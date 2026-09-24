export const DB1_EXAMPLES = Object.freeze({
  nationalityDistributionExample: {
    leagueKey: "Deutschland 2",
    nationality: "Deutschland",
    sharePercent: 61
  },
  nationGroupExample: {
    nationality: "Deutschland",
    groupKey: "DIS"
  },
  firstNameExample: {
    nationality: "Deutschland",
    firstName: "Luca",
    ageWeights: { age15to20: 9, age20to25: 8, age25to30: 5, age30plus: 2 }
  },
  characterExample: {
    key: "teamspieler",
    name: "Teamspieler",
    effects: [{ attribute: "teamwork", delta: 2 }],
    groupWeights: { DIS: 1.2, BAL: 1.0, EMO: 0.9, KRE: 0.8 },
    ageEffectMultipliers: { u20: 0.95, age20to24: 1.0, age25to29: 1.0, age30plus: 1.05 }
  },
  playerTypeExample: {
    key: "abräumer",
    name: "Abräumer",
    effects: [{ attribute: "tackling", delta: 2 }],
    positionWeights: { IV: 1.2, DM: 1.1, ZM: 0.3 },
    ageEffectMultipliers: { u20: 0.9, age20to24: 1.0, age25to29: 1.0, age30plus: 1.05 }
  }
});
