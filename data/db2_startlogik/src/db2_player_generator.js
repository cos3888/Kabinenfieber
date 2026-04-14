import { DB2_START_RULES } from './db2_start_rules.js';
import {
  clamp,
  randomInt,
  mapAgeToBucket,
  mapAgeToDb1EffectKey,
  chooseAge,
  chooseMainPositionForGroup,
  chooseSecondaryPositions,
  chooseNationality,
  chooseFirstName,
  chooseLastName,
  chooseCharacterKeys,
  choosePlayerTypeKeys,
  createPlayerId,
  getAgeBucketRule,
  calculateTargetOverall,
  chooseQualityBandByRole,
  estimateClubStrengthTarget
} from './db2_start_helpers.js';

const POSITION_GROUP_SKILL_TARGETS = Object.freeze({
  TW: { tech: 0.18, fin: 0.05, mental: 0.18, phys: 0.14, def: 0.10, gk: 0.35 },
  IV: { tech: 0.14, fin: 0.06, mental: 0.2, phys: 0.22, def: 0.28, gk: 0.02 },
  LV: { tech: 0.2, fin: 0.1, mental: 0.18, phys: 0.22, def: 0.24, gk: 0.02 },
  RV: { tech: 0.2, fin: 0.1, mental: 0.18, phys: 0.22, def: 0.24, gk: 0.02 },
  DM: { tech: 0.2, fin: 0.08, mental: 0.22, phys: 0.2, def: 0.28, gk: 0.02 },
  ZM: { tech: 0.24, fin: 0.1, mental: 0.22, phys: 0.18, def: 0.18, gk: 0.02 },
  OM: { tech: 0.26, fin: 0.18, mental: 0.22, phys: 0.16, def: 0.1, gk: 0.02 },
  LM: { tech: 0.24, fin: 0.16, mental: 0.2, phys: 0.2, def: 0.18, gk: 0.02 },
  RM: { tech: 0.24, fin: 0.16, mental: 0.2, phys: 0.2, def: 0.18, gk: 0.02 },
  LF: { tech: 0.24, fin: 0.22, mental: 0.18, phys: 0.2, def: 0.12, gk: 0.02 },
  RF: { tech: 0.24, fin: 0.22, mental: 0.18, phys: 0.2, def: 0.12, gk: 0.02 },
  HS: { tech: 0.22, fin: 0.24, mental: 0.2, phys: 0.18, def: 0.14, gk: 0.02 },
  ST: { tech: 0.16, fin: 0.3, mental: 0.18, phys: 0.22, def: 0.12, gk: 0.02 }
});

const SKILL_GROUPS = Object.freeze({
  tech: ['ballControl','dribbling','shortPassing','longPassing','crossing'],
  fin: ['finishing','longShots','heading','setPieces','techniqueFlair'],
  mental: ['vision','decisionMaking','positioning','teamwork','concentration'],
  phys: ['speed','acceleration','stamina','strengthPhysical','balance'],
  def: ['tackling','aggression','composure','leadership','discipline'],
  gk: ['gkReflexes','gkAreaControl','gkKicking','gkOneOnOne','gkHandling']
});

function getPotentialDeltaForAge(ageBucket, rng) {
  const [min, max] = DB2_START_RULES.potentialDeltaByAge[ageBucket];
  return randomInt(rng, min, max);
}

function getPotentialUsageForAge(ageBucket, rng) {
  const [min, max] = DB2_START_RULES.potentialUsageByAge[ageBucket];
  return Number((min + (rng() * (max - min))).toFixed(1));
}

function buildSkillValue(rng, anchor, jitter = 4) {
  return clamp(Math.round(anchor + (rng() * (jitter * 2) - jitter)), 1, 99);
}

function applyDefinitionEffects(player, definitionsByKey, keys, age, ageEffectMultipliers) {
  const effectKey = mapAgeToDb1EffectKey(age);
  const active = keys.filter(Boolean).map(key => definitionsByKey[key]).filter(Boolean);
  if (!active.length) return player;
  const perEffectScale = active.length > 1 ? 0.75 : 1;
  active.forEach(definition => {
    const ageScale = Number(definition.ageEffectMultipliers?.[effectKey] || ageEffectMultipliers?.[effectKey] || 1);
    definition.effects.forEach(effect => {
      if (!effect.attribute || effect.attribute === '-') return;
      player[effect.attribute] = clamp(Math.round((player[effect.attribute] || 0) + (effect.delta * ageScale * perEffectScale)), 1, 99);
    });
  });
  return player;
}

function buildSkillProfile({ mainPosition, targetOverall, rng }) {
  const weights = POSITION_GROUP_SKILL_TARGETS[mainPosition] || POSITION_GROUP_SKILL_TARGETS.ZM;
  const anchors = {
    tech: targetOverall + Math.round((weights.tech - 0.18) * 20),
    fin: targetOverall + Math.round((weights.fin - 0.12) * 20),
    mental: targetOverall + Math.round((weights.mental - 0.18) * 18),
    phys: targetOverall + Math.round((weights.phys - 0.18) * 18),
    def: targetOverall + Math.round((weights.def - 0.16) * 22),
    gk: mainPosition === 'TW' ? targetOverall + 5 : 8
  };
  const profile = {};
  Object.entries(SKILL_GROUPS).forEach(([groupKey, attributes]) => {
    attributes.forEach(attribute => {
      profile[attribute] = buildSkillValue(rng, anchors[groupKey], groupKey === 'gk' && mainPosition !== 'TW' ? 2 : 5);
    });
  });
  if (mainPosition !== 'TW') {
    SKILL_GROUPS.gk.forEach(attribute => { profile[attribute] = clamp(profile[attribute], 1, 20); });
  } else {
    ['finishing','longShots','heading','setPieces'].forEach(attribute => { profile[attribute] = clamp(profile[attribute], 1, 35); });
  }
  return profile;
}

