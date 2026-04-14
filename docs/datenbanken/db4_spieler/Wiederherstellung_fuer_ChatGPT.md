# Wiederherstellung DB4 für ChatGPT

## Zweck
DB4 definiert das Spielerschema und die Formeln zur Stärkeberechnung. DB4 ist keine fertige Spielerliste, sondern die fachliche Wahrheit darüber, wie ein Spieler aufgebaut ist und wie seine Stärke berechnet wird.

## Dateistruktur
- `db4_player_schema.js`
- `db4_player_rules.js`
- `db4_player_example.js`

## Kernfelder
Identität: `playerId`, `firstName`, `lastName`, `age`, `nationality`, `fullName`

Vereinskontext: `clubId`, `squadSlot`

Körper/Position: `heightCm`, `weightKg`, `strongFoot`, `weakFoot`, `mainPosition`, `secondaryPosition1`, `secondaryPosition2`

Profil: `talent`, `reliability`, `displayedTalent`, `character1`, `character2`, `playerType1`, `playerType2`

Zustand: `form`, `fitness`, `morale`, `injuryStatus`, `suspensionStatus`

Abgeleitete Felder: `baseOverall`, `potentialOverall`, `potentialUsage`, `overall`, Gruppenratings

## Regeln
- Nebenpositionen dürfen nicht doppelt sein
- Nebenpositionen dürfen nicht der Hauptposition entsprechen
- `displayedTalent` ist derived_persisted
- 1 Stern = 2 Punkte `displayedTalent`

## Formeln
- Gruppenratings = Durchschnitt von je fünf Einzelattributen
- `developmentOverall = baseOverall + ((potentialOverall - baseOverall) * (potentialUsage / 10))`
- `overall = round(developmentOverall * factor)`
- `factor = 1 + ((fitness-80)/10)*0.005 + ((form-80)/10)*0.01 + ((morale-80)/10)*0.01`

## Wichtige Gewichte
- TW: Goalkeeping 0.70
- IV: Defensive 0.35, Physical 0.25
- ST: Finishing 0.38, Physical 0.22
- ZM: Tech 0.28, Mental 0.24

## Wiederherstellungsreihenfolge
1. Schema anlegen
2. Regeln und Formeln anlegen
3. Beispielspieler anlegen
4. Testrechnungen für Gruppenratings und Overalls ausführen
