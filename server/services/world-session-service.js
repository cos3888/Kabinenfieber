'use strict';

const { DomainRuleError } = require('../persistence/errors');
const { ensureWorldMembershipRoles, activeMemberships, membershipForUser, createMembershipForUser, removeMembershipForUser } = require('../domain/world-memberships');
const { MAX_WORLD_SLOTS, MAX_ACTIVE_WORLDS_PER_USER } = require('../persistence/file-metadata-repository');
const { normalizeWorldName, normalizeWorldDescription, normalizeStartVariant, normalizeWorldAccess } = require('../domain/world-metadata');

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

  async _claimFreeSlot(worldId, userId, createdAt, worldMetadata) {
    let lastError = null;
    for (let slotId = 1; slotId <= MAX_WORLD_SLOTS; slotId += 1) {
      const slot = await this.metadata.getSlot(slotId);
      if (slot && slot.status === 'OCCUPIED') continue;
      try {
        return await this.metadata.createWorldRegistration({
          slotId, worldId, createdByUserId: userId, createdAt,
          worldName: worldMetadata.worldName,
          description: worldMetadata.description,
          startVariant: worldMetadata.startVariant,
          visibility: worldMetadata.visibility,
          joinPolicy: worldMetadata.joinPolicy
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

  async createWorld({ userId, worldRecord, worldName, description, startVariant, visibility, joinPolicy, matches = [], financeEvents = [] }) {
    const record = this._prepareInitialWorld(worldRecord, userId);
    const access = normalizeWorldAccess({ visibility, joinPolicy });
    const normalizedStartVariant = normalizeStartVariant(startVariant || (record.creationRules && record.creationRules.startVariant));
    record.creationRules = { ...(record.creationRules || {}), startVariant: normalizedStartVariant };
    const worldMetadata = {
      worldName: normalizeWorldName(worldName),
      description: normalizeWorldDescription(description),
      startVariant: normalizedStartVariant,
      visibility: access.visibility,
      joinPolicy: access.joinPolicy
    };
    const createdAt = record.createdAt || new Date().toISOString();
    const registration = await this._claimFreeSlot(record.id, userId, createdAt, worldMetadata);
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
      await this.worlds.deleteWorld(record.id).catch(() => {});
      await this.metadata.deleteWorldRegistration({ worldId: record.id, expectedCreatedByUserId: userId }).catch(() => {});
      throw error;
    }
  }

  async listWorlds(userId) {
    const registrations = await this.metadata.listVisibleWorldRegistrations(userId);
    const activeIds = await this.metadata.listActiveWorldIdsForUser(userId);
    const activeSet = new Set(activeIds.map(String));
    const worlds = [];
    for (const meta of registrations) {
      const worldId = meta.worldId;
      const manifest = await this.worlds.getManifest(worldId);
      if (!manifest) continue;
      const record = await this.worlds.loadWorldRecord(worldId);
      const members = activeMemberships(record);
      const membership = membershipForUser(record, userId);
      const application = membership ? null : await this.metadata.getApplication(worldId, userId);
      const openApplications = membership && membership.role === 'WORLD_ADMIN'
        ? await this.metadata.listApplicationsForWorld(worldId)
        : [];
      worlds.push({
        worldId,
        slotId: meta.slotId,
        worldName: meta.worldName || `Welt ${meta.slotId}`,
        description: meta.description || '',
        startVariant: meta.startVariant || ((record.creationRules || {}).startVariant) || 'classic',
        visibility: meta.visibility || 'PRIVATE',
        joinPolicy: meta.joinPolicy || 'INVITE_ONLY',
        createdAt: meta.createdAt,
        revision: Number(manifest.revision),
        currentSeason: Number(manifest.currentSeason || 1),
        participantCount: members.length,
        maxParticipants: (((record.gameState || {}).clubs || {}).order || []).length,
        mine: Boolean(membership),
        membership: membership ? clone(membership) : null,
        applicationStatus: application && application.status || null,
        openApplicationCount: openApplications.length,
        canJoin: !membership && meta.visibility === 'PUBLIC' && meta.joinPolicy === 'OPEN',
        canApply: !membership && meta.visibility === 'PUBLIC' && meta.joinPolicy === 'APPLICATION' && !(application && application.status === 'OPEN')
      });
    }
    return {
      worlds: worlds.sort((a, b) => Number(a.slotId) - Number(b.slotId)),
      activeWorldCount: activeSet.size,
      maxActiveWorlds: MAX_ACTIVE_WORLDS_PER_USER
    };
  }

  async joinWorld({ userId, displayName, worldId }) {
    const meta = await this.metadata.getWorld(worldId);
    if (!meta || meta.status !== 'ACTIVE') throw new DomainRuleError('World is not active');
    if (meta.visibility !== 'PUBLIC' || meta.joinPolicy !== 'OPEN') throw new DomainRuleError('World does not allow direct joining');
    const participation = await this.metadata.getParticipation(worldId, userId);
    if (participation && participation.status === 'ACTIVE') throw new DomainRuleError('User already participates in this world');
    await this.metadata.addParticipationIndex({ worldId, userId });
    try {
      const manifest = await this.worlds.getManifest(worldId);
      const record = await this.worlds.loadWorldRecord(worldId);
      const membership = createMembershipForUser(record, { userId, displayName });
      const committed = await this.worlds.commitWorldRecord({ worldRecord: record, expectedRevision: manifest.revision });
      await this.runtime.unloadWorld(worldId);
      return { membership: clone(membership), revision: Number(committed.revision), currentSeason: Number(committed.currentSeason || manifest.currentSeason || 1) };
    } catch (error) {
      await this.metadata.removeParticipationIndex({ worldId, userId }).catch(() => {});
      throw error;
    }
  }

  async applyToWorld({ userId, displayName, worldId }) {
    return this.metadata.createApplication({ worldId, userId, displayName });
  }

  async listApplications({ actorUserId, worldId }) {
    const record = await this.worlds.loadWorldRecord(worldId);
    const actor = membershipForUser(record, actorUserId);
    if (!actor || actor.role !== 'WORLD_ADMIN') throw new DomainRuleError('Only a world admin may review applications');
    return this.metadata.listApplicationsForWorld(worldId);
  }

  async decideApplication({ actorUserId, worldId, applicantUserId, decision }) {
    const record = await this.worlds.loadWorldRecord(worldId);
    const actor = membershipForUser(record, actorUserId);
    if (!actor || actor.role !== 'WORLD_ADMIN') throw new DomainRuleError('Only a world admin may review applications');
    const applications = await this.metadata.listApplicationsForWorld(worldId);
    const application = applications.find(row => String(row.userId) === String(applicantUserId));
    if (!application) throw new DomainRuleError('Open application not found');
    const normalized = String(decision || '').toUpperCase();
    if (normalized === 'REJECT') {
      await this.metadata.setApplicationStatus({ worldId, userId: applicantUserId, status:'REJECTED' });
      return { accepted:false };
    }
    if (normalized !== 'ACCEPT') throw new DomainRuleError('Invalid application decision');
    await this.metadata.addParticipationIndex({ worldId, userId: applicantUserId });
    try {
      const manifest = await this.worlds.getManifest(worldId);
      const current = await this.worlds.loadWorldRecord(worldId);
      const membership = createMembershipForUser(current, { userId: applicantUserId, displayName: application.displayName });
      const committed = await this.worlds.commitWorldRecord({ worldRecord: current, expectedRevision: manifest.revision });
      await this.metadata.setApplicationStatus({ worldId, userId: applicantUserId, status:'ACCEPTED' });
      await this.runtime.unloadWorld(worldId);
      return { accepted:true, membership:clone(membership), revision:Number(committed.revision) };
    } catch (error) {
      await this.metadata.removeParticipationIndex({ worldId, userId: applicantUserId }).catch(() => {});
      throw error;
    }
  }

  async leaveWorld({ userId, worldId }) {
    const manifest = await this.worlds.getManifest(worldId);
    if (!manifest) throw new DomainRuleError('World is not initialized');
    const record = await this.worlds.loadWorldRecord(worldId);
    const active = activeMemberships(record);
    const membership = membershipForUser(record, userId);
    if (!membership) throw new DomainRuleError('User is not a member of this world');
    if (active.length === 1) {
      return this.deleteWorld({ userId, worldId, allowLastParticipant: true });
    }
    removeMembershipForUser(record, userId);
    const committed = await this.worlds.commitWorldRecord({ worldRecord: record, expectedRevision: manifest.revision });
    await this.metadata.removeParticipationIndex({ worldId, userId });
    await this.runtime.unloadWorld(worldId);
    return { deleted: false, left: true, revision: Number(committed.revision) };
  }

  async deleteWorld({ userId, worldId, allowLastParticipant = false }) {
    const meta = await this.metadata.getWorld(worldId);
    if (!meta || meta.status !== 'ACTIVE') throw new DomainRuleError('World is not active');
    const record = await this.worlds.loadWorldRecord(worldId);
    const membership = membershipForUser(record, userId);
    if (!membership) throw new DomainRuleError('User is not a member of this world');
    const members = activeMemberships(record);
    if (!allowLastParticipant && membership.role !== 'WORLD_ADMIN') throw new DomainRuleError('Only a world admin may delete the world');
    if (allowLastParticipant && members.length !== 1) throw new DomainRuleError('World still has other participants');
    await this.runtime.unloadWorld(worldId);
    await this.worlds.deleteWorld(worldId);
    await this.metadata.deleteWorldRegistration({ worldId });
    return { deleted: true, worldId };
  }

  async openWorld({ userId, worldId }) {
    return this.runtime.openWorld({ userId, worldId });
  }

  async saveWorld({ userId, worldId, worldRecord, expectedRevision, matches, financeEvents }) {
    return this.runtime.saveSnapshot({ userId, worldId, worldRecord, expectedRevision, matches, financeEvents });
  }

  async saveSlot({ userId, worldId, worldRecord, expectedRevision, season, slotKey, matches, financeEvents }) {
    return this.runtime.saveSlot({ userId, worldId, worldRecord, expectedRevision, season, slotKey, matches, financeEvents });
  }

  async assignClub({ userId, worldId, clubId, expectedRevision }) {
    return this.runtime.assignClub({ userId, worldId, clubId, expectedRevision });
  }
}

module.exports = { WorldSessionService };
