import { DB2_START_RULES, DB2_START_FORMATION_POOL, DB2_POSITION_ROLE_TEMPLATES, DB2_POSITION_GROUPS, DB2_SECONDARY_POSITION_MAP } from './db2_start_rules.js';

export function createSeededRandom(seedInput = Date.now()) {
  let seed = 0;
  const source = String(seedInput);
  for (let i = 0; i < source.length; i += 1) {
    seed = (seed * 31 + source.charCodeAt(i)) >>> 0;
  }
  if (seed === 0) seed = 123456789;
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function weightedPick(items, getWeight, rng) {
  const weighted = items
    .map(item => ({ item, weight: Math.max(0, Number(getWeight(item) || 0)) }))
    .filter(entry => entry.weight > 0);
  if (!weighted.length) return items[0] ?? null;
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = rng() * total;
  for (const entry of weighted) {
    threshold -= entry.weight;
    if (threshold <= 0) return entry.item;
  }
  return weighted[weighted.length - 1].item;
}

export function sampleWithoutReplacement(items, count, rng) {
  const pool = [...items];
  const result = [];
  while (pool.length && result.length < count) {
    const index = randomInt(rng, 0, pool.length - 1);
    result.push(pool.splice(index, 1)[0]);
  }
  return result;
}

export function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function indexBy(items, key) {
  return Object.fromEntries(items.map(item => [item[key], item]));
}

export function resolveLeagueReference(db1) {
  return db1.DB1_LEAGUE_REFERENCE || db1.leagues || db1.leagueReference || [];
}

export function resolveNationalityDistribution(db1) {
  return db1.DB1_NATIONALITY_DISTRIBUTION || db1.nationalityDistribution || [];
}

export function resolveNationGroups(db1) {
  const rows = db1.DB1_NATION_GROUPS || db1.nationGroups || [];
  const byNationality = {};
  for (const row of rows) {
    byNationality[row.nationality] = row.groupKey || row.group || row.nationGroup;
  }
  return byNationality;
}

export function resolveFirstNames(db1) {
  return db1.DB1_FIRST_NAMES || db1.firstNames || [];
}

export function resolveLastNames(db1) {
  return db1.DB1_LAST_NAMES || db1.lastNames || [];
}

export function resolveCharacterDefinitions(db1) {
  return db1.DB1_CHARACTER_DEFINITIONS || db1.characterDefinitions || [];
}

export function resolvePlayerTypeDefinitions(db1) {
  return db1.DB1_PLAYER_TYPE_DEFINITIONS || db1.playerTypeDefinitions || [];
}

export function resolveClubs(db3) {
  if (Array.isArray(db3?.clubs)) return db3.clubs;
  if (Array.isArray(db3?.DB3_CLUBS)) return db3.DB3_CLUBS;
  if (Array.isArray(db3)) return db3;
  return [];
}

export function resolveFormations(db5) {
  return db5.TACTIC_FORMATIONS || db5.formations || [];
}

export function resolveDb4Api(db4) {
  const fallbackAverage = values => {
    const numbers = values.map(Number).filter(Number.isFinite);
    return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
  };
  const calculateGroupRatings = db4.calculateGroupRatings || (player => ({
    techRating: fallbackAverage([player.ballControl, player.dribbling, player.shortPassing, player.longPassing, player.crossing]),
    finishingRating: fallbackAverage([player.finishing, player.longShots, player.heading, player.setPieces, player.techniqueFlair]),
    mentalRating: fallbackAverage([player.vision, player.decisionMaking, player.positioning, player.teamwork, player.concentration]),
    physicalRating: fallbackAverage([player.speed, player.acceleration, player.stamina, player.strengthPhysical, player.balance]),
    defensiveRating: fallbackAverage([player.tackling, player.aggression, player.composure, player.leadership, player.discipline]),
    goalkeepingRating: fallbackAverage([player.gkReflexes, player.gkAreaControl, player.gkKicking, player.gkOneOnOne, player.gkHandling])
  }));
  const OVERALL_WEIGHTS = db4.OVERALL_WEIGHTS || {
    TW: { goalkeepingRating: 0.7, mentalRating: 0.1, physicalRating: 0.1, techRating: 0.1 },
    LV: { defensiveRating: 0.28, physicalRating: 0.22, techRating: 0.22, mentalRating: 0.18, finishingRating: 0.1 },
    RV: { defensiveRating: 0.28, physicalRating: 0.22, techRating: 0.22, mentalRating: 0.18, finishingRating: 0.1 },
    IV: { defensiveRating: 0.35, physicalRating: 0.25, mentalRating: 0.2, techRating: 0.15, finishingRating: 0.05 },
    DM: { defensiveRating: 0.28, mentalRating: 0.24, techRating: 0.22, physicalRating: 0.18, finishingRating: 0.08 },
    ZM: { techRating: 0.28, mentalRating: 0.24, physicalRating: 0.2, defensiveRating: 0.18, finishingRating: 0.1 },
    OM: { techRating: 0.3, mentalRating: 0.24, finishingRating: 0.22, physicalRating: 0.14, defensiveRating: 0.1 },
    LM: { techRating: 0.28, physicalRating: 0.22, mentalRating: 0.2, finishingRating: 0.2, defensiveRating: 0.1 },
    RM: { techRating: 0.28, physicalRating: 0.22, mentalRating: 0.2, finishingRating: 0.2, defensiveRating: 0.1 },
    LF: { finishingRating: 0.3, techRating: 0.24, physicalRating: 0.2, mentalRating: 0.16, defensiveRating: 0.1 },
    RF: { finishingRating: 0.3, techRating: 0.24, physicalRating: 0.2, mentalRating: 0.16, defensiveRating: 0.1 },
    HS: { finishingRating: 0.32, techRating: 0.24, mentalRating: 0.2, physicalRating: 0.14, defensiveRating: 0.1 },
    ST: { finishingRating: 0.38, physicalRating: 0.22, techRating: 0.18, mentalRating: 0.14, defensiveRating: 0.08 }
  };
  const calculateBaseOverall = db4.calculateBaseOverall || (player => {
    const ratings = calculateGroupRatings(player);
    const weights = OVERALL_WEIGHTS[player.mainPosition] || Object.fromEntries(Object.keys(ratings).map(key => [key, 1 / Object.keys(ratings).length]));
    return Math.round(Object.entries(weights).reduce((sum, [key, weight]) => sum + (ratings[key] * weight), 0));
  });
  const calculateDevelopmentOverall = db4.calculateDevelopmentOverall || ((baseOverall, potentialOverall, potentialUsage) => (
    baseOverall + ((potentialOverall - baseOverall) * (potentialUsage / 10))
  ));
  const calculateOverall = db4.calculateOverall || ((developmentOverall, form, fitness, morale) => {
    const factor = 1 + ((fitness - 80) / 10) * 0.005 + ((form - 80) / 10) * 0.01 + ((morale - 80) / 10) * 0.01;
    return Math.round(developmentOverall * factor);
  });
  const buildFullName = db4.buildFullName || (player => `${player.firstName} ${player.lastName}`.trim());
  return { calculateGroupRatings, calculateBaseOverall, calculateDevelopmentOverall, calculateOverall, buildFullName, OVERALL_WEIGHTS };
}

export function mapAgeToDb1EffectKey(age) {
  if (age <= 19) return 'u20';
  if (age <= 24) return 'age20to24';
  if (age <= 29) return 'age25to29';
  return 'age30plus';
}

export function mapAgeToBucket(age) {
  if (age <= 19) return '17-19';
  if (age <= 23) return '20-23';
  if (age <= 27) return '24-27';
  if (age <= 31) return '28-31';
  return '32-35';
}

export function getAgeBucketRule(age) {
  return DB2_START_RULES.ageDistribution.find(rule => age >= rule.min && age <= rule.max) || DB2_START_RULES.ageDistribution[2];
}

export function chooseAge(rng) {
  const bucket = weightedPick(DB2_START_RULES.ageDistribution, item => item.weight, rng);
  return randomInt(rng, bucket.min, bucket.max);
}

export function chooseFormationLabel(rng) {
  return weightedPick(DB2_START_FORMATION_POOL, label => DB2_START_RULES.formationWeights[label] || 1, rng);
}

export function chooseFormationRecord(db5, rng) {
  const formations = resolveFormations(db5);
  const label = chooseFormationLabel(rng);
  return formations.find(formation => formation.label === label) || formations[0] || null;
}

export function buildSquadTemplate(formationLabel, rng) {
  const base = [];
  Object.entries(DB2_START_RULES.squad.baseCounts).forEach(([groupKey, count]) => {
    for (let i = 0; i < count; i += 1) base.push(groupKey);
  });
  const extras = DB2_START_RULES.squad.formationExtras[`formation_${formationLabel.replaceAll('-', '_')}`] || [];
  extras.forEach(groupKey => base.push(groupKey));
  const targetSize = randomInt(rng, ...DB2_START_RULES.squad.targetSizeRange);
  while (base.length < targetSize) {
    base.push(weightedPick(['CM', 'WM', 'ST', 'IV', 'FB'], key => ({ CM: 5, WM: 4, ST: 3, IV: 3, FB: 2 }[key]), rng));
  }
  return base;
}

export function chooseMainPositionForGroup(groupKey, rng) {
  return weightedPick(DB2_POSITION_GROUPS[groupKey] || ['ZM'], () => 1, rng);
}

export function chooseSecondaryPositions(mainPosition, rng) {
  const candidates = DB2_SECONDARY_POSITION_MAP[mainPosition] || [];
  if (!candidates.length) return [null, null];
  const count = weightedPick([0, 1, 2], value => ({ 0: 35, 1: 45, 2: 20 }[value]), rng);
  const selected = sampleWithoutReplacement(candidates, count, rng);
  return [selected[0] ?? null, selected[1] ?? null];
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function estimateClubStrengthTarget(club, leagueRef) {
  const leagueBase = Number(leagueRef?.standardPlayerOverall || 60);
  const prestigeBoost = ((Number(club.prestige || 5) - 5) * 0.8);
  const financeBoost = ((Number(club.financialPower || 5) - 5) * 0.5);
  const fanbaseBoost = ((Number(club.fanbase || 5) - 5) * 0.25);
  return Math.round(leagueBase + prestigeBoost + financeBoost + fanbaseBoost);
}

export function getRoleTierForIndex(index) {
  if (index < 11) return 'starters';
  if (index < 18) return 'bench';
  return 'reserve';
}

export function chooseQualityBandByRole(rng, roleTier) {
  const roleBias = {
    starters: { low: 4, below: 18, average: 36, above: 27, elite: 15 },
    bench: { low: 10, below: 26, average: 40, above: 18, elite: 6 },
    reserve: { low: 21, below: 34, average: 31, above: 11, elite: 3 }
  };
  return weightedPick(DB2_START_RULES.qualityBands, band => roleBias[roleTier]?.[band.key] ?? band.weight, rng);
}

export function calculateTargetOverall(leagueOverall, band, clubStrengthTarget, roleTier, rng) {
  const tierMod = { starters: 1.5, bench: 0, reserve: -2.5 }[roleTier] ?? 0;
  const clubDelta = (clubStrengthTarget - leagueOverall) * ({ starters: 0.55, bench: 0.35, reserve: 0.2 }[roleTier] ?? 0.3);
  const offset = randomInt(rng, band.minOffset, band.maxOffset);
  return Math.round(leagueOverall + offset + tierMod + clubDelta);
}

export function findLeagueNationalityRows(distributionRows, leagueKey) {
  return distributionRows.filter(row => row.leagueKey === leagueKey);
}

export function chooseNationality(distributionRows, leagueKey, rng) {
  const rows = findLeagueNationalityRows(distributionRows, leagueKey);
  if (!rows.length) return 'Deutschland';
  return weightedPick(rows, row => Number(row.sharePercent || row.share || 0), rng).nationality;
}

export function filterNamesByNationality(rows, nationality) {
  return rows.filter(row => row.nationality === nationality || row.nation === nationality);
}

export function chooseFirstName(firstNameRows, nationality, age, rng) {
  const candidates = filterNamesByNationality(firstNameRows, nationality);
  if (!candidates.length) return nationality.slice(0, 3);
  const effectKey = mapAgeToDb1EffectKey(age);
  const fieldMap = { u20: 'age15to20', age20to24: 'age20to25', age25to29: 'age25to30', age30plus: 'age30plus' };
  return weightedPick(candidates, row => Number(row[fieldMap[effectKey]] || row[effectKey] || 1), rng).firstName;
}

export function chooseLastName(lastNameRows, nationality, rng) {
  const candidates = filterNamesByNationality(lastNameRows, nationality);
  if (!candidates.length) return 'Spieler';
  return weightedPick(candidates, row => Number(row.weight || row.Häufigkeit || row.frequency || 1), rng).lastName;
}

export function chooseCharacterKeys(definitions, nationGroup, rng) {
  const count = weightedPick([0, 1, 2], value => ({ 0: 15, 1: 60, 2: 25 }[value]), rng);
  if (count === 0) return [null, null];
  const available = definitions.filter(definition => Number(definition.groupWeights?.[nationGroup] || 0) > 0);
  const selected = [];
  const pool = [...(available.length ? available : definitions)];
  while (selected.length < count && pool.length) {
    const picked = weightedPick(pool, item => Number(item.groupWeights?.[nationGroup] || 1), rng);
    selected.push(picked.key);
    const index = pool.findIndex(item => item.key === picked.key);
    if (index >= 0) pool.splice(index, 1);
  }
  return [selected[0] ?? null, selected[1] ?? null];
}

export function choosePlayerTypeKeys(definitions, mainPosition, rng) {
  const count = weightedPick([0, 1, 2], value => ({ 0: 10, 1: 65, 2: 25 }[value]), rng);
  if (count === 0) return [null, null];
  const available = definitions.filter(definition => definition.availableAtGameStart !== false && Number(definition.positionWeights?.[mainPosition] || 0) > 0);
  const selected = [];
  const pool = [...(available.length ? available : definitions.filter(definition => definition.availableAtGameStart !== false))];
  while (selected.length < count && pool.length) {
    const picked = weightedPick(pool, item => Number(item.positionWeights?.[mainPosition] || 1), rng);
    selected.push(picked.key);
    const index = pool.findIndex(item => item.key === picked.key);
    if (index >= 0) pool.splice(index, 1);
  }
  return [selected[0] ?? null, selected[1] ?? null];
}

export function createPlayerId({ clubId, index, nationality, lastName }) {
  return `${clubId || 'free'}_${String(index).padStart(4, '0')}_${slugify(nationality)}_${slugify(lastName).slice(0, 12)}`;
}

export function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
}

export function sum(values) {
  return values.map(Number).filter(Number.isFinite).reduce((total, value) => total + value, 0);
}

export function pickTopWeightedCandidates(candidates, scoreAccessor, rng, size = DB2_START_RULES.selection.topCandidatePoolSize) {
  const sorted = [...candidates].sort((left, right) => scoreAccessor(right) - scoreAccessor(left));
  const top = sorted.slice(0, size);
  return weightedPick(top, candidate => Math.max(1, scoreAccessor(candidate)), rng);
}

export function budgetMillionsToSeasonCurrency(value) {
  return Math.round(Number(value || 0) * 1_000_000);
}

export function seasonCurrencyToMillions(value) {
  return Number((Number(value || 0) / 1_000_000).toFixed(2));
}

export function buildSelectionPreviewClub(club, players, formationRecord) {
  const sorted = [...players].sort((a, b) => b.overall - a.overall);
  const topPlayers = sorted.slice(0, 5).map(player => ({
    playerId: player.playerId,
    name: player.fullName,
    position: player.mainPosition,
    overall: player.overall
  }));
  return {
    clubId: club.clubId,
    clubName: club.clubName,
    city: club.city,
    leagueKey: club.leagueKey,
    prestige: club.prestige,
    fanbase: club.fanbase,
    financialPower: club.financialPower,
    seasonTarget: club.seasonTarget,
    salaryBudget: club.salaryBudget,
    transferBudget: club.transferBudget,
    squadStrength: club.squadStrength,
    squadCount: club.squadCount,
    averageAge: club.averageAge,
    formationLabel: formationRecord?.label || null,
    clubDescription: club.clubDescription,
    colors: [club.clubColor1, club.clubColor2, club.clubColor3].filter(Boolean),
    crestAsset: club.crestAsset,
    topPlayers
  };
}

export function formationLabelToKey(db5, label) {
  const formation = resolveFormations(db5).find(item => item.label === label);
  return formation?.id || null;
}

export function formationKeyToRecord(db5, formationKey) {
  return resolveFormations(db5).find(item => item.id === formationKey) || null;
}

export function buildLineupBuckets(playerIds, byId, count = 7) {
  const sorted = [...playerIds]
    .map(playerId => byId[playerId])
    .filter(Boolean)
    .sort((a, b) => b.overall - a.overall);
  return {
    benchPlayerIds: sorted.slice(0, count).map(player => player.playerId),
    reservePlayerIds: sorted.slice(count).map(player => player.playerId)
  };
}
