'use strict';

const { DomainRuleError, PersistenceConflictError } = require('../persistence/errors');
const { applyWorldDelta } = require('../domain/world-delta');
const {
  activeMemberships,
  membershipForUser,
  ensureWorldMembershipRoles
} = require('../domain/world-memberships');

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function mergeMatchesById(current, delta) {
  const byId = new Map((current || []).filter(row => row && row.id != null).map(row => [String(row.id), row]));
  (delta || []).filter(row => row && row.id != null).forEach(row => byId.set(String(row.id), row));
  return Array.from(byId.values());
}

function financeEventIdentity(row) {
  if (!row || row.id == null || row.clubId == null) return '';
  return [Number(row.seasonId || 1), String(row.clubId), String(row.id)].join('|');
}

function mergeFinanceEvents(current, delta) {
  const byIdentity = new Map();
  (current || []).filter(Boolean).forEach(row => {
    const key = financeEventIdentity(row);
    if (key) byIdentity.set(key, row);
  });
  (delta || []).filter(Boolean).forEach(row => {
    const key = financeEventIdentity(row);
    if (key) byIdentity.set(key, row);
  });
  return Array.from(byIdentity.values());
}

function assertManagementDeltaScope(worldDelta) {
  const blockedHistoryRoots = new Set([
    'matches','seasonResults','seasonStandings','playerSeasons',
    'playerMarketValues','previousSeasonRecentContext'
  ]);
  const blocked = (worldDelta && Array.isArray(worldDelta.ops) ? worldDelta.ops : []).find(op => {
    const path = Array.isArray(op && op.path) ? op.path.map(String) : [];
    if (path[0] !== 'gameState') return true;
    if (path[1] === 'calendar' || path[1] === 'meta') return true;
    if (path[1] === 'history' && blockedHistoryRoots.has(path[2])) return true;
    return false;
  });
  if (blocked) {
    throw new DomainRuleError('Management delta may not mutate progression-owned game-state paths');
  }
}

class WorldRuntimeManager {
  constructor({ worldPersistence, metadataRepository, idleMs = 15 * 60 * 1000, now = () => Date.now() }) {
    if (!worldPersistence || !metadataRepository) throw new Error('WorldRuntimeManager requires worldPersistence and metadataRepository');
    this.worldPersistence = worldPersistence;
    this.metadataRepository = metadataRepository;
    this.idleMs = idleMs;
    this.now = now;
    this.runtimes = new Map();
    this.queues = new Map();
  }

  _touch(runtime) {
    runtime.lastAccessAt = this.now();
    return runtime;
  }

  _enqueue(worldId, task) {
    const key = String(worldId);
    const previous = this.queues.get(key) || Promise.resolve();
    const run = previous.then(task);
    const tail = run.catch(() => {});
    this.queues.set(key, tail);
    return run.finally(() => {
      if (this.queues.get(key) === tail) this.queues.delete(key);
    });
  }

  async _compactRuntimeIfNeeded(runtime) {
    if (!runtime || !this.worldPersistence.shouldCompactManifest) return null;
    const manifest = await this.worldPersistence.getManifest(runtime.worldId);
    if (!manifest ||
        Number(manifest.revision) !== Number(runtime.revision) ||
        !this.worldPersistence.shouldCompactManifest(manifest)) return null;
    try {
      return await this.worldPersistence.compactWorld({
        worldId:runtime.worldId,
        expectedRevision:runtime.revision,
        worldRecord:runtime.worldRecord
      });
    } catch (error) {
      if (error && error.code === 'PERSISTENCE_CONFLICT') return null;
      return null;
    }
  }

