# Wiederherstellung DB2 für ChatGPT

## Zweck
DB2 erzeugt beim Karrierestart den ersten spielbaren GameState. DB2 ist die Brücke zwischen DB1, DB3, DB4, DB5 und dem ersten konkreten Spielstand.

## Dateistruktur
- `db2_game_state_builder.js`
- `db2_lineup_initializer.js`
- `db2_player_generator.js`
- `db2_selection.js`
- `db2_squad_builder.js`
- `db2_start_helpers.js`
- `db2_start_logic.js`
- `db2_start_pipeline.js`
- `db2_start_rules.js`

## Führende Regelwerte
- `minSize = 22`
- `targetSizeRange = [23,25]`
- `maxSize = 26`
- `freeAgentRatio = 0.12`
- Basisgruppen: `TW 2, IV 4, FB 4, CM 6, WM 4, ST 2`

### Altersverteilung
- 17-19: Gewicht 10
- 20-23: Gewicht 24
- 24-27: Gewicht 31
- 28-31: Gewicht 23
- 32-35: Gewicht 12

### Qualitätsbänder
- low = -7 bis -4
- below = -3 bis -1
- average = 0 bis +1
- above = +2 bis +4
- elite = +5 bis +8

### Potenzialregeln
- 17-19: `potentialDelta 6–15`, `potentialUsage 6.8–8.2`
- 20-23: `4–12`, `7.4–8.8`
- 24-27: `2–8`, `8.2–9.4`
- 28-31: `0–5`, `8.6–9.7`
- 32-35: `0–3`, `8.8–9.8`

## Orchestrierung
`createNewCareerGameState()` macht:
1. Seed erzeugen
2. DB1 auflösen
3. Ligareferenzen indizieren
4. Clubs aus DB3 laden
5. pro Club Startpaket erzeugen
6. freie Spieler erzeugen
7. initialen GameState bauen

## Führende Formeln
### Club-Stärkeziel
`clubStrengthTarget = leagueBase + prestigeBoost + financeBoost + fanbaseBoost`
mit
- `prestigeBoost = (prestige - 5) * 0.8`
- `financeBoost = (financialPower - 5) * 0.5`
- `fanbaseBoost = (fanbase - 5) * 0.25`

### Zielstärke
`targetOverall = leagueOverall + offset + tierMod + clubDelta`

### Marktwert
`marketValue = baseValue * overallFactor * potentialFactor * ageFactor * 0.12`

### Gehalt
`salary = leagueSalary * 0.04 * qualityFactor * prestigeFactor * ageFactor`

### Budgetkappung
Bei Überschreitung des Budgets werden Gehälter proportional skaliert.

## Führende Zustandsstruktur
```text
meta
career
world
clubs.byId / clubs.allIds
players.byId / players.allIds
selection.availableClubIds / previewByClubId
manager
tactics.byClubId
ui
```

## Zusatzregel für aktuelle Rekonstruktion
Die Startformation eines Vereins muss bei der Vereinszuordnung grundsätzlich besetzbar sein. Pflichtslots dürfen nicht durch positionsfremde Spieler abgesichert werden.

## Validierungscheckliste
- jeder Club hat Kader und Preview
- `salaryBudgetRemaining` ist nicht negativ
- Vereinsübernahme führt zu `currentScreen = office`
- erste Aufstellung ist aus dem Kader bildbar
