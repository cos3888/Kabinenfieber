'use strict';

const crypto = require('crypto');
const { DomainRuleError, PersistenceNotFoundError } = require('../persistence/errors');

const ROLE_PLAYER = 'PLAYER';
const ROLE_WORLD_ADMIN = 'WORLD_ADMIN';

function isActive(membership) {
  return membership && String(membership.status || 'active').toLowerCase() === 'active';
}

function membershipList(worldRecord) {
  const memberships = worldRecord && worldRecord.memberships;
  if (!memberships) return [];
  if (memberships.byTrainerId && typeof memberships.byTrainerId === 'object') {
    const order = Array.isArray(memberships.order) ? memberships.order : Object.keys(memberships.byTrainerId);
    return order.map(id => memberships.byTrainerId[id]).filter(Boolean);
  }
  return [];
}

function activeMemberships(worldRecord) {
  return membershipList(worldRecord).filter(isActive);
}

function membershipForUser(worldRecord, userId) {
  return activeMemberships(worldRecord).find(m => String(m.userProfileId) === String(userId)) || null;
}

function createMembershipForUser(worldRecord, { userId, displayName, role = ROLE_PLAYER } = {}) {
  if (!worldRecord || !worldRecord.memberships || !worldRecord.memberships.byTrainerId) throw new DomainRuleError('World memberships are missing');
  if (!userId) throw new DomainRuleError('User id is required');
  if (membershipForUser(worldRecord, userId)) throw new DomainRuleError('User already participates in this world');
  const clubs = worldRecord.gameState && worldRecord.gameState.clubs;
  const maxHumans = clubs && Array.isArray(clubs.order) ? clubs.order.length : 0;
  if (maxHumans && activeMemberships(worldRecord).length >= maxHumans) throw new DomainRuleError('World has no free club slots');
  const trainerId = 'trainer-' + crypto.randomUUID();
  const now = new Date().toISOString();
  const membership = {
    trainerId,
    userProfileId: userId,
    clubId: null,
    status: 'active',
    role: role === ROLE_WORLD_ADMIN ? ROLE_WORLD_ADMIN : ROLE_PLAYER,
    joinedAt: now,
    lastActivityAt: now,
    trainerDisplayName: String(displayName || 'Trainer').slice(0, 40)
  };
  worldRecord.memberships.byTrainerId[trainerId] = membership;
  worldRecord.memberships.order = Array.isArray(worldRecord.memberships.order) ? worldRecord.memberships.order : [];
  worldRecord.memberships.order.push(trainerId);
  return membership;
}

function removeMembershipForUser(worldRecord, userId) {
  ensureWorldMembershipRoles(worldRecord);
  const membership = membershipForUser(worldRecord, userId);
  if (!membership) throw new PersistenceNotFoundError('Membership not found', { userId });
  const active = activeMemberships(worldRecord);
  const admins = active.filter(row => row.role === ROLE_WORLD_ADMIN);
  if (membership.role === ROLE_WORLD_ADMIN && admins.length <= 1 && active.length > 1) {
    throw new DomainRuleError('Last world admin must transfer administration before leaving');
  }
  delete worldRecord.memberships.byTrainerId[membership.trainerId];
  worldRecord.memberships.order = (worldRecord.memberships.order || []).filter(id => String(id) !== String(membership.trainerId));
  return { membership, remaining: activeMemberships(worldRecord) };
}

function ensureWorldMembershipRoles(worldRecord) {
  const active = activeMemberships(worldRecord);
  if (!active.length) return { changed: false, adminUserId: null };
  let changed = false;
  for (const membership of active) {
    if (membership.role !== ROLE_PLAYER && membership.role !== ROLE_WORLD_ADMIN) {
      membership.role = ROLE_PLAYER;
      changed = true;
    }
  }
  let admins = active.filter(m => m.role === ROLE_WORLD_ADMIN);
  if (!admins.length) {
    const creator = active.find(m => String(m.userProfileId) === String(worldRecord.createdByUserId));
    const initialAdmin = creator || active[0];
    initialAdmin.role = ROLE_WORLD_ADMIN;
    changed = true;
    admins = [initialAdmin];
  }
  return { changed, adminUserId: admins[0] ? admins[0].userProfileId : null };
}

function setWorldMembershipRole(worldRecord, { actorUserId, targetUserId, role }) {
  if (![ROLE_PLAYER, ROLE_WORLD_ADMIN].includes(role)) throw new DomainRuleError('Invalid world role', { role });
  ensureWorldMembershipRoles(worldRecord);
  const actor = membershipForUser(worldRecord, actorUserId);
  if (!actor || actor.role !== ROLE_WORLD_ADMIN) throw new DomainRuleError('Only a world admin may change world roles');
  const target = membershipForUser(worldRecord, targetUserId);
  if (!target) throw new PersistenceNotFoundError('Target membership not found', { targetUserId });
  if (target.role === ROLE_WORLD_ADMIN && role === ROLE_PLAYER) {
    const admins = activeMemberships(worldRecord).filter(m => m.role === ROLE_WORLD_ADMIN);
    if (admins.length <= 1) throw new DomainRuleError('A world must keep at least one world admin');
  }
  target.role = role;
  target.lastActivityAt = target.lastActivityAt || new Date().toISOString();
  return target;
}

function canManageWorld(worldRecord, userId) {
  ensureWorldMembershipRoles(worldRecord);
  const membership = membershipForUser(worldRecord, userId);
  return Boolean(membership && membership.role === ROLE_WORLD_ADMIN);
}

module.exports = {
  ROLE_PLAYER,
  ROLE_WORLD_ADMIN,
  activeMemberships,
  membershipForUser,
  createMembershipForUser,
  removeMembershipForUser,
  ensureWorldMembershipRoles,
  setWorldMembershipRole,
  canManageWorld
};
