'use strict';

const { DomainRuleError } = require('../persistence/errors');
const { WORLD_DELTA_SCHEMA, validateWorldDelta } = require('./world-delta');

const ROUND_STATUS_OPEN = 'OPEN';
const ROUND_STATUS_LOCKING = 'LOCKING';
const ROUND_STATUS_MATCHDAY = 'MATCHDAY';
const ROUND_STATUS_FINALIZING = 'FINALIZING';
const TIME_MODEL_COUNTDOWN = 'COUNTDOWN';
const TIME_MODEL_FIXED_SCHEDULE = 'FIXED_SCHEDULE';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function operationKey(op) {
  return JSON.stringify((op && op.path || []).map(String));
}

function operationPath(op) {
  return Array.isArray(op && op.path) ? op.path.map(String) : [];
}

function pathsOverlap(left, right) {
  const a = operationPath(left);
  const b = operationPath(right);
  const common = Math.min(a.length, b.length);
  for (let index=0; index<common; index+=1) {
    if (a[index] !== b[index]) return false;
  }
  return common > 0;
}

function operationsEquivalent(left, right) {
  const a = left || {};
  const b = right || {};
  if (a.delete === true || b.delete === true) return a.delete === true && b.delete === true;
  return JSON.stringify(a.value) === JSON.stringify(b.value);
}

function findConflictingDeltaPath(existingDelta, incomingDelta) {
  for (const incoming of (incomingDelta && incomingDelta.ops) || []) {
    for (const existing of (existingDelta && existingDelta.ops) || []) {
      if (!pathsOverlap(existing, incoming)) continue;
      if (operationKey(existing) === operationKey(incoming) && operationsEquivalent(existing, incoming)) continue;
      return operationPath(incoming).join('.');
    }
  }
  return null;
}

function mergeWorldDeltas(base, incoming) {
  if (!base) return clone(incoming);
  const order = [];
  const byPath = new Map();
  for (const op of [...(base.ops || []), ...(incoming.ops || [])]) {
    const key = operationKey(op);
    if (!byPath.has(key)) order.push(key);
    byPath.set(key, clone(op));
  }
  return {
    schemaVersion: incoming.schemaVersion || base.schemaVersion || WORLD_DELTA_SCHEMA,
    worldId: incoming.worldId || base.worldId,
    ops: order.map(key => byPath.get(key))
  };
}

function ownedClubId(membership) {
  return membership && membership.clubId != null ? String(membership.clubId) : '';
}

function requireOwnedClub(membership, clubId) {
  const owned = ownedClubId(membership);
  if (!owned || String(clubId || '') !== owned) {
    throw new DomainRuleError('Trainer may only mutate resources owned by the assigned club', {
      assignedClubId: owned || null,
      requestedClubId: clubId || null
    });
  }
  return owned;
}

function classifyOperation(worldRecord, membership, op) {
  const path = Array.isArray(op && op.path) ? op.path.map(String) : [];
  if (path[0] !== 'gameState') throw new DomainRuleError('Management delta may only mutate gameState');

  const root = path[1];
  if (root === 'calendar' || root === 'meta' || root === 'history') {
    throw new DomainRuleError('Management delta may not mutate progression-owned game-state paths');
  }

  if (root === 'squads' && path[2]) {
    const clubId = requireOwnedClub(membership, path[2]);
    return `SQUAD:${clubId}`;
  }

  if (root === 'clubs' && path[2] === 'byId' && path[3]) {
    const clubId = requireOwnedClub(membership, path[3]);
    return `CLUB:${clubId}`;
  }

  if (root === 'clubFinances' && path[2] === 'byClub' && path[3]) {
    const clubId = requireOwnedClub(membership, path[3]);
    return `CLUB:${clubId}`;
  }

  if (root === 'clubMailboxes' && path[2] === 'byClub' && path[3]) {
    const clubId = requireOwnedClub(membership, path[3]);
    return `CLUB:${clubId}`;
  }

  if (root === 'players' && path[2] === 'byId' && path[3]) {
    const playerId = path[3];
    const player = worldRecord && worldRecord.gameState && worldRecord.gameState.players &&
      worldRecord.gameState.players.byId && worldRecord.gameState.players.byId[playerId];
    if (!player) throw new DomainRuleError('Management delta references an unknown player', { playerId });
    requireOwnedClub(membership, player.clubId);
    return `PLAYER:${playerId}`;
  }

  if (root === 'scouting') {
    if (!membership || !membership.trainerId) throw new DomainRuleError('Trainer identity is required for scouting changes');
    return `SCOUTING:${membership.trainerId}`;
  }

  if (root === 'training') {
    const clubId = path[2] === 'byClub' && path[3] ? path[3] : path[2];
    requireOwnedClub(membership, clubId);
    return `CLUB:${clubId}`;
  }

  throw new DomainRuleError('Unsupported multiplayer management path', { path });
}

function splitManagementDeltaByScope(worldRecord, membership, worldDelta) {
  validateWorldDelta(worldDelta, worldRecord && worldRecord.id);
  const grouped = new Map();
  for (const op of worldDelta.ops || []) {
    const scope = classifyOperation(worldRecord, membership, op);
    if (!grouped.has(scope)) grouped.set(scope, []);
    grouped.get(scope).push(clone(op));
  }
  if (!grouped.size) throw new DomainRuleError('Management delta has no operations');
  return Array.from(grouped.entries()).map(([scope, ops]) => ({
    scope,
    worldDelta: {
      schemaVersion: worldDelta.schemaVersion,
      worldId: worldDelta.worldId,
      ops
    }
  }));
}

function scopeRevisionMap(rows) {
  const result = {};
  for (const row of rows || []) {
    if (!row || !row.scope) continue;
    result[String(row.scope)] = Number(row.scopeRevision || 0);
  }
  return result;
}

module.exports = {
  ROUND_STATUS_OPEN,
  ROUND_STATUS_LOCKING,
  ROUND_STATUS_MATCHDAY,
  ROUND_STATUS_FINALIZING,
  TIME_MODEL_COUNTDOWN,
  TIME_MODEL_FIXED_SCHEDULE,
  mergeWorldDeltas,
  findConflictingDeltaPath,
  splitManagementDeltaByScope,
  scopeRevisionMap
};
