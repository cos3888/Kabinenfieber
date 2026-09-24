export const DB1_GENERAL_CONSTANTS = Object.freeze({
  maxSquadSlots: 30,
  standardSalaryFactorFromMarketValue: 0.12,
  standardSalaryUnit: "million_per_season",
  standardPlayerReferenceLeague: "Deutschland 1",
  standardPlayerReferenceOverall: 71
});

export const DB1_LEAGUE_REFERENCE = Object.freeze([
  { leagueKey: "England 1", countryName: "England", leagueLevel: 1, prestige: 10.0, standardPlayerOverall: 74, averagePlayerMarketValue: 12.0, standardSalarySeason: 1.44 },
  { leagueKey: "England 2", countryName: "England", leagueLevel: 2, prestige: 7.8, standardPlayerOverall: 68, averagePlayerMarketValue: 7.3, standardSalarySeason: 0.88 },
  { leagueKey: "England 3", countryName: "England", leagueLevel: 3, prestige: 5.6, standardPlayerOverall: 61, averagePlayerMarketValue: 3.8, standardSalarySeason: 0.46 },

  { leagueKey: "Deutschland 1", countryName: "Deutschland", leagueLevel: 1, prestige: 9.0, standardPlayerOverall: 71, averagePlayerMarketValue: 9.7, standardSalarySeason: 1.16 },
  { leagueKey: "Deutschland 2", countryName: "Deutschland", leagueLevel: 2, prestige: 6.6, standardPlayerOverall: 65, averagePlayerMarketValue: 5.2, standardSalarySeason: 0.62 },
  { leagueKey: "Deutschland 3", countryName: "Deutschland", leagueLevel: 3, prestige: 4.9, standardPlayerOverall: 59, averagePlayerMarketValue: 2.9, standardSalarySeason: 0.35 },

  { leagueKey: "Spanien 1", countryName: "Spanien", leagueLevel: 1, prestige: 9.3, standardPlayerOverall: 72, averagePlayerMarketValue: 10.4, standardSalarySeason: 1.25 },
  { leagueKey: "Spanien 2", countryName: "Spanien", leagueLevel: 2, prestige: 6.4, standardPlayerOverall: 65, averagePlayerMarketValue: 4.9, standardSalarySeason: 0.59 },
  { leagueKey: "Spanien 3", countryName: "Spanien", leagueLevel: 3, prestige: 4.3, standardPlayerOverall: 56, averagePlayerMarketValue: 2.2, standardSalarySeason: 0.26 },

  { leagueKey: "Italien 1", countryName: "Italien", leagueLevel: 1, prestige: 9.2, standardPlayerOverall: 72, averagePlayerMarketValue: 10.1, standardSalarySeason: 1.21 },
  { leagueKey: "Italien 2", countryName: "Italien", leagueLevel: 2, prestige: 6.0, standardPlayerOverall: 63, averagePlayerMarketValue: 4.3, standardSalarySeason: 0.52 },
  { leagueKey: "Italien 3", countryName: "Italien", leagueLevel: 3, prestige: 4.0, standardPlayerOverall: 55, averagePlayerMarketValue: 1.9, standardSalarySeason: 0.23 },

  { leagueKey: "Frankreich 1", countryName: "Frankreich", leagueLevel: 1, prestige: 8.2, standardPlayerOverall: 69, averagePlayerMarketValue: 8.1, standardSalarySeason: 0.97 },
  { leagueKey: "Frankreich 2", countryName: "Frankreich", leagueLevel: 2, prestige: 6.0, standardPlayerOverall: 63, averagePlayerMarketValue: 4.3, standardSalarySeason: 0.52 },
  { leagueKey: "Frankreich 3", countryName: "Frankreich", leagueLevel: 3, prestige: 3.8, standardPlayerOverall: 54, averagePlayerMarketValue: 1.7, standardSalarySeason: 0.20 },

  { leagueKey: "Portugal 1", countryName: "Portugal", leagueLevel: 1, prestige: 6.9, standardPlayerOverall: 66, averagePlayerMarketValue: 5.7, standardSalarySeason: 0.68 },
  { leagueKey: "Portugal 2", countryName: "Portugal", leagueLevel: 2, prestige: 4.7, standardPlayerOverall: 58, averagePlayerMarketValue: 2.7, standardSalarySeason: 0.32 },
  { leagueKey: "Portugal 3", countryName: "Portugal", leagueLevel: 3, prestige: 2.5, standardPlayerOverall: 49, averagePlayerMarketValue: 0.8, standardSalarySeason: 0.10 },

  { leagueKey: "Türkei 1", countryName: "Türkei", leagueLevel: 1, prestige: 6.2, standardPlayerOverall: 64, averagePlayerMarketValue: 4.6, standardSalarySeason: 0.55 },
  { leagueKey: "Türkei 2", countryName: "Türkei", leagueLevel: 2, prestige: 4.5, standardPlayerOverall: 57, averagePlayerMarketValue: 2.4, standardSalarySeason: 0.29 },
  { leagueKey: "Türkei 3", countryName: "Türkei", leagueLevel: 3, prestige: 2.8, standardPlayerOverall: 50, averagePlayerMarketValue: 0.9, standardSalarySeason: 0.11 },

  { leagueKey: "Niederlande 1", countryName: "Niederlande", leagueLevel: 1, prestige: 6.3, standardPlayerOverall: 64, averagePlayerMarketValue: 4.8, standardSalarySeason: 0.58 },
  { leagueKey: "Niederlande 2", countryName: "Niederlande", leagueLevel: 2, prestige: 4.4, standardPlayerOverall: 57, averagePlayerMarketValue: 2.3, standardSalarySeason: 0.28 },
  { leagueKey: "Niederlande 3", countryName: "Niederlande", leagueLevel: 3, prestige: 2.6, standardPlayerOverall: 49, averagePlayerMarketValue: 0.8, standardSalarySeason: 0.10 }
]);

export function getLeagueReference(leagueKey) {
  return DB1_LEAGUE_REFERENCE.find(item => item.leagueKey === leagueKey) ?? null;
}
