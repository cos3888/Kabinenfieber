export const DB2_START_RULES = Object.freeze({
  squad: {
    minSize: 22,
    targetSizeRange: [23, 25],
    maxSize: 26,
    freeAgentRatio: 0.12,
    baseCounts: {
      TW: 2,
      IV: 4,
      FB: 4,
      CM: 6,
      WM: 4,
      ST: 2
    },
    formationExtras: {
      'formation_4_2_3_1': ['WM'],
      'formation_4_3_3': ['WM'],
      'formation_4_4_2': ['ST'],
      'formation_3_5_2': ['IV', 'FB'],
      'formation_4_1_4_1': ['CM']
    },
    stageWeights: {
      starters: 1.0,
      bench: 0.88,
      reserve: 0.79
    }
  },
  ageDistribution: Object.freeze([
    { key: '17-19', min: 17, max: 19, weight: 10 },
    { key: '20-23', min: 20, max: 23, weight: 24 },
    { key: '24-27', min: 24, max: 27, weight: 31 },
    { key: '28-31', min: 28, max: 31, weight: 23 },
    { key: '32-35', min: 32, max: 35, weight: 12 }
  ]),
  ageEffectMultipliers: Object.freeze({
    '17-19': 0.55,
    '20-23': 0.75,
    '24-27': 1.0,
    '28-31': 1.0,
    '32-35': 0.9,
    u20: 0.55,
    age20to24: 0.75,
    age25to29: 1.0,
    age30plus: 0.9
  }),
  qualityBands: Object.freeze([
    { key: 'low', weight: 12, minOffset: -7, maxOffset: -4 },
    { key: 'below', weight: 23, minOffset: -3, maxOffset: -1 },
    { key: 'average', weight: 36, minOffset: 0, maxOffset: 1 },
    { key: 'above', weight: 21, minOffset: 2, maxOffset: 4 },
    { key: 'elite', weight: 8, minOffset: 5, maxOffset: 8 }
  ]),
  potentialDeltaByAge: Object.freeze({
    '17-19': [6, 15],
    '20-23': [4, 12],
    '24-27': [2, 8],
    '28-31': [0, 5],
    '32-35': [0, 3]
  }),
  potentialUsageByAge: Object.freeze({
    '17-19': [6.8, 8.2],
    '20-23': [7.4, 8.8],
    '24-27': [8.2, 9.4],
    '28-31': [8.6, 9.7],
    '32-35': [8.8, 9.8]
  }),
  selection: {
    scoreWeights: Object.freeze({
      positionFit: 35,
      salaryFit: 25,
      qualityFit: 20,
      prestigeFit: 15,
      leagueFit: 5
    }),
    topCandidatePoolSize: 5
  },
  formationWeights: Object.freeze({
    '4-2-3-1': 28,
    '4-3-3': 24,
    '4-4-2': 18,
    '3-5-2': 14,
    '4-1-4-1': 16
  }),
  clubSelection: {
    includeAllActiveClubs: true,
    previewTopPlayers: 5
  },
  managerViews: {
    benchSize: 7,
    reserveSizeFromRest: true
  },
  playerGeneration: {
    defaultForm: 80,
    defaultFitness: 80,
    defaultMorale: 80,
    reliabilityRange: [1, 10],
    talentRange: [1, 10],
    weakFootRange: [1, 5],
    heightRangeByGroup: {
      TW: [184, 199],
      DEF: [178, 195],
      MID: [170, 190],
      ATT: [168, 194]
    }
  }
});

export const DB2_START_FORMATION_POOL = Object.freeze(['4-2-3-1', '4-3-3', '4-4-2', '3-5-2', '4-1-4-1']);

export const DB2_POSITION_GROUPS = Object.freeze({
  TW: ['TW'],
  IV: ['IV'],
  FB: ['LV', 'RV'],
  CM: ['DM', 'ZM'],
  WM: ['LM', 'RM', 'OM', 'LF', 'RF', 'HS'],
  ST: ['ST']
});

export const DB2_POSITION_ROLE_TEMPLATES = Object.freeze({
  '4-2-3-1': ['TW','LV','IV','IV','RV','DM','ZM','LM','OM','RM','ST'],
  '4-3-3': ['TW','LV','IV','IV','RV','DM','ZM','ZM','LF','RF','ST'],
  '4-4-2': ['TW','LV','IV','IV','RV','LM','ZM','ZM','RM','ST','ST'],
  '3-5-2': ['TW','IV','IV','IV','LM','DM','ZM','ZM','RM','ST','ST'],
  '4-1-4-1': ['TW','LV','IV','IV','RV','DM','LM','ZM','ZM','RM','ST']
});

export const DB2_SECONDARY_POSITION_MAP = Object.freeze({
  TW: [],
  LV: ['LM'],
  IV: ['DM'],
  RV: ['RM'],
  DM: ['ZM', 'IV'],
  ZM: ['DM', 'OM'],
  OM: ['ZM', 'HS'],
  LM: ['LF', 'LV'],
  RM: ['RF', 'RV'],
  LF: ['LM', 'ST'],
  RF: ['RM', 'ST'],
  HS: ['OM', 'ST'],
  ST: ['HS', 'LF', 'RF']
});
