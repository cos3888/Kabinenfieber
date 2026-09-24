import { ensureDB6State } from './db6_match_history_helpers.js';

export function getAllMatches(state) {
  return ensureDB6State(state).matches;
}

export function getMatchById(state, matchId) {
  return getAllMatches(state).find(match => match.matchId === matchId) || null;
}

export function getMatchesByClubId(state, clubId) {
  return getAllMatches(state).filter(match => match.homeClubId === clubId || match.awayClubId === clubId);
}

export function getMatchesByPlayerId(state, playerId) {
  return getAllMatches(state).filter(match => (match.players || []).some(player => player.playerId === playerId));
}

export function getMatchesByCompetition(state, competitionKey, seasonNr = null) {
  return getAllMatches(state).filter(match => {
    if (match.competitionKey !== competitionKey) return false;
    if (seasonNr == null) return true;
    return Number(match.seasonNr) === Number(seasonNr);
  });
}
