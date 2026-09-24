import { DB2_START_RULES } from './db2_start_rules.js';
import {
  createSeededRandom,
  resolveLeagueReference,
  resolveNationalityDistribution,
  resolveNationGroups,
  resolveFirstNames,
  resolveLastNames,
  resolveCharacterDefinitions,
  resolvePlayerTypeDefinitions,
  resolveClubs,
  resolveDb4Api,
  buildSelectionPreviewClub,
  indexBy
} from './db2_start_helpers.js';
import { generateClubStartPackage, generateFreeAgents } from './db2_squad_builder.js';
import { buildInitialGameState } from './db2_game_state_builder.js';

function buildResolvedDb1(db1) {
  const characters = resolveCharacterDefinitions(db1);
  const playerTypes = resolvePlayerTypeDefinitions(db1);
  return {
    leagueReference: resolveLeagueReference(db1),
    nationalityDistribution: resolveNationalityDistribution(db1),
    nationGroups: resolveNationGroups(db1),
    firstNames: resolveFirstNames(db1),
    lastNames: resolveLastNames(db1),
    characters,
    playerTypes,
    characterMap: Object.fromEntries(characters.map(definition => [definition.key, definition])),
    playerTypeMap: Object.fromEntries(playerTypes.map(definition => [definition.key, definition]))
  };
}

export function createNewCareerGameState({ db1, db3, db4, db5, options = {} }) {
  const createdAt = new Date().toISOString();
  const seed = options.seed || `${createdAt}_${Math.random().toString(36).slice(2, 8)}`;
  const rng = createSeededRandom(seed);

  const db1Resolved = buildResolvedDb1(db1);
  const leagueReferenceByKey = indexBy(db1Resolved.leagueReference, 'leagueKey');
  const clubs = resolveClubs(db3).map(club => ({ ...club }));
  const db4Api = resolveDb4Api(db4);

  const generatedClubs = [];
  const generatedPlayers = [];
  const tacticStateByClubId = {};
  const selectionPreviews = {};
  const playerIndexState = { value: 0 };

  clubs.forEach(club => {
    const leagueReference = leagueReferenceByKey[club.leagueKey];
    const packageForClub = generateClubStartPackage({
      club,
      leagueReference,
      db1Resolved,
      db4Api,
      db5,
      rng,
      playerIndexState
    });
    generatedClubs.push(packageForClub.club);
    generatedPlayers.push(...packageForClub.players);
    tacticStateByClubId[packageForClub.club.clubId] = packageForClub.tacticState;
    selectionPreviews[packageForClub.club.clubId] = buildSelectionPreviewClub(packageForClub.club, packageForClub.players, {
      id: packageForClub.club.currentFormationKey,
      label: packageForClub.tacticState.formationLabel
    });
  });

  const freeAgents = generateFreeAgents({
    clubs: generatedClubs,
    leagueReferenceByKey,
    db1Resolved,
    db4Api,
    rng,
    playerIndexState
  });

  const careerId = `career_${createdAt.replace(/[-:.TZ]/g, '').slice(0, 14)}_${String(seed).slice(0, 8)}`;
  return buildInitialGameState({
    careerId,
    seed,
    clubs: generatedClubs,
    players: generatedPlayers,
    freeAgents,
    tacticStateByClubId,
    selectionPreviews,
    createdAt
  });
}
