import { buildMatchReport } from './db7_match_report_texts.js';
import { attackingWeightForPlayer, buildSeededRandom, cardWeightForPlayer, clamp, ensureDB7State, randomInt, toNumber, weightedPick } from './db7_simulation_helpers.js';

function createPlayerEntry(player, clubId, positionSlot, startMinute, endMinute, isStarter) {
  return {
    playerId: String(player?.playerId || ''),
    clubId: String(clubId || ''),
    isStarter: Boolean(isStarter),
    startMinute: Math.max(0, toNumber(startMinute, 0)),
    endMinute: Math.max(0, toNumber(endMinute, 90)),
    positionSlot: String(positionSlot || player?.mainPosition || ''),
    rating: null
  };
}

function createGoalEvent({ events, minute, type = 'goal', clubId, playerId, secondaryPlayerId = null, benefitClubId = null }) {
  events.push({
    eventIndex: events.length + 1,
    minute,
    type,
    clubId,
    playerId,
    secondaryPlayerId,
    benefitClubId
  });
}

function simulateGoals(random, context, homeAttackStrength, awayAttackStrength) {
  const strengthDiff = homeAttackStrength - awayAttackStrength;
  const baseHome = 1.25 + (strengthDiff / 18);
  const baseAway = 1.05 - (strengthDiff / 20);
  const homeGoals = clamp(Math.round(baseHome + (random() * 2.4) - 0.7), 0, 6);
  const awayGoals = clamp(Math.round(baseAway + (random() * 2.2) - 0.7), 0, 6);
  return { homeGoals, awayGoals };
}

function maybeAddPenalty(random, events, context, scoringSide) {
  if (random() > 0.18) return false;
  const lineup = scoringSide === 'home' ? context.homeClub : context.awayClub;
  const opposingClubId = scoringSide === 'home' ? context.awayClub.clubId : context.homeClub.clubId;
  const taker = weightedPick(lineup.starters, player => attackingWeightForPlayer(player), random) || lineup.starters[0] || null;
  if (!taker) return false;
  const minute = randomInt(random, 10, 88);
  if (random() < 0.76) {
    createGoalEvent({ events, minute, type: 'penalty_goal', clubId: lineup.clubId, playerId: taker.playerId });
    if (random() < 0.55) {
      const assister = weightedPick(lineup.starters.filter(player => player.playerId !== taker.playerId), player => attackingWeightForPlayer(player), random);
      if (assister) createGoalEvent({ events, minute, type: 'assist', clubId: lineup.clubId, playerId: assister.playerId });
    }
    return { scored: true, side: scoringSide };
  }
  createGoalEvent({ events, minute, type: 'penalty_miss', clubId: lineup.clubId, playerId: taker.playerId, benefitClubId: opposingClubId });
  return { scored: false, side: scoringSide };
}

function applySimpleSubstitutions(random, context, players) {
  [context.homeClub, context.awayClub].forEach(lineup => {
    const subCount = Math.min(lineup.bench.length, randomInt(random, 1, Math.min(3, lineup.bench.length || 1)));
    const startersPool = [...lineup.starters].sort((a, b) => Number(a.overall || 0) - Number(b.overall || 0));
    for (let i = 0; i < subCount; i += 1) {
      const subIn = lineup.bench[i];
      const subOut = startersPool[i];
      if (!subIn || !subOut) continue;
      const minute = randomInt(random, 55, 82);
      const starterEntry = players.find(player => player.playerId === subOut.playerId);
      if (starterEntry) starterEntry.endMinute = minute;
      players.push(createPlayerEntry(subIn, lineup.clubId, subIn.mainPosition || 'Bank', minute, context.config.matchLength, false));
    }
  });
}

function addCardEvents(random, context, events) {
  [context.homeClub, context.awayClub].forEach(lineup => {
    const yellowCount = randomInt(random, 0, 3);
    for (let i = 0; i < yellowCount; i += 1) {
      const offender = weightedPick(lineup.starters, player => cardWeightForPlayer(player), random);
      if (!offender) continue;
      createGoalEvent({ events, minute: randomInt(random, 8, 89), type: 'yellow_card', clubId: lineup.clubId, playerId: offender.playerId });
    }
    if (random() < 0.08) {
      const offender = weightedPick(lineup.starters, player => cardWeightForPlayer(player), random);
      if (offender) createGoalEvent({ events, minute: randomInt(random, 15, 88), type: 'red_card', clubId: lineup.clubId, playerId: offender.playerId });
    }
  });
}

