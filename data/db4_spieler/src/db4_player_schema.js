export const DB4_PLAYER_SCHEMA = Object.freeze({
  identity: {
    playerId: "static",
    firstName: "static",
    lastName: "static",
    age: "dynamic",
    nationality: "static",
    fullName: "derived"
  },
  clubContext: {
    clubId: "club_link",
    squadSlot: "club_context"
  },
  bodyAndPosition: {
    heightCm: "static",
    weightKg: "static",
    strongFoot: "static",
    weakFoot: "dynamic",
    mainPosition: "static",
    secondaryPosition1: "dynamic",
    secondaryPosition2: "dynamic"
  },
  profile: {
    talent: "static",
    reliability: "dynamic",
    displayedTalent: "derived_persisted",
    character1: "static",
    character2: "static",
    playerType1: "dynamic",
    playerType2: "dynamic"
  },
  state: {
    form: "dynamic",
    fitness: "dynamic",
    morale: "dynamic",
    injuryStatus: "dynamic",
    suspensionStatus: "dynamic"
  },
  skills: {
    technique: ["ballControl","dribbling","shortPassing","longPassing","crossing"],
    finishing: ["finishing","longShots","heading","setPieces","techniqueFlair"],
    mental: ["vision","decisionMaking","positioning","teamwork","concentration"],
    physical: ["speed","acceleration","stamina","strengthPhysical","balance"],
    defensive: ["tackling","aggression","composure","leadership","discipline"],
    goalkeeping: ["gkReflexes","gkAreaControl","gkKicking","gkOneOnOne","gkHandling"]
  },
  derived: {
    baseOverall: "derived",
    potentialOverall: "derived_persisted",
    potentialUsage: "dynamic",
    overall: "derived",
    techRating: "derived",
    finishingRating: "derived",
    mentalRating: "derived",
    physicalRating: "derived",
    defensiveRating: "derived",
    goalkeepingRating: "derived"
  },
  profileTabs: ["Profil","Statistik","Scouting"]
});
