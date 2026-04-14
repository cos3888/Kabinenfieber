# DB3 Vereine – Integrationspaket

Dieses Paket enthält die echte DB3-Vereinsdatenbank für die Integration ins Spiel.

## Enthalten
- `db3_vereine_final.js` – direkt im Spiel importierbare JS-Datei
- `db3_vereine_final.json` – dieselben Daten als JSON
- `db3_field_rules.json` – zentrale Feldregeln/Formelbeschreibung
- `Vereine_v3_budgetlogik.xlsx` – Autoren-/Kontrolldatei als Quelle

## Wichtige Festlegung
- In DB3 sind die Spalten **B:AL** aus der Excel enthalten.
- Die Spalten **AM:BC** sind nicht Teil von DB3.

## Startannahmen in dieser Version
- `countryName` und `leagueLevel` werden aus `leagueKey` abgeleitet.
- `clubId` wird deterministisch erzeugt.
- Asset-Pfade werden standardisiert erzeugt:
  - `assets/clubs/<clubId>/crest.png`
  - `assets/clubs/<clubId>/home.png`
  - `assets/clubs/<clubId>/away.png`
- Noch nicht mit Spieler- oder Historiedaten belegte Felder starten mit `0`:
  - `successScoreRaw`
  - `successScore`
  - `squadStrength`
  - `squadCount`
  - `leaguePosition`
  - `squadMarketValue`

## Startlogik der dynamischen Felder in dieser Exportversion
- `fanbase` wird aus `populationScore`, `catchmentArea`, `leaguePrestige` und `successScore` initial gesetzt.
- `clubWealth` wird aus `squadMarketValue`, `transferBudget` und `salaryBudget` initial gesetzt.
- `financialPower` wird relativ über alle Vereine aus `clubWealth` initialisiert.
- `prestigeRaw` und `prestige` werden auf Basis der Startwerte initialisiert.
- `ambition` wird auf Basis der Startwerte initialisiert.
- `seasonTarget` wird intern je Liga aus der Rangfolge von `clubWealth` in 5 Zielstufen eingeordnet.

## Hinweis
Diese Datei ist jetzt als **echte DB3-Grundlage** nutzbar. Einige Felder sind bewusst als Startzustand initialisiert und werden später durch Spielereignisse oder durch die Spieler-/Saisonlogik weitergeführt.
