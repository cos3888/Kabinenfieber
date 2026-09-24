# DB6 – Matchhistorie / Wiederherstellung für ChatGPT

## Fachliche Aufgabe
DB6 speichert die spielstandsbezogene Historie aller **bereits ausgetragenen Spiele**.
Nicht gespeichert werden geplante oder mögliche zukünftige Spiele.

DB6 ist die Primärquelle für:
- vergangene Matchergebnisse
- eingesetzte Spieler pro Spiel
- Matchereignisse pro Spiel
- Matchnoten pro Spieler

Spätere Ableitungen wie Tabelle, Torjägerliste, Einsatzstatistik oder Vereinsform werden **aus DB6 berechnet** und sind nicht die Primärwahrheit.

## Kernstruktur
DB6 liegt im Spielstand als eigener Block:
- `db6.meta`
- `db6.matches`

### `db6.meta`
- `database`: fester Text `DB6 Matchhistorie`
- `version`: fester Text `v1`
- `createdAt`: ISO-Zeitpunkt der Initialisierung
- `lastMatchNumber`: laufender Zähler für neue `matchId`

### `db6.matches`
Array aus Matchdatensätzen.

## Struktur eines Matchdatensatzes
### Match-Kopf
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

### Spielerliste `players`
Eintrag pro im Match gespeicherten Spieler:
- `playerId`
- `clubId`
- `isStarter`
- `startMinute`
- `endMinute`
- `positionSlot`
- `rating`

### Aktionsliste `events`
Chronologische Ereignisse:
- `eventIndex`
- `minute`
- `type`
- `clubId`
- `playerId`
- `secondaryPlayerId`
- `benefitClubId`

## Fest integrierte Eventtypen
- `goal`
- `own_goal`
- `yellow_card`
- `red_card`
- `sub_on`
- `sub_off`
- `assist`
- `penalty_goal`
- `penalty_miss`
- `injury`

## Wichtige Regeln
- DB6 speichert nur **ausgetragene Spiele**.
- `eventIndex` entscheidet die Reihenfolge bei gleicher Minute.
- Eigentore laufen über `type = own_goal`.
- `playerId` ist bei Eigentoren der verursachende Spieler.
- `benefitClubId` ist der Verein, der vom Eigentor profitiert.
- Starter haben `startMinute = 0`.
- Nicht ausgewechselte Spieler enden standardmäßig in Minute `90`, sofern keine andere Endminute übergeben wird.
- `rating` wird aus Einsatzzeit und Eventtypen berechnet und im Match gespeichert.

## Erste Schreiblogik
Die zentrale Schreibfunktion ist `recordPlayedMatch({ state, matchInput })`.

Ablauf:
1. Spielstand auf vorhandene `db6`-Struktur prüfen oder initialisieren.
2. Neue `matchId` erzeugen.
3. Match-Kopf normalisieren.
4. Spielerliste normalisieren.
5. Aktionsliste normalisieren.
6. Matchnoten pro Spieler berechnen, sofern keine gültige Note übergeben wurde.
7. Vollständigen Matchdatensatz in `db6.matches` schreiben.
8. `lastMatchNumber` erhöhen.

## Wichtig für Wiederherstellung
DB6 ist absichtlich **historienbasiert** und speichert keine doppelten Primärdaten für Vereins- oder Spielerhistorien.
Alle späteren Statistikansichten müssen aus `db6.matches` gefiltert oder aggregiert werden.