  async _load(worldId) {
    const key = String(worldId);
    const manifest = await this.worldPersistence.getManifest(key);
    if (!manifest) throw new DomainRuleError('World is not initialized');

    let runtime = this.runtimes.get(key);
    if (runtime && Number(runtime.revision) === Number(manifest.revision)) {
      return this._touch(runtime);
    }

    const snapshot = await this.worldPersistence.loadRuntimeSnapshot(key, manifest);
    ensureWorldMembershipRoles(snapshot.worldRecord);
    runtime = {
      worldId: key,
      worldRecord: snapshot.worldRecord,
      revision: Number(snapshot.manifest.revision),
      currentSeason: Number(snapshot.currentSeason || 1),
      matches: mergeMatchesById([], snapshot.matches || []),
      financeEvents: mergeFinanceEvents([], snapshot.financeEvents || []),
      lastAccessAt: this.now()
    };
    this.runtimes.set(key, runtime);
    await this._compactRuntimeIfNeeded(runtime);
    return runtime;
  }

  async openWorld({ worldId, userId }) {
    return this._enqueue(worldId, async () => {
      const runtime = await this._load(worldId);
      const membership = membershipForUser(runtime.worldRecord, userId);
      if (!membership) throw new DomainRuleError('User is not a member of this world');
      this._touch(runtime);
      return {
        worldRecord: runtime.worldRecord,
        revision: runtime.revision,
        currentSeason: runtime.currentSeason,
        matches: [],
        financeEvents: runtime.financeEvents,
        membership: clone(membership)
      };
    });
  }

  async loadMatchDetail({ worldId, userId, matchId }) {
    return this._enqueue(worldId, async () => {
      const runtime = await this._load(worldId);
      const membership = membershipForUser(runtime.worldRecord, userId);
      if (!membership) throw new DomainRuleError('User is not a member of this world');
      this._touch(runtime);
      return this.worldPersistence.loadMatchDetail(worldId, matchId);
    });
  }

  _canonicalizeSingleUserSnapshot(runtime, userId, incoming) {
    if (!incoming || String(incoming.id) !== String(runtime.worldRecord.id)) throw new DomainRuleError('World snapshot does not match worldId');
    const active = activeMemberships(runtime.worldRecord);
    if (active.length !== 1 || String(active[0].userProfileId) !== String(userId)) {
      throw new DomainRuleError('Full snapshot save is disabled for multiplayer worlds');
    }
    const incomingMembership = membershipForUser(incoming, userId);
    if (!incomingMembership ||
        String(incomingMembership.trainerId) !== String(active[0].trainerId) ||
        String(incomingMembership.userProfileId) !== String(active[0].userProfileId)) {
      throw new DomainRuleError('World membership identity cannot be changed by a snapshot');
    }
    const next = incoming;
    next.createdByUserId = runtime.worldRecord.createdByUserId;
    next.memberships = clone(runtime.worldRecord.memberships);
    const serverMembership = next.memberships.byTrainerId[active[0].trainerId];
    serverMembership.clubId = incomingMembership.clubId || null;
    serverMembership.lastActivityAt = incomingMembership.lastActivityAt || new Date(this.now()).toISOString();
    if (incomingMembership.trainerDisplayName) serverMembership.trainerDisplayName = incomingMembership.trainerDisplayName;
    ensureWorldMembershipRoles(next);
    return next;
  }

  _canonicalizeProgressSnapshot(runtime, userId, incoming) {
    if (!incoming || String(incoming.id) !== String(runtime.worldRecord.id)) throw new DomainRuleError('World snapshot does not match worldId');
    if (!incoming.gameState || String(((incoming.gameState||{}).meta||{}).id || '') !== String(runtime.worldRecord.id)) {
      throw new DomainRuleError('World snapshot gameState identity does not match worldId');
    }
    const membership = membershipForUser(runtime.worldRecord, userId);
    if (!membership) throw new DomainRuleError('User is not a member of this world');
    const next = incoming;
    next.createdByUserId = runtime.worldRecord.createdByUserId;
    next.createdAt = runtime.worldRecord.createdAt;
    next.creationRules = clone(runtime.worldRecord.creationRules);
    next.runtimeSettings = clone(runtime.worldRecord.runtimeSettings);
    next.memberships = clone(runtime.worldRecord.memberships);
    ensureWorldMembershipRoles(next);
    return next;
  }

