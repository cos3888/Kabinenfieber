export const DB4_PLAYER_RULES = Object.freeze({
  secondaryPositions: {
    emptyValue: null,
    mustNotMatchMainPosition: true,
    mustNotMatchEachOther: true
  },
  talentDisplay: {
    trueTalentScale: "1-10 integer",
    displayedTalentScale: "1-10 integer",
    starDisplayRule: "1 star = 2 displayed talent points",
    displayedTalentUpdateTrigger: "reliability_change_only"
  },
  ratings: {
    groupRatingsAreDerived: true,
    baseOverallIsDerived: true,
    potentialOverallIsPersistedAtGeneration: true,
    potentialUsageScale: "0-10",
    developmentOverallFormula:
      "baseOverall + ((potentialOverall - baseOverall) * (potentialUsage / 10))",
    overallFormula:
      "developmentOverall * (1 + ((fitness - 80) / 10) * 0.005 + ((form - 80) / 10) * 0.01 + ((morale - 80) / 10) * 0.01)"
  }
});

export function average(values) {
  const nums = values.map(Number).filter(v => Number.isFinite(v));
  return nums.length ? nums.reduce((a,b)=>a+b,0) / nums.length : 0;
}

export function buildFullName(player) {
  return `${player.firstName} ${player.lastName}`.trim();
}

export function calculateGroupRatings(player) {
  return {
    techRating: average([player.ballControl, player.dribbling, player.shortPassing, player.longPassing, player.crossing]),
    finishingRating: average([player.finishing, player.longShots, player.heading, player.setPieces, player.techniqueFlair]),
    mentalRating: average([player.vision, player.decisionMaking, player.positioning, player.teamwork, player.concentration]),
    physicalRating: average([player.speed, player.acceleration, player.stamina, player.strengthPhysical, player.balance]),
    defensiveRating: average([player.tackling, player.aggression, player.composure, player.leadership, player.discipline]),
    goalkeepingRating: average([player.gkReflexes, player.gkAreaControl, player.gkKicking, player.gkOneOnOne, player.gkHandling])
  };
}

export const OVERALL_WEIGHTS = Object.freeze({
  TW: { goalkeepingRating: 0.70, mentalRating: 0.10, physicalRating: 0.10, techRating: 0.10 },
  LV: { defensiveRating: 0.28, physicalRating: 0.22, techRating: 0.22, mentalRating: 0.18, finishingRating: 0.10 },
  RV: { defensiveRating: 0.28, physicalRating: 0.22, techRating: 0.22, mentalRating: 0.18, finishingRating: 0.10 },
  IV: { defensiveRating: 0.35, physicalRating: 0.25, mentalRating: 0.20, techRating: 0.15, finishingRating: 0.05 },
  DM: { defensiveRating: 0.28, mentalRating: 0.24, techRating: 0.22, physicalRating: 0.18, finishingRating: 0.08 },
  ZM: { techRating: 0.28, mentalRating: 0.24, physicalRating: 0.20, defensiveRating: 0.18, finishingRating: 0.10 },
  OM: { techRating: 0.30, mentalRating: 0.24, finishingRating: 0.22, physicalRating: 0.14, defensiveRating: 0.10 },
  LM: { techRating: 0.28, physicalRating: 0.22, mentalRating: 0.20, finishingRating: 0.20, defensiveRating: 0.10 },
  RM: { techRating: 0.28, physicalRating: 0.22, mentalRating: 0.20, finishingRating: 0.20, defensiveRating: 0.10 },
  LF: { finishingRating: 0.30, techRating: 0.24, physicalRating: 0.20, mentalRating: 0.16, defensiveRating: 0.10 },
  RF: { finishingRating: 0.30, techRating: 0.24, physicalRating: 0.20, mentalRating: 0.16, defensiveRating: 0.10 },
  HS: { finishingRating: 0.32, techRating: 0.24, mentalRating: 0.20, physicalRating: 0.14, defensiveRating: 0.10 },
  ST: { finishingRating: 0.38, physicalRating: 0.22, techRating: 0.18, mentalRating: 0.14, defensiveRating: 0.08 }
});

export function calculateBaseOverall(player) {
  const ratings = calculateGroupRatings(player);
  const weights = OVERALL_WEIGHTS[player.mainPosition];
  if (!weights) return Math.round(average(Object.values(ratings)));
  return Math.round(Object.entries(weights).reduce((sum, [k, w]) => sum + (ratings[k] * w), 0));
}

export function calculateDevelopmentOverall(baseOverall, potentialOverall, potentialUsage) {
  return baseOverall + ((potentialOverall - baseOverall) * (potentialUsage / 10));
}

export function calculateOverall(developmentOverall, form, fitness, morale) {
  const factor = 1
    + ((fitness - 80) / 10) * 0.005
    + ((form - 80) / 10) * 0.01
    + ((morale - 80) / 10) * 0.01;
  return Math.round(developmentOverall * factor);
}
