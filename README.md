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

## Speicherwirkung

Echter Vollwelt-Test mit 432 Clubs und 7.736 Matches in Saison 1:

- KF_0.26.2 WorldRecord vor Saisonwechsel: ca. **550,9 MiB**
- KF_0.27.0 WorldRecord vor Saisonwechsel: ca. **206,4 MiB**
- KF_0.27.1 WorldRecord vor Saisonwechsel: ca. **81,7 MiB**
- Reduktion KF_0.27.1 gegen KF_0.27.0: **60,4 %**
- Reduktion KF_0.27.1 gegen KF_0.26.2: **85,2 %**
- kompakter laufender Matchindex: ca. **45,2 MiB**
- separater Vollmatch-Store: ca. **389,5 MiB**
- separater Finance-Store: ca. **124,2 MiB** mit 256.810 Buchungen
- kombinierte physische Datenmenge vor Saisonwechsel: ca. **595,4 MiB**
- WorldRecord nach Saisonwechsel: ca. **68,2 MiB**
- Vollmatch-Store der abgeschlossenen Saison nach Saisonwechsel: leer
- Finance-Store der abgeschlossenen Saison nach Saisonwechsel: leer; Saison 2 startet mit neuem Ledger

Die Gesamtmenge auf dem Datentraeger wird durch KF_0.27.1 bewusst kaum reduziert. Der Gewinn liegt darin, dass Matchdetails und FinanceEvents nicht mehr Bestandteil des heissen, staendig zu serialisierenden Weltzustands sind.

## Laufzeit

Der Vollsaison-Test benoetigte in KF_0.27.1 rund **241 s** reine Saison-Simulation und rund **18 s** fuer den Saisonwechsel. Im vergleichbaren KF_0.27.0-Messlauf waren es rund **265 s** Simulation und rund **20 s** Saisonwechsel. Die Finance-Segmentierung fuehrt damit zu keiner erkennbaren Performanceverschlechterung.

## Tests

Wichtige Tests:

- `tests/run_kf_0_27_0_current_season_match_store_test.js`
- `tests/run_kf_0_27_1_current_season_finance_store_test.js`
- `tests/run_kf_0_27_1_server_storage_test.js`
- Source-/DataTruth-/Finance-/SeasonTransition-/ServerFoundation-/Multiworld-/Negotiation-Regressions

Release- und Validierungsdetails: `reports/kf_0.27.1_release_notes.md` und `reports/kf_0.27.1_validation_summary.md`.

## Repository- und Asset-Workflow

KF_0.27.1 dient zugleich als technische Ausgangsbasis fuer den neuen GitHub-Stand. Die Spielstruktur wurde fuer diesen Neustart bewusst nicht umgebaut, damit lokale Tests und GitHub Pages denselben Codepfad behalten.

Hilfsbefehle:

- `npm run assets:check` prueft Wappen sowie Heim-/Auswaertstrikots gegen die zentrale Vereinsliste.
- `npm run assets:crests:import -- <quellordner>` importiert Vereinswappen anhand des Vereinsnamens in den stabilen `clubId`-Pfad.
- `npm run assets:crests:import -- <quellordner> --dry-run` prueft die Zuordnung ohne Dateien zu kopieren.

Die neue Sponsorenbasis ist bewusst noch nicht Teil dieses Stands und bleibt ein spaeterer eigener Entwicklungsblock.
