'use strict';

const crypto = require('crypto');
const { DomainRuleError, PersistenceNotFoundError } = require('./errors');
const {
  ROUND_STATUS_OPEN, ROUND_STATUS_LOCKING, ROUND_STATUS_MATCHDAY, ROUND_STATUS_FINALIZING,
  TIME_MODEL_COUNTDOWN, TIME_MODEL_FIXED_SCHEDULE,
  mergeWorldDeltas, findConflictingDeltaPath
} = require('../domain/round-management');
const { voteSummary } = require('../domain/round-settings');
const { STATUS_ACTIVE, STATUS_LEFT, MAX_WORLD_SLOTS, MAX_ACTIVE_WORLDS_PER_USER } = require('./file-metadata-repository');

function nowIso() { return new Date().toISOString(); }
function participationId(worldId, userId) { return `${worldId}__${userId}`; }

class FirestoreMetadataRepository {
  constructor({ firestore, projectId, collectionPrefix = 'kf_dev' } = {}) {
    if (!firestore) {
      const { Firestore } = require('@google-cloud/firestore');
      firestore = new Firestore(projectId ? { projectId } : undefined);
    }
    this.db = firestore;
    this.names = {
      slots: `${collectionPrefix}_world_slots`,
      worlds: `${collectionPrefix}_worlds`,
      participation: `${collectionPrefix}_world_participation_index`,
      invitations: `${collectionPrefix}_invitations`,
      applications: `${collectionPrefix}_applications`,
      progression: `${collectionPrefix}_world_progression`,
      managementScopes: `${collectionPrefix}_world_management_scopes`,
      system: `${collectionPrefix}_system`
    };
  }

  _slot(slotId) { return this.db.collection(this.names.slots).doc(String(Number(slotId)).padStart(4, '0')); }
  _world(worldId) { return this.db.collection(this.names.worlds).doc(String(worldId)); }
  _participation(worldId, userId) { return this.db.collection(this.names.participation).doc(participationId(worldId, userId)); }
  _progression(worldId) { return this.db.collection(this.names.progression).doc(String(worldId)); }
  _managementScope(worldId, roundGeneration, scope) {
    return this.db.collection(this.names.managementScopes).doc(`${encodeURIComponent(String(worldId))}__${Number(roundGeneration)}__${encodeURIComponent(String(scope))}`);
  }

  async listActiveWorldIdsForUser(userId) {
    const snap = await this.db.collection(this.names.participation).where('userId', '==', userId).where('status', '==', STATUS_ACTIVE).get();
    return snap.docs.map(doc => doc.data().worldId);
  }

  async listActiveUserIdsForWorld(worldId) {
    const snap = await this.db.collection(this.names.participation).where('worldId', '==', worldId).where('status', '==', STATUS_ACTIVE).get();
    return snap.docs.map(doc => doc.data().userId);
  }

  async listActiveAssignedUserIdsForWorld(worldId) {
    const snap = await this.db.collection(this.names.participation).where('worldId', '==', worldId).where('status', '==', STATUS_ACTIVE).get();
    return snap.docs.map(doc => doc.data()).filter(row => row.clubId).map(row => row.userId);
  }

  async listActiveWorldIds() {
    const snap = await this.db.collection(this.names.worlds).where('status', '==', 'ACTIVE').get();
    return snap.docs.map(doc => doc.data().worldId).filter(Boolean);
  }

  async getWorld(worldId) {
    const doc = await this._world(worldId).get();
    return doc.exists ? doc.data() : null;
  }

  async setWorldLobbyProjection({
    worldId, currentSeason = 1, maxPlayers = 0, clubNamesById = {},
    roundTimeModel = TIME_MODEL_COUNTDOWN, roundDurationSeconds = 120, nextRoundAt = null,
    fixedScheduleWeekdays = [], fixedScheduleTime = null, timezone = 'UTC',
    roundConfigured = true, roundSetupRequired = false
  }) {
    const ref = this._world(worldId);
    const doc = await ref.get();
    if (!doc.exists) throw new PersistenceNotFoundError('World not found', { worldId });
    const patch = {
      currentSeason: Number(currentSeason || 1),
      maxPlayers: Number(maxPlayers || 0),
      clubNamesById: clubNamesById || {},
      roundConfigured:Boolean(roundConfigured),
      roundSetupRequired:Boolean(roundSetupRequired),
      roundTimeModel:roundConfigured
        ? (roundTimeModel === TIME_MODEL_FIXED_SCHEDULE ? TIME_MODEL_FIXED_SCHEDULE : TIME_MODEL_COUNTDOWN)
        : null,
      roundDurationSeconds:roundConfigured && roundTimeModel !== TIME_MODEL_FIXED_SCHEDULE
        ? Math.max(15, Number(roundDurationSeconds || 120))
        : null,
      nextRoundAt:roundConfigured ? (nextRoundAt || null) : null,
      fixedScheduleWeekdays:roundConfigured && Array.isArray(fixedScheduleWeekdays)
        ? fixedScheduleWeekdays.map(Number).filter(Number.isInteger)
        : [],
      fixedScheduleTime:roundConfigured ? (fixedScheduleTime || null) : null,
      timezone:roundConfigured ? String(timezone || 'UTC') : null,
      projectionUpdatedAt: nowIso()
    };
    await ref.set(patch, { merge:true });
    return { ...doc.data(), ...patch };
  }

