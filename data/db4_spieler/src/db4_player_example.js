import {
  buildFullName,
  calculateGroupRatings,
  calculateBaseOverall,
  calculateDevelopmentOverall,
  calculateOverall
} from "./db4_player_rules.js";

export const DB4_PLAYER_EXAMPLE = {
  playerId: "player_0001",
  firstName: "Lukas",
  lastName: "Meyer",
  age: 24,
  nationality: "DEU",
  clubId: "club_01",
  squadSlot: 8,
  heightCm: 183,
  weightKg: 77,
  strongFoot: "R",
  weakFoot: 3,
  mainPosition: "ZM",
  secondaryPosition1: "DM",
  secondaryPosition2: "OM",
  talent: 8,
  reliability: 4,
  displayedTalent: 7,
  character1: "kreativ",
  character2: "mutig",
  playerType1: "macher",
  playerType2: "techniker",
  form: 86,
  fitness: 84,
  morale: 82,
  injuryStatus: null,
  suspensionStatus: null,
  ballControl: 76, dribbling: 70, shortPassing: 81, longPassing: 77, crossing: 55,
  finishing: 62, longShots: 68, heading: 58, setPieces: 49, techniqueFlair: 66,
  vision: 79, decisionMaking: 75, positioning: 74, teamwork: 84, concentration: 77,
  speed: 65, acceleration: 63, stamina: 80, strengthPhysical: 71, balance: 72,
  tackling: 64, aggression: 61, composure: 73, leadership: 67, discipline: 81,
  gkReflexes: 9, gkAreaControl: 8, gkKicking: 12, gkOneOnOne: 7, gkHandling: 10,
  potentialOverall: 81,
  potentialUsage: 6
};

export function buildDerivedExample(player = DB4_PLAYER_EXAMPLE) {
  const fullName = buildFullName(player);
  const ratings = calculateGroupRatings(player);
  const baseOverall = calculateBaseOverall(player);
  const developmentOverall = calculateDevelopmentOverall(baseOverall, player.potentialOverall, player.potentialUsage);
  const overall = calculateOverall(developmentOverall, player.form, player.fitness, player.morale);
  return { ...player, fullName, ...ratings, baseOverall, overall };
}