function addInjuryEvents(random, context, events) {
  [context.homeClub, context.awayClub].forEach(lineup => {
    if (random() < 0.12) {
      const injured = weightedPick(lineup.starters, player => Math.max(1, Number(player.overall || 50)), random);
      if (injured) createGoalEvent({ events, minute: randomInt(random, 20, 85), type: 'injury', clubId: lineup.clubId, playerId: injured.playerId });
    }
  });
}

function addGoalPackage(random, context, events, scoringSide, forcedType = 'goal') {
  const lineup = scoringSide === 'home' ? context.homeClub : context.awayClub;
  const opponent = scoringSide === 'home' ? context.awayClub : context.homeClub;
  const minute = randomInt(random, 4, 89);
  if (forcedType === 'own_goal') {
    const culprit = weightedPick(opponent.starters, player => Math.max(1, 110 - Number(player.overall || 50)), random) || opponent.starters[0];
    if (!culprit) return;
    createGoalEvent({ events, minute, type: 'own_goal', clubId: opponent.clubId, playerId: culprit.playerId, benefitClubId: lineup.clubId });
    return;
  }
  const scorer = weightedPick(lineup.starters, player => attackingWeightForPlayer(player), random) || lineup.starters[0];
  if (!scorer) return;
  createGoalEvent({ events, minute, type: forcedType, clubId: lineup.clubId, playerId: scorer.playerId });
  if (random() < 0.62) {
    const assister = weightedPick(lineup.starters.filter(player => player.playerId !== scorer.playerId), player => attackingWeightForPlayer(player), random);
    if (assister) createGoalEvent({ events, minute, type: 'assist', clubId: lineup.clubId, playerId: assister.playerId, secondaryPlayerId: scorer.playerId });
  }
}

export function simulateMatchResult({ state, context }) {
  if (!context) throw new Error('DB7 benötigt einen Matchkontext.');
  const db7State = ensureDB7State(state);
  const random = buildSeededRandom(`${state?.meta?.seed || 'seed'}|${context.simulationId}|${context.homeClub.clubId}|${context.awayClub.clubId}|${context.matchday || context.roundKey || ''}`);
  const homeAttackStrength = Number(context.homeClub.teamStrength || 50) + Number(context.config.homeAdvantage || 0);
  const awayAttackStrength = Number(context.awayClub.teamStrength || 50);

  let { homeGoals, awayGoals } = simulateGoals(random, context, homeAttackStrength, awayAttackStrength);
  const events = [];

  for (let i = 0; i < homeGoals; i += 1) addGoalPackage(random, context, events, 'home');
  for (let i = 0; i < awayGoals; i += 1) addGoalPackage(random, context, events, 'away');

  if (random() < 0.09) {
    const side = random() < 0.5 ? 'home' : 'away';
    addGoalPackage(random, context, events, side, 'own_goal');
    if (side === 'home') homeGoals += 1;
    else awayGoals += 1;
  }

  const homePenalty = maybeAddPenalty(random, events, context, 'home');
  const awayPenalty = maybeAddPenalty(random, events, context, 'away');
  if (homePenalty?.scored) homeGoals += 1;
  if (awayPenalty?.scored) awayGoals += 1;

  const players = [
    ...context.homeClub.starters.map(player => createPlayerEntry(player, context.homeClub.clubId, player.simulationSlot || player.mainPosition, 0, context.config.matchLength, true)),
    ...context.awayClub.starters.map(player => createPlayerEntry(player, context.awayClub.clubId, player.simulationSlot || player.mainPosition, 0, context.config.matchLength, true))
  ];

  applySimpleSubstitutions(random, context, players);
  addCardEvents(random, context, events);
  addInjuryEvents(random, context, events);

  events.sort((a, b) => Number(a.minute) - Number(b.minute) || Number(a.eventIndex) - Number(b.eventIndex));
  events.forEach((event, index) => { event.eventIndex = index + 1; });

  const result = {
    simulationId: context.simulationId,
    competitionKey: context.competitionKey,
    seasonNr: context.seasonNr,
    matchday: context.matchday,
    roundKey: context.roundKey,
    homeClubId: context.homeClub.clubId,
    awayClubId: context.awayClub.clubId,
    homeGoals,
    awayGoals,
    homeFormationKey: context.homeClub.formationKey,
    awayFormationKey: context.awayClub.formationKey,
    players,
    events,
    report: null
  };

  result.report = buildMatchReport(result, context);
  db7State.lastContext = context;
  db7State.lastResult = result;
  db7State.meta.lastSimulationNumber = Number(db7State.meta.lastSimulationNumber || 0) + 1;
  return result;
}
