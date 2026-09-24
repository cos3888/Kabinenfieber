import { formationKeyToRecord, buildLineupBuckets } from './db2_start_helpers.js';

function getPlayerPositions(player) {
  return [player.mainPosition, player.secondaryPosition1, player.secondaryPosition2].filter(Boolean);
}

function calculateSlotFit(player, positionCode) {
  if (player.mainPosition === positionCode) return player.overall + 6;
  if ([player.secondaryPosition1, player.secondaryPosition2].includes(positionCode)) return player.overall + 2;
  return -999;
}

function collectSlotCandidates({ slotId, positionCode, availablePlayers, assignedPlayerIds }) {
  return availablePlayers
    .filter(player => !assignedPlayerIds.has(player.playerId))
    .map(player => ({ player, fitScore: calculateSlotFit(player, positionCode) }))
    .filter(item => item.fitScore > -900)
    .sort((left, right) => right.fitScore - left.fitScore);
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

  const unfilledSlotIds = [...formationRecord.occupiedSlots];

  while (unfilledSlotIds.length) {
    const slotOptions = unfilledSlotIds
      .map(slotId => ({
        slotId,
        positionCode: formationRecord.positionMap[slotId],
        candidates: collectSlotCandidates({
          slotId,
          positionCode: formationRecord.positionMap[slotId],
          availablePlayers,
          assignedPlayerIds
        })
      }))
      .sort((left, right) => left.candidates.length - right.candidates.length || (right.candidates[0]?.fitScore || -999) - (left.candidates[0]?.fitScore || -999));

    const currentSlot = slotOptions[0];
    if (!currentSlot || !currentSlot.candidates.length) break;

    const winner = currentSlot.candidates[0].player;
    assignedPlayerIds.add(winner.playerId);
    lineupPlayerIdsBySlotId[currentSlot.slotId] = winner.playerId;

    const slotIndex = unfilledSlotIds.indexOf(currentSlot.slotId);
    if (slotIndex >= 0) unfilledSlotIds.splice(slotIndex, 1);
  }

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
