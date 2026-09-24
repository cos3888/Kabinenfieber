import { DB7_EVENT_TYPES, createEmptyDB7State } from './db7_simulation_state.js';

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function ensureDB7State(state, { createdAt } = {}) {
  if (!state || typeof state !== 'object') return createEmptyDB7State({ createdAt });
  if (!state.db7 || typeof state.db7 !== 'object') {
    state.db7 = createEmptyDB7State({ createdAt });
    return state.db7;
  }
  if (!state.db7.meta || typeof state.db7.meta !== 'object') state.db7.meta = createEmptyDB7State({ createdAt }).meta;
  if (!state.db7.config || typeof state.db7.config !== 'object') state.db7.config = createEmptyDB7State({ createdAt }).config;
  if (!state.db7.profiles || typeof state.db7.profiles !== 'object') state.db7.profiles = createEmptyDB7State({ createdAt }).profiles;
  if (!Array.isArray(state.db7.profiles.eventTypes)) state.db7.profiles.eventTypes = [...DB7_EVENT_TYPES];
  if (!Number.isFinite(Number(state.db7.meta.lastSimulationNumber))) state.db7.meta.lastSimulationNumber = 0;
  if (!state.db7.meta.database) state.db7.meta.database = 'DB7 Spielsimulation';
  if (!state.db7.meta.version) state.db7.meta.version = 'v1';
  if (!state.db7.meta.createdAt) state.db7.meta.createdAt = createdAt || new Date().toISOString();
  return state.db7;
}

export function createSimulationId(db7State) {
  const nextNumber = toNumber(db7State?.meta?.lastSimulationNumber, 0) + 1;
  return `sim_${String(nextNumber).padStart(6, '0')}`;
}

export function buildSeededRandom(seedInput) {
  let seed = 0;
  const source = String(seedInput || 'kabinenfieber');
  for (let i = 0; i < source.length; i += 1) {
    seed = ((seed * 31) + source.charCodeAt(i)) >>> 0;
  }
  if (seed === 0) seed = 123456789;
  return function seededRandom() {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 4294967296;
  };
}

export function randomInt(random, min, max) {
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return Math.floor(random() * (high - low + 1)) + low;
}

export function weightedPick(items, getWeight, random) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  const total = list.reduce((sum, item) => sum + Math.max(0, Number(getWeight(item) || 0)), 0);
  if (total <= 0) return list[0] || null;
  let roll = random() * total;
  for (const item of list) {
    roll -= Math.max(0, Number(getWeight(item) || 0));
    if (roll <= 0) return item;
  }
  return list[list.length - 1] || null;
}

export function normalizePosition(position) {
  return String(position || '').toUpperCase();
}

export function attackingWeightForPlayer(player) {
  const mainPosition = normalizePosition(player?.mainPosition || player?.positionSlot);
  const overall = toNumber(player?.overall, 50);
  const map = {
    ST: 1.45, HS: 1.35, LF: 1.28, RF: 1.28, OM: 1.18,
    LM: 0.95, RM: 0.95, ZM: 0.88, DM: 0.72,
    LV: 0.45, RV: 0.45, IV: 0.28, TW: 0.05
  };
  return Math.max(1, overall * (map[mainPosition] || 0.7));
}

export function cardWeightForPlayer(player) {
  const mainPosition = normalizePosition(player?.mainPosition || player?.positionSlot);
  const map = { IV: 1.25, LV: 1.15, RV: 1.15, DM: 1.2, ZM: 1.0, OM: 0.85, LM: 0.9, RM: 0.9, ST: 0.8, HS: 0.8, LF: 0.75, RF: 0.75, TW: 0.6 };
  return map[mainPosition] || 1;
}

export function simpleAverage(values) {
  const numbers = (values || []).map(value => Number(value)).filter(Number.isFinite);
  if (!numbers.length) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}
