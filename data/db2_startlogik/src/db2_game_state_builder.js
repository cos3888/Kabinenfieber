import { indexBy, buildSelectionPreviewClub } from './db2_start_helpers.js';
import { createEmptyDB6State } from '../../db6_matchhistorie/src/db6_match_history.js';
import { createEmptyDB7State } from '../../db7_spielsimulation/src/db7_simulation_state.js';

export function buildInitialGameState({ careerId, seed, clubs, players, freeAgents, tacticStateByClubId, selectionPreviews, createdAt }) {
  const clubById = indexBy(clubs, 'clubId');
  const allPlayers = [...players, ...freeAgents];
  const playersById = indexBy(allPlayers, 'playerId');

  clubs.forEach(club => {
    club.playerIds = players.filter(player => player.clubId === club.clubId).map(player => player.playerId);
  });

  return {
    meta: {
      database: 'DB2 Startlogik',
      version: 'v3_karrierestart',
      createdAt,
      careerId,
      seed
    },
    career: {
      status: 'club_selection',
      selectedClubId: null,
      managerName: null,
      startComplete: false
    },
    world: {
      activeClubIds: clubs.map(club => club.clubId),
      freeAgentIds: freeAgents.map(player => player.playerId),
      seasonState: 'career_start'
    },
    clubs: {
      byId: clubById,
      allIds: clubs.map(club => club.clubId)
    },
    players: {
      byId: playersById,
      allIds: allPlayers.map(player => player.playerId)
    },
    selection: {
      availableClubIds: clubs.map(club => club.clubId),
      previewByClubId: selectionPreviews
    },
    manager: {
      clubId: null,
      homeScreen: 'club-selection'
    },
    tactics: {
      byClubId: tacticStateByClubId
    },
    db6: createEmptyDB6State({ createdAt }),
    db7: createEmptyDB7State({ createdAt }),
    ui: {
      currentScreen: 'club-selection',
      officeTab: 'overview'
    }
  };
}
