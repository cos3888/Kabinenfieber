'use strict';

const WORLD_DELTA_SCHEMA = 'kf-world-delta-0.31.0';
const FORBIDDEN_PATH_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizePath(path) {
  if (!Array.isArray(path) || !path.length) throw new Error('World delta path is required');
  const parts = path.map(part => String(part));
  if (parts[0] !== 'gameState') throw new Error('World delta may only mutate gameState');
  for (const part of parts) {
    if (!part || FORBIDDEN_PATH_KEYS.has(part)) throw new Error('Invalid world delta path');
  }
  return parts;
}

function validateWorldDelta(delta, expectedWorldId = null) {
  if (!delta || delta.schemaVersion !== WORLD_DELTA_SCHEMA) throw new Error('Unsupported world delta schema');
  if (expectedWorldId != null && String(delta.worldId || '') !== String(expectedWorldId)) throw new Error('World delta does not match worldId');
  if (!Array.isArray(delta.ops)) throw new Error('World delta ops are required');
  if (delta.ops.length > 250000) throw new Error('World delta contains too many operations');
  delta.ops.forEach(op => {
    if (!op || typeof op !== 'object') throw new Error('Invalid world delta operation');
    normalizePath(op.path);
    if (op.delete === true) return;
    if (!Object.prototype.hasOwnProperty.call(op, 'value')) throw new Error('World delta set operation requires value');
  });
  return delta;
}

function readPath(root, path) {
  let current = root;
  for (const key of path) {
    if (current == null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, key)) {
      return { exists: false, value: undefined };
    }
    current = current[key];
  }
  return { exists: true, value: current };
}

function ensureParent(root, path) {
  let current = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) current[key] = {};
    current = current[key];
  }
  return current;
}

function setPath(root, path, value) {
  const parent = ensureParent(root, path);
  parent[path[path.length - 1]] = cloneJson(value);
}

function deletePath(root, path) {
  let current = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, key)) return;
    current = current[key];
  }
  if (current && typeof current === 'object') delete current[path[path.length - 1]];
}

function applyWorldDelta(worldRecord, delta, { captureUndo = false } = {}) {
  if (!worldRecord || !worldRecord.id || !worldRecord.gameState) throw new Error('WorldRecord is incomplete');
  validateWorldDelta(delta, worldRecord.id);
  const undo = [];
  for (const rawOp of delta.ops) {
    const path = normalizePath(rawOp.path);
    if (captureUndo) {
      const before = readPath(worldRecord, path);
      undo.push(before.exists
        ? { path, value: cloneJson(before.value) }
        : { path, delete: true });
    }
    if (rawOp.delete === true) deletePath(worldRecord, path);
    else setPath(worldRecord, path, rawOp.value);
  }
  if (String((worldRecord.gameState.meta || {}).id || '') !== String(worldRecord.id)) {
    throw new Error('World delta changed gameState identity');
  }
  return captureUndo
    ? { worldRecord, undoDelta: { schemaVersion: WORLD_DELTA_SCHEMA, worldId: worldRecord.id, ops: undo.reverse() } }
    : { worldRecord };
}

module.exports = {
  WORLD_DELTA_SCHEMA,
  validateWorldDelta,
  applyWorldDelta
};
