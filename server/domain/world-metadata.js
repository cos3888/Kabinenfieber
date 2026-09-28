'use strict';

const { DomainRuleError } = require('../persistence/errors');

const WORLD_VISIBILITY_PUBLIC = 'PUBLIC';
const WORLD_VISIBILITY_PRIVATE = 'PRIVATE';
const JOIN_POLICY_OPEN = 'OPEN';
const JOIN_POLICY_APPLICATION = 'APPLICATION';
const JOIN_POLICY_INVITE_ONLY = 'INVITE_ONLY';

function normalizeWorldName(value) {
  const name = String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 40) {
    throw new DomainRuleError('World name must contain 3-40 characters');
  }
  return name;
}

function normalizeWorldDescription(value) {
  const description = String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (description.length > 200) throw new DomainRuleError('World description must contain at most 200 characters');
  return description;
}

function normalizeStartVariant(value) {
  const variant = String(value || 'classic').toLowerCase();
  if (variant !== 'classic') throw new DomainRuleError('Unsupported start variant');
  return variant;
}

function normalizeWorldAccess({ visibility, joinPolicy } = {}) {
  const nextVisibility = String(visibility || WORLD_VISIBILITY_PRIVATE).toUpperCase();
  const nextJoinPolicy = String(joinPolicy || JOIN_POLICY_INVITE_ONLY).toUpperCase();
  const allowed =
    (nextVisibility === WORLD_VISIBILITY_PUBLIC && nextJoinPolicy === JOIN_POLICY_OPEN) ||
    (nextVisibility === WORLD_VISIBILITY_PUBLIC && nextJoinPolicy === JOIN_POLICY_APPLICATION) ||
    (nextVisibility === WORLD_VISIBILITY_PRIVATE && nextJoinPolicy === JOIN_POLICY_INVITE_ONLY);
  if (!allowed) {
    throw new DomainRuleError('Unsupported world visibility/join policy combination');
  }
  return { visibility: nextVisibility, joinPolicy: nextJoinPolicy };
}

module.exports = {
  WORLD_VISIBILITY_PUBLIC,
  WORLD_VISIBILITY_PRIVATE,
  JOIN_POLICY_OPEN,
  JOIN_POLICY_APPLICATION,
  JOIN_POLICY_INVITE_ONLY,
  normalizeWorldName,
  normalizeWorldDescription,
  normalizeStartVariant,
  normalizeWorldAccess
};
