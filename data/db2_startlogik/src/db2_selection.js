import { buildInitialLineupForClub } from './db2_lineup_initializer.js';

export function getClubSelectionPreview({ gameState, clubId }) {
  return gameState.selection.previewByClubId[clubId] || null;
}

export function rebuildManagerClubViews({ gameState, db5 }) {
  const clubId = gameState.manager.clubId;
  if (!clubId) return gameState;
  const club = gameState.clubs.byId[clubId];
  const lineup = buildInitialLineupForClub({ club, playersById: gameState.players.byId, db5 });
  gameState.tactics.byClubId[clubId] = {
    ...gameState.tactics.byClubId[clubId],
    ...lineup
  };
  club.startingElevenPlayerIds = Object.values(lineup.lineupPlayerIdsBySlotId);
  club.benchPlayerIds = lineup.benchPlayerIds;
  club.reservePlayerIds = lineup.reservePlayerIds;
  return gameState;
}

export function selectCareerClub({ gameState, clubId, db5 }) {
  const club = gameState.clubs.byId[clubId];
  if (!club) {
    throw new Error(`Club '${clubId}' ist in gameState.clubs.byId nicht vorhanden.`);
  }
  gameState.career.selectedClubId = clubId;
  gameState.career.status = 'office_ready';
  gameState.career.startComplete = true;
  gameState.manager.clubId = clubId;
  gameState.manager.homeScreen = 'office';
  gameState.ui.currentScreen = 'office';
  rebuildManagerClubViews({ gameState, db5 });
  return gameState;
}