  async setParticipationProjection({ worldId, userId, trainerId = null, clubId = null, role = null, trainerDisplayName = null }) {
    const ref = this._participation(worldId, userId);
    const doc = await ref.get();
    if (!doc.exists || doc.data().status !== STATUS_ACTIVE) throw new PersistenceNotFoundError('Active participation index not found', { worldId, userId });
    const patch = {
      trainerId: trainerId || doc.data().trainerId || null,
      clubId: clubId || null,
      role: role || doc.data().role || 'PLAYER',
      projectionUpdatedAt: nowIso()
    };
    if (trainerDisplayName) patch.trainerDisplayName = trainerDisplayName;
    await ref.set(patch, { merge:true });
    return { ...doc.data(), ...patch };
  }

  async getSlot(slotId) {
    const doc = await this._slot(slotId).get();
    return doc.exists ? doc.data() : null;
  }

  async verifyRoundTrip({ probeId, payload }) {
    const safeId = String(probeId || '').replace(/[^A-Za-z0-9_-]/g, '');
    if (!safeId) throw new Error('verification_probe_id_required');
    const ref = this.db.collection(this.names.system).doc(`persistence-verification-${safeId}`);
    let failure = null;
    try {
      await ref.create({
        kind: 'persistence-verification',
        probeId: safeId,
        payload: String(payload),
        createdAt: nowIso()
      });
      const doc = await ref.get();
      if (!doc.exists || !doc.data() || doc.data().payload !== String(payload)) {
        throw new Error('verification_payload_mismatch');
      }
    } catch (error) {
      failure = error;
    }
    try {
      await ref.delete();
    } catch (cleanupError) {
      if (!failure) {
        cleanupError.message = `verification_cleanup_failed: ${cleanupError.message || 'firestore cleanup failed'}`;
        failure = cleanupError;
      }
    }
    if (failure) throw failure;
    return true;
  }

  async createWorldRegistration({ slotId, worldId, createdByUserId, worldName = null, description = '', visibility = 'PRIVATE', joinPolicy = 'INVITE_ONLY', createdAt = nowIso() }) {
    slotId = Number(slotId);
    if (!Number.isInteger(slotId) || slotId < 1 || slotId > MAX_WORLD_SLOTS) throw new DomainRuleError('slotId must be between 1 and 1000');
    if (!worldId || !createdByUserId) throw new DomainRuleError('worldId and createdByUserId are required');
    return this.db.runTransaction(async tx => {
      const slotRef = this._slot(slotId), worldRef = this._world(worldId), participationRef = this._participation(worldId, createdByUserId);
      const activeQuery = this.db.collection(this.names.participation).where('userId', '==', createdByUserId).where('status', '==', STATUS_ACTIVE);
      const [slotDoc, worldDoc, activeSnap] = await Promise.all([tx.get(slotRef), tx.get(worldRef), tx.get(activeQuery)]);
      if (slotDoc.exists && slotDoc.data().status === 'OCCUPIED') throw new DomainRuleError('World slot is already occupied', { slotId });
      if (worldDoc.exists && worldDoc.data().status === 'ACTIVE') throw new DomainRuleError('World already exists', { worldId });
      if (activeSnap.size >= MAX_ACTIVE_WORLDS_PER_USER) throw new DomainRuleError('User already participates in five active worlds');
      const world = { worldId, slotId, status: 'ACTIVE', createdAt, createdByUserId, worldName, description, visibility, joinPolicy };
      tx.set(slotRef, { slotId, status: 'OCCUPIED', worldId, createdAt });
      tx.set(worldRef, world);
      tx.set(participationRef, { worldId, userId: createdByUserId, status: STATUS_ACTIVE, joinedAt: createdAt, derivedIndex: true });
      return world;
    });
  }

