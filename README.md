# Kabinenfieber KF_0.27.1

KF_0.27.1 setzt den Server-/Persistenzumbau aus KF_0.27.0 fort. Nach den Vollmatches werden nun auch die Finanzbuchungen der laufenden Saison aus dem staendig serialisierten `WorldRecord` ausgelagert.

## Neu in KF_0.27.1

- `world.clubFinances.byClub[clubId]` enthaelt nur noch den kompakten aktuellen Finanzzustand eines Vereins.
- Vollstaendige Finanzbuchungen der laufenden Saison liegen genau einmal im separaten `CurrentSeasonFinanceRepository`, getrennt nach Welt, Saison, Verein und Event-ID.
- Im WorldRecord bleiben u. a. `seasonStartCash`, `currentCash`, `financeEventCount`, kleine laufende Summen nach Typ, Lizenzwarnungen und Sanktionen.
- Praemien-Idempotenz nutzt weiterhin stabile `eventKey`s, deren persistente Wahrheit nun im Finance-Store liegt.
- Finanzuebersicht, Prognosen, Lizenzlogik, Transfers, Gehaelter und Praemien verwenden weiterhin dieselbe fachliche Buchungslogik.
- Beim Saisonwechsel wird der abgeschlossene Finance-Store erst geloescht, nachdem der Schlussbestand in die neue Saison uebernommen wurde.
- KF_0.27.0-Spielstaende werden migriert: vorhandene `financeEvents` werden in den neuen Store verschoben; Kontostand und Summen bleiben erhalten.

## Zentrale Datenquellen

- aktuelle Spieler: `world.players.byId`
- aktuelle Kader/Aufstellung/Taktik: `world.squads`
- Spielplan/Fixturestatus: `world.calendar.fixtures`
- kompakter Index abgeschlossener Matches der laufenden Saison: `world.history.matches`
- vollstaendige Matchdetails der laufenden Saison: `CurrentSeasonMatchRepository[worldId][season][matchId]`
- kompakter aktueller Finanzzustand: `world.clubFinances.byClub[clubId]`
- vollstaendiger Finanzledger der laufenden Saison: `CurrentSeasonFinanceRepository[worldId][season][clubId][eventId]`
- historische Resultate: `world.history.seasonResults`
- Spieler-Saisonstatistiken: `world.history.playerSeasons`
- historische Tabellen: `world.history.seasonStandings`
- Marktwert + Staerkeverlauf: `world.history.playerMarketValues[playerId]`
- Ruhestaendler: `world.history.retiredPlayers.byId`

Es gibt weder eine doppelte Vollmatchwahrheit noch eine doppelte FinanceEvent-Wahrheit. Die kompakten aktuellen Zustaende sind fuer haeufig benoetigte Berechnungen gedacht; die vollstaendigen Detailobjekte liegen in den jeweiligen Stores.

## Repository- und Asset-Workflow

KF_0.27.1 dient zugleich als technische Ausgangsbasis fuer den neuen GitHub-Stand. Die Spielstruktur wurde fuer diesen Neustart bewusst nicht umgebaut, damit lokale Tests und GitHub Pages denselben Codepfad behalten.

Hilfsbefehle:

- `npm run assets:check` prueft Wappen sowie Heim-/Auswaertstrikots gegen die zentrale Vereinsliste.
- `npm run assets:crests:import -- <quellordner>` importiert Vereinswappen anhand des Vereinsnamens in den stabilen `clubId`-Pfad.
- `npm run assets:crests:import -- <quellordner> --dry-run` prueft die Zuordnung ohne Dateien zu kopieren.

Die neue Sponsorenbasis ist bewusst noch nicht Teil dieses Stands und bleibt ein spaeterer eigener Entwicklungsblock.
