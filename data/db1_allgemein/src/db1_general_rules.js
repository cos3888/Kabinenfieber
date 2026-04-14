import { DB1_GENERAL_CONSTANTS, DB1_LEAGUE_REFERENCE } from "./db1_general_reference.js";
import { DB1_NATIONALITY_DISTRIBUTION_BY_LEAGUE } from "./db1_nationality_distribution.js";
import { DB1_NATION_GROUPS } from "./db1_nation_groups.js";
import { DB1_FIRST_NAMES_BY_NATIONALITY } from "./db1_first_names.js";
import { DB1_LAST_NAMES_BY_NATIONALITY } from "./db1_last_names.js";
import { DB1_CHARACTER_DEFINITIONS } from "./db1_character_definitions.js";
import { DB1_PLAYER_TYPE_DEFINITIONS } from "./db1_player_type_definitions.js";

export const DB1_GENERAL_RULES = Object.freeze({
  purpose: "system_wide_reference_values",
  standardSalaryFormula: "averagePlayerMarketValue * 0.12",
  standardPlayerReference: {
    leagueKey: DB1_GENERAL_CONSTANTS.standardPlayerReferenceLeague,
    overall: DB1_GENERAL_CONSTANTS.standardPlayerReferenceOverall
  },
  scope: {
    contains: [
      "league_prestige",
      "standard_player_overall",
      "average_player_market_value",
      "standard_salary",
      "global_constants",
      "nationality_distribution_by_league",
      "nation_groups",
      "first_names_by_nationality",
      "last_names_by_nationality",
      "character_definitions",
      "player_type_definitions"
    ],
    excludes: [
      "club_start_generation_rules",
      "initial_squad_generation",
      "initial_form_fitness_morale_rules",
      "generated_players",
      "generated_club_assignments"
    ]
  },
  startGenerationUsage: {
    characterAssignment: {
      ageIndependentAssignment: true,
      ageScalesOnlyEffects: true,
      maxCharacterTraitsAtGameStartPerPlayer: 2,
      characterTraitsAtGameStartCanBeZero: true
    },
    playerTypeAssignment: {
      ageIndependentAssignment: true,
      ageScalesOnlyEffects: true,
      maxPlayerTypesAtGameStartPerPlayer: 2,
      playerTypesAtGameStartCanBeZero: true,
      futureActivationLogicPlanned: true,
      currentReferenceDefaultAvailableAtGameStart: true
    }
  },
  validation: {
    leagueCount: DB1_LEAGUE_REFERENCE.length,
    nationalityDistributionCount: DB1_NATIONALITY_DISTRIBUTION_BY_LEAGUE.length,
    nationGroupCount: DB1_NATION_GROUPS.length,
    firstNameCount: DB1_FIRST_NAMES_BY_NATIONALITY.length,
    lastNameCount: DB1_LAST_NAMES_BY_NATIONALITY.length,
    characterDefinitionCount: DB1_CHARACTER_DEFINITIONS.length,
    playerTypeDefinitionCount: DB1_PLAYER_TYPE_DEFINITIONS.length
  }
});
