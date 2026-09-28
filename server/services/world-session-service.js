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

  _clubNamesById(record) {
    const clubs = record && record.gameState && record.gameState.clubs;
    const names = {};
    if (!clubs || !clubs.byId) return names;
    Object.keys(clubs.byId).forEach(clubId => {
      const club = clubs.byId[clubId];
      if (club) names[clubId] = club.name || club.clubName || clubId;
    });
    return names;
  }

  async _syncLobbyProjection(record) {
    const clubs = record && record.gameState && record.gameState.clubs;
    await this.metadata.setWorldLobbyProjection({
      worldId: record.id,
      currentSeason: Number(record.gameState.meta && record.gameState.meta.seasonNumber || 1),
      maxPlayers: clubs && Array.isArray(clubs.order) ? clubs.order.length : 0,
      clubNamesById: this._clubNamesById(record)
    });
  }

  async _syncParticipationProjection(worldId, membership) {
    if (!membership) return null;
    return this.metadata.setParticipationProjection({
      worldId,
      userId: membership.userProfileId,
      trainerId: membership.trainerId,
      clubId: membership.clubId || null,
      role: membership.role || 'PLAYER',
      trainerDisplayName: membership.trainerDisplayName || null
    });
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
      await this._syncLobbyProjection(record);
      await this._syncParticipationProjection(record.id, activeMemberships(record)[0]);
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
      const membership = meta.membership || null;
      const clubName = membership && membership.clubId
        ? ((meta.clubNamesById || {})[membership.clubId] || membership.clubId)
        : null;
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
        currentSeason: Number(meta.currentSeason || manifest.currentSeason || 1),
        participantCount: Number(meta.participantCount || 0),
        maxPlayers: Number(meta.maxPlayers || 0),
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
      await this._syncParticipationProjection(worldId, record.memberships.byTrainerId[trainerId]);
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
      await this._syncParticipationProjection(worldId, record.memberships.byTrainerId[trainerId]);
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
    if (transferAdminToUserId) {
      const target = activeMemberships(record).find(row => String(row.userProfileId) === String(transferAdminToUserId));
      if (target) await this._syncParticipationProjection(worldId, target);
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

  async getProgression({ userId, worldId }) {
    const participation = await this.metadata.getParticipation({ worldId, userId });
    if (!participation) throw new DomainRuleError('User is not a member of this world');
    const manifest = await this.worlds.getManifest(worldId);
    if (!manifest) throw new DomainRuleError('Active world not found');
    const stored = await this.metadata.getWorldProgression(worldId);
    if (!stored || Number(stored.revision) !== Number(manifest.revision)) {
      return {
        worldId,
        revision:Number(manifest.revision),
        status:'WAITING',
        readyUserIds:[],
        deadlineAt:null,
        leaseId:null,
        leaseExpiresAt:null,
        shouldAdvance:false
      };
    }
    return stored;
  }

  async markReady({ userId, worldId, expectedRevision }) {
    const participation = await this.metadata.getParticipation({ worldId, userId });
    if (!participation) throw new DomainRuleError('User is not a member of this world');
    const manifest = await this.worlds.getManifest(worldId);
    if (!manifest) throw new DomainRuleError('Active world not found');
    if (Number(expectedRevision) !== Number(manifest.revision)) {
      const error = new Error('World revision mismatch');
      error.code = 'PERSISTENCE_CONFLICT';
      error.details = { worldId, expectedRevision, actualRevision:manifest.revision };
      throw error;
    }
    const activeUserIds = await this.metadata.listActiveUserIdsForWorld(worldId);
    const meta = await this.metadata.getWorld(worldId);
    const durationSeconds = Math.max(15, Number((meta && meta.roundDurationSeconds) || 120));
    return this.metadata.markTrainerReady({
      worldId,
      userId,
      expectedRevision:Number(manifest.revision),
      activeUserIds,
      deadlineAt:new Date(Date.now() + durationSeconds * 1000).toISOString(),
      leaseMs:120000
    });
  }

  async releaseProgress({ userId, worldId, expectedRevision, leaseId }) {
    const participation = await this.metadata.getParticipation({ worldId, userId });
    if (!participation) throw new DomainRuleError('User is not a member of this world');
    return this.metadata.releaseWorldProgress({
      worldId,
      expectedRevision:Number(expectedRevision),
      leaseId
    });
  }

  async openWorld({ userId, worldId }) {
    return this.runtime.openWorld({ userId, worldId });
  }

  async loadMatchDetail({ userId, worldId, matchId }) {
    return this.runtime.loadMatchDetail({ userId, worldId, matchId });
  }

  async saveWorld({ userId, worldId, worldRecord, expectedRevision, matches, financeEvents, progressLeaseId = null }) {
    const activeUserIds = await this.metadata.listActiveUserIdsForWorld(worldId);
    let allowMultiplayerProgress = false;
    if (progressLeaseId) {
      const state = await this.metadata.getWorldProgression(worldId);
      if (!state ||
          Number(state.revision) !== Number(expectedRevision) ||
          state.status !== 'PROCESSING' ||
          String(state.leaseId || '') !== String(progressLeaseId)) {
        throw new DomainRuleError('Progression lease mismatch');
      }
      allowMultiplayerProgress = true;
    } else if (activeUserIds.length > 1) {
      throw new DomainRuleError('Multiplayer snapshot progress requires a progress lease');
    }

    try {
      const result = await this.runtime.saveSnapshot({
        userId, worldId, worldRecord, expectedRevision, matches, financeEvents, allowMultiplayerProgress
      });
      if (progressLeaseId) {
        await this.metadata.completeWorldProgress({
          worldId,
          expectedRevision:Number(expectedRevision),
          nextRevision:Number(result.revision),
          leaseId:progressLeaseId
        }).catch(() => {});
      }
      return result;
    } catch (error) {
      if (progressLeaseId) {
        await this.metadata.releaseWorldProgress({
          worldId,
          expectedRevision:Number(expectedRevision),
          leaseId:progressLeaseId
        }).catch(() => {});
      }
      throw error;
    }
  }

  async saveSlot({ userId, worldId, worldRecord = null, worldDelta = null, expectedRevision, season, slotKey, matches, financeEvents, progressLeaseId = null }) {
    const activeUserIds = await this.metadata.listActiveUserIdsForWorld(worldId);
    if (activeUserIds.length > 1 && !progressLeaseId) throw new DomainRuleError('Multiplayer slot progress requires a progress lease');
    if (progressLeaseId) {
      const state = await this.metadata.getWorldProgression(worldId);
      if (!state ||
          Number(state.revision) !== Number(expectedRevision) ||
          state.status !== 'PROCESSING' ||
          String(state.leaseId || '') !== String(progressLeaseId)) {
        throw new DomainRuleError('Progression lease mismatch');
      }
    }
    try {
      const result = await this.runtime.saveSlot({ userId, worldId, worldRecord, worldDelta, expectedRevision, season, slotKey, matches, financeEvents });
      if (progressLeaseId) {
        await this.metadata.completeWorldProgress({
          worldId,
          expectedRevision:Number(expectedRevision),
          nextRevision:Number(result.revision),
          leaseId:progressLeaseId
        }).catch(() => {});
      }
      return result;
    } catch (error) {
      if (progressLeaseId) {
        await this.metadata.releaseWorldProgress({
          worldId,
          expectedRevision:Number(expectedRevision),
          leaseId:progressLeaseId
        }).catch(() => {});
      }
      throw error;
    }
  }

  async assignClub({ userId, worldId, clubId, expectedRevision }) {
    const result = await this.runtime.assignClub({ userId, worldId, clubId, expectedRevision });
    await this._syncParticipationProjection(worldId, result.membership);
    return result;
  }
}

module.exports = { WorldSessionService };
