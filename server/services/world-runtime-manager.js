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
    this.queues.set(key, run.catch(() => {}));
    return run.finally(() => {
      if (this.queues.get(key) === run) this.queues.delete(key);
    });
  }

  async _load(worldId) {
    const key = String(worldId);
    let runtime = this.runtimes.get(key);
    if (runtime) return this._touch(runtime);
    const [manifest, worldRecord, details] = await Promise.all([
      this.worldPersistence.getManifest(key),
      this.worldPersistence.loadWorldRecord(key),
      this.worldPersistence.loadCurrentSeasonDetails(key)
    ]);
    if (!manifest) throw new DomainRuleError('World is not initialized');
    ensureWorldMembershipRoles(worldRecord);
    runtime = {
      worldId: key,
      worldRecord,
      revision: Number(manifest.revision),
      currentSeason: Number(manifest.currentSeason || 1),
      matches: details.matches || [],
      financeEvents: details.financeEvents || [],
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
    const next = clone(incoming);
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
      runtime.matches = clone(matches || []);
      runtime.financeEvents = clone(financeEvents || []);
      this._touch(runtime);
      return {
        revision: runtime.revision,
        currentSeason: runtime.currentSeason,
        committedAt: manifest.committedAt
      };
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
