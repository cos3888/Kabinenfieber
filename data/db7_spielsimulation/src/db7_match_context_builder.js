import { createSimulationId, ensureDB7State, simpleAverage, toNumber } from './db7_simulation_helpers.js';

function getPlacementMap(state, clubId) {
  return state?.tacticsByClubId?.[clubId]?.maskState?.playerPlacementById || {};
}

function getFormationLabel(state, clubId) {
  return state?.tacticsByClubId?.[clubId]?.formationLabel
    || state?.tacticsByClubId?.[clubId]?.maskFormation
    || state?.clubsById?.[clubId]?.currentFormationKey
    || '';
}

function sortByStrengthDesc(a, b) {
  return Number(b?.overall || 0) - Number(a?.overall || 0);
}

function buildClubLineup(state, clubId, maxBenchParticipants = 3) {
  const club = state?.clubsById?.[clubId] || null;
  const placementMap = getPlacementMap(state, clubId);
  const players = (club?.playerIds || []).map(playerId => state?.playersById?.[playerId]).filter(Boolean);

  const starters = Object.entries(placementMap)
    .filter(([, info]) => info?.location === 'field')
    .map(([playerId, info]) => {
      const player = state?.playersById?.[playerId];
      return player ? {
        ...player,
        simulationSlot: info.slot || '',
        isStarter: true
      } : null;
    })
    .filter(Boolean)
    .sort(sortByStrengthDesc)
    .slice(0, 11);

  const usedIds = new Set(starters.map(player => player.playerId));
  const benchSource = Object.entries(placementMap)
    .filter(([, info]) => info?.location === 'bench')
    .map(([playerId]) => state?.playersById?.[playerId])
    .filter(Boolean);

  const fallbackBench = players.filter(player => !usedIds.has(player.playerId)).sort(sortByStrengthDesc);
  const bench = [...benchSource, ...fallbackBench]
    .filter((player, index, arr) => arr.findIndex(item => item.playerId === player.playerId) === index)
    .slice(0, Math.max(0, maxBenchParticipants));

  const starterStrength = simpleAverage(starters.map(player => toNumber(player.overall, 50)));
  const benchStrength = simpleAverage(bench.map(player => toNumber(player.overall, 50)));

  return {
    clubId,
    clubName: club?.clubName || '',
    formationKey: getFormationLabel(state, clubId),
    starters,
    bench,
    starterStrength,
    benchStrength,
    teamStrength: Math.round((starterStrength * 0.86 + benchStrength * 0.14) * 10) / 10
  };
}

export function buildMatchSimulationContext({ state, matchInput }) {
  if (!state || typeof state !== 'object') throw new Error('DB7 benötigt einen gültigen Spielstand.');
  const db7State = ensureDB7State(state, { createdAt: matchInput?.createdAt });
  const homeClubId = String(matchInput?.homeClubId || '');
  const awayClubId = String(matchInput?.awayClubId || '');
  if (!homeClubId || !awayClubId) throw new Error('DB7 benötigt Heim- und Auswärtsverein.');

  const maxBenchParticipants = toNumber(db7State?.config?.maxBenchParticipants, 3);

  return {
    simulationId: createSimulationId(db7State),
    competitionKey: String(matchInput?.competitionKey || ''),
    seasonNr: Math.max(1, toNumber(matchInput?.seasonNr, 1)),
    matchday: Number.isFinite(Number(matchInput?.matchday)) ? Number(matchInput.matchday) : null,
    roundKey: matchInput?.roundKey ? String(matchInput.roundKey) : null,
    homeClub: buildClubLineup(state, homeClubId, maxBenchParticipants),
    awayClub: buildClubLineup(state, awayClubId, maxBenchParticipants),
    config: {
      matchLength: toNumber(matchInput?.matchLength, db7State?.config?.matchLength || 90),
      homeAdvantage: toNumber(matchInput?.homeAdvantage, db7State?.config?.homeAdvantage || 3),
      maxBenchParticipants
    }
  };
}