  async saveSnapshot({ worldId, userId, worldRecord, expectedRevision, matches = [], financeEvents = [], allowMultiplayerProgress = false, progressionRunId = null, roundGeneration = null, progressionLeaseId = null }) {
    return this._enqueue(worldId, async () => {
      const runtime = await this._load(worldId);
      if (Number(expectedRevision) !== Number(runtime.revision)) {
        throw new PersistenceConflictError('World revision mismatch', {
          worldId,
          expectedRevision,
          actualRevision: runtime.revision
        });
      }
      const nextRecord = allowMultiplayerProgress
        ? this._canonicalizeProgressSnapshot(runtime, userId, worldRecord)
        : this._canonicalizeSingleUserSnapshot(runtime, userId, worldRecord);
      const season = Number(nextRecord.gameState && nextRecord.gameState.meta && nextRecord.gameState.meta.seasonNumber || runtime.currentSeason || 1);
      const manifest = await this.worldPersistence.commitRuntimeSnapshot({
        worldRecord: nextRecord,
        season,
        matches,
        financeEvents,
        expectedRevision: runtime.revision,
        progressionRunId,
        roundGeneration,
        progressionLeaseId
      });
      runtime.worldRecord = nextRecord;
      runtime.revision = Number(manifest.revision);
      runtime.currentSeason = Number(manifest.currentSeason);
      runtime.matches = matches || [];
      runtime.financeEvents = financeEvents || [];
      this._touch(runtime);
      return {
        revision: runtime.revision,
        currentSeason: runtime.currentSeason,
        committedAt: manifest.committedAt
      };
    });
  }

  async assignClub({ worldId, userId, clubId, expectedRevision }) {
    return this._enqueue(worldId, async () => {
      const runtime = await this._load(worldId);
      if (Number(expectedRevision) !== Number(runtime.revision)) {
        throw new PersistenceConflictError('World revision mismatch', { worldId, expectedRevision, actualRevision: runtime.revision });
      }
      const membership = membershipForUser(runtime.worldRecord, userId);
      if (!membership) throw new DomainRuleError('User is not a member of this world');
      const clubs = runtime.worldRecord.gameState && runtime.worldRecord.gameState.clubs;
      if (!clubs || !clubs.byId || !clubs.byId[clubId]) throw new DomainRuleError('Club does not exist');
      const occupied = activeMemberships(runtime.worldRecord).some(row => row !== membership && String(row.clubId || '') === String(clubId));
      if (occupied) throw new DomainRuleError('Club is already assigned');
      if (membership.clubId && String(membership.clubId) !== String(clubId)) throw new DomainRuleError('Trainer already controls a club');
      const previousClubId = membership.clubId || null;
      const previousActivityAt = membership.lastActivityAt || null;
      membership.clubId = clubId;
      membership.lastActivityAt = new Date(this.now()).toISOString();
      let manifest;
      try {
        manifest = await this.worldPersistence.commitWorldRecord({ worldRecord: runtime.worldRecord, expectedRevision: runtime.revision });
      } catch (error) {
        membership.clubId = previousClubId;
        membership.lastActivityAt = previousActivityAt;
        throw error;
      }
      runtime.revision = Number(manifest.revision);
      this._touch(runtime);
      return { revision: runtime.revision, currentSeason: runtime.currentSeason, committedAt: manifest.committedAt, membership: clone(membership) };
    });
  }

