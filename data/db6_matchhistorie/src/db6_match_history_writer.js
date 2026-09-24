import { createEmptyDB6State } from './db6_match_history.js';
import { calculateMatchRating, resolveClubResult } from './db6_match_rating_logic.js';
import { createMatchId, ensureDB6State, normalizeMatchEvent, normalizeMatchPlayerEntry, toNumber } from './db6_match_history_helpers.js';

export function buildMatchHistoryEntry({ state, matchInput }) {
  const db6State = ensureDB6State(state || { db6: createEmptyDB6State() }, { createdAt: matchInput?.createdAt });
  const matchLength = Math.max(90, toNumber(matchInput?.matchLength, 90));
  const normalizedPlayers = (matchInput?.players || []).map(player => normalizeMatchPlayerEntry(player, { matchLength }));
  const normalizedEvents = (matchInput?.events || []).map((event, index) => normalizeMatchEvent(event, index));

  const matchId = createMatchId(db6State);
  const homeGoals = toNumber(matchInput?.homeGoals, 0);
  const awayGoals = toNumber(matchInput?.awayGoals, 0);
  const homeClubId = String(matchInput?.homeClubId || '');
  const awayClubId = String(matchInput?.awayClubId || '');

  const players = normalizedPlayers.map(playerEntry => {
    if (playerEntry.rating != null && Number.isFinite(Number(playerEntry.rating))) return playerEntry;
    const result = resolveClubResult({
      clubId: playerEntry.clubId,
      homeClubId,
      awayClubId,
      homeGoals,
      awayGoals
    });
    return {
      ...playerEntry,
      rating: calculateMatchRating({
        playerEntry,
        events: normalizedEvents,
        result
      })
    };
  });

  return {
    matchId,
    competitionKey: String(matchInput?.competitionKey || ''),
    seasonNr: Math.max(1, toNumber(matchInput?.seasonNr, 1)),
    matchday: Number.isFinite(Number(matchInput?.matchday)) ? Number(matchInput.matchday) : null,
    roundKey: matchInput?.roundKey ? String(matchInput.roundKey) : null,
    homeClubId,
    awayClubId,
    homeGoals,
    awayGoals,
    homeFormationKey: matchInput?.homeFormationKey ? String(matchInput.homeFormationKey) : '',
    awayFormationKey: matchInput?.awayFormationKey ? String(matchInput.awayFormationKey) : '',
    players,
    events: normalizedEvents
  };
}

export function recordPlayedMatch({ state, matchInput }) {
  if (!state || typeof state !== 'object') throw new Error('DB6 benötigt einen gültigen Spielstand.');
  const db6State = ensureDB6State(state, { createdAt: matchInput?.createdAt });
  const matchEntry = buildMatchHistoryEntry({ state, matchInput });
  db6State.matches.push(matchEntry);
  db6State.meta.lastMatchNumber = Number(db6State.meta.lastMatchNumber || 0) + 1;
  return matchEntry;
}
