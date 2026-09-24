# DB6 Matchhistorie v1

DB6 ist die spielstandsbezogene Matchhistorie von **Kabinenfieber**.

Gespeichert werden nur **ausgetragene Spiele**.
Tabellen, Vereinsstatistiken und Spielerstatistiken werden später aus dieser Historie abgeleitet.

## Kernaufgabe
- Match-Kopf speichern
- beteiligte Spieler speichern
- chronologische Matchereignisse speichern
- Matchnoten aus dem Spielverlauf ableiten

## Öffentliche Funktionen
- `createEmptyDB6State({ createdAt })`
- `buildMatchHistoryEntry({ state, matchInput })`
- `recordPlayedMatch({ state, matchInput })`
- `getAllMatches(state)`
- `getMatchesByClubId(state, clubId)`
- `getMatchesByPlayerId(state, playerId)`

## Architekturregel
DB6 ist die **eine historische Wahrheit** für ausgetragene Spiele.
Eigene Tabellen, Spielerstatistiken und Vereinshistorien werden daraus später als Ansichten oder Ableitungen gelesen.
