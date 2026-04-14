export const DB1_PLAYER_TYPE_DEFINITIONS = Object.freeze([
  {
    "key": "linienkeeper",
    "name": "Linienkeeper",
    "effects": [
      {
        "attribute": "gkReflexes",
        "delta": 5.0
      },
      {
        "attribute": "gkOneOnOne",
        "delta": 3.0
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
    "positionWeights": {
      "TW": 16.0,
      "LV": 0.0,
      "RV": 0.0,
      "IV": 0.0,
      "DM": 0.0,
      "ZM": 0.0,
      "OM": 0.0,
      "LM": 0.0,
      "RM": 0.0,
      "LF": 0.0,
      "RF": 0.0,
      "HS": 0.0,
      "ST": 0.0
    },
    "ageEffectMultipliers": {
      "u20": 0.95,
      "age20to24": 1.0,
      "age25to29": 1.0,
      "age30plus": 1.0
    },
    "assignmentAgeIndependent": true,
    "availableAtGameStart": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "mitspielender_keeper",
    "name": "Mitspielender Keeper",
    "effects": [
      {
        "attribute": "gkKicking",
        "delta": 5.0
      },
      {
        "attribute": "longPassing",
        "delta": 3.0
      },
      {
        "attribute": "decisionMaking",
        "delta": 1.0
      },
      {
        "attribute": "gkHandling",
        "delta": -1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "positionWeights": {
      "TW": 12.0,
      "LV": 0.0,
      "RV": 0.0,
      "IV": 0.0,
      "DM": 0.0,
      "ZM": 0.0,
      "OM": 0.0,
      "LM": 0.0,
      "RM": 0.0,
      "LF": 0.0,
      "RF": 0.0,
      "HS": 0.0,
      "ST": 0.0
    },
    "ageEffectMultipliers": {
      "u20": 1.0,
      "age20to24": 1.0,
      "age25to29": 1.0,
      "age30plus": 0.95
    },
    "assignmentAgeIndependent": true,
    "availableAtGameStart": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "abräumer",
    "name": "Abräumer",
    "effects": [
      {
        "attribute": "tackling",
        "delta": 5.0
      },
      {
        "attribute": "strengthPhysical",
        "delta": 3.0
      },
      {
        "attribute": "heading",
        "delta": 1.0
      },
      {
        "attribute": "longPassing",
        "delta": -1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "positionWeights": {
      "TW": 0.0,
      "LV": 0.0,
      "RV": 0.0,
      "IV": 15.0,
      "DM": 2.0,
      "ZM": 0.0,
      "OM": 0.0,
      "LM": 0.0,
      "RM": 0.0,
      "LF": 0.0,
      "RF": 0.0,
      "HS": 0.0,
      "ST": 0.0
    },
    "ageEffectMultipliers": {
      "u20": 0.95,
      "age20to24": 1.0,
      "age25to29": 1.0,
      "age30plus": 1.05
    },
    "assignmentAgeIndependent": true,
    "availableAtGameStart": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "spielaufbau_verteidiger",
    "name": "Spielaufbau-Verteidiger",
    "effects": [
      {
        "attribute": "longPassing",
        "delta": 5.0
      },
      {
        "attribute": "shortPassing",
        "delta": 3.0
      },
      {
        "attribute": "vision",
        "delta": 1.0
      },
      {
        "attribute": "tackling",
        "delta": -1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "positionWeights": {
      "TW": 0.0,
      "LV": 0.0,
      "RV": 0.0,
      "IV": 10.0,
      "DM": 8.0,
      "ZM": 4.0,
      "OM": 0.0,
      "LM": 0.0,
      "RM": 0.0,
      "LF": 0.0,
      "RF": 0.0,
      "HS": 0.0,
      "ST": 0.0
    },
    "ageEffectMultipliers": {
      "u20": 0.95,
      "age20to24": 1.0,
      "age25to29": 1.0,
      "age30plus": 1.05
    },
    "assignmentAgeIndependent": true,
    "availableAtGameStart": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "defensiver_außenverteidiger",
    "name": "Defensiver Außenverteidiger",
    "effects": [
      {
        "attribute": "tackling",
        "delta": 4.0
      },
      {
        "attribute": "positioning",
        "delta": 3.0
      },
      {
        "attribute": "stamina",
        "delta": 1.0
      },
      {
        "attribute": "crossing",
        "delta": -1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "positionWeights": {
      "TW": 0.0,
      "LV": 12.0,
      "RV": 12.0,
      "IV": 3.0,
      "DM": 2.0,
      "ZM": 0.0,
      "OM": 0.0,
      "LM": 1.0,
      "RM": 1.0,
      "LF": 0.0,
      "RF": 0.0,
      "HS": 0.0,
      "ST": 0.0
    },
    "ageEffectMultipliers": {
      "u20": 0.95,
      "age20to24": 1.0,
      "age25to29": 1.0,
      "age30plus": 1.0
    },
    "assignmentAgeIndependent": true,
    "availableAtGameStart": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "schienenspieler",
    "name": "Schienenspieler",
    "effects": [
      {
        "attribute": "stamina",
        "delta": 5.0
      },
      {
        "attribute": "speed",
        "delta": 3.0
      },
      {
        "attribute": "crossing",
        "delta": 1.0
      },
      {
        "attribute": "strengthPhysical",
        "delta": -1.0
      },
      {
        "attribute": "concentration",
        "delta": -1.0
      }
    ],
    "positionWeights": {
      "TW": 0.0,
      "LV": 10.0,
      "RV": 10.0,
      "IV": 0.0,
      "DM": 1.0,
      "ZM": 2.0,
      "OM": 2.0,
      "LM": 8.0,
      "RM": 8.0,
      "LF": 2.0,
      "RF": 2.0,
      "HS": 0.0,
      "ST": 0.0
    },
    "ageEffectMultipliers": {
      "u20": 1.05,
      "age20to24": 1.0,
      "age25to29": 0.95,
      "age30plus": 0.85
    },
    "assignmentAgeIndependent": true,
    "availableAtGameStart": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "sechser_zerstörer",
    "name": "Sechser-Zerstörer",
    "effects": [
      {
        "attribute": "tackling",
        "delta": 5.0
      },
      {
        "attribute": "aggression",
        "delta": 3.0
      },
      {
        "attribute": "positioning",
        "delta": 1.0
      },
      {
        "attribute": "shortPassing",
        "delta": -1.0
      },
      {
        "attribute": "techniqueFlair",
        "delta": -1.0
      }
    ],
    "positionWeights": {
      "TW": 0.0,
      "LV": 0.0,
      "RV": 0.0,
      "IV": 2.0,
      "DM": 14.0,
      "ZM": 6.0,
      "OM": 0.0,
      "LM": 0.0,
      "RM": 0.0,
      "LF": 0.0,
      "RF": 0.0,
      "HS": 0.0,
      "ST": 0.0
    },
    "ageEffectMultipliers": {
      "u20": 1.0,
      "age20to24": 1.0,
      "age25to29": 1.0,
      "age30plus": 0.95
    },
    "assignmentAgeIndependent": true,
    "availableAtGameStart": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "taktgeber",
    "name": "Taktgeber",
    "effects": [
      {
        "attribute": "shortPassing",
        "delta": 5.0
      },
      {
        "attribute": "longPassing",
        "delta": 3.0
      },
      {
        "attribute": "vision",
        "delta": 1.0
      },
      {
        "attribute": "aggression",
        "delta": -1.0
      },
      {
        "attribute": "speed",
        "delta": -1.0
      }
    ],
    "positionWeights": {
      "TW": 0.0,
      "LV": 0.0,
      "RV": 0.0,
      "IV": 3.0,
      "DM": 10.0,
      "ZM": 14.0,
      "OM": 8.0,
      "LM": 0.0,
      "RM": 0.0,
      "LF": 0.0,
      "RF": 0.0,
      "HS": 0.0,
      "ST": 0.0
    },
    "ageEffectMultipliers": {
      "u20": 0.9,
      "age20to24": 0.95,
      "age25to29": 1.0,
      "age30plus": 1.1
    },
    "assignmentAgeIndependent": true,
    "availableAtGameStart": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "box_to_box",
    "name": "Box-to-Box",
    "effects": [
      {
        "attribute": "stamina",
        "delta": 5.0
      },
      {
        "attribute": "teamwork",
        "delta": 3.0
      },
      {
        "attribute": "positioning",
        "delta": 1.0
      },
      {
        "attribute": "finishing",
        "delta": 1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "positionWeights": {
      "TW": 0.0,
      "LV": 2.0,
      "RV": 2.0,
      "IV": 2.0,
      "DM": 8.0,
      "ZM": 14.0,
      "OM": 4.0,
      "LM": 3.0,
      "RM": 3.0,
      "LF": 0.0,
      "RF": 0.0,
      "HS": 0.0,
      "ST": 0.0
    },
    "ageEffectMultipliers": {
      "u20": 1.05,
      "age20to24": 1.0,
      "age25to29": 1.0,
      "age30plus": 0.9
    },
    "assignmentAgeIndependent": true,
    "availableAtGameStart": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "spielmacher",
    "name": "Spielmacher",
    "effects": [
      {
        "attribute": "vision",
        "delta": 5.0
      },
      {
        "attribute": "shortPassing",
        "delta": 3.0
      },
      {
        "attribute": "techniqueFlair",
        "delta": 1.0
      },
      {
        "attribute": "speed",
        "delta": -1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "positionWeights": {
      "TW": 0.0,
      "LV": 0.0,
      "RV": 0.0,
      "IV": 1.0,
      "DM": 4.0,
      "ZM": 10.0,
      "OM": 15.0,
      "LM": 2.0,
      "RM": 2.0,
      "LF": 3.0,
      "RF": 3.0,
      "HS": 4.0,
      "ST": 2.0
    },
    "ageEffectMultipliers": {
      "u20": 0.9,
      "age20to24": 0.95,
      "age25to29": 1.0,
      "age30plus": 1.05
    },
    "assignmentAgeIndependent": true,
    "availableAtGameStart": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "dribbler",
    "name": "Dribbler",
    "effects": [
      {
        "attribute": "dribbling",
        "delta": 5.0
      },
      {
        "attribute": "ballControl",
        "delta": 3.0
      },
      {
        "attribute": "acceleration",
        "delta": 1.0
      },
      {
        "attribute": "teamwork",
        "delta": -1.0
      },
      {
        "attribute": "discipline",
        "delta": -1.0
      }
    ],
    "positionWeights": {
      "TW": 0.0,
      "LV": 0.0,
      "RV": 0.0,
      "IV": 0.0,
      "DM": 1.0,
      "ZM": 4.0,
      "OM": 10.0,
      "LM": 10.0,
      "RM": 10.0,
      "LF": 8.0,
      "RF": 8.0,
      "HS": 3.0,
      "ST": 1.0
    },
    "ageEffectMultipliers": {
      "u20": 1.05,
      "age20to24": 1.0,
      "age25to29": 0.95,
      "age30plus": 0.85
    },
    "assignmentAgeIndependent": true,
    "availableAtGameStart": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "flankengeber",
    "name": "Flankengeber",
    "effects": [
      {
        "attribute": "crossing",
        "delta": 5.0
      },
      {
        "attribute": "shortPassing",
        "delta": 3.0
      },
      {
        "attribute": "stamina",
        "delta": 1.0
      },
      {
        "attribute": "finishing",
        "delta": -1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "positionWeights": {
      "TW": 0.0,
      "LV": 8.0,
      "RV": 8.0,
      "IV": 0.0,
      "DM": 2.0,
      "ZM": 4.0,
      "OM": 6.0,
      "LM": 12.0,
      "RM": 12.0,
      "LF": 5.0,
      "RF": 5.0,
      "HS": 1.0,
      "ST": 0.0
    },
    "ageEffectMultipliers": {
      "u20": 1.0,
      "age20to24": 1.0,
      "age25to29": 0.95,
      "age30plus": 0.9
    },
    "assignmentAgeIndependent": true,
    "availableAtGameStart": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "knipser",
    "name": "Knipser",
    "effects": [
      {
        "attribute": "finishing",
        "delta": 5.0
      },
      {
        "attribute": "positioning",
        "delta": 3.0
      },
      {
        "attribute": "composure",
        "delta": 1.0
      },
      {
        "attribute": "shortPassing",
        "delta": -1.0
      },
      {
        "attribute": "tackling",
        "delta": -1.0
      }
    ],
    "positionWeights": {
      "TW": 0.0,
      "LV": 0.0,
      "RV": 0.0,
      "IV": 0.0,
      "DM": 0.0,
      "ZM": 2.0,
      "OM": 6.0,
      "LM": 3.0,
      "RM": 3.0,
      "LF": 6.0,
      "RF": 6.0,
      "HS": 14.0,
      "ST": 16.0
    },
    "ageEffectMultipliers": {
      "u20": 0.95,
      "age20to24": 1.0,
      "age25to29": 1.0,
      "age30plus": 0.95
    },
    "assignmentAgeIndependent": true,
    "availableAtGameStart": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "tiefenläufer",
    "name": "Tiefenläufer",
    "effects": [
      {
        "attribute": "speed",
        "delta": 5.0
      },
      {
        "attribute": "acceleration",
        "delta": 3.0
      },
      {
        "attribute": "positioning",
        "delta": 1.0
      },
      {
        "attribute": "strengthPhysical",
        "delta": -1.0
      },
      {
        "attribute": "-",
        "delta": 0.0
      }
    ],
    "positionWeights": {
      "TW": 0.0,
      "LV": 0.0,
      "RV": 0.0,
      "IV": 0.0,
      "DM": 1.0,
      "ZM": 4.0,
      "OM": 6.0,
      "LM": 6.0,
      "RM": 6.0,
      "LF": 12.0,
      "RF": 12.0,
      "HS": 10.0,
      "ST": 12.0
    },
    "ageEffectMultipliers": {
      "u20": 1.05,
      "age20to24": 1.0,
      "age25to29": 0.95,
      "age30plus": 0.85
    },
    "assignmentAgeIndependent": true,
    "availableAtGameStart": true,
    "maxAtGameStartPerPlayer": 2
  },
  {
    "key": "zielspieler",
    "name": "Zielspieler",
    "effects": [
      {
        "attribute": "heading",
        "delta": 5.0
      },
      {
        "attribute": "strengthPhysical",
        "delta": 3.0
      },
      {
        "attribute": "ballControl",
        "delta": 1.0
      },
      {
        "attribute": "speed",
        "delta": -1.0
      },
      {
        "attribute": "acceleration",
        "delta": -1.0
      }
    ],
    "positionWeights": {
      "TW": 0.0,
      "LV": 0.0,
      "RV": 0.0,
      "IV": 2.0,
      "DM": 4.0,
      "ZM": 6.0,
      "OM": 4.0,
      "LM": 2.0,
      "RM": 2.0,
      "LF": 3.0,
      "RF": 3.0,
      "HS": 10.0,
      "ST": 12.0
    },
    "ageEffectMultipliers": {
      "u20": 0.9,
      "age20to24": 0.95,
      "age25to29": 1.0,
      "age30plus": 1.05
    },
    "assignmentAgeIndependent": true,
    "availableAtGameStart": true,
    "maxAtGameStartPerPlayer": 2
  }
]);
