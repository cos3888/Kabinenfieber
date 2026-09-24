export const DB1_CHARACTER_DEFINITIONS = Object.freeze([
  {
    "key": "teamspieler",
    "name": "Teamspieler",
    "effects": [
      {
        "attribute": "teamwork",
        "delta": 4.0
      },
      {
        "attribute": "shortPassing",
        "delta": 2.0
      },
      {
        "attribute": "decisionMaking",
        "delta": 1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "groupWeights": {
      "DIS": 14.0,
      "BAL": 11.0,
      "EMO": 8.0,
      "KRE": 7.0
    },
    "ageEffectMultipliers": {
      "u20": 0.95,
      "age20to24": 1.0,
      "age25to29": 1.0,
      "age30plus": 1.05
    },
    "assignmentAgeIndependent": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "führungsspieler",
    "name": "Führungsspieler",
    "effects": [
      {
        "attribute": "leadership",
        "delta": 5.0
      },
      {
        "attribute": "teamwork",
        "delta": 2.0
      },
      {
        "attribute": "concentration",
        "delta": 1.0
      },
      {
        "attribute": "aggression",
        "delta": 1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "groupWeights": {
      "DIS": 11.0,
      "BAL": 9.0,
      "EMO": 10.0,
      "KRE": 6.0
    },
    "ageEffectMultipliers": {
      "u20": 0.8,
      "age20to24": 0.9,
      "age25to29": 1.0,
      "age30plus": 1.1
    },
    "assignmentAgeIndependent": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "professional",
    "name": "Professional",
    "effects": [
      {
        "attribute": "discipline",
        "delta": 4.0
      },
      {
        "attribute": "concentration",
        "delta": 3.0
      },
      {
        "attribute": "decisionMaking",
        "delta": 1.0
      },
      {
        "attribute": "composure",
        "delta": 1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "groupWeights": {
      "DIS": 16.0,
      "BAL": 12.0,
      "EMO": 6.0,
      "KRE": 5.0
    },
    "ageEffectMultipliers": {
      "u20": 0.85,
      "age20to24": 0.95,
      "age25to29": 1.0,
      "age30plus": 1.1
    },
    "assignmentAgeIndependent": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "nervenstark",
    "name": "Nervenstark",
    "effects": [
      {
        "attribute": "composure",
        "delta": 4.0
      },
      {
        "attribute": "concentration",
        "delta": 2.0
      },
      {
        "attribute": "decisionMaking",
        "delta": 1.0
      },
      {
        "attribute": "leadership",
        "delta": 1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "groupWeights": {
      "DIS": 12.0,
      "BAL": 11.0,
      "EMO": 7.0,
      "KRE": 7.0
    },
    "ageEffectMultipliers": {
      "u20": 0.9,
      "age20to24": 0.95,
      "age25to29": 1.0,
      "age30plus": 1.05
    },
    "assignmentAgeIndependent": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "kämpfer",
    "name": "Kämpfer",
    "effects": [
      {
        "attribute": "aggression",
        "delta": 5.0
      },
      {
        "attribute": "stamina",
        "delta": 2.0
      },
      {
        "attribute": "tackling",
        "delta": 1.0
      },
      {
        "attribute": "composure",
        "delta": -1.0
      },
      {
        "attribute": "discipline",
        "delta": -1.0
      }
    ],
    "groupWeights": {
      "DIS": 7.0,
      "BAL": 9.0,
      "EMO": 15.0,
      "KRE": 6.0
    },
    "ageEffectMultipliers": {
      "u20": 1.05,
      "age20to24": 1.0,
      "age25to29": 1.0,
      "age30plus": 0.95
    },
    "assignmentAgeIndependent": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "hitzkopf",
    "name": "Hitzkopf",
    "effects": [
      {
        "attribute": "aggression",
        "delta": 5.0
      },
      {
        "attribute": "strengthPhysical",
        "delta": 2.0
      },
      {
        "attribute": "tackling",
        "delta": 1.0
      },
      {
        "attribute": "decisionMaking",
        "delta": -1.0
      },
      {
        "attribute": "discipline",
        "delta": -3.0
      }
    ],
    "groupWeights": {
      "DIS": 4.0,
      "BAL": 7.0,
      "EMO": 14.0,
      "KRE": 5.0
    },
    "ageEffectMultipliers": {
      "u20": 1.1,
      "age20to24": 1.05,
      "age25to29": 0.95,
      "age30plus": 0.85
    },
    "assignmentAgeIndependent": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "eiskalt",
    "name": "Eiskalt",
    "effects": [
      {
        "attribute": "composure",
        "delta": 5.0
      },
      {
        "attribute": "finishing",
        "delta": 2.0
      },
      {
        "attribute": "concentration",
        "delta": 1.0
      },
      {
        "attribute": "teamwork",
        "delta": -1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "groupWeights": {
      "DIS": 7.0,
      "BAL": 9.0,
      "EMO": 8.0,
      "KRE": 11.0
    },
    "ageEffectMultipliers": {
      "u20": 0.9,
      "age20to24": 0.95,
      "age25to29": 1.0,
      "age30plus": 1.05
    },
    "assignmentAgeIndependent": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "egoist",
    "name": "Egoist",
    "effects": [
      {
        "attribute": "dribbling",
        "delta": 4.0
      },
      {
        "attribute": "techniqueFlair",
        "delta": 3.0
      },
      {
        "attribute": "finishing",
        "delta": 1.0
      },
      {
        "attribute": "shortPassing",
        "delta": -1.0
      },
      {
        "attribute": "teamwork",
        "delta": -3.0
      }
    ],
    "groupWeights": {
      "DIS": 4.0,
      "BAL": 7.0,
      "EMO": 8.0,
      "KRE": 13.0
    },
    "ageEffectMultipliers": {
      "u20": 1.05,
      "age20to24": 1.0,
      "age25to29": 0.95,
      "age30plus": 0.9
    },
    "assignmentAgeIndependent": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "kreativ",
    "name": "Kreativ",
    "effects": [
      {
        "attribute": "techniqueFlair",
        "delta": 4.0
      },
      {
        "attribute": "vision",
        "delta": 3.0
      },
      {
        "attribute": "dribbling",
        "delta": 1.0
      },
      {
        "attribute": "discipline",
        "delta": -1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "groupWeights": {
      "DIS": 5.0,
      "BAL": 8.0,
      "EMO": 7.0,
      "KRE": 16.0
    },
    "ageEffectMultipliers": {
      "u20": 1.05,
      "age20to24": 1.0,
      "age25to29": 1.0,
      "age30plus": 0.95
    },
    "assignmentAgeIndependent": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "launisch",
    "name": "Launisch",
    "effects": [
      {
        "attribute": "techniqueFlair",
        "delta": 4.0
      },
      {
        "attribute": "dribbling",
        "delta": 2.0
      },
      {
        "attribute": "vision",
        "delta": 1.0
      },
      {
        "attribute": "concentration",
        "delta": -1.0
      },
      {
        "attribute": "discipline",
        "delta": -2.0
      }
    ],
    "groupWeights": {
      "DIS": 3.0,
      "BAL": 7.0,
      "EMO": 10.0,
      "KRE": 14.0
    },
    "ageEffectMultipliers": {
      "u20": 1.1,
      "age20to24": 1.05,
      "age25to29": 0.95,
      "age30plus": 0.85
    },
    "assignmentAgeIndependent": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "mutig",
    "name": "Mutig",
    "effects": [
      {
        "attribute": "longShots",
        "delta": 4.0
      },
      {
        "attribute": "acceleration",
        "delta": 2.0
      },
      {
        "attribute": "dribbling",
        "delta": 1.0
      },
      {
        "attribute": "decisionMaking",
        "delta": -1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "groupWeights": {
      "DIS": 5.0,
      "BAL": 8.0,
      "EMO": 10.0,
      "KRE": 12.0
    },
    "ageEffectMultipliers": {
      "u20": 1.05,
      "age20to24": 1.0,
      "age25to29": 0.95,
      "age30plus": 0.9
    },
    "assignmentAgeIndependent": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "bodenständig",
    "name": "Bodenständig",
    "effects": [
      {
        "attribute": "discipline",
        "delta": 4.0
      },
      {
        "attribute": "teamwork",
        "delta": 2.0
      },
      {
        "attribute": "concentration",
        "delta": 1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "groupWeights": {
      "DIS": 10.0,
      "BAL": 12.0,
      "EMO": 8.0,
      "KRE": 5.0
    },
    "ageEffectMultipliers": {
      "u20": 0.95,
      "age20to24": 1.0,
      "age25to29": 1.0,
      "age30plus": 1.05
    },
    "assignmentAgeIndependent": true,
    "maxAtGameStartPerPlayer": 2
  }
]);
