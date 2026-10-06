'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { DomainRuleError, PersistenceNotFoundError } = require('./errors');
const {
  ROUND_STATUS_OPEN, ROUND_STATUS_LOCKING, ROUND_STATUS_MATCHDAY, ROUND_STATUS_FINALIZING,
  TIME_MODEL_COUNTDOWN, TIME_MODEL_FIXED_SCHEDULE,
  mergeWorldDeltas, findConflictingDeltaPath
} = require('../domain/round-management');

const STATUS_ACTIVE = 'ACTIVE';
const STATUS_LEFT = 'LEFT';
const MAX_WORLD_SLOTS = 1000;
const MAX_ACTIVE_WORLDS_PER_USER = 5;

function nowIso() { return new Date().toISOString(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function participationKey(worldId, userId) { return `${worldId}__${userId}`; }
function managementScopeKey(worldId, roundGeneration, scope) {
  return `${worldId}__${Number(roundGeneration)}__${String(scope)}`;
}

class FileMetadataRepository {
  constructor({ filePath }) {
    if (!filePath) throw new Error('FileMetadataRepository requires filePath');
    this.filePath = path.resolve(filePath);
    this._queue = Promise.resolve();
  }

  async _read() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      parsed.slots = parsed.slots || {};
      parsed.worlds = parsed.worlds || {};
      parsed.participationIndex = parsed.participationIndex || {};
      parsed.invitations = parsed.invitations || {};
      parsed.applications = parsed.applications || {};
      parsed.progression = parsed.progression || {};
      parsed.managementScopes = parsed.managementScopes || {};
      return parsed;
    } catch (error) {
      if (error && error.code === 'ENOENT') return { schemaVersion: 1, slots: {}, worlds: {}, participationIndex: {}, invitations: {}, applications: {}, progression: {}, managementScopes: {} };
      throw error;
    }
  }

  async _write(data) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(data), 'utf8');
    await fs.rename(tmp, this.filePath);
  }

  _mutate(fn) {
    const run = this._queue.then(async () => {
      const data = await this._read();
      const result = await fn(data);
      await this._write(data);
      return clone(result);
    });
    this._queue = run.catch(() => {});
    return run;
  }

  async listActiveWorldIdsForUser(userId) {
    const data = await this._read();
    return Object.values(data.participationIndex)
      .filter(p => p.userId === userId && p.status === STATUS_ACTIVE)
      .map(p => p.worldId);
  }

  async listActiveUserIdsForWorld(worldId) {
    const data = await this._read();
    return Object.values(data.participationIndex)
      .filter(p => p.worldId === worldId && p.status === STATUS_ACTIVE)
      .map(p => p.userId);
  }

  async listActiveAssignedUserIdsForWorld(worldId) {
    const data = await this._read();
    return Object.values(data.participationIndex)
      .filter(p => p.worldId === worldId && p.status === STATUS_ACTIVE && p.clubId)
      .map(p => p.userId);
  }

  async listActiveWorldIds() {
    const data = await this._read();
    return Object.values(data.worlds)
      .filter(world => world && world.status === 'ACTIVE')
      .map(world => world.worldId);
  }

  async getWorld(worldId) {
    const data = await this._read();
    return data.worlds[worldId] ? clone(data.worlds[worldId]) : null;
  }

  async setWorldLobbyProjection({
    worldId, currentSeason = 1, maxPlayers = 0, clubNamesById = {},
    roundTimeModel = TIME_MODEL_COUNTDOWN, roundDurationSeconds = 120, nextRoundAt = null
  }) {
    return this._mutate(data => {
      const world = data.worlds[worldId];
      if (!world) throw new PersistenceNotFoundError('World not found', { worldId });
      world.currentSeason = Number(currentSeason || 1);
      world.maxPlayers = Number(maxPlayers || 0);
      world.clubNamesById = clone(clubNamesById || {});
      world.roundTimeModel = roundTimeModel === TIME_MODEL_FIXED_SCHEDULE ? TIME_MODEL_FIXED_SCHEDULE : TIME_MODEL_COUNTDOWN;
      world.roundDurationSeconds = Math.max(15, Number(roundDurationSeconds || 120));
      world.nextRoundAt = nextRoundAt || null;
      world.projectionUpdatedAt = nowIso();
      return world;
    });
  }

  async setParticipationProjection({ worldId, userId, trainerId = null, clubId = null, role = null, trainerDisplayName = null }) {
    return this._mutate(data => {
      const key = participationKey(worldId, userId);
      const row = data.participationIndex[key];
      if (!row || row.status !== STATUS_ACTIVE) throw new PersistenceNotFoundError('Active participation index not found', { worldId, userId });
      row.trainerId = trainerId || row.trainerId || null;
      row.clubId = clubId || null;
      row.role = role || row.role || 'PLAYER';
      if (trainerDisplayName) row.trainerDisplayName = trainerDisplayName;
      row.projectionUpdatedAt = nowIso();
      return row;
    });
  }

  async getSlot(slotId) {
    const data = await this._read();
    return data.slots[String(Number(slotId))] ? clone(data.slots[String(Number(slotId))]) : null;
  }

  async verifyRoundTrip({ probeId, payload }) {
    const safeId = String(probeId || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!safeId) throw new Error('verification_probe_id_required');
    const target = `${this.filePath}.verification-${safeId}.json`;
    let failure = null;
    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, String(payload), 'utf8');
      const readBack = await fs.readFile(target, 'utf8');
      if (readBack !== String(payload)) throw new Error('verification_payload_mismatch');
    } catch (error) {
      failure = error;
    }
    try {
      await fs.unlink(target);
    } catch (cleanupError) {
      if (cleanupError && cleanupError.code !== 'ENOENT' && !failure) {
        cleanupError.message = `verification_cleanup_failed: ${cleanupError.message || 'file metadata cleanup failed'}`;
        failure = cleanupError;
      }
    }
    if (failure) throw failure;
    return true;
  }

  async createWorldRegistration({ slotId, worldId, createdByUserId, worldName = null, description = '', visibility = 'PRIVATE', joinPolicy = 'INVITE_ONLY', createdAt = nowIso() }) {
    return this._mutate(data => {
      slotId = Number(slotId);
      if (!Number.isInteger(slotId) || slotId < 1 || slotId > MAX_WORLD_SLOTS) throw new DomainRuleError('slotId must be between 1 and 1000');
      if (!worldId || !createdByUserId) throw new DomainRuleError('worldId and createdByUserId are required');
      const active = Object.values(data.participationIndex).filter(p => p.userId === createdByUserId && p.status === STATUS_ACTIVE);
      if (active.length >= MAX_ACTIVE_WORLDS_PER_USER) throw new DomainRuleError('User already participates in five active worlds');
      const slot = data.slots[String(slotId)];
      if (slot && slot.status === 'OCCUPIED') throw new DomainRuleError('World slot is already occupied', { slotId });
      if (data.worlds[worldId] && data.worlds[worldId].status === 'ACTIVE') throw new DomainRuleError('World already exists', { worldId });
      const world = { worldId, slotId, status: 'ACTIVE', createdAt, createdByUserId, worldName, description, visibility, joinPolicy };
      data.slots[String(slotId)] = { slotId, status: 'OCCUPIED', worldId, createdAt };
      data.worlds[worldId] = world;
      data.participationIndex[participationKey(worldId, createdByUserId)] = {
        worldId, userId: createdByUserId, status: STATUS_ACTIVE, joinedAt: createdAt, derivedIndex: true
      };
      return world;
    });
  }

  async addParticipationIndex({ worldId, userId, joinedAt = nowIso() }) {
    return this._mutate(data => {
      const world = data.worlds[worldId];
      if (!world || world.status !== 'ACTIVE') throw new PersistenceNotFoundError('Active world not found', { worldId });
      const key = participationKey(worldId, userId);
      if (data.participationIndex[key] && data.participationIndex[key].status === STATUS_ACTIVE) throw new DomainRuleError('User already participates in this world');
      const active = Object.values(data.participationIndex).filter(p => p.userId === userId && p.status === STATUS_ACTIVE);
      if (active.length >= MAX_ACTIVE_WORLDS_PER_USER) throw new DomainRuleError('User already participates in five active worlds');
      data.participationIndex[key] = { worldId, userId, status: STATUS_ACTIVE, joinedAt, derivedIndex: true };
      return data.participationIndex[key];
    });
  }

  async removeParticipationIndex({ worldId, userId }) {
    return this._mutate(data => {
      const key = participationKey(worldId, userId), participation = data.participationIndex[key];
      if (!participation || participation.status !== STATUS_ACTIVE) throw new PersistenceNotFoundError('Active participation index not found', { worldId, userId });
      participation.status = STATUS_LEFT;
      participation.leftAt = nowIso();
      return participation;
    });
  }

  async deleteWorldRegistration({ worldId, expectedCreatedByUserId = null }) {
    return this._mutate(data => {
      const world = data.worlds[worldId];
      if (!world) return { deleted: false };
      if (expectedCreatedByUserId && String(world.createdByUserId) !== String(expectedCreatedByUserId)) {
        throw new DomainRuleError('World creator does not match rollback request', { worldId });
      }
      const slotId = String(Number(world.slotId));
      if (data.slots[slotId] && data.slots[slotId].worldId === worldId) delete data.slots[slotId];
      delete data.worlds[worldId];
      Object.keys(data.participationIndex).forEach(key => {
        if (data.participationIndex[key] && data.participationIndex[key].worldId === worldId) delete data.participationIndex[key];
      });
      Object.keys(data.invitations).forEach(key => {
        if (data.invitations[key] && data.invitations[key].worldId === worldId) delete data.invitations[key];
      });
      Object.keys(data.applications).forEach(key => {
        if (data.applications[key] && data.applications[key].worldId === worldId) delete data.applications[key];
      });
      if (data.progression) delete data.progression[worldId];
      return { deleted: true, worldId };
    });
  }

  async listLobbyWorlds(userId) {
    const data = await this._read();
    const participationByWorld = {};
    Object.values(data.participationIndex).forEach(row => {
      if (!row || row.status !== STATUS_ACTIVE) return;
      participationByWorld[row.worldId] = participationByWorld[row.worldId] || [];
      participationByWorld[row.worldId].push(row);
    });
    return Object.values(data.worlds)
      .filter(world => world && world.status === 'ACTIVE')
      .filter(world => world.visibility === 'PUBLIC' || (participationByWorld[world.worldId] || []).some(row => String(row.userId) === String(userId)))
      .map(world => {
        const participants = participationByWorld[world.worldId] || [];
        const mineRow = participants.find(row => String(row.userId) === String(userId)) || null;
        const application = data.applications[participationKey(world.worldId, userId)] || null;
        return {
          ...clone(world),
          participantCount: participants.length,
          isMember: Boolean(mineRow),
          membership: mineRow ? clone(mineRow) : null,
          applicationStatus: application ? application.status : null
        };
      })
      .sort((a, b) => Number(a.slotId) - Number(b.slotId));
  }

  async getParticipation({ worldId, userId }) {
    const data = await this._read();
    const row = data.participationIndex[participationKey(worldId, userId)];
    return row && row.status === STATUS_ACTIVE ? clone(row) : null;
  }

  async getWorldProgression(worldId) {
    const data = await this._read();
    const row = data.progression && data.progression[worldId];
    return row ? clone(row) : null;
  }

  async ensureWorldRound({ worldId, revision, timeModel = TIME_MODEL_COUNTDOWN, fixedDeadlineAt = null }) {
    return this._mutate(data => {
      data.progression = data.progression || {};
      let state = data.progression[worldId] || null;
      if (!state) {
        state = {
          worldId,
          revision:Number(revision),
          roundGeneration:1,
          status:ROUND_STATUS_OPEN,
          timeModel:timeModel === TIME_MODEL_FIXED_SCHEDULE ? TIME_MODEL_FIXED_SCHEDULE : TIME_MODEL_COUNTDOWN,
          readyUserIds:[],
          deadlineAt:fixedDeadlineAt || null,
          progressionRunId:null,
          leaseId:null,
          leaseExpiresAt:null,
          lastCompletedProgressionRunId:null,
          matchIntentByUserId:{},
          matchdayPlan:null
        };
      } else {
        if (!state.roundGeneration) state.roundGeneration = 1;
        if (state.status === 'WAITING') state.status = ROUND_STATUS_OPEN;
        if (state.status === 'PROCESSING') state.status = ROUND_STATUS_MATCHDAY;
      state.matchIntentByUserId = state.matchIntentByUserId || {};
      if (!Object.prototype.hasOwnProperty.call(state,'matchdayPlan')) state.matchdayPlan = null;
        if (!state.timeModel) state.timeModel = TIME_MODEL_COUNTDOWN;
        if (state.status === ROUND_STATUS_OPEN) {
          state.revision = Number(revision);
          if (timeModel) state.timeModel = timeModel === TIME_MODEL_FIXED_SCHEDULE ? TIME_MODEL_FIXED_SCHEDULE : TIME_MODEL_COUNTDOWN;
          if (state.timeModel === TIME_MODEL_FIXED_SCHEDULE && fixedDeadlineAt) state.deadlineAt = fixedDeadlineAt;
        }
      }
      data.progression[worldId] = state;
      return state;
    });
  }

  async getManagementScopes({ worldId, roundGeneration }) {
    const data = await this._read();
    return Object.values(data.managementScopes || {})
      .filter(row => row && String(row.worldId) === String(worldId) && Number(row.roundGeneration) === Number(roundGeneration))
      .map(clone)
      .sort((a,b) => String(a.scope).localeCompare(String(b.scope)));
  }

  async commitManagementScopes({
    worldId, userId, roundGeneration, expectedWorldRevision,
    scopeDeltas, expectedScopeRevisions = {}
  }) {
    return this._mutate(data => {
      data.progression = data.progression || {};
      data.managementScopes = data.managementScopes || {};
      const state = data.progression[worldId];
      if (!state) throw new DomainRuleError('Round state not found');
      if (Number(state.roundGeneration) !== Number(roundGeneration)) {
        throw new DomainRuleError('Round generation mismatch', {
          expectedRoundGeneration:roundGeneration,
          actualRoundGeneration:state.roundGeneration
        });
      }
      if (Number(state.revision) !== Number(expectedWorldRevision)) {
        throw new DomainRuleError('Round world revision mismatch', {
          expectedRevision:expectedWorldRevision,
          actualRevision:state.revision
        });
      }
      if (state.status !== ROUND_STATUS_OPEN) {
        throw new DomainRuleError('Round is locked for management changes', { status:state.status });
      }
      if ((state.readyUserIds || []).map(String).includes(String(userId))) {
        throw new DomainRuleError('Trainer is already ready for this round');
      }

      const existingRows = Object.values(data.managementScopes)
        .filter(row => row && String(row.worldId) === String(worldId) && Number(row.roundGeneration) === Number(roundGeneration));
      const staged = [];
      for (const item of scopeDeltas || []) {
        if (!item || !item.scope || !item.worldDelta) throw new DomainRuleError('Invalid management scope delta');
        const key = managementScopeKey(worldId, roundGeneration, item.scope);
        const current = data.managementScopes[key] || null;
        const currentRevision = Number(current && current.scopeRevision || 0);
        const expectedScopeRevision = Number(Object.prototype.hasOwnProperty.call(expectedScopeRevisions || {}, item.scope)
          ? expectedScopeRevisions[item.scope]
          : 0);
        if (currentRevision !== expectedScopeRevision) {
          const error = new DomainRuleError('Management scope revision mismatch', {
            scope:item.scope,
            expectedScopeRevision,
            actualScopeRevision:currentRevision
          });
          error.code = 'PERSISTENCE_CONFLICT';
          throw error;
        }
        for (const other of existingRows) {
          if (!other || String(other.scope) === String(item.scope)) continue;
          const conflictingPath = findConflictingDeltaPath(other.worldDelta, item.worldDelta);
          if (conflictingPath) {
            const error = new DomainRuleError('Management resources overlap on a shared storage path', {
              scope:item.scope,
              conflictingScope:other.scope,
              path:conflictingPath
            });
            error.code = 'PERSISTENCE_CONFLICT';
            throw error;
          }
        }
        staged.push({
          key,
          row:{
            worldId,
            roundGeneration:Number(roundGeneration),
            scope:String(item.scope),
            scopeRevision:currentRevision + 1,
            worldDelta:mergeWorldDeltas(current && current.worldDelta, item.worldDelta),
            updatedByUserId:String(userId),
            updatedAt:nowIso()
          }
        });
      }
      staged.forEach(item => { data.managementScopes[item.key] = item.row; });
      return {
        worldId,
        revision:Number(state.revision),
        roundGeneration:Number(state.roundGeneration),
        scopeRows:staged.map(item => item.row)
      };
    });
  }

  async claimDueWorldProgress({ worldId, expectedRevision, activeUserIds, leaseMs = 120000 }) {
    return this._mutate(data => {
      data.progression = data.progression || {};
      const state = data.progression[worldId];
      if (!state) return null;
      if (Number(state.revision) !== Number(expectedRevision)) return state;
      if (!state.roundGeneration) state.roundGeneration = 1;
      if (state.status === 'WAITING') state.status = ROUND_STATUS_OPEN;
      if (state.status === 'PROCESSING') state.status = ROUND_STATUS_MATCHDAY;
      state.matchIntentByUserId = state.matchIntentByUserId || {};
      if (!Object.prototype.hasOwnProperty.call(state,'matchdayPlan')) state.matchdayPlan = null;

      const now = Date.now();
      if ((state.status === ROUND_STATUS_LOCKING || state.status === ROUND_STATUS_MATCHDAY) &&
          state.leaseExpiresAt && new Date(state.leaseExpiresAt).getTime() <= now) {
        state.status = ROUND_STATUS_OPEN;
        state.leaseId = null;
        state.leaseExpiresAt = null;
      }

      const active = Array.from(new Set((activeUserIds || []).map(String)));
      const ready = (state.readyUserIds || []).map(String);
      const allReady = active.length > 0 && active.every(id => ready.includes(id));
      const expired = Boolean(state.deadlineAt && new Date(state.deadlineAt).getTime() <= now);
      const due = state.timeModel === TIME_MODEL_FIXED_SCHEDULE ? expired : (allReady || expired);
      let shouldAdvance = false;
      if (state.status === ROUND_STATUS_OPEN && due) {
        state.status = ROUND_STATUS_LOCKING;
        state.progressionRunId = state.progressionRunId || crypto.randomUUID();
        state.leaseId = crypto.randomUUID();
        state.leaseExpiresAt = new Date(now + Math.max(30000, Number(leaseMs || 120000))).toISOString();
        shouldAdvance = true;
      }
      data.progression[worldId] = state;
      return {
        ...state,
        activeTrainerCount:active.length,
        readyTrainerCount:ready.filter(id => active.includes(id)).length,
        shouldAdvance
      };
    });
  }

  async markTrainerReady({
    worldId, userId, expectedRevision, roundGeneration = null, activeUserIds,
    deadlineAt, timeModel = TIME_MODEL_COUNTDOWN, matchIntent = 'QUICK', leaseMs = 120000
  }) {
    return this._mutate(data => {
      data.progression = data.progression || {};
      const active = Array.from(new Set((activeUserIds || []).map(String)));
      if (!active.includes(String(userId))) throw new DomainRuleError('User is not an active trainer in this world');
      let state = data.progression[worldId] || null;
      if (!state) {
        state = {
          worldId,
          revision:Number(expectedRevision),
          roundGeneration:1,
          status:ROUND_STATUS_OPEN,
          timeModel:timeModel === TIME_MODEL_FIXED_SCHEDULE ? TIME_MODEL_FIXED_SCHEDULE : TIME_MODEL_COUNTDOWN,
          readyUserIds:[],
          deadlineAt:null,
          progressionRunId:null,
          leaseId:null,
          leaseExpiresAt:null,
          lastCompletedProgressionRunId:null,
          matchIntentByUserId:{},
          matchdayPlan:null
        };
      }
      if (!state.roundGeneration) state.roundGeneration = 1;
      if (state.status === 'WAITING') state.status = ROUND_STATUS_OPEN;
      if (state.status === 'PROCESSING') state.status = ROUND_STATUS_MATCHDAY;
      state.matchIntentByUserId = state.matchIntentByUserId || {};
      if (!Object.prototype.hasOwnProperty.call(state,'matchdayPlan')) state.matchdayPlan = null;
      if (roundGeneration != null && Number(state.roundGeneration) !== Number(roundGeneration)) {
        throw new DomainRuleError('Round generation mismatch');
      }
      if (state.status === ROUND_STATUS_OPEN) state.revision = Number(expectedRevision);
      if (Number(state.revision) !== Number(expectedRevision)) throw new DomainRuleError('Progression revision mismatch');

      const now = Date.now();
      if (state.status === ROUND_STATUS_MATCHDAY && state.leaseExpiresAt && new Date(state.leaseExpiresAt).getTime() <= now) {
        state.status = ROUND_STATUS_OPEN;
        state.leaseId = null;
        state.leaseExpiresAt = null;
      }
      if (state.status !== ROUND_STATUS_OPEN) {
        data.progression[worldId] = state;
        return { ...state, activeTrainerCount:active.length, readyTrainerCount:(state.readyUserIds || []).filter(id => active.includes(String(id))).length, shouldAdvance:false };
      }

      const alreadyReady = (state.readyUserIds || []).map(String).includes(String(userId));
      state.readyUserIds = Array.from(new Set([...(state.readyUserIds || []).map(String), String(userId)]));
      if (!alreadyReady) {
        const normalizedIntent = String(matchIntent || 'QUICK').toUpperCase() === 'LIVE' ? 'LIVE' : 'QUICK';
        state.matchIntentByUserId[String(userId)] = normalizedIntent;
      }
      state.timeModel = timeModel === TIME_MODEL_FIXED_SCHEDULE ? TIME_MODEL_FIXED_SCHEDULE : TIME_MODEL_COUNTDOWN;
      if (state.timeModel === TIME_MODEL_COUNTDOWN) {
        if (!state.deadlineAt) state.deadlineAt = deadlineAt || new Date(now + 120000).toISOString();
      } else if (deadlineAt) {
        state.deadlineAt = deadlineAt;
      }

      const allReady = active.length > 0 && active.every(id => state.readyUserIds.includes(id));
      const expired = state.deadlineAt && new Date(state.deadlineAt).getTime() <= now;
      const due = state.timeModel === TIME_MODEL_FIXED_SCHEDULE ? Boolean(expired) : Boolean(allReady || expired);
      let shouldAdvance = false;
      if (due) {
        state.status = ROUND_STATUS_LOCKING;
        state.progressionRunId = state.progressionRunId || crypto.randomUUID();
        state.leaseId = crypto.randomUUID();
        state.leaseExpiresAt = new Date(now + Math.max(30000, Number(leaseMs || 120000))).toISOString();
        shouldAdvance = true;
      }
      data.progression[worldId] = state;
      return {
        ...state,
        activeTrainerCount:active.length,
        readyTrainerCount:state.readyUserIds.filter(id => active.includes(id)).length,
        shouldAdvance
      };
    });
  }

  async beginMatchday({ worldId, expectedRevision, roundGeneration, leaseId, progressionRunId, matchdayPlan = null }) {
    return this._mutate(data => {
      const state = data.progression && data.progression[worldId];
      if (!state) throw new DomainRuleError('Progression state not found');
      if (Number(state.revision) !== Number(expectedRevision) ||
          Number(state.roundGeneration) !== Number(roundGeneration)) {
        throw new DomainRuleError('Progression generation mismatch');
      }
      if (state.status !== ROUND_STATUS_LOCKING ||
          String(state.leaseId || '') !== String(leaseId || '') ||
          String(state.progressionRunId || '') !== String(progressionRunId || '')) {
        throw new DomainRuleError('Progression lease mismatch');
      }
      state.status = ROUND_STATUS_MATCHDAY;
      state.matchdayPlan = matchdayPlan ? clone(matchdayPlan) : null;
      if (state.matchdayPlan && !Array.isArray(state.matchdayPlan.completedLiveFixtureIds)) {
        state.matchdayPlan.completedLiveFixtureIds = [];
      }
      data.progression[worldId] = state;
      return state;
    });
  }

  async markLiveFixtureCompleted({ worldId, roundGeneration, progressionRunId, fixtureId }) {
    return this._mutate(data => {
      const state = data.progression && data.progression[worldId];
      if (!state || state.status !== ROUND_STATUS_MATCHDAY) throw new DomainRuleError('Matchday is not active');
      if (Number(state.roundGeneration) !== Number(roundGeneration) ||
          String(state.progressionRunId || '') !== String(progressionRunId || '')) {
        throw new DomainRuleError('Progression generation mismatch');
      }
      const plan = state.matchdayPlan || {};
      const fixturePlan = (plan.fixturePlans || []).find(row => row && String(row.fixtureId) === String(fixtureId));
      if (!fixturePlan || fixturePlan.mode !== 'LIVE') throw new DomainRuleError('Live fixture is not part of this matchday');
      plan.completedLiveFixtureIds = Array.from(new Set([...(plan.completedLiveFixtureIds || []).map(String), String(fixtureId)]));
      state.matchdayPlan = plan;
      data.progression[worldId] = state;
      return state;
    });
  }

  async beginFinalizing({ worldId, expectedRevision, roundGeneration, leaseId, progressionRunId }) {
    return this._mutate(data => {
      const state = data.progression && data.progression[worldId];
      if (!state) throw new DomainRuleError('Progression state not found');
      if (Number(state.revision) !== Number(expectedRevision) ||
          Number(state.roundGeneration) !== Number(roundGeneration)) {
        throw new DomainRuleError('Progression generation mismatch');
      }
      if (state.status !== ROUND_STATUS_MATCHDAY ||
          String(state.leaseId || '') !== String(leaseId || '') ||
          String(state.progressionRunId || '') !== String(progressionRunId || '')) {
        throw new DomainRuleError('Progression lease mismatch');
      }
      state.status = ROUND_STATUS_FINALIZING;
      data.progression[worldId] = state;
      return state;
    });
  }

  async completeWorldProgress({
    worldId, expectedRevision, nextRevision, leaseId, roundGeneration = null,
    progressionRunId = null, allowCommittedRecovery = false
  }) {
    return this._mutate(data => {
      data.progression = data.progression || {};
      data.managementScopes = data.managementScopes || {};
      const state = data.progression[worldId];
      if (!state) throw new DomainRuleError('Progression state not found');

      if (progressionRunId &&
          state.status === ROUND_STATUS_OPEN &&
          String(state.lastCompletedProgressionRunId || '') === String(progressionRunId) &&
          Number(state.revision) === Number(nextRevision)) {
        return state;
      }

      if (Number(state.revision) !== Number(expectedRevision)) throw new DomainRuleError('Progression revision mismatch');
      if (roundGeneration != null && Number(state.roundGeneration) !== Number(roundGeneration)) throw new DomainRuleError('Progression generation mismatch');
      if (state.status !== ROUND_STATUS_FINALIZING &&
          !(allowCommittedRecovery && (state.status === ROUND_STATUS_MATCHDAY || state.status === ROUND_STATUS_LOCKING))) {
        throw new DomainRuleError('Progression state mismatch');
      }
      if (progressionRunId != null && String(state.progressionRunId || '') !== String(progressionRunId || '')) {
        throw new DomainRuleError('Progression run mismatch');
      }
      if (!allowCommittedRecovery && String(state.leaseId || '') !== String(leaseId || '')) {
        throw new DomainRuleError('Progression lease mismatch');
      }

      const completedGeneration = Number(state.roundGeneration || 1);
      for (const key of Object.keys(data.managementScopes)) {
        const row = data.managementScopes[key];
        if (row && String(row.worldId) === String(worldId) && Number(row.roundGeneration) === completedGeneration) {
          delete data.managementScopes[key];
        }
      }

      const completedRunId = progressionRunId || state.progressionRunId || null;
      const next = {
        worldId,
        revision:Number(nextRevision),
        roundGeneration:completedGeneration + 1,
        status:ROUND_STATUS_OPEN,
        timeModel:state.timeModel || TIME_MODEL_COUNTDOWN,
        readyUserIds:[],
        deadlineAt:null,
        progressionRunId:null,
        leaseId:null,
        leaseExpiresAt:null,
        lastCompletedProgressionRunId:completedRunId,
        matchIntentByUserId:{},
        matchdayPlan:null
      };
      data.progression[worldId]=next;
      return next;
    });
  }

  async releaseWorldProgress({ worldId, expectedRevision, leaseId }) {
    return this._mutate(data => {
      data.progression = data.progression || {};
      const state = data.progression[worldId];
      if (!state || Number(state.revision) !== Number(expectedRevision)) return state || null;
      if ((state.status === ROUND_STATUS_MATCHDAY || state.status === ROUND_STATUS_LOCKING || state.status === ROUND_STATUS_FINALIZING) &&
          String(state.leaseId || '') === String(leaseId || '')) {
        state.status=ROUND_STATUS_OPEN;
        state.leaseId=null;
        state.leaseExpiresAt=null;
      }
      return state;
    });
  }

  async createWorldApplication({ worldId, userId, displayName = '', createdAt = nowIso() }) {
    return this._mutate(data => {
      const world = data.worlds[worldId];
      if (!world || world.status !== 'ACTIVE') throw new PersistenceNotFoundError('Active world not found', { worldId });
      if (world.visibility !== 'PUBLIC' || world.joinPolicy !== 'APPLICATION') throw new DomainRuleError('World does not accept applications');
      const participation = data.participationIndex[participationKey(worldId, userId)];
      if (participation && participation.status === STATUS_ACTIVE) throw new DomainRuleError('User already participates in this world');
      const key = participationKey(worldId, userId);
      const existing = data.applications[key];
      if (existing && existing.status === 'PENDING') throw new DomainRuleError('Application already pending');
      const application = { applicationId:key, worldId, userId, displayName, status:'PENDING', createdAt };
      data.applications[key] = application;
      return application;
    });
  }

  async listWorldApplications(worldId) {
    const data = await this._read();
    return Object.values(data.applications)
      .filter(row => row && row.worldId === worldId && row.status === 'PENDING')
      .map(clone)
      .sort((a,b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  async getWorldApplication({ worldId, userId }) {
    const data = await this._read();
    const row = data.applications[participationKey(worldId, userId)];
    return row ? clone(row) : null;
  }

  async resolveWorldApplication({ worldId, userId, status, resolvedByUserId }) {
    return this._mutate(data => {
      const key = participationKey(worldId, userId);
      const row = data.applications[key];
      if (!row || row.status !== 'PENDING') throw new PersistenceNotFoundError('Pending application not found', { worldId, userId });
      row.status = status;
      row.resolvedAt = nowIso();
      row.resolvedByUserId = resolvedByUserId;
      return row;
    });
  }

  async createInvitation({ worldId, invitedByUserId, invitedUserId = null, inviteId = crypto.randomUUID(), expiresAt = null }) {
    return this._mutate(data => {
      const world = data.worlds[worldId];
      if (!world || world.status !== 'ACTIVE') throw new PersistenceNotFoundError('Active world not found', { worldId });
      const invitation = { inviteId, worldId, invitedByUserId, invitedUserId, status: 'OPEN', createdAt: nowIso(), expiresAt };
      data.invitations[inviteId] = invitation;
      return invitation;
    });
  }
}

module.exports = {
  FileMetadataRepository,
  STATUS_ACTIVE,
  STATUS_LEFT,
  MAX_WORLD_SLOTS,
  MAX_ACTIVE_WORLDS_PER_USER
};
