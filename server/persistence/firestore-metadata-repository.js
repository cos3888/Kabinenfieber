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
      system: `${collectionPrefix}_system`
    };
  }

  _slot(slotId) { return this.db.collection(this.names.slots).doc(String(Number(slotId)).padStart(4, '0')); }
  _world(worldId) { return this.db.collection(this.names.worlds).doc(String(worldId)); }
  _participation(worldId, userId) { return this.db.collection(this.names.participation).doc(participationId(worldId, userId)); }

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

  async createWorldRegistration({ slotId, worldId, createdByUserId, worldName = null, visibility = 'PRIVATE', joinPolicy = 'INVITE_ONLY', createdAt = nowIso() }) {
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
      const world = { worldId, slotId, status: 'ACTIVE', createdAt, createdByUserId, worldName, visibility, joinPolicy };
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
    const [participations, invitations] = await Promise.all([
      this.db.collection(this.names.participation).where('worldId', '==', worldId).get(),
      this.db.collection(this.names.invitations).where('worldId', '==', worldId).get()
    ]);
    const batch = this.db.batch();
    batch.delete(worldRef);
    batch.delete(this._slot(world.slotId));
    participations.docs.forEach(doc => batch.delete(doc.ref));
    invitations.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    return { deleted: true, worldId };
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