  async addParticipationIndex({ worldId, userId, joinedAt = nowIso() }) {
    return this.db.runTransaction(async tx => {
      const worldRef = this._world(worldId), participationRef = this._participation(worldId, userId);
      const activeQuery = this.db.collection(this.names.participation).where('userId', '==', userId).where('status', '==', STATUS_ACTIVE);
      const [worldDoc, participationDoc, activeSnap] = await Promise.all([tx.get(worldRef), tx.get(participationRef), tx.get(activeQuery)]);
      if (!worldDoc.exists || worldDoc.data().status !== 'ACTIVE') throw new PersistenceNotFoundError('Active world not found', { worldId });
      if (participationDoc.exists && participationDoc.data().status === STATUS_ACTIVE) throw new DomainRuleError('User already participates in this world');
      if (activeSnap.size >= MAX_ACTIVE_WORLDS_PER_USER) throw new DomainRuleError('User already participates in five active worlds');
      const index = { worldId, userId, status: STATUS_ACTIVE, joinedAt, derivedIndex: true };
      tx.set(participationRef, index);
      return index;
    });
  }

  async removeParticipationIndex({ worldId, userId }) {
    return this.db.runTransaction(async tx => {
      const ref = this._participation(worldId, userId), doc = await tx.get(ref);
      if (!doc.exists || doc.data().status !== STATUS_ACTIVE) throw new PersistenceNotFoundError('Active participation index not found', { worldId, userId });
      const next = { ...doc.data(), status: STATUS_LEFT, leftAt: nowIso() };
      tx.set(ref, next);
      return next;
    });
  }

  async deleteWorldRegistration({ worldId, expectedCreatedByUserId = null }) {
    const worldRef = this._world(worldId);
    const worldDoc = await worldRef.get();
    if (!worldDoc.exists) return { deleted: false };
    const world = worldDoc.data();
    if (expectedCreatedByUserId && String(world.createdByUserId) !== String(expectedCreatedByUserId)) {
      throw new DomainRuleError('World creator does not match rollback request', { worldId });
    }
    const [participations, invitations, applications] = await Promise.all([
      this.db.collection(this.names.participation).where('worldId', '==', worldId).get(),
      this.db.collection(this.names.invitations).where('worldId', '==', worldId).get(),
      this.db.collection(this.names.applications).where('worldId', '==', worldId).get()
    ]);
    const batch = this.db.batch();
    batch.delete(worldRef);
    batch.delete(this._slot(world.slotId));
    batch.delete(this._progression(worldId));
    participations.docs.forEach(doc => batch.delete(doc.ref));
    invitations.docs.forEach(doc => batch.delete(doc.ref));
    applications.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    return { deleted: true, worldId };
  }

  async listLobbyWorlds(userId) {
    const [worldSnap, participationSnap, applicationSnap] = await Promise.all([
      this.db.collection(this.names.worlds).where('status', '==', 'ACTIVE').get(),
      this.db.collection(this.names.participation).where('status', '==', STATUS_ACTIVE).get(),
      this.db.collection(this.names.applications).where('userId', '==', userId).get()
    ]);
    const participationByWorld = {};
    participationSnap.docs.forEach(doc => {
      const row = doc.data();
      participationByWorld[row.worldId] = participationByWorld[row.worldId] || [];
      participationByWorld[row.worldId].push(row);
    });
    const applications = {};
    applicationSnap.docs.forEach(doc => { const row=doc.data(); applications[row.worldId]=row; });
    return worldSnap.docs.map(doc => doc.data())
      .filter(world => world.visibility === 'PUBLIC' || (participationByWorld[world.worldId] || []).some(row => String(row.userId) === String(userId)))
      .map(world => {
        const participants = participationByWorld[world.worldId] || [];
        const mineRow = participants.find(row => String(row.userId) === String(userId)) || null;
        const application = applications[world.worldId] || null;
        return {
          ...world,
          participantCount: participants.length,
          isMember: Boolean(mineRow),
          membership: mineRow || null,
          applicationStatus: application ? application.status : null
        };
      })
      .sort((a,b) => Number(a.slotId) - Number(b.slotId));
  }

  async getParticipation({ worldId, userId }) {
    const doc = await this._participation(worldId, userId).get();
    return doc.exists && doc.data().status === STATUS_ACTIVE ? doc.data() : null;
  }

  async getWorldProgression(worldId) {
    const doc = await this._progression(worldId).get();
    return doc.exists ? doc.data() : null;
  }

