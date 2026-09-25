# Kabinenfieber KF_0.29.1

KF_0.27.2 bereinigt auf Basis des abgeschlossenen KF_0.27.1-Stands die Repository- und Assetstruktur, ohne Gameplay oder Simulation zu veraendern. Die Match- und Finance-Segmentierung aus KF_0.27.0/0.27.1 bleibt unveraendert aktiv.


## Neu in KF_0.29.1 – Autosave & benannte Spielwelten

KF_0.29.1 korrigiert den ersten Save/Load-Praxistest und richtet Kabinenfieber auf ein persistentes Online-Weltmodell aus.

- kein manueller „Jetzt speichern“-Knopf mehr als normale Spielfunktion.
- garantierter serverseitiger Autosave-Checkpoint nach normalem Kalenderfortschritt und nach abgeschlossener Kalenderschnellsimulation.
- relevante Entscheidungen wie Vereinsübernahme, Aufstellung/Taktik, Transfers, Verträge, Sponsoring, Scouting und Trikotänderungen lösen einen direkten oder kurz verzögerten Autosave aus.
- beim Verlassen der Welt bzw. Logout wird ein noch offener Autosave vor dem Wechsel abgearbeitet.
- Reload-Test prüft explizit, dass `world.calendar.currentSlotKey`, Saison, Current-Season-Matches und FinanceEvents aus derselben committed Revision wiederhergestellt werden.
- jede neu erstellte Spielwelt benötigt einen Namen mit 3–40 Zeichen.
- Weltname und Zugangsmodell liegen ausschließlich im World Registry / Firestore und werden nicht zusätzlich im WorldRecord gespeichert.
- vorbereitete Zugangsmodelle: `PUBLIC + OPEN` (offen), `PUBLIC + APPLICATION` (Bewerbung) und `PRIVATE + INVITE_ONLY` (nur Einladung).
- bestehende KF_0.29.0-Welten ohne Namen bleiben ladbar und erhalten in der Weltliste einen technischen Fallbacknamen.

Öffentliche Weltsuche, Bewerbungsworkflow und Direktbeitritt sind weiterhin **nicht** Bestandteil dieses Fixes; KF_0.29.1 bereitet nur die Metadaten dafür sauber vor.

## Neu in KF_0.29.0 – User Identity, World Runtime & Save/Load

KF_0.29.0 verbindet den Browser erstmals mit der autoritativen Cloud-Persistenz.

- eigener Kabinenfieber-Login mit eindeutigem Benutzernamen + Passwort; E-Mail/Recovery ist bewusst noch nicht Teil dieses Entwicklungsblocks.
- unveraenderliche interne `userId`; Loginname und sichtbarer Anzeigename sind davon getrennt.
- Passwoerter werden serverseitig ausschliesslich als gesalzene `scrypt`-Hashes gespeichert. Persistiert wird nie das Klartextpasswort.
- Browser-Sitzungen verwenden zufaellige Bearer-Tokens; serverseitig liegt nur deren SHA-256-Hash.
- `WorldRuntimeManager` laedt mehrere Welten parallel nach `worldId`, serialisiert Mutationen je Welt in einer eigenen Queue und entlaedt inaktive Welten nach 15 Minuten aus dem RAM, ohne Spielstaende zu loeschen.
- GitHub Pages kann nach Anmeldung eigene Welten auflisten, laden und serverseitig speichern.
- aktuelle Vollmatch- und Finance-Details werden beim Remote-Snapshot zusammen mit dem WorldRecord wiederherstellbar gehalten.
- `WorldRecord.memberships` bleibt alleinige Wahrheit fuer menschliche Weltzugehoerigkeit, `clubId` und `PLAYER`/`WORLD_ADMIN`. Auth-/Profil- und Firestore-Indexdaten enthalten diese Wahrheit nicht nochmals.
- vollstaendiges Browser-Snapshot-Speichern ist absichtlich nur fuer Welten mit genau einem menschlichen User erlaubt. Sobald mehrere Menschen teilnehmen, muss der spaetere serverautoritative Command-Pfad verwendet werden.

Das ist noch **nicht** die fertige Multiplayer-Lobby. Einladungen, Join/Leave-UI, Ready/Countdown und Live-Eingriffe folgen auf dieser nun servergebundenen Save/Load-Grundlage.

## Neu in KF_0.28.1 – Cloud Persistence Verification

KF_0.28.1 ergänzt einen technischen Persistenz-Selbsttest beim Start des Backendservers.

- Google Cloud Storage: reserviertes Testobjekt schreiben, lesen, Inhalt prüfen und löschen.
- Firestore: reserviertes Dokument in `<prefix>_system` schreiben, lesen, Inhalt prüfen und löschen.
- `/api/v1/persistence/status` zeigt den tatsächlichen Prüfstatus für Object Store und Metadata Store, statt nur vorhandene Konfiguration zu melden.
- Berechtigungsfehler werden als `permission_denied`, fehlende Ressourcen als `not_found` und Cleanup-/Payloadfehler separat ausgewiesen.
- Ein fehlgeschlagener Persistenztest beendet Cloud Run nicht; der Fehler bleibt diagnostizierbar.
- GCS-Adapter: Tippfehler `metadadata` → `metadata` korrigiert, damit Content-Type-Metadaten korrekt übergeben werden.

