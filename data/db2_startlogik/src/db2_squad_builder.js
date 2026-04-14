import { DB2_START_RULES, DB2_POSITION_ROLE_TEMPLATES } from './db2_start_rules.js';
import {
  buildSquadTemplate,
  chooseFormationRecord,
  buildSelectionPreviewClub,
  budgetMillionsToSeasonCurrency,
  seasonCurrencyToMillions,
  formationKeyToRecord,
  sum,
  average,
  getRoleTierForIndex
} from './db2_start_helpers.js';
import { generatePlayerForClub } from './db2_player_generator.js';

function estimateSalaryFromPlayer({ player, leagueReference, club }) {
  const leagueSalary = budgetMillionsToSeasonCurrency(leagueReference.standardSalarySeason);
  const qualityFactor = Math.max(0.45, player.overall / Math.max(1, leagueReference.standardPlayerOverall));
  const prestigeFactor = 1 + ((Number(club.prestige || 5) - 5) * 0.03);
  const ageFactor = player.age <= 22 ? 0.93 : player.age >= 31 ? 0.95 : 1.0;
  return Math.round(leagueSalary * 0.04 * qualityFactor * prestigeFactor * ageFactor);
}

function estimateMarketValue({ player, leagueReference }) {
  const baseValue = budgetMillionsToSeasonCurrency(leagueReference.averagePlayerMarketValue);
  const overallFactor = Math.max(0.25, (player.overall / Math.max(1, leagueReference.standardPlayerOverall)) ** 2);
  const potentialFactor = 1 + Math.max(0, player.potentialOverall - player.overall) * 0.025;
  const ageFactor = player.age <= 21 ? 1.2 : player.age <= 27 ? 1.0 : player.age <= 31 ? 0.82 : 0.6;
  return Math.round(baseValue * overallFactor * potentialFactor * ageFactor * 0.12);
}

function estimatePrestigeExpectation({ player, leagueReference }) {
  const baseline = Number(leagueReference.prestige || 5);
  const qualityBoost = Math.max(-1, Math.min(3, (player.overall - leagueReference.standardPlayerOverall) / 3));
  return Math.max(1, Math.min(10, Math.round(baseline * 0.55 + qualityBoost + 2)));
}

function assignContractValues({ players, club, leagueReference }) {
  let committed = 0;
  players.forEach(player => {
    player.marketValue = estimateMarketValue({ player, leagueReference });
    player.salaryExpectation = estimateSalaryFromPlayer({ player, leagueReference, club });
    player.salary = player.salaryExpectation;
    player.prestigeExpectation = estimatePrestigeExpectation({ player, leagueReference });
    player.contractStatus = player.clubId ? 'contracted' : 'freeAgent';
    committed += player.salary;
  });
  return committed;
}

function buildClubTacticSkeleton({ club, formationRecord, players }) {
  return {
    clubId: club.clubId,
    defaultFormationKey: formationRecord.id,
    currentFormationKey: formationRecord.id,
    formationLabel: formationRecord.label,
    lineupSlotAssignments: {},
    benchPlayerIds: [],
    reservePlayerIds: [],
    availablePlayerIds: players.map(player => player.playerId)
  };
}

export function generateClubStartPackage({ club, leagueReference, db1Resolved, db4Api, db5, rng, playerIndexState }) {
  const formationRecord = chooseFormationRecord(db5, rng);
  const squadTemplate = buildSquadTemplate(formationRecord.label, rng);
  const players = squadTemplate.map((groupKey, index) => {
    playerIndexState.value += 1;
    const roleTier = getRoleTierForIndex(index);
    return generatePlayerForClub({
      club,
      slotIndex: index,
      groupKey,
      roleTier,
      leagueReference,
      db1Resolved,
      db4Api,
      rng,
      playerIndex: playerIndexState.value
    });
  });

  const salaryCommitted = assignContractValues({ players, club, leagueReference });
  const salaryBudget = budgetMillionsToSeasonCurrency(club.salaryBudget);
  const cappedCommitted = Math.min(salaryCommitted, salaryBudget);
  if (salaryCommitted > salaryBudget) {
    const factor = salaryBudget / salaryCommitted;
    players.forEach(player => {
      player.salary = Math.max(18000, Math.round(player.salary * factor));
      player.salaryExpectation = player.salary;
    });
  }

  const recalculatedCommitted = sum(players.map(player => player.salary));
  const squadStrength = Math.round(average(players.map(player => player.overall)));
  const squadMarketValue = seasonCurrencyToMillions(sum(players.map(player => player.marketValue)));
  const averageAge = Number(average(players.map(player => player.age)).toFixed(1));

  const nextClub = {
    ...club,
    defaultFormationKey: formationRecord.id,
    currentFormationKey: formationRecord.id,
    squadCount: players.length,
    squadStrength,
    squadMarketValue,
    averageAge,
    salaryCommitted: seasonCurrencyToMillions(recalculatedCommitted),
    salaryBudgetRemaining: seasonCurrencyToMillions(Math.max(0, budgetMillionsToSeasonCurrency(club.salaryBudget) - recalculatedCommitted))
  };

  return {
    club: nextClub,
    players,
    tacticState: buildClubTacticSkeleton({ club: nextClub, formationRecord, players })
  };
}

export function generateFreeAgents({ clubs, leagueReferenceByKey, db1Resolved, db4Api, rng, playerIndexState }) {
  const freeAgents = [];
  clubs.forEach(club => {
    const count = Math.max(2, Math.round(club.squadCount * DB2_START_RULES.squad.freeAgentRatio));
    const leagueReference = leagueReferenceByKey[club.leagueKey];
    for (let i = 0; i < count; i += 1) {
      playerIndexState.value += 1;
      const groupKey = ['TW', 'IV', 'FB', 'CM', 'WM', 'ST'][i % 6];
      const player = generatePlayerForClub({
        club,
        slotIndex: i,
        groupKey,
        roleTier: 'reserve',
        leagueReference,
        db1Resolved,
        db4Api,
        rng,
        playerIndex: playerIndexState.value,
        generationScope: 'freeAgent'
      });
      player.clubId = null;
      player.contractStatus = 'freeAgent';
      player.salaryExpectation = estimateSalaryFromPlayer({ player, leagueReference, club });
      player.salary = 0;
      player.marketValue = estimateMarketValue({ player, leagueReference });
      player.prestigeExpectation = estimatePrestigeExpectation({ player, leagueReference });
      freeAgents.push(player);
    }
  });
  return freeAgents;
}
