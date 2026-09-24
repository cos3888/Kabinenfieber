# DB7 – Datenüberblick

## State-Grundstruktur
`state.db7`
- `meta.database`
- `meta.version`
- `meta.createdAt`
- `meta.lastSimulationNumber`
- `config.homeAdvantage`
- `config.maxBenchParticipants`
- `config.matchLength`
- `profiles.eventTypes`
- `lastContext`
- `lastResult`

## Matchkontext
- `simulationId`
- `competitionKey`
- `seasonNr`
- `matchday`
- `roundKey`
- `homeClub`
- `awayClub`
- `homeLineup`
- `awayLineup`
- `config`

## Ergebnisobjekt
- `competitionKey`
- `seasonNr`
- `matchday`
- `roundKey`
- `homeClubId`
- `awayClubId`
- `homeGoals`
- `awayGoals`
- `homeFormationKey`
- `awayFormationKey`
- `players[]`
- `events[]`
- `report`
