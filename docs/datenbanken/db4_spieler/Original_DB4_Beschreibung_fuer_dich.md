# DB4 – Spielerdatenbank
## Beschreibung für Menschen / Projektpartner

DB4 ist der zentrale Spielerkern von Kabinenfieber.

## DB4 enthält
- Identität
- Körper / Füße / Positionsprofil
- Profilwerte
- Zustandswerte
- Fähigkeitswerte
- abgeleitete Profilwerte

## DB4 enthält bewusst nicht
- Einsatzstatus in der Aufstellung
- eingesetzte Position
- Vereinsdaten selbst
- Startlogik-Regeln
- Trainingslogik
- konkrete Statistik- und Scoutstruktur

## Gruppe 1 – Identität & Grunddaten
Kern:
- `playerId`
- `firstName`
- `lastName`
- `age`
- `nationality`

Abgeleitet:
- `fullName`

Vereinsgebunden:
- `clubId`
- `squadSlot`

## Gruppe 2 – Körper, Füße, Positionsprofil
- `heightCm`
- `weightKg`
- `strongFoot`
- `weakFoot`
- `mainPosition`
- `secondaryPosition1`
- `secondaryPosition2`

Festgelegt:
- `weakFoot` dynamisch
- beide Nebenpositionen dynamisch
- leere Nebenpositionen = `null`

## Gruppe 3 – Profilwerte
- `talent`
- `reliability`
- `displayedTalent`
- `character1`
- `character2`
- `playerType1`
- `playerType2`

Wichtig:
- `talent` = echter interner Wert 1–10
- `displayedTalent` = sichtbare Schätzung
- `displayedTalent` wird nur neu gesetzt, wenn sich `reliability` verändert

## Gruppe 4 – Zustandswerte
- `form`
- `fitness`
- `morale`
- `injuryStatus`
- `suspensionStatus`

## Gruppe 5 – Fähigkeitswerte
6 feste Gruppen:
- Technik
- Abschluss
- Mental
- Physis
- Defensiv
- Torwart

Alle Skillwerte sind dynamisch.

## Gruppe 6 – Abgeleitete Werte
- `baseOverall`
- `potentialOverall`
- `potentialUsage`
- `overall`
- `techRating`
- `finishingRating`
- `mentalRating`
- `physicalRating`
- `defensiveRating`
- `goalkeepingRating`

### Bedeutungen
- `baseOverall` = Grundstärke aus den Skills
- `potentialOverall` = obere mögliche Stärke, bei Generierung festgeschrieben
- `potentialUsage` = wie viel des Potenzials aktuell ausgeschöpft wird, Skala 0–10
- `overall` = sichtbare aktuelle Gesamtstärke

### Formeln
`developmentOverall = baseOverall + ((potentialOverall - baseOverall) * (potentialUsage / 10))`

`overall = developmentOverall * (1 + ((fitness - 80) / 10) * 0.005 + ((form - 80) / 10) * 0.01 + ((morale - 80) / 10) * 0.01)`

## Spielerprofil
Tabs:
- Profil
- Statistik
- Scouting

Der erste Tab ist **Profil** und zeigt ein Diagramm mit den 6 Fähigkeitsgruppen.
