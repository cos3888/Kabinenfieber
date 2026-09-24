import { DB6_EVENT_TYPES, createEmptyDB6State } from './db6_match_history.js';

const MIN_RATING = 3;
const MAX_RATING = 10;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function isValidEventType(type) {
  return DB6_EVENT_TYPES.includes(type);
}

export function ensureDB6State(state, { createdAt } = {}) {
  if (!state || typeof state !== 'object') return createEmptyDB6State({ createdAt });
  if (!state.db6 || typeof state.db6 !== 'object') {
    state.db6 = createEmptyDB6State({ createdAt });
    return state.db6;
  }
  if (!state.db6.meta || typeof state.db6.meta !== 'object') {
    state.db6.meta = createEmptyDB6State({ createdAt }).meta;
  }
  if (!Array.isArray(state.db6.matches)) state.db6.matches = [];
  if (!Number.isFinite(Number(state.db6.meta.lastMatchNumber))) state.db6.meta.lastMatchNumber = state.db6.matches.length;
  if (!state.db6.meta.database) state.db6.meta.database = 'DB6 Matchhistorie';
  if (!state.db6.meta.version) state.db6.meta.version = 'v1';
  if (!state.db6.meta.createdAt) state.db6.meta.createdAt = createdAt || new Date().toISOString();
  return state.db6;
}

export function createMatchId(db6State) {
  const nextNumber = toNumber(db6State?.meta?.lastMatchNumber, 0) + 1;
  return `m_${String(nextNumber).padStart(6, '0')}`;
}

export function normalizeMatchPlayerEntry(playerEntry, { matchLength = 90 } = {}) {
  const startMinute = Math.max(0, toNumber(playerEntry?.startMinute, playerEntry?.isStarter ? 0 : 0));
  const endMinute = Math.max(startMinute, toNumber(playerEntry?.endMinute, matchLength));
  return {
    playerId: String(playerEntry?.playerId || ''),
    clubId: String(playerEntry?.clubId || ''),
    isStarter: Boolean(playerEntry?.isStarter),
    startMinute,
    endMinute,
    positionSlot: playerEntry?.positionSlot ? String(playerEntry.positionSlot) : '',
    rating: playerEntry?.rating == null ? null : (Number.isFinite(Number(playerEntry.rating)) ? clamp(Number(playerEntry.rating), MIN_RATING, MAX_RATING) : null)
  };
}

export function normalizeMatchEvent(eventEntry, index) {
  const type = String(eventEntry?.type || '');
  if (!isValidEventType(type)) {
    throw new Error(`Ungültiger DB6-Eventtyp: ${type}`);
  }
  return {
    eventIndex: Number.isFinite(Number(eventEntry?.eventIndex)) ? Number(eventEntry.eventIndex) : index + 1,
    minute: Math.max(0, toNumber(eventEntry?.minute, 0)),
    type,
    clubId: String(eventEntry?.clubId || ''),
    playerId: String(eventEntry?.playerId || ''),
    secondaryPlayerId: eventEntry?.secondaryPlayerId ? String(eventEntry.secondaryPlayerId) : null,
    benefitClubId: eventEntry?.benefitClubId ? String(eventEntry.benefitClubId) : null
  };
}
