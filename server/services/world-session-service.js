'use strict';

const { DomainRuleError } = require('../persistence/errors');
const { ensureWorldMembershipRoles, activeMemberships, membershipForUser } = require('../domain/world-memberships');
const { MAX_WORLD_SLOTS } = require('../persistence/file-metadata-repository');

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

class WorldSessionService {
  constructor({ metadataRepository, worldPersistence, runtimeManager }) {
    if (!metadataRepository || !worldPersistence || !runtimeManager) throw new Error('WorldSessionService dependencies are required');
    this.metadata = metadataRepository;
    this.worlds = worldPersistence;
    this.runtime = runtimeManager;
  }

  _prepareInitialWorld(worldRecord, userId) {
    if (!worldRecord || !worldRecord.id || !worldRecord.gameState || !worldRecord.gameState.meta) throw new DomainRuleError('Initial WorldRecord is incomplete');
    if (String(worldRecord.gameState.meta.id) !== String(worldRecord.id)) throw new DomainRuleError('WorldRecord id and gameState.meta.id must match');
    const record = clone(worldRecord);
    record.createdByUserId = userId;
    const members = activeMemberships(record);
    if (members.length !== 1 || String(members[0].userProfileId) !== String(userId)) {
      throw new DomainRuleError('A new world must start with exactly one authenticated human user');
    }
    ensureWorldMembershipRoles(record);
    return record;
  }

  async _claimFreeSlot(worldId, userId, createdAt) {
    let lastError = null;
    for (let slotId = 1; slotId <= MAX_WORLD_SLOTS; slotId += 1) {
      const slot = await this.metadata.getSlot(slotId);
      if (slot && slot.status === 'OCCUPIED') continue;
      try {
        return await this.metadata.createWorldRegistration({
          slotId, worldId, createdByUserId: userId, createdAt
        });
      } catch (error) {
        lastError = error;
        if (error && error.code === 'DOMAIN_RULE_VIOLATION' && /slot/i.test(String(error.message || ''))) continue;
        throw error;
      }
    }
    if (lastError) throw lastError;
    throw new DomainRuleError('No free world slot available');
  }

  async createWorld({ userId, worldRecord, matches = [], financeEvents = [] }) {
    const record = this._prepareInitialWorld(worldRecord, userId);
    const createdAt = record.createdAt || new Date().toISOString();
    const registration = await this._claimFreeSlot(record.id, userId, createdAt);
    try {
      const manifest = await this.worlds.initializeWorld({ worldRecord: record });
      if ((matches && matches.length) || (financeEvents && financeEvents.length)) {
        await this.worlds.commitRuntimeSnapshot({
          worldRecord: record,
          season: Number(record.gameState.meta.seasonNumber || 1),
          matches,
          financeEvents,
          expectedRevision: manifest.revision
        });
      }
      const opened = await this.runtime.openWorld({ worldId: record.id, userId });
      return { registration, ...opened };
    } catch (error) {
      await this.metadata.deleteWorldRegistration({ worldId: record.id, expectedCreatedByUserId: userId }).catch(() => {});
      throw error;
    }
  }

  async listWorlds(userId) {
    const ids = await this.metadata.listActiveWorldIdsForUser(userId);
    const worlds = [];
    for (const worldId of ids) {
      const [meta, manifest] = await Promise.all([
        this.metadata.getWorld(worldId),
        this.worlds.getManifest(worldId)
      ]);
      if (!meta || meta.status !== 'ACTIVE' || !manifest) continue;
      worlds.push({
        worldId,
        slotId: meta.slotId,
        createdAt: meta.createdAt,
        revision: Number(manifest.revision),
        currentSeason: Number(manifest.currentSeason || 1)
      });
    }
    return worlds.sort((a, b) => Number(a.slotId) - Number(b.slotId));
  }

  async openWorld({ userId, worldId }) {
    return this.runtime.openWorld({ userId, worldId });
  }

  async saveWorld({ userId, worldId, worldRecord, expectedRevision, matches, financeEvents }) {
    const canonical = await this.runtime.openWorld({ userId, worldId });
    if (!membershipForUser(canonical.worldRecord, userId)) throw new DomainRuleError('User is not a member of this world');
    return this.runtime.saveSnapshot({ userId, worldId, worldRecord, expectedRevision, matches, financeEvents });
  }
}

module.exports = { WorldSessionService };
