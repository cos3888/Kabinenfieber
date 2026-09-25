'use strict';

const { DomainRuleError, PersistenceConflictError } = require('../persistence/errors');
const {
  activeMemberships,
  membershipForUser,
  ensureWorldMembershipRoles
} = require('../domain/world-memberships');

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

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
      matches: snapshot.matches || [],
      financeEvents: snapshot.financeEvents || [],
      lastAccessAt: this.now()
    };
    this.runtimes.set(key, runtime);
    return runtime;
  }

  async openWorld({ worldId, userId }) {
    return this._enqueue(worldId, async () => {
      const runtime = await this._load(worldId);
      const membership = membershipForUser(runtime.worldRecord, userId);
      if (!membership) throw new DomainRuleError('User is not a member of this world');
      this._touch(runtime);
      return {
        worldRecord: clone(runtime.worldRecord),
        revision: runtime.revision,
        currentSeason: runtime.currentSeason,
        matches: clone(runtime.matches),
        financeEvents: clone(runtime.financeEvents),
        membership: clone(membership)
      };
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

  async saveSnapshot({ worldId, userId, worldRecord, expectedRevision, matches = [], financeEvents = [] }) {
    return this._enqueue(worldId, async () => {
      const runtime = await this._load(worldId);
      if (Number(expectedRevision) !== Number(runtime.revision)) {
        throw new PersistenceConflictError('World revision mismatch', {
          worldId,
          expectedRevision,
          actualRevision: runtime.revision
        });
      }
      const nextRecord = this._canonicalizeSingleUserSnapshot(runtime, userId, worldRecord);
      const season = Number(nextRecord.gameState && nextRecord.gameState.meta && nextRecord.gameState.meta.seasonNumber || runtime.currentSeason || 1);
      const manifest = await this.worldPersistence.commitRuntimeSnapshot({
        worldRecord: nextRecord,
        season,
        matches,
        financeEvents,
        expectedRevision: runtime.revision
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

  async saveSlot({ worldId, userId, worldRecord, expectedRevision, season, slotKey, matches = [], financeEvents = [] }) {
    return this._enqueue(worldId, async () => {
      const runtime = await this._load(worldId);
      if (Number(expectedRevision) !== Number(runtime.revision)) {
        throw new PersistenceConflictError('World revision mismatch', { worldId, expectedRevision, actualRevision: runtime.revision });
      }
      const nextRecord = this._canonicalizeSingleUserSnapshot(runtime, userId, worldRecord);
      const manifest = await this.worldPersistence.commitSlot({
        worldRecord: nextRecord,
        season,
        slotKey,
        matches,
        financeEvents,
        expectedRevision: runtime.revision
      });
      runtime.worldRecord = nextRecord;
      runtime.revision = Number(manifest.revision);
      runtime.currentSeason = Number(manifest.currentSeason);
      const mergeById = (current, delta) => {
        const byId = new Map((current || []).filter(Boolean).map(row => [String(row.id || ''), row]));
        (delta || []).filter(Boolean).forEach(row => byId.set(String(row.id || ''), row));
        return Array.from(byId.values());
      };
      runtime.matches = mergeById(runtime.matches, matches);
      runtime.financeEvents = mergeById(runtime.financeEvents, financeEvents);
      this._touch(runtime);
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
