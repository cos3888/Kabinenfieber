# DB1 – Allgemeine Referenzdaten
## Beschreibung für Menschen / Projektpartner

## Wofür DB1 da ist
DB1 Allgemein enthält die Referenzwerte und Definitionslisten, die mehrere Systeme im Spiel gleichzeitig brauchen.

Das sind jetzt:
- Liga-Prestige
- Standardspieler je Liga
- durchschnittlicher Spieler-Marktwert je Liga
- Standardgehalt je Liga
- Nationalitätenverteilung je Liga
- Nationengruppen je Nationalität
- Vornamen je Nationalität mit Altersgewichtung
- Nachnamen je Nationalität mit Häufigkeit
- Charakterdefinitionen mit Gruppen-Gewichtungen und altersabhängiger Wirk-Skalierung
- Spielertypdefinitionen mit Positions-Gewichtungen und altersabhängiger Wirk-Skalierung

DB1 Allgemein ist damit die übergeordnete Vergleichs- und Referenzbasis für die Spielwelt.

## Enthalten
### 1. Ligareferenzdaten
Jede Liga hat feste Referenzwerte:
- `leagueKey`
- `countryName`
- `leagueLevel`
- `prestige`
- `standardPlayerOverall`
- `averagePlayerMarketValue`
- `standardSalarySeason`

Regel:
- `standardSalarySeason = averagePlayerMarketValue * 0.12`

### 2. Nationalitätenverteilung je Liga
Für jede Liga ist hinterlegt, welche Nationalitäten dort wie häufig vorkommen sollen.

Wichtige Regel:
- je `leagueKey` summieren sich die Anteile auf 100.

### 3. Nationengruppen je Nationalität
Jede Nationalität ist genau einer Nationengruppe zugeordnet.
Diese Gruppen dienen als Referenz für die Charaktervergabe in DB2.

### 4. Vornamen je Nationalität
Für jede Nationalität gibt es Vornamen mit Altersgewichten.
Die Altersgewichte beeinflussen nur die Wahrscheinlichkeit bei der Namensvergabe.

### 5. Nachnamen je Nationalität
Für jede Nationalität gibt es Nachnamen mit Häufigkeitsgewichten.

### 6. Charakterdefinitionen
Charaktere sind allgemeine Definitionswerte und werden in DB2 konkret an Spieler vergeben.

Wichtige Regel:
- Charaktere werden unabhängig vom Alter vergeben.
- Das Alter skaliert nur die Wirkung der Charakter-Effekte auf Fähigkeiten.
- Ein Spieler kann beim Spielstart 0 bis maximal 2 Charakterzüge erhalten.

### 7. Spielertypdefinitionen
Spielertypen sind allgemeine Definitionswerte und werden in DB2 konkret an Spieler vergeben.

Wichtige Regel:
- Spielertypen werden unabhängig vom Alter vergeben.
- Das Alter skaliert nur die Wirkung der Spielertyp-Effekte auf Fähigkeiten.
- Ein Spieler kann beim Spielstart 0 bis maximal 2 Spielertypen erhalten.
- Eine spätere Freischaltlogik für Spielertypen ist vorgesehen.

## Nicht enthalten
DB1 enthält bewusst nicht:
- konkrete Spieler
- konkrete Vereinskader
- Startformationen der Vereine
- Budgetverbrauch beim Kaderbau
- generierte Spielstände
- laufende Spielupdates

Diese Themen gehören in DB2, DB3 oder DB4.