  async saveManagementDelta({ worldId, userId, worldDelta, expectedRevision }) {
    return this._enqueue(worldId, async () => {
      const runtime = await this._load(worldId);
      if (Number(expectedRevision) !== Number(runtime.revision)) {
        throw new PersistenceConflictError('World revision mismatch', { worldId, expectedRevision, actualRevision: runtime.revision });
      }
      const membership = membershipForUser(runtime.worldRecord, userId);
      if (!membership) throw new DomainRuleError('User is not a member of this world');
      assertManagementDeltaScope(worldDelta);

      const applied = applyWorldDelta(runtime.worldRecord, worldDelta, { captureUndo: true });
      let manifest;
      try {
        manifest = await this.worldPersistence.commitWorldDelta({
          worldId,
          worldDelta,
          expectedRevision: runtime.revision
        });
      } catch (error) {
        if (applied.undoDelta) applyWorldDelta(runtime.worldRecord, applied.undoDelta);
        throw error;
      }
      runtime.worldRecord = applied.worldRecord;
      runtime.revision = Number(manifest.revision);
      this._touch(runtime);
      await this._compactRuntimeIfNeeded(runtime);
      return {
        revision: runtime.revision,
        currentSeason: runtime.currentSeason,
        committedAt: manifest.committedAt
      };
    });
  }

  async saveSlot({ worldId, userId, worldRecord = null, worldDelta = null, expectedRevision, season, slotKey, matches = [], financeEvents = [], progressionRunId = null, roundGeneration = null, progressionLeaseId = null }) {
    return this._enqueue(worldId, async () => {
      const runtime = await this._load(worldId);
      if (Number(expectedRevision) !== Number(runtime.revision)) {
        throw new PersistenceConflictError('World revision mismatch', { worldId, expectedRevision, actualRevision: runtime.revision });
      }
      const membership = membershipForUser(runtime.worldRecord, userId);
      if (!membership) throw new DomainRuleError('User is not a member of this world');

      let nextRecord = null;
      let undoDelta = null;
      if (worldDelta) {
        const applied = applyWorldDelta(runtime.worldRecord, worldDelta, { captureUndo: true });
        nextRecord = applied.worldRecord;
        undoDelta = applied.undoDelta;
      } else {
        nextRecord = this._canonicalizeSingleUserSnapshot(runtime, userId, worldRecord);
      }

      let manifest;
      try {
        manifest = await this.worldPersistence.commitSlot({
          worldId,
          worldRecord: worldDelta ? null : nextRecord,
          worldDelta,
          season,
          slotKey,
          matches,
          financeEvents,
          expectedRevision: runtime.revision,
          progressionRunId,
          roundGeneration,
          progressionLeaseId
        });
      } catch (error) {
        if (undoDelta) applyWorldDelta(runtime.worldRecord, undoDelta);
        throw error;
      }
      runtime.worldRecord = nextRecord;
      runtime.revision = Number(manifest.revision);
      runtime.currentSeason = Number(manifest.currentSeason);
      runtime.matches = mergeMatchesById(runtime.matches, matches);
      runtime.financeEvents = mergeFinanceEvents(runtime.financeEvents, financeEvents);
      this._touch(runtime);
      await this._compactRuntimeIfNeeded(runtime);
      return { revision: runtime.revision, currentSeason: runtime.currentSeason, committedAt: manifest.committedAt };
    });
  }

  unloadInactive() {
    const now = this.now();
    const unloaded = [];
    for (const [worldId, runtime] of this.runtimes.entries()) {
      if (this.queues.has(worldId)) continue;
      if (now - Number(runtime.lastAccessAt || 0) < this.idleMs) continue;
      this.runtimes.delete(worldId);
      unloaded.push(worldId);
    }
    return unloaded;
  }

  async unloadWorld(worldId) {
    const key = String(worldId);
    if (this.queues.has(key)) await this.queues.get(key).catch(() => {});
    return this.runtimes.delete(key);
  }

  status() {
    return {
      loadedWorldCount: this.runtimes.size,
      queuedWorldCount: this.queues.size,
      idleMs: this.idleMs,
      worlds: Array.from(this.runtimes.values()).map(runtime => ({
        worldId: runtime.worldId,
        revision: runtime.revision,
        currentSeason: runtime.currentSeason,
        lastAccessAt: new Date(runtime.lastAccessAt).toISOString()
      }))
    };
  }
}

module.exports = { WorldRuntimeManager };
