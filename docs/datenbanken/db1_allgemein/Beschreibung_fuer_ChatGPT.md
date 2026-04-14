# DB1 – Beschreibung für ChatGPT

## Rolle
DB1 ist die allgemeine Referenzdatenbank für Ligen, Nationalitäten, Namen, Nationengruppen, Charakterdefinitionen und Spielertypdefinitionen.

## Enthält
- Ligareferenzen (`leagueKey`, `countryName`, `leagueLevel`, `prestige`, `standardPlayerOverall`, `averagePlayerMarketValue`, `standardSalarySeason`)
- Nationalitätenverteilung je Liga
- Nationengruppen je Nationalität
- Vornamen mit Altersgewichten
- Nachnamen mit Häufigkeiten
- Charakterdefinitionen
- Spielertypdefinitionen
- allgemeine Regeln und Beispiele

## Enthält bewusst nicht
- konkrete Vereine
- konkrete Spieler
- Karrierestart
- laufende Spielzustände

## Primäre Bezüge
- `leagueKey` für ligabezogene Referenzen
- `nationality` für Namen und Nationengruppen
- `key` für Charakter- und Typdefinitionen

## Wiederherstellung / Neuerstellung
1. Ligenreferenzen wieder aus der Haupttabelle aufbauen
2. Nationalitätenverteilung je Liga flach speichern
3. Nationengruppen je Nationalität eindeutig zuordnen
4. Vornamen und Nachnamen getrennt je Nationalität führen
5. Charakter- und Spielertypdefinitionen mit Effekten und Gewichten pflegen
6. Summen- und Eindeutigkeitsprüfungen durchführen

## Nutzung im Projekt
DB2 zieht Nationalitäten, Namen, Charaktere und Spielertypen aus DB1. DB4 und DB5 greifen indirekt darauf zurück.
