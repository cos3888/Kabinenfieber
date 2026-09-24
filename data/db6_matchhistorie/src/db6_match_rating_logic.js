import { clamp } from './db6_match_history_helpers.js';

const MIN_RATING = 3;
const MAX_RATING = 10;

function roundToOne(value) {
  return Math.round(value * 10) / 10;
}

export function calculateMatchRating({ playerEntry, events, result }) {
  const startMinute = Number(playerEntry?.startMinute || 0);
  const endMinute = Number(playerEntry?.endMinute || 0);
  const minutesPlayed = Math.max(0, endMinute - startMinute);
  const playerId = String(playerEntry?.playerId || '');
  const clubId = String(playerEntry?.clubId || '');
  let rating = 6.0;

  if (minutesPlayed >= 75) rating += 0.2;
  else if (minutesPlayed < 20) rating -= 0.2;

  const playerEvents = (events || []).filter(event => String(event.playerId || '') === playerId);
  playerEvents.forEach(event => {
    if (event.type === 'goal' || event.type === 'penalty_goal') rating += 0.7;
    else if (event.type === 'assist') rating += 0.4;
    else if (event.type === 'yellow_card') rating -= 0.2;
    else if (event.type === 'red_card') rating -= 1.0;
    else if (event.type === 'own_goal') rating -= 0.8;
    else if (event.type === 'penalty_miss') rating -= 0.4;
    else if (event.type === 'injury') rating -= 0.2;
  });

  if (result === 'win') rating += 0.2;
  else if (result === 'loss') rating -= 0.2;

  return roundToOne(clamp(rating, MIN_RATING, MAX_RATING));
}

export function resolveClubResult({ clubId, homeClubId, awayClubId, homeGoals, awayGoals }) {
  if (!clubId) return 'draw';
  if (homeGoals === awayGoals) return 'draw';
  const isHomeClub = String(clubId) === String(homeClubId);
  const won = isHomeClub ? homeGoals > awayGoals : awayGoals > homeGoals;
  return won ? 'win' : 'loss';
}