Die Prüfung berührt keine Weltslots, Mitgliedschaften, Spielstände oder Fußballwahrheiten. Testdaten liegen ausschließlich unter `_system/persistence-verification/` bzw. `<prefix>_system` und werden unmittelbar wieder entfernt.


## Neu in KF_0.28.0 – Backend Persistence Foundation

KF_0.28.0 ergänzt die serverfähige Persistenzgrundlage, ohne Gameplay oder Matchsimulation des Browser-Clients zu verändern. GitHub bleibt die Code-Wahrheit; die Entwicklungszielplattform ist Google Cloud.

- `WorldRecord.memberships` bleibt die kanonische Wahrheit für menschliche Trainer, `clubId` und die Weltrolle `PLAYER` / `WORLD_ADMIN`.
- Firestore bzw. der lokale Metadata-Adapter hält nur Weltslots, Weltregister, Einladungen und einen **rebuildbaren** User-Welt-Teilnahmeindex. Dort liegt bewusst keine zweite Club-/Rollenwahrheit.
- maximal 1000 belegbare Weltslots global und maximal 5 aktive Weltteilnahmen je User.
- der Ersteller wird bei der Rolleninitialisierung erster `WORLD_ADMIN`; weitere Weltadmins können später ernannt oder zurückgestuft werden, solange mindestens ein Weltadmin verbleibt.
- der eigentliche `WorldRecord` wird gzip-komprimiert im Object Store gespeichert; Match- und Finance-Details der laufenden Saison werden slotweise segmentiert.
- Manifest + Revision schützen vor veralteten Überschreibungen. Nach erfolgreichem Commit wird der vorherige WorldRecord-Snapshot entfernt; nach Saisonwechsel werden die Detailsegmente der abgeschlossenen Saison physisch bereinigt.
- lokale File-Adapter und Google-Cloud-Adapter verwenden dieselben fachlichen Schnittstellen. Ein späterer Umzug auf Pi/SSD oder einen anderen Cloud-Anbieter bleibt damit möglich.
- Cloud-Run-fähiger Servereinstieg: `server/index.js`; lokaler Start: `npm run start:server`.
- neuer Test: `npm run test:0280`.

**Noch nicht Teil von KF_0.28.0:** Browser-Anbindung an das Backend, Login/Auth, Lobby/Einladungs-UI, serverautoritatives Command Gateway, Ready/Countdown und Live-Match-Runtime. Der bestehende Browser-Client bleibt gameplay-seitig auf dem Stand von KF_0.27.3.

## Neu in KF_0.27.3

- 424 aktuelle Vereinswappen aus der freigegebenen Google-Drive-Masterquelle integriert.
- technische Laufzeitablage bleibt `assets/clubs/<clubId>/crest.png`; Drive-Dateinamen sind nur Importhilfe.
- Runtime-Wappen auf maximal 512×512 PNG optimiert.
- exakt 8 Tuerkei-3-Vereine bleiben kontrollierte Fallbackfaelle.
- keine Gameplay-, Simulations- oder Persistenzaenderung; die World-Schemas bleiben auf 0.27.2.

## Grundlage KF_0.27.2

- club-spezifische 1x1-Platzhalter `home.png` / `away.png` und ihre `homeKitAsset`/`awayKitAsset`-Felder entfernt; Trikots kommen ausschliesslich aus dem Trikotdesigner.
- nachweislich tote alte Kit-Templates, doppelte Icons/Tiles, Sponsor-/Nation-Platzhalter und ein ungenutztes Base-Asset entfernt.
- redundanten DB3-JS-Export und alte Source-Archive entfernt; JSON bleibt kanonische DB3-Entwicklungsquelle.
- generierte Test-JSONs werden nicht mehr versioniert. Release Notes und Validation Summaries bleiben im Repository.
- Build-/Finance-Architekturmetadaten auf den tatsaechlichen KF_0.27.2-Stand korrigiert.
- bestehende Trikotdesigner-Bases/Masken bleiben vollstaendig erhalten.
- Legacy-Migration fuer KF_0.26.0-FinanceEvents abgesichert.

## Grundlage aus KF_0.27.1

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

KF_0.27.2 dient als bereinigte technische Ausgangsbasis fuer den neuen GitHub-Stand. Die Spielstruktur wurde fuer diesen Neustart bewusst nicht umgebaut, damit lokale Tests und GitHub Pages denselben Codepfad behalten.

Hilfsbefehle:

- `npm run assets:check` prueft Wappen sowie Heim-/Auswaertstrikots gegen die zentrale Vereinsliste.
- `npm run assets:crests:import -- <quellordner>` importiert Vereinswappen anhand des Vereinsnamens in den stabilen `clubId`-Pfad.
- `npm run assets:crests:import -- <quellordner> --dry-run` prueft die Zuordnung ohne Dateien zu kopieren.

Die neue Sponsorenbasis ist bewusst noch nicht Teil dieses Stands und bleibt ein spaeterer eigener Entwicklungsblock.
