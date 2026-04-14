# DB4 – Spielerdatenbank
## Beschreibung für ChatGPT / technische Weiterarbeit

DB4 ist der zentrale Spielerkern von Kabinenfieber.

## Kernprinzip
- Skills sind die eigentliche Wahrheit des Spielers
- `overall` und Gruppenwerte sind daraus abgeleitet
- Aufstellung und Einsatzkontext gehören nicht in DB4

## Gruppe 1
Kern:
- `playerId`
- `firstName`
- `lastName`
- `age`
- `nationality`

Abgeleitet:
- `fullName` (nicht gespeichert)

Nicht echter DB4-Kern:
- `clubId`
- `squadSlot`

## Gruppe 2
- `heightCm`
- `weightKg`
- `strongFoot`
- `weakFoot`
- `mainPosition`
- `secondaryPosition1`
- `secondaryPosition2`

Regeln:
- leere Nebenpositionen = `null`
- Nebenpositionen dürfen nicht mit Hauptposition oder untereinander kollidieren

## Gruppe 3
- `talent`
- `reliability`
- `displayedTalent`
- `character1`
- `character2`
- `playerType1`
- `playerType2`

Wichtig:
- `displayedTalent` ist **abgeleitet (gespeichert)**
- Neuableitung nur bei Änderung von `reliability`

## Gruppe 4
- `form`
- `fitness`
- `morale`
- `injuryStatus`
- `suspensionStatus`

## Gruppe 5
6 Skillgruppen:
- Technik
- Abschluss
- Mental
- Physis
- Defensiv
- Torwart

Alle Skillwerte sind dynamisch.

## Gruppe 6
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

### Gruppenwerte
In v1 als einfacher Durchschnitt der jeweiligen Unterwerte.

### BaseOverall
Wird positionsabhängig über die 6 Gruppenwerte gewichtet.

### PotentialOverall
Wird bei Generierung festgeschrieben. Fachlich abgeleitet, technisch gespeichert.

### PotentialUsage
Dynamisch, Skala 0–10.
Formel:
`developmentOverall = baseOverall + ((potentialOverall - baseOverall) * (potentialUsage / 10))`

### Overall
Neutralwert:
- Form = 80
- Fitness = 80
- Moral = 80

Einfluss pro 10 Punkte:
- Fitness = 0,5 %
- Form = 1,0 %
- Moral = 1,0 %

Formel:
`overall = developmentOverall * (1 + ((fitness - 80) / 10) * 0.005 + ((form - 80) / 10) * 0.01 + ((morale - 80) / 10) * 0.01)`

## Spielerprofil
Tabs:
- Profil
- Statistik
- Scouting

Erster Tab: Profil mit Diagramm der 6 Fähigkeitsgruppen.

## Nicht in DB4
- usageStatus
- assignedSlot
- isStartingXI
- isBench
- isReserve
- lineupspezifische Position
- Vereinsstammdaten
- Generierungsregeln
- Trainingsregeln
- finale Statistikstruktur
- finale Scoutstruktur

## Prüffragen
1. `fullName` ist abgeleitet und nicht gespeichert.
2. `displayedTalent` ist abgeleitet, aber gespeichert.
3. `potentialOverall` wird bei Generierung festgeschrieben.
4. `potentialUsage` steuert die Freischaltung zwischen `baseOverall` und `potentialOverall`.
5. `overall` wird durch Form, Fitness und Moral beeinflusst.
6. Einsatzstatus gehört nicht in DB4.