function adjustBaseSkillProfile({ player, db4Api, targetOverall, rng }) {
  let iterations = 0;
  let current = db4Api.calculateBaseOverall(player);
  while (Math.abs(current - targetOverall) > 1 && iterations < 10) {
    const delta = current < targetOverall ? 1 : -1;
    const priorityAttributes = player.mainPosition === 'TW'
      ? ['gkReflexes','gkHandling','gkOneOnOne','concentration','decisionMaking']
      : ['ballControl','shortPassing','positioning','stamina','tackling','finishing','vision','decisionMaking'];
    priorityAttributes.forEach(attribute => {
      player[attribute] = clamp(player[attribute] + delta, 1, 99);
    });
    current = db4Api.calculateBaseOverall(player);
    iterations += 1;
  }
  return player;
}

export function generatePlayerForClub({
  club,
  slotIndex,
  groupKey,
  roleTier,
  leagueReference,
  db1Resolved,
  db4Api,
  rng,
  playerIndex,
  generationScope = 'club'
}) {
  const age = chooseAge(rng);
  const ageBucket = mapAgeToBucket(age);
  const mainPosition = chooseMainPositionForGroup(groupKey, rng);
  const [secondaryPosition1, secondaryPosition2] = chooseSecondaryPositions(mainPosition, rng);
  const band = chooseQualityBandByRole(rng, roleTier);
  const clubStrengthTarget = estimateClubStrengthTarget(club, leagueReference);
  const targetOverall = calculateTargetOverall(leagueReference.standardPlayerOverall, band, clubStrengthTarget, roleTier, rng);
  const potentialOverall = clamp(targetOverall + getPotentialDeltaForAge(ageBucket, rng), targetOverall, 99);
  const potentialUsage = getPotentialUsageForAge(ageBucket, rng);
  const nationality = chooseNationality(db1Resolved.nationalityDistribution, club.leagueKey, rng);
  const nationGroup = db1Resolved.nationGroups[nationality] || 'BAL';
  const firstName = chooseFirstName(db1Resolved.firstNames, nationality, age, rng);
  const lastName = chooseLastName(db1Resolved.lastNames, nationality, rng);
  const [character1, character2] = chooseCharacterKeys(db1Resolved.characters, nationGroup, rng);
  const [playerType1, playerType2] = choosePlayerTypeKeys(db1Resolved.playerTypes, mainPosition, rng);
  const skills = buildSkillProfile({ mainPosition, targetOverall, rng });
  const heightGroup = mainPosition === 'TW' ? 'TW' : ['IV','LV','RV','DM'].includes(mainPosition) ? 'DEF' : ['ZM','OM','LM','RM'].includes(mainPosition) ? 'MID' : 'ATT';
  const [heightMin, heightMax] = DB2_START_RULES.playerGeneration.heightRangeByGroup[heightGroup];
  const strongFoot = ['LV','LM','LF'].includes(mainPosition) ? weightedPick(['L','R'], value => ({ L: 75, R: 25 }[value]), rng) : ['RV','RM','RF'].includes(mainPosition) ? weightedPick(['R','L'], value => ({ R: 75, L: 25 }[value]), rng) : weightedPick(['R','L'], value => ({ R: 72, L: 28 }[value]), rng);

  const player = {
    playerId: createPlayerId({ clubId: generationScope === 'freeAgent' ? null : club.clubId, index: playerIndex, nationality, lastName }),
    firstName,
    lastName,
    age,
    nationality,
    nationGroup,
    clubId: generationScope === 'freeAgent' ? null : club.clubId,
    squadSlot: slotIndex + 1,
    heightCm: randomInt(rng, heightMin, heightMax),
    weightKg: randomInt(rng, 68, 94),
    strongFoot,
    weakFoot: randomInt(rng, ...DB2_START_RULES.playerGeneration.weakFootRange),
    mainPosition,
    secondaryPosition1,
    secondaryPosition2,
    talent: randomInt(rng, ...DB2_START_RULES.playerGeneration.talentRange),
    reliability: randomInt(rng, ...DB2_START_RULES.playerGeneration.reliabilityRange),
    displayedTalent: 0,
    character1,
    character2,
    playerType1,
    playerType2,
    form: DB2_START_RULES.playerGeneration.defaultForm,
    fitness: DB2_START_RULES.playerGeneration.defaultFitness,
    morale: DB2_START_RULES.playerGeneration.defaultMorale,
    injuryStatus: null,
    suspensionStatus: null,
    potentialOverall,
    potentialUsage,
    ...skills
  };

  player.displayedTalent = clamp(Math.round(player.talent * 0.8 + player.reliability * 0.2), 1, 10);

  applyDefinitionEffects(player, db1Resolved.characterMap, [character1, character2], age, DB2_START_RULES.ageEffectMultipliers);
  applyDefinitionEffects(player, db1Resolved.playerTypeMap, [playerType1, playerType2], age, DB2_START_RULES.ageEffectMultipliers);

  adjustBaseSkillProfile({ player, db4Api, targetOverall, rng });

  const baseOverall = db4Api.calculateBaseOverall(player);
  const developmentOverall = db4Api.calculateDevelopmentOverall(baseOverall, player.potentialOverall, player.potentialUsage);
  const overall = db4Api.calculateOverall(developmentOverall, player.form, player.fitness, player.morale);
  const fullName = db4Api.buildFullName(player);

  return {
    ...player,
    fullName,
    baseOverall,
    developmentOverall: Math.round(developmentOverall),
    overall,
    generationScope,
    generatedRoleTier: roleTier
  };
}
