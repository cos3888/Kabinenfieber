export const DB6_EVENT_TYPES = Object.freeze([
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

export function createEmptyDB6State({ createdAt } = {}) {
  return {
    meta: {
      database: 'DB6 Matchhistorie',
      version: 'v1',
      createdAt: createdAt || new Date().toISOString(),
      lastMatchNumber: 0
    },
    matches: []
  };
}
