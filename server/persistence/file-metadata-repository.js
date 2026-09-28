'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { DomainRuleError, PersistenceNotFoundError } = require('./errors');

const STATUS_ACTIVE = 'ACTIVE';
const STATUS_LEFT = 'LEFT';
const MAX_WORLD_SLOTS = 1000;
const MAX_ACTIVE_WORLDS_PER_USER = 5;

function nowIso() { return new Date().toISOString(); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function participationKey(worldId, userId) { return `${worldId}__${userId}`; }

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
      return parsed;
    } catch (error) {
      if (error && error.code === 'ENOENT') return { schemaVersion: 1, slots: {}, worlds: {}, participationIndex: {}, invitations: {}, applications: {} };
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

  async getWorld(worldId) {
    const data = await this._read();
    return data.worlds[worldId] ? clone(data.worlds[worldId]) : null;
  }

  async setWorldLobbyProjection({ worldId, currentSeason = 1, maxPlayers = 0, clubNamesById = {} }) {
    return this._mutate(data => {
      const world = data.worlds[worldId];
      if (!world) throw new PersistenceNotFoundError('World not found', { worldId });
      world.currentSeason = Number(currentSeason || 1);
      world.maxPlayers = Number(maxPlayers || 0);
      world.clubNamesById = clone(clubNamesById || {});
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
        const mine = participants.some(row => String(row.userId) === String(userId));
        const application = data.applications[participationKey(world.worldId, userId)] || null;
        return {
          ...clone(world),
          participantCount: participants.length,
          isMember: mine,
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
