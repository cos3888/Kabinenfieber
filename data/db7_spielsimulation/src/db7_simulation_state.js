export const DB7_EVENT_TYPES = Object.freeze([
  'goal',
  'own_goal',
  'yellow_card',
  'red_card',
  'sub_on',
  'sub_off',
  'assist',
  'penalty_goal',
  'penalty_miss',
  'injury'
]);

export function createEmptyDB7State({ createdAt } = {}) {
  return {
    meta: {
      database: 'DB7 Spielsimulation',
      version: 'v1',
      createdAt: createdAt || new Date().toISOString(),
      lastSimulationNumber: 0
    },
    config: {
      homeAdvantage: 3,
      maxBenchParticipants: 3,
      matchLength: 90
    },
    profiles: {
      eventTypes: [...DB7_EVENT_TYPES]
    },
    lastContext: null,
    lastResult: null
  };
}
