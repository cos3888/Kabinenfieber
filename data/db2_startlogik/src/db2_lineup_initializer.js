import { formationKeyToRecord, buildLineupBuckets } from './db2_start_helpers.js';

function getPlayerPositions(player) {
  return [player.mainPosition, player.secondaryPosition1, player.secondaryPosition2].filter(Boolean);
}

function calculateSlotFit(player, positionCode) {
  if (player.mainPosition === positionCode) return player.overall + 6;
  if ([player.secondaryPosition1, player.secondaryPosition2].includes(positionCode)) return player.overall + 2;
  const nearbyMap = {
    LV: ['LM'], RV: ['RM'], DM: ['ZM', 'IV'], ZM: ['DM', 'OM'], OM: ['ZM', 'HS'],
    LM: ['LF', 'LV'], RM: ['RF', 'RV'], LF: ['LM', 'ST'], RF: ['RM', 'ST'], HS: ['OM', 'ST'], ST: ['HS', 'LF', 'RF'], IV: ['DM']
  };
  if ((nearbyMap[positionCode] || []).includes(player.mainPosition)) return player.overall - 1;
  return -999;
}

export function buildInitialLineupForClub({ club, playersById, db5 }) {
  const formationRecord = formationKeyToRecord(db5, club.currentFormationKey || club.defaultFormationKey);
  if (!formationRecord) {
    return {
      lineupPlayerIdsBySlotId: {},
      benchPlayerIds: [],
      reservePlayerIds: club.playerIds || []
    };
  }

  const availablePlayers = (club.playerIds || []).map(playerId => playersById[playerId]).filter(Boolean);
  const assignedPlayerIds = new Set();
  const lineupPlayerIdsBySlotId = {};

  formationRecord.occupiedSlots.forEach(slotId => {
    const positionCode = formationRecord.positionMap[slotId];
    const candidates = availablePlayers
      .filter(player => !assignedPlayerIds.has(player.playerId))
      .map(player => ({ player, fitScore: calculateSlotFit(player, positionCode) }))
      .filter(item => item.fitScore > -900)
      .sort((left, right) => right.fitScore - left.fitScore);

    const winner = candidates[0]?.player;
    if (!winner) return;
    assignedPlayerIds.add(winner.playerId);
    lineupPlayerIdsBySlotId[slotId] = winner.playerId;
  });

  const unassignedPlayerIds = availablePlayers
    .filter(player => !assignedPlayerIds.has(player.playerId))
    .map(player => player.playerId);

  const { benchPlayerIds, reservePlayerIds } = buildLineupBuckets(unassignedPlayerIds, playersById, 7);

  return {
    lineupPlayerIdsBySlotId,
    benchPlayerIds,
    reservePlayerIds,
    formationKey: formationRecord.id,
    formationLabel: formationRecord.label
  };
}