  async ensureWorldRound({
    worldId, revision, timeModel = TIME_MODEL_COUNTDOWN, fixedDeadlineAt = null, setupRequired = false, soloMode = false
  }) {
    const ref = this._progression(worldId);
    return this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      let state = doc.exists ? doc.data() : null;
      if (!state) {
        state = {
          worldId,
          revision:Number(revision),
          roundGeneration:1,
          status:ROUND_STATUS_OPEN,
          roundSetupRequired:Boolean(setupRequired),
          timeModel:(setupRequired || soloMode) ? null : (timeModel === TIME_MODEL_FIXED_SCHEDULE ? TIME_MODEL_FIXED_SCHEDULE : TIME_MODEL_COUNTDOWN),
          readyUserIds:[],
          deadlineAt:(setupRequired || soloMode) ? null : (timeModel === TIME_MODEL_FIXED_SCHEDULE ? (fixedDeadlineAt || null) : null),
          progressionRunId:null,
          leaseId:null,
          leaseExpiresAt:null,
          lastCompletedProgressionRunId:null,
          matchIntentByUserId:{},
          matchdayPlan:null,
          pendingRoundSettingsChange:null,
          lastRoundSettingsDecision:null
        };
      } else {
        if (!state.roundGeneration) state.roundGeneration = 1;
        if (state.status === 'WAITING') state.status = ROUND_STATUS_OPEN;
        if (state.status === 'PROCESSING') state.status = ROUND_STATUS_MATCHDAY;
        state.matchIntentByUserId = state.matchIntentByUserId || {};
        if (!Object.prototype.hasOwnProperty.call(state,'matchdayPlan')) state.matchdayPlan = null;
        if (!Object.prototype.hasOwnProperty.call(state,'pendingRoundSettingsChange')) state.pendingRoundSettingsChange = null;
        if (!Object.prototype.hasOwnProperty.call(state,'lastRoundSettingsDecision')) state.lastRoundSettingsDecision = null;
        if (!Object.prototype.hasOwnProperty.call(state,'roundSetupRequired')) state.roundSetupRequired = false;
        if (state.status === ROUND_STATUS_OPEN) {
          state.revision = Number(revision);
          const wasSetupRequired = Boolean(state.roundSetupRequired);
          state.roundSetupRequired = Boolean(setupRequired);
          if (state.roundSetupRequired || soloMode) {
            state.timeModel = null;
            state.readyUserIds = [];
            state.deadlineAt = null;
            state.matchIntentByUserId = {};
          } else {
            const nextModel = timeModel === TIME_MODEL_FIXED_SCHEDULE ? TIME_MODEL_FIXED_SCHEDULE : TIME_MODEL_COUNTDOWN;
            if (wasSetupRequired || state.timeModel !== nextModel) {
              state.timeModel = nextModel;
              state.readyUserIds = [];
              state.matchIntentByUserId = {};
              state.deadlineAt = nextModel === TIME_MODEL_FIXED_SCHEDULE ? (fixedDeadlineAt || null) : null;
            } else if (nextModel === TIME_MODEL_FIXED_SCHEDULE && !state.deadlineAt && fixedDeadlineAt) {
              state.deadlineAt = fixedDeadlineAt;
            }
          }
        }
      }
      tx.set(ref, state);
      return state;
    });
  }

  async proposeRoundSettingsChange({
    worldId, userId, roundGeneration, proposedSettings,
    evaluationRoundGeneration, effectiveRoundGeneration
  }) {
    const ref = this._progression(worldId);
    return this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new DomainRuleError('Round state not found');
      const state = doc.data();
      if (state.roundSetupRequired) throw new DomainRuleError('Initial round settings must be completed before proposing changes');
      if (state.status !== ROUND_STATUS_OPEN) throw new DomainRuleError('Round settings can only be proposed while the round is open');
      if (Number(state.roundGeneration) !== Number(roundGeneration)) throw new DomainRuleError('Round generation mismatch');
      if (state.pendingRoundSettingsChange) throw new DomainRuleError('A round settings proposal is already active');

      const current = Number(state.roundGeneration);
      const evaluation = Number(evaluationRoundGeneration);
      const effective = Number(effectiveRoundGeneration);
      if (!Number.isInteger(evaluation) || evaluation < current + 1) {
        throw new DomainRuleError('Round settings vote cannot be evaluated before the next full slot has passed', {
          earliestEvaluationRoundGeneration:current + 1
        });
      }
      if (!Number.isInteger(effective) || effective < evaluation + 1) {
        throw new DomainRuleError('Round settings cannot become effective before the vote has ended', {
          earliestEffectiveRoundGeneration:evaluation + 1
        });
      }

      const proposal = {
        id:crypto.randomUUID(),
        status:'VOTING',
        proposedSettings,
        proposedAtRoundGeneration:current,
        earliestEvaluationRoundGeneration:current + 1,
        evaluationRoundGeneration:evaluation,
        effectiveRoundGeneration:effective,
        proposedByUserId:String(userId),
        votesByUserId:{ [String(userId)]:'YES' },
        createdAt:nowIso(),
        decidedAt:null,
        decisionSummary:null
      };
      state.pendingRoundSettingsChange = proposal;
      tx.set(ref, state);
      return proposal;
    });
  }

  async castRoundSettingsVote({ worldId, userId, vote }) {
    const ref = this._progression(worldId);
    return this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new DomainRuleError('Round state not found');
      const state = doc.data();
      const proposal = state.pendingRoundSettingsChange;
      if (!proposal || proposal.status !== 'VOTING') throw new DomainRuleError('No active round settings vote');
      const normalizedVote = String(vote || '').toUpperCase();
      if (normalizedVote !== 'YES' && normalizedVote !== 'NO') throw new DomainRuleError('Vote must be YES or NO');
      proposal.votesByUserId = proposal.votesByUserId || {};
      proposal.votesByUserId[String(userId)] = normalizedVote;
      state.pendingRoundSettingsChange = proposal;
      tx.set(ref, state);
      return proposal;
    });
  }

  async evaluateRoundSettingsChangeForProgression({ worldId, roundGeneration, activeUserIds }) {
    const ref = this._progression(worldId);
    return this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new DomainRuleError('Round state not found');
      const state = doc.data();
      if (Number(state.roundGeneration) !== Number(roundGeneration)) throw new DomainRuleError('Round generation mismatch');
      const proposal = state.pendingRoundSettingsChange;
      if (!proposal || proposal.status !== 'VOTING' ||
          Number(roundGeneration) < Number(proposal.evaluationRoundGeneration)) {
        return state;
      }
      const summary = voteSummary(proposal, activeUserIds);
      if (summary.passed) {
        proposal.status = 'APPROVED';
        proposal.decidedAt = nowIso();
        proposal.decisionSummary = summary;
        state.pendingRoundSettingsChange = proposal;
      } else {
        const rejected = {
          ...proposal,
          status:'REJECTED',
          decidedAt:nowIso(),
          decisionSummary:summary
        };
        state.lastRoundSettingsDecision = rejected;
        state.pendingRoundSettingsChange = null;
      }
      tx.set(ref, state);
      return state;
    });
  }

  async getManagementScopes({ worldId, roundGeneration }) {
    const snap = await this.db.collection(this.names.managementScopes).where('worldId', '==', String(worldId)).get();
    return snap.docs.map(doc => doc.data())
      .filter(row => Number(row.roundGeneration) === Number(roundGeneration))
      .sort((a,b) => String(a.scope).localeCompare(String(b.scope)));
  }

  async commitManagementScopes({
    worldId, userId, roundGeneration, expectedWorldRevision,
    scopeDeltas, expectedScopeRevisions = {}
  }) {
    const progressRef = this._progression(worldId);
    const items = (scopeDeltas || []).map(item => ({
      item,
      ref:this._managementScope(worldId, roundGeneration, item && item.scope)
    }));
    return this.db.runTransaction(async tx => {
      const progressDoc = await tx.get(progressRef);
      if (!progressDoc.exists) throw new DomainRuleError('Round state not found');
      const state = progressDoc.data();
      if (Number(state.roundGeneration) !== Number(roundGeneration)) throw new DomainRuleError('Round generation mismatch');
      if (Number(state.revision) !== Number(expectedWorldRevision)) throw new DomainRuleError('Round world revision mismatch');
      if (state.roundSetupRequired) throw new DomainRuleError('World round settings require initial setup');
      if (state.status !== ROUND_STATUS_OPEN) throw new DomainRuleError('Round is locked for management changes', { status:state.status });
      if ((state.readyUserIds || []).map(String).includes(String(userId))) throw new DomainRuleError('Trainer is already ready for this round');

      const docs = [];
      for (const entry of items) docs.push(await tx.get(entry.ref));
      const existingQuery = this.db.collection(this.names.managementScopes).where('worldId', '==', String(worldId));
      const existingSnap = await tx.get(existingQuery);
      const existingRows = existingSnap.docs.map(doc => doc.data())
        .filter(row => Number(row.roundGeneration) === Number(roundGeneration));
      const staged = [];
      for (let index=0; index<items.length; index+=1) {
        const { item, ref } = items[index];
        if (!item || !item.scope || !item.worldDelta) throw new DomainRuleError('Invalid management scope delta');
        const current = docs[index].exists ? docs[index].data() : null;
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
        const row = {
          worldId:String(worldId),
          roundGeneration:Number(roundGeneration),
          scope:String(item.scope),
          scopeRevision:currentRevision + 1,
          worldDelta:mergeWorldDeltas(current && current.worldDelta, item.worldDelta),
          updatedByUserId:String(userId),
          updatedAt:nowIso()
        };
        staged.push(row);
        tx.set(ref, row);
      }
      return {
        worldId,
        revision:Number(state.revision),
        roundGeneration:Number(state.roundGeneration),
        scopeRows:staged
      };
    });
  }

  async claimDueWorldProgress({ worldId, expectedRevision, activeUserIds, leaseMs = 120000 }) {
    const ref = this._progression(worldId);
    const active = Array.from(new Set((activeUserIds || []).map(String)));
    return this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) return null;
      const state = doc.data();
      if (Number(state.revision) !== Number(expectedRevision)) return state;
      if (!state.roundGeneration) state.roundGeneration = 1;
      if (state.status === 'WAITING') state.status = ROUND_STATUS_OPEN;
      if (state.status === 'PROCESSING') state.status = ROUND_STATUS_MATCHDAY;
      state.matchIntentByUserId = state.matchIntentByUserId || {};
      if (!Object.prototype.hasOwnProperty.call(state,'matchdayPlan')) state.matchdayPlan = null;

      const now = Date.now();
      let reclaimedLease = false;
      if ((state.status === ROUND_STATUS_LOCKING || state.status === ROUND_STATUS_MATCHDAY ||
           state.status === ROUND_STATUS_FINALIZING) &&
          state.leaseExpiresAt && new Date(state.leaseExpiresAt).getTime() <= now) {
        if (state.status === ROUND_STATUS_FINALIZING) {
          state.progressionRetries = Number(state.progressionRetries || 0) + 1;
          if (state.progressionRetries > 2) {
            state.status = 'FAILED';
            state.lastProgressionError = 'Mehrfache Berechnungsfehler. Spielstand unverändert; manuelle Prüfung notwendig.';
            tx.set(ref, state);
            return {...state, shouldAdvance:false};
          }
        }
        state.leaseId = crypto.randomUUID();
        state.leaseExpiresAt = new Date(now + Math.max(30000, Number(leaseMs || 120000))).toISOString();
        reclaimedLease = true;
      }

      const ready = (state.readyUserIds || []).map(String);
      const allReady = active.length > 0 && active.every(id => ready.includes(id));
      const expired = Boolean(state.deadlineAt && new Date(state.deadlineAt).getTime() <= now);
      if (state.roundSetupRequired) {
        tx.set(ref, state);
        return {
          ...state,
          activeTrainerCount:active.length,
          readyTrainerCount:ready.filter(id => active.includes(id)).length,
          shouldAdvance:false
        };
      }
      const due = state.timeModel === TIME_MODEL_FIXED_SCHEDULE ? expired : (allReady || expired);
      let shouldAdvance = reclaimedLease;
      if (state.status === ROUND_STATUS_OPEN && due) {
        state.status = ROUND_STATUS_LOCKING;
        state.progressionRunId = state.progressionRunId || crypto.randomUUID();
        state.leaseId = crypto.randomUUID();
        state.leaseExpiresAt = new Date(now + Math.max(30000, Number(leaseMs || 120000))).toISOString();
        shouldAdvance = true;
      }
      tx.set(ref, state);
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
    const ref = this._progression(worldId);
    const active = Array.from(new Set((activeUserIds || []).map(String)));
    if (!active.includes(String(userId))) throw new DomainRuleError('User is not an active trainer in this world');
    return this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      let state = doc.exists ? doc.data() : null;
      if (!state) {
        state = {
          worldId,
          revision:Number(expectedRevision),
          roundGeneration:1,
          status:ROUND_STATUS_OPEN,
          roundSetupRequired:false,
          timeModel:timeModel === TIME_MODEL_FIXED_SCHEDULE ? TIME_MODEL_FIXED_SCHEDULE : TIME_MODEL_COUNTDOWN,
          readyUserIds:[],
          deadlineAt:null,
          progressionRunId:null,
          leaseId:null,
          leaseExpiresAt:null,
          lastCompletedProgressionRunId:null,
          matchIntentByUserId:{},
          matchdayPlan:null,
          pendingRoundSettingsChange:null,
          lastRoundSettingsDecision:null
        };
      }
      if (!state.roundGeneration) state.roundGeneration = 1;
      if (state.status === 'WAITING') state.status = ROUND_STATUS_OPEN;
      if (state.status === 'PROCESSING') state.status = ROUND_STATUS_MATCHDAY;
      state.matchIntentByUserId = state.matchIntentByUserId || {};
      if (!Object.prototype.hasOwnProperty.call(state,'matchdayPlan')) state.matchdayPlan = null;
      if (!Object.prototype.hasOwnProperty.call(state,'pendingRoundSettingsChange')) state.pendingRoundSettingsChange = null;
      if (!Object.prototype.hasOwnProperty.call(state,'lastRoundSettingsDecision')) state.lastRoundSettingsDecision = null;
      if (state.roundSetupRequired) throw new DomainRuleError('World round settings require initial setup');
      if (roundGeneration != null && Number(state.roundGeneration) !== Number(roundGeneration)) throw new DomainRuleError('Round generation mismatch');
      if (state.status === ROUND_STATUS_OPEN) state.revision = Number(expectedRevision);
      if (Number(state.revision) !== Number(expectedRevision)) throw new DomainRuleError('Progression revision mismatch');

      const now = Date.now();
      if (state.status !== ROUND_STATUS_OPEN) {
        tx.set(ref, state);
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
      tx.set(ref, state);
      return {
        ...state,
        activeTrainerCount:active.length,
        readyTrainerCount:state.readyUserIds.filter(id => active.includes(id)).length,
        shouldAdvance
      };
    });
  }

  async beginMatchday({ worldId, expectedRevision, roundGeneration, leaseId, progressionRunId, matchdayPlan = null }) {
    const ref = this._progression(worldId);
    return this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new DomainRuleError('Progression state not found');
      const state = doc.data();
      if (Number(state.revision) !== Number(expectedRevision) || Number(state.roundGeneration) !== Number(roundGeneration)) throw new DomainRuleError('Progression generation mismatch');
      if (state.status !== ROUND_STATUS_LOCKING ||
          String(state.leaseId || '') !== String(leaseId || '') ||
          String(state.progressionRunId || '') !== String(progressionRunId || '')) {
        throw new DomainRuleError('Progression lease mismatch');
      }
      state.status = ROUND_STATUS_MATCHDAY;
      state.matchdayPlan = matchdayPlan || null;
      if (state.matchdayPlan && !Array.isArray(state.matchdayPlan.completedLiveFixtureIds)) {
        state.matchdayPlan.completedLiveFixtureIds = [];
      }
      tx.set(ref, state);
      return state;
    });
  }

  async markLiveFixtureCompleted({ worldId, roundGeneration, progressionRunId, fixtureId }) {
    const ref = this._progression(worldId);
    return this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new DomainRuleError('Progression state not found');
      const state = doc.data();
      if (state.status !== ROUND_STATUS_MATCHDAY) throw new DomainRuleError('Matchday is not active');
      if (Number(state.roundGeneration) !== Number(roundGeneration) ||
          String(state.progressionRunId || '') !== String(progressionRunId || '')) {
        throw new DomainRuleError('Progression generation mismatch');
      }
      const plan = state.matchdayPlan || {};
      const fixturePlan = (plan.fixturePlans || []).find(row => row && String(row.fixtureId) === String(fixtureId));
      if (!fixturePlan || fixturePlan.mode !== 'LIVE') throw new DomainRuleError('Live fixture is not part of this matchday');
      plan.completedLiveFixtureIds = Array.from(new Set([...(plan.completedLiveFixtureIds || []).map(String), String(fixtureId)]));
      state.matchdayPlan = plan;
      tx.set(ref, state);
      return state;
    });
  }

  async beginFinalizing({ worldId, expectedRevision, roundGeneration, leaseId, progressionRunId }) {
    const ref = this._progression(worldId);
    return this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new DomainRuleError('Progression state not found');
      const state = doc.data();
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
      tx.set(ref, state);
      return state;
    });
  }

  async completeWorldProgress({
    worldId, expectedRevision, nextRevision, leaseId, roundGeneration = null,
    progressionRunId = null, allowCommittedRecovery = false
  }) {
    const ref = this._progression(worldId);
    const completed = await this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new DomainRuleError('Progression state not found');
      const state = doc.data();

      if (progressionRunId &&
          state.status === ROUND_STATUS_OPEN &&
          String(state.lastCompletedProgressionRunId || '') === String(progressionRunId) &&
          Number(state.revision) === Number(nextRevision)) {
        return { next:state, completedGeneration:null, alreadyCompleted:true };
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

      const completedRunId = progressionRunId || state.progressionRunId || null;
      const nextGeneration = Number(state.roundGeneration || 1) + 1;
      let pendingRoundSettingsChange = state.pendingRoundSettingsChange || null;
      let lastRoundSettingsDecision = state.lastRoundSettingsDecision || null;
      if (pendingRoundSettingsChange && pendingRoundSettingsChange.status === 'APPROVED' &&
          Number(pendingRoundSettingsChange.effectiveRoundGeneration) <= nextGeneration) {
        lastRoundSettingsDecision = {
          ...pendingRoundSettingsChange,
          status:'APPLIED',
          appliedRoundGeneration:nextGeneration,
          appliedAt:nowIso()
        };
        pendingRoundSettingsChange = null;
      }
      const next = {
        worldId,
        revision:Number(nextRevision),
        roundGeneration:nextGeneration,
        status:ROUND_STATUS_OPEN,
        roundSetupRequired:false,
        timeModel:state.timeModel || TIME_MODEL_COUNTDOWN,
        readyUserIds:[],
        deadlineAt:null,
        progressionRunId:null,
        leaseId:null,
        leaseExpiresAt:null,
        lastCompletedProgressionRunId:completedRunId,
        progressionRetries:0,
        matchIntentByUserId:{},
        matchdayPlan:null,
        pendingRoundSettingsChange,
        lastRoundSettingsDecision
      };
      tx.set(ref, next);
      return { next, completedGeneration:Number(state.roundGeneration || 1), alreadyCompleted:false };
    });
    if (!completed.alreadyCompleted && completed.completedGeneration != null) {
      try {
        const snap = await this.db.collection(this.names.managementScopes).where('worldId', '==', String(worldId)).get();
        const batch = this.db.batch();
        let count = 0;
        snap.docs.forEach(doc => {
          const row = doc.data();
          if (Number(row.roundGeneration) === completed.completedGeneration) {
            batch.delete(doc.ref);
            count += 1;
          }
        });
        if (count) await batch.commit();
      } catch (_) {}
    }
    return completed.next;
  }

  async releaseWorldProgress({ worldId, expectedRevision, leaseId }) {
    const ref = this._progression(worldId);
    return this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) return null;
      const state = doc.data();
      if (Number(state.revision) !== Number(expectedRevision)) return state;
      if ((state.status === ROUND_STATUS_MATCHDAY || state.status === ROUND_STATUS_LOCKING || state.status === ROUND_STATUS_FINALIZING) &&
          String(state.leaseId || '') === String(leaseId || '')) {
        state.status=ROUND_STATUS_OPEN;
        state.leaseId=null;
        state.leaseExpiresAt=null;
        tx.set(ref, state);
      }
      return state;
    });
  }

  async createWorldApplication({ worldId, userId, displayName = '', createdAt = nowIso() }) {
    const world = await this.getWorld(worldId);
    if (!world || world.status !== 'ACTIVE') throw new PersistenceNotFoundError('Active world not found', { worldId });
    if (world.visibility !== 'PUBLIC' || world.joinPolicy !== 'APPLICATION') throw new DomainRuleError('World does not accept applications');
    if (await this.getParticipation({ worldId, userId })) throw new DomainRuleError('User already participates in this world');
    const ref = this.db.collection(this.names.applications).doc(participationId(worldId, userId));
    const existing = await ref.get();
    if (existing.exists && existing.data().status === 'PENDING') throw new DomainRuleError('Application already pending');
    const application = { applicationId:participationId(worldId, userId), worldId, userId, displayName, status:'PENDING', createdAt };
    await ref.set(application);
    return application;
  }

  async listWorldApplications(worldId) {
    const snap = await this.db.collection(this.names.applications).where('worldId', '==', worldId).where('status', '==', 'PENDING').get();
    return snap.docs.map(doc => doc.data()).sort((a,b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  async getWorldApplication({ worldId, userId }) {
    const doc = await this.db.collection(this.names.applications).doc(participationId(worldId, userId)).get();
    return doc.exists ? doc.data() : null;
  }

  async resolveWorldApplication({ worldId, userId, status, resolvedByUserId }) {
    const ref = this.db.collection(this.names.applications).doc(participationId(worldId, userId));
    const doc = await ref.get();
    if (!doc.exists || doc.data().status !== 'PENDING') throw new PersistenceNotFoundError('Pending application not found', { worldId, userId });
    const next = { ...doc.data(), status, resolvedAt:nowIso(), resolvedByUserId };
    await ref.set(next);
    return next;
  }

  async createInvitation({ worldId, invitedByUserId, invitedUserId = null, inviteId = crypto.randomUUID(), expiresAt = null }) {
    const worldDoc = await this._world(worldId).get();
    if (!worldDoc.exists || worldDoc.data().status !== 'ACTIVE') throw new PersistenceNotFoundError('Active world not found', { worldId });
    const invitation = { inviteId, worldId, invitedByUserId, invitedUserId, status: 'OPEN', createdAt: nowIso(), expiresAt };
    await this.db.collection(this.names.invitations).doc(inviteId).set(invitation);
    return invitation;
  }
}

module.exports = { FirestoreMetadataRepository };
