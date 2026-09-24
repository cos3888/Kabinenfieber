# DB6 – Datenüberblick

## Block im Spielstand
- `db6.meta`
- `db6.matches`

## Kopf eines Spiels
- `matchId`
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

## Spieler pro Spiel
- `playerId`
- `clubId`
- `isStarter`
- `startMinute`
- `endMinute`
- `positionSlot`
- `rating`

## Events pro Spiel
- `eventIndex`
- `minute`
- `type`
- `clubId`
- `playerId`
- `secondaryPlayerId`
- `benefitClubId`
