'use strict';

const crypto = require('crypto');
const { DomainRuleError, PersistenceNotFoundError } = require('./errors');
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
      system: `${collectionPrefix}_system`
    };
  }

  _slot(slotId) { return this.db.collection(this.names.slots).doc(String(Number(slotId)).padStart(4, '0')); }
  _world(worldId) { return this.db.collection(this.names.worlds).doc(String(worldId)); }
  _participation(worldId, userId) { return this.db.collection(this.names.participation).doc(participationId(worldId, userId)); }
  _progression(worldId) { return this.db.collection(this.names.progression).doc(String(worldId)); }

  async listActiveWorldIdsForUser(userId) {
    const snap = await this.db.collection(this.names.participation).where('userId', '==', userId).where('status', '==', STATUS_ACTIVE).get();
    return snap.docs.map(doc => doc.data().worldId);
  }

  async listActiveUserIdsForWorld(worldId) {
    const snap = await this.db.collection(this.names.participation).where('worldId', '==', worldId).where('status', '==', STATUS_ACTIVE).get();
    return snap.docs.map(doc => doc.data().userId);
  }

  async getWorld(worldId) {
    const doc = await this._world(worldId).get();
    return doc.exists ? doc.data() : null;
  }

  async setWorldLobbyProjection({ worldId, currentSeason = 1, maxPlayers = 0, clubNamesById = {} }) {
    const ref = this._world(worldId);
    const doc = await ref.get();
    if (!doc.exists) throw new PersistenceNotFoundError('World not found', { worldId });
    const patch = {
      currentSeason: Number(currentSeason || 1),
      maxPlayers: Number(maxPlayers || 0),
      clubNamesById: clubNamesById || {},
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

  async markTrainerReady({ worldId, userId, expectedRevision, activeUserIds, deadlineAt, leaseMs = 120000 }) {
    const ref = this._progression(worldId);
    const active = Array.from(new Set((activeUserIds || []).map(String)));
    if (!active.includes(String(userId))) throw new DomainRuleError('User is not an active trainer in this world');
    return this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      let state = doc.exists ? doc.data() : null;
      if (!state || Number(state.revision) !== Number(expectedRevision)) {
        state = {
          worldId,
          revision:Number(expectedRevision),
          status:'WAITING',
          readyUserIds:[],
          deadlineAt:null,
          leaseId:null,
          leaseExpiresAt:null
        };
      }
      const now = Date.now();
      if (state.status === 'PROCESSING' && state.leaseExpiresAt && new Date(state.leaseExpiresAt).getTime() <= now) {
        state.status='WAITING';
        state.leaseId=null;
        state.leaseExpiresAt=null;
      }
      state.readyUserIds = Array.from(new Set([...(state.readyUserIds || []).map(String), String(userId)]));
      if (!state.deadlineAt) state.deadlineAt = deadlineAt || new Date(now + 120000).toISOString();
      let shouldAdvance = false;
      if (state.status !== 'PROCESSING') {
        const allReady = active.length > 0 && active.every(id => state.readyUserIds.includes(id));
        const expired = state.deadlineAt && new Date(state.deadlineAt).getTime() <= now;
        if (allReady || expired) {
          state.status='PROCESSING';
          state.leaseId=crypto.randomUUID();
          state.leaseExpiresAt=new Date(now + Math.max(30000, Number(leaseMs || 120000))).toISOString();
          shouldAdvance=true;
        }
      }
      tx.set(ref, state);
      return { ...state, activeTrainerCount:active.length, readyTrainerCount:state.readyUserIds.filter(id => active.includes(id)).length, shouldAdvance };
    });
  }

  async completeWorldProgress({ worldId, expectedRevision, nextRevision, leaseId }) {
    const ref = this._progression(worldId);
    return this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new DomainRuleError('Progression state not found');
      const state = doc.data();
      if (Number(state.revision) !== Number(expectedRevision)) throw new DomainRuleError('Progression revision mismatch');
      if (state.status !== 'PROCESSING' || String(state.leaseId || '') !== String(leaseId || '')) throw new DomainRuleError('Progression lease mismatch');
      const next = {
        worldId,
        revision:Number(nextRevision),
        status:'WAITING',
        readyUserIds:[],
        deadlineAt:null,
        leaseId:null,
        leaseExpiresAt:null
      };
      tx.set(ref, next);
      return next;
    });
  }

  async releaseWorldProgress({ worldId, expectedRevision, leaseId }) {
    const ref = this._progression(worldId);
    return this.db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (!doc.exists) return null;
      const state = doc.data();
      if (Number(state.revision) !== Number(expectedRevision)) return state;
      if (state.status === 'PROCESSING' && String(state.leaseId || '') === String(leaseId || '')) {
        state.status='WAITING';
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
