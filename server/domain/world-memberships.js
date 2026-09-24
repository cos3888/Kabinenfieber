'use strict';

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
  ensureWorldMembershipRoles,
  setWorldMembershipRole,
  canManageWorld
};
