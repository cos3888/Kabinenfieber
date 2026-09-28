'use strict';

const crypto = require('crypto');
const { DomainRuleError } = require('../persistence/errors');
const { ROLE_WORLD_ADMIN, ensureWorldMembershipRoles, activeMemberships, membershipForUser } = require('../domain/world-memberships');
const { MAX_WORLD_SLOTS, MAX_ACTIVE_WORLDS_PER_USER } = require('../persistence/file-metadata-repository');
const { normalizeWorldName, normalizeWorldAccess } = require('../domain/world-metadata');

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

  async createWorld({ userId, worldRecord, worldName, description = '', visibility, joinPolicy, matches = [], financeEvents = [] }) {
    const record = this._prepareInitialWorld(worldRecord, userId);
    const access = normalizeWorldAccess({ visibility, joinPolicy });
    const worldMetadata = {
      worldName: normalizeWorldName(worldName),
      description: String(description || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 200),
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
    const rows = await this.metadata.listLobbyWorlds(userId);
    const worlds = [];
    for (const meta of rows) {
      const manifest = await this.worlds.getManifest(meta.worldId);
      if (!manifest) continue;
      let membership = null;
      let active = [];
      let clubName = null;
      let maxPlayers = 0;
      try {
        const record = await this.worlds.loadWorldRecord(meta.worldId);
        ensureWorldMembershipRoles(record);
        active = activeMemberships(record);
        membership = membershipForUser(record, userId);
        const clubs = record.gameState && record.gameState.clubs;
        maxPlayers = clubs && Array.isArray(clubs.order) ? clubs.order.length : 0;
        if (membership && membership.clubId && clubs && clubs.byId && clubs.byId[membership.clubId]) {
          clubName = clubs.byId[membership.clubId].name || clubs.byId[membership.clubId].clubName || membership.clubId;
        }
      } catch (_) {}
      worlds.push({
        worldId: meta.worldId,
        slotId: meta.slotId,
        worldName: meta.worldName || `Welt ${meta.slotId}`,
        description: meta.description || '',
        visibility: meta.visibility || 'PRIVATE',
        joinPolicy: meta.joinPolicy || 'INVITE_ONLY',
        createdAt: meta.createdAt,
        createdByUserId: meta.createdByUserId,
        revision: Number(manifest.revision),
        currentSeason: Number(manifest.currentSeason || 1),
        participantCount: Number(meta.participantCount || active.length || 0),
        maxPlayers,
        isMember: Boolean(membership),
        membership: membership ? clone(membership) : null,
        clubName,
        applicationStatus: meta.applicationStatus || null,
        isAdmin: Boolean(membership && membership.role === ROLE_WORLD_ADMIN)
      });
    }
    return worlds.sort((a, b) => Number(a.slotId) - Number(b.slotId));
  }

  async joinWorld({ userId, displayName, worldId }) {
    const meta = await this.metadata.getWorld(worldId);
    if (!meta || meta.status !== 'ACTIVE') throw new DomainRuleError('Active world not found');
    if (meta.visibility !== 'PUBLIC' || meta.joinPolicy !== 'OPEN') throw new DomainRuleError('World does not allow direct joining');
    const record = await this.worlds.loadWorldRecord(worldId);
    ensureWorldMembershipRoles(record);
    if (membershipForUser(record, userId)) throw new DomainRuleError('User already participates in this world');
    const trainerId = 'trainer-' + crypto.randomUUID();
    const joinedAt = new Date().toISOString();
    record.memberships.byTrainerId[trainerId] = {
      trainerId,
      userProfileId:userId,
      clubId:null,
      status:'active',
      joinedAt,
      lastActivityAt:joinedAt,
      trainerDisplayName:String(displayName || 'Trainer').slice(0, 40),
      role:'PLAYER'
    };
    record.memberships.order.push(trainerId);
    const manifest = await this.worlds.getManifest(worldId);
    await this.metadata.addParticipationIndex({ worldId, userId, joinedAt });
    try {
      const next = await this.worlds.commitWorldRecord({ worldRecord:record, expectedRevision:manifest.revision });
      await this.runtime.unloadWorld(worldId);
      return { revision:Number(next.revision), currentSeason:Number(next.currentSeason || manifest.currentSeason || 1), membership:clone(record.memberships.byTrainerId[trainerId]) };
    } catch (error) {
      await this.metadata.removeParticipationIndex({ worldId, userId }).catch(() => {});
      throw error;
    }
  }

  async applyToWorld({ userId, displayName, worldId }) {
    const activeWorldIds = await this.metadata.listActiveWorldIdsForUser(userId);
    if (activeWorldIds.length >= MAX_ACTIVE_WORLDS_PER_USER) {
      throw new DomainRuleError('User already participates in five active worlds');
    }
    return this.metadata.createWorldApplication({ worldId, userId, displayName });
  }

  async listApplications({ userId, worldId }) {
    const record = await this.worlds.loadWorldRecord(worldId);
    ensureWorldMembershipRoles(record);
    const actor = membershipForUser(record, userId);
    if (!actor || actor.role !== ROLE_WORLD_ADMIN) throw new DomainRuleError('Only a world admin may review applications');
    return this.metadata.listWorldApplications(worldId);
  }

  async resolveApplication({ actorUserId, worldId, applicantUserId, accept }) {
    const record = await this.worlds.loadWorldRecord(worldId);
    ensureWorldMembershipRoles(record);
    const actor = membershipForUser(record, actorUserId);
    if (!actor || actor.role !== ROLE_WORLD_ADMIN) throw new DomainRuleError('Only a world admin may review applications');
    const application = await this.metadata.getWorldApplication({ worldId, userId:applicantUserId });
    if (!application || application.status !== 'PENDING') throw new DomainRuleError('Pending application not found');
    if (!accept) {
      return this.metadata.resolveWorldApplication({ worldId, userId:applicantUserId, status:'REJECTED', resolvedByUserId:actorUserId });
    }
    const meta = await this.metadata.getWorld(worldId);
    if (!meta || meta.status !== 'ACTIVE' || meta.joinPolicy !== 'APPLICATION') throw new DomainRuleError('World does not accept applications');
    if (membershipForUser(record, applicantUserId)) throw new DomainRuleError('User already participates in this world');
    const trainerId='trainer-'+crypto.randomUUID();
    const joinedAt=new Date().toISOString();
    record.memberships.byTrainerId[trainerId]={
      trainerId,userProfileId:applicantUserId,clubId:null,status:'active',joinedAt,lastActivityAt:joinedAt,
      trainerDisplayName:String(application.displayName || 'Trainer').slice(0,40),role:'PLAYER'
    };
    record.memberships.order.push(trainerId);
    const manifest=await this.worlds.getManifest(worldId);
    await this.metadata.addParticipationIndex({ worldId, userId:applicantUserId, joinedAt });
    try {
      const next=await this.worlds.commitWorldRecord({ worldRecord:record, expectedRevision:manifest.revision });
      await this.metadata.resolveWorldApplication({ worldId, userId:applicantUserId, status:'ACCEPTED', resolvedByUserId:actorUserId });
      await this.runtime.unloadWorld(worldId);
      return { revision:Number(next.revision), membership:clone(record.memberships.byTrainerId[trainerId]) };
    } catch(error) {
      await this.metadata.removeParticipationIndex({ worldId, userId:applicantUserId }).catch(()=>{});
      throw error;
    }
  }

  async leaveWorld({ userId, worldId, transferAdminToUserId = null }) {
    const record = await this.worlds.loadWorldRecord(worldId);
    ensureWorldMembershipRoles(record);
    const membership = membershipForUser(record, userId);
    if (!membership) throw new DomainRuleError('User is not a member of this world');
    const active = activeMemberships(record);
    if (active.length === 1) return this.deleteWorld({ userId, worldId });
    const admins=active.filter(row => row.role === ROLE_WORLD_ADMIN);
    if (membership.role === ROLE_WORLD_ADMIN && admins.length === 1) {
      if (!transferAdminToUserId) throw new DomainRuleError('Last world admin must transfer administration before leaving');
      const target=active.find(row => String(row.userProfileId) === String(transferAdminToUserId) && row !== membership);
      if (!target) throw new DomainRuleError('Admin transfer target is not an active world member');
      target.role=ROLE_WORLD_ADMIN;
    }
    const previousParticipation=await this.metadata.getParticipation({ worldId, userId });
    membership.status='left';
    membership.leftAt=new Date().toISOString();
    membership.clubId=null;
    const manifest=await this.worlds.getManifest(worldId);
    await this.metadata.removeParticipationIndex({ worldId, userId });
    let next;
    try {
      next=await this.worlds.commitWorldRecord({ worldRecord:record, expectedRevision:manifest.revision });
    } catch (error) {
      if (previousParticipation) {
        await this.metadata.addParticipationIndex({
          worldId,
          userId,
          joinedAt:previousParticipation.joinedAt || new Date().toISOString()
        }).catch(() => {});
      }
      throw error;
    }
    await this.runtime.unloadWorld(worldId);
    return { deleted:false, revision:Number(next.revision) };
  }

  async deleteWorld({ userId, worldId }) {
    const record = await this.worlds.loadWorldRecord(worldId);
    ensureWorldMembershipRoles(record);
    const membership = membershipForUser(record, userId);
    const active=activeMemberships(record);
    if (!membership || membership.role !== ROLE_WORLD_ADMIN) throw new DomainRuleError('Only a world admin may delete a world');
    if (active.length > 1) throw new DomainRuleError('A world with other active players cannot be deleted');
    await this.runtime.unloadWorld(worldId);
    await this.metadata.deleteWorldRegistration({ worldId });
    await this.worlds.deleteWorld(worldId);
    return { deleted:true, worldId };
  }

  async openWorld({ userId, worldId }) {
    return this.runtime.openWorld({ userId, worldId });
  }

  async saveWorld({ userId, worldId, worldRecord, expectedRevision, matches, financeEvents }) {
    return this.runtime.saveSnapshot({ userId, worldId, worldRecord, expectedRevision, matches, financeEvents });
  }

  async saveSlot({ userId, worldId, worldRecord = null, worldDelta = null, expectedRevision, season, slotKey, matches, financeEvents }) {
    return this.runtime.saveSlot({ userId, worldId, worldRecord, worldDelta, expectedRevision, season, slotKey, matches, financeEvents });
  }

  async assignClub({ userId, worldId, clubId, expectedRevision }) {
    return this.runtime.assignClub({ userId, worldId, clubId, expectedRevision });
  }
}

module.exports = { WorldSessionService };
