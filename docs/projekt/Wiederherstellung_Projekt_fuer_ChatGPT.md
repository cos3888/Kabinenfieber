# Wiederherstellung Kabinenfieber - KF_0.27.1

Dieses Dokument soll einen neuen Chat/Agenten in die Lage versetzen, den aktuellen Entwicklungsstand ohne vorherigen Gespraechsverlauf fortzusetzen.

## 1. Aktueller technischer Stand

Version: `KF_0.27.1`

Build-Label:

`KF_0.27.1 - Current-Season Finance Store`

Persistierte Schemas:

- `kf-core-0.27.1`
- `kf-world-record-0.27.1`

Kanonischer Runtime-Einstieg:

`src/app.bundle.js`

Produktions-HTML:

`index.html`

Aktuelle ZIP nach Export soll `KF_0.27.1.zip` heissen.

## 2. Projektgrundsaetze

- Ergebnisse niemals vorab festlegen.
- Matchsituationen entstehen aus Aufstellung, Taktik, Gegner, Trainer, Chemie und Matchphase.
- Aus Situationen entstehen Abschluesse, Tore, Paraden, Blocks, Karten, xG, Heatmap und Bewertungen.
- Berichte rekonstruieren aus vorhandenen Matchdaten und duerfen nichts behaupten, was Events/Spielwerte nicht hergeben.
- Entscheidungen des Spielers muessen nachvollziehbar wirken.
- Bestehende Systeme vor neuen Features sauber abschliessen.
- Aktuelle Wahrheit und historische Wahrheit getrennt halten.
- Keine parallelen persistierten Wahrheiten ohne fachliche Begruendung.

## 3. Kanonische Datenquellen ab KF_0.27.1

### Aktuelle Spielwelt

- Spieler: `world.players.byId`
- Kader/Aufstellung/Taktik: `world.squads`
- Fixtures/Status: `world.calendar.fixtures`
- kompakter Index abgeschlossener Matches der laufenden Saison: `world.history.matches`
- Vollmatchdetails laufende Saison: `CurrentSeasonMatchRepository[worldId][season][matchId]`
- Spielervertrag: `world.players.byId[playerId].contract`
- kompakter Finanzzustand: `world.clubFinances.byClub`
- vollstaendiger Finanzledger laufende Saison: `CurrentSeasonFinanceRepository[worldId][season][clubId][eventId]`
- Sponsorvertraege: `world.sponsorContracts.byId`
- Regeln/Texte: `StaticData`

### Historische Fussballwahrheit

- kompakte Matchresultate: `world.history.seasonResults[season]`
- Spieler-Saisonaggregate: `world.history.playerSeasons[season].byPlayerId[playerId]`
- Abschlusstabellen: `world.history.seasonStandings`
- Marktwert- und Staerkehistorie: `world.history.playerMarketValues[playerId]` (`averageStrength` optional bei alten Punkten)
- Ruhestaendleridentitaet: `world.history.retiredPlayers.byId`
- aktuelle tatsaechliche Finanzbuchungen: `CurrentSeasonFinanceRepository[worldId][season][clubId][eventId]`
- Praemien-Idempotenz innerhalb der laufenden Saison: `CurrentSeasonFinanceRepository`-Events mit `eventKey`
- `world.history.bonusEvents`: nur leerer Legacy-Kompatibilitaetscontainer, keine kanonische Historie

### Abgeleiteter Saisonuebergangssnapshot

`world.history.previousSeasonRecentContext`

Maximal die letzten fuenf relevanten Spiele je Club. Nur fuer Gegneranalyse, letzte bekannte Aufstellung und Teamchemie. Keine historische UI-Wahrheit.

## 4. Wichtigste Aenderung KF_0.26.0

Vor 0.26.0 blieben alte Matchobjekte trotz Saisonarchivierung dauerhaft in `world.history.matches` und trieben Save-/RAM-Wachstum.

KF_0.26.0 fuehrt folgende Struktur ein:

### `seasonResults`

Kompakter Datensatz je abgeschlossenem Match mit Paarung/Ergebnis und Wettbewerbsmetadaten. Keine alten Detailberichte, Events, `playerStats`, `matchStats`, Aufstellungen oder Taktikpayloads.

### `playerSeasons`

Materialisierte Spielerkarrierewerte je Saison. Enthalten sind Gesamt- und Wettbewerbswerte inkl. Einsaetze, Minuten, Tore, Vorlagen, Karten, RatingTotal/RatingCount, Team-des-Tages und Torwartwerte.

### `previousSeasonRecentContext`

Version 2 speichert gemeinsame Matchsnapshots unter `matchesById` und pro Club nur Schluessel in `byClub`. So wird ein gemeinsames Spiel nicht doppelt gespeichert.

## 4a. Wichtigste Aenderung KF_0.26.1 - Bonusdaten-Bereinigung

Vor 0.26.1 wurde jede bereits bezahlte Einsatz-, Tor-, Zu-Null-, Saison- und Transferklauselpraemie zusaetzlich in `world.history.bonusEvents` protokolliert. Im Langlauf waren das grob rund 250.000 Eintraege pro Saison. Bis KF_0.27.0 lag die eigentliche Geldbewegung in `world.clubFinances.byClub[clubId].financeEvents`; ab KF_0.27.1 liegt die vollstaendige Buchung im `CurrentSeasonFinanceRepository`.

KF_0.26.1 entfernt diese parallele persistente Wahrheit fachlich:

- aktive Funktion `kf021ProcessMatchContractBonuses` dedupliziert ueber `financeEvents[].eventKey`,
- aktive Funktion `kf021PaySeasonPlayerBonus` dedupliziert ueber denselben Mechanismus,
- aktive Funktion `kf021PayInterClubBonus` schreibt denselben `eventKey` auf Ausgaben- und Einnahme-Finanzereignis und erhaelt die bestehende Mailcenter-Meldung bei menschlicher Beteiligung; ein bereits verarbeiteter Key erzeugt keine zweite Mail,
- `kf0261FinanceEventKeyCache(world)` ist ein abgeleiteter world-spezifischer Runtime-Set,
- `kf0261BonusKeySeen`/`kf0261RegisterBonusKey` sind die aktiven Helfer,
- beim `resetFinanceForNewSeason` wird der Runtime-Index verworfen,
- `world.history.bonusEvents` bleibt nur als leeres Array fuer Altcode-Kompatibilitaet und darf nicht mehr anwachsen.

Wichtig: Es wurde **keine Finanzlogik und keine Praemienhoehe geaendert**. Nur der persistente Idempotenzanker wurde von einer zweiten Historienliste auf die bereits vorhandene echte Finanzbuchung verlagert.

## 5. Saisonwechsel KF_0.26.0

Finaler Wrapper am Ende von `src/app.bundle.js`:

1. `kf0260PrepareCompletedSeason(world, previousSeason)` erstellt Ergebnisse, Spieleraggregate und Recent-Context aus den noch vollen Matchobjekten.
2. Der vorherige finale `advanceIntoNextSeason` laeuft unveraendert fachlich durch.
3. `kf0260CommitCompletedSeason(world, prepared)` schreibt die neue Historie.
4. Vollmatches der beendeten Saison werden aus `world.history.matches` entfernt.
5. Match-/Statistik-Runtimecaches werden invalidiert.

Diese Reihenfolge ist wichtig: Archive nicht vor einem moeglicherweise fehlschlagenden fachlichen Saisonwechsel committen.

## 6. Migration alter 0.25.x-Welten

Finaler Wrapper von `migrateWorldDataTruthToCurrent(world)`:

- ruft die bisherigen Vertrags-/Formation-/Verletzungs-/Marktwertmigrationen auf
- stellt die neuen Historiencontainer sicher
- erkennt Full/archivierte Matchobjekte aus Saisons `< current season`
- baut daraus `seasonResults` und `playerSeasons`
- entfernt danach alte Vollmatches abgeschlossener Saisons
- der 0.26.0-Historienmigrationspfad laeuft weiterhin zuerst
- der finale 0.26.1-Wrapper setzt danach `world.meta.schemaVersion = 'kf-core-0.26.1'`
- der registrierte WorldRecord erhaelt `schemaVersion = 'kf-world-record-0.26.1'` und `gameVersion = '0.26.1'`
- `kf0261MigrateLegacyBonusEvents(world)` uebertraegt bei alten aktuellen Transferklauselzahlungen fehlende `eventKey`s soweit eindeutig auf die passenden FinanceEvents und leert danach den alten BonusEvent-Container

Regression: 0.25.x-Migration mit 12 alten Vollmatches ist weiterhin bestanden. Zusaetzlich ist die 0.26.0 -> 0.26.1 BonusEvent-Migration inklusive Transferklausel-Key-Uebernahme getestet.

## 7. Historische Leser, die auf neue Quellen umgestellt wurden

Am Ende des Bundles werden folgende Funktionen ueberschrieben/erweitert:

- `derivePlayerStatsFromHistory`
- `playerStatsSeasonOptions`
- `derivePlayerCompetitionStats`
- `deriveTeamOfDayAwardsForPlayerInCompetition`
- `deriveTeamOfDayAwardsForPlayer`
- `buildLeaguePlayerStatMap`
- `buildCupPlayerStatMap`
- `buildFieberCupPlayerStatMap`
- `clubCurrentRankingPoints`
- `buildAllTimeLeagueTable`
- `buildCompetitionHistoryRows`
- `countryCupWinnerClubId`
- `winnerClubIdForCompetitionSeason`
- `clubProfileSeasonOptions`
- `buildClubCompetitionRows`
- `clubSuccessSummary`
- historische Zweige von `buildCupPairRows`
- historische Zweige von `buildFiebercupRowsForStage`
- `statisticsCacheStamp`

Aktuelle Saison bleibt auf Vollmatches.

## 8. Simulation ueber Saisonwechsel

Folgende bestehende Systeme duerfen durch Matchloeschung nicht ihre Vorsaisoninformationen verlieren:

- `analyzeOpponentRecentMatches`
- `calculateTeamChemistry`
- `latestMatchForClub`
- `recentFormStringForClub`
- wahrscheinliche/letzte Aufstellungen

Darum ueberschreibt KF_0.26.0 `recentMatchesForClub` so, dass es den begrenzten Vorsaison-Snapshot und die aktuellen Vollmatches zusammenfuehrt.

Regression: Gegneranalyse und letzte bekannte Aufstellung sind vor/nach Verdichtung identisch.

## 9. Produktentscheidung historische Matches

Der aktuelle UI-Stand hat keine Detailansicht einzelner Spiele vergangener Saisons. Langfristig sollen deshalb nicht alle alten Detailmatches gespeichert werden.

Dauerhaft relevant:

- Ergebnis/Paarung/Wettbewerb/Runde
- Tabellen
- Spielerkarrieren
- Vereins-/Wettbewerbshistorie

Nicht dauerhaft relevant:

- alter Live-Ticker
- kompletter alter Spielbericht
- Situationsrohstrom
- detaillierte alte Taktiktimeline
- sonstige Matchsimulationspayloads

Eine spaetere historische Spielplanansicht kann direkt auf `seasonResults` aufbauen.

## 10. Speicherregression 0.26.0

### Synthetischer Integritaetstest

12 sehr payloadreiche Matches:

- vorher: 285.814 Byte
- nachher: 45.879 Byte
- ca. 84 % weniger fuer den getesteten Historienpayload

### Echte Matchstichprobe

180 echte KF-Ligamatches aus einer Liga:

- Vollmatches: 9.227.101 Byte (8,80 MB)
- kompakte Historie: 565.944 Byte (0,54 MB)
- Reduktion: 93,9 %
- Resultate: 75.324 Byte
- Spieler-Saisonaggregate: 271.342 Byte
- Recent-Context: 219.234 Byte
- 294 Spieler-Saisoneintraege
- 18 Clubs, max. 5 Recent-Matches je Club, 45 gemeinsame `matchesById`

Nicht als Gesamt-Save-Hochrechnung verwenden.

## 11. Bekannte offene Ressourcenthemen

### `bonusEvents` - mit KF_0.26.1 fachlich geloest

Im 0.25.6-Langlauf entstanden grob rund 250.000 neue `bonusEvents` pro Saison. Seit KF_0.26.1 werden keine neuen fachlichen BonusEvents mehr erzeugt. Ab KF_0.27.1 ist die echte Buchung mit `eventKey` im `CurrentSeasonFinanceRepository` die einzige vollstaendige persistente Wahrheit fuer bereits verarbeitete Praemien der laufenden Saison.

Der Container `world.history.bonusEvents` existiert noch leer, damit alter Basiskode nicht durch fehlende Properties bricht. Er ist **keine** Datenquelle mehr und darf in Langlaeufen nicht anwachsen.

### Ruhestaendler und Staerkehistorie - mit KF_0.26.2 geloest

- `world.players.byId` enthaelt nur aktive Spieler.
- Karriereende erzeugt ein kompaktes Profil in `world.history.retiredPlayers.byId` und entfernt den Spieler aus `players.order` sowie allen Kaderstrukturen.
- Nicht archiviert werden aktive Simulationsdaten wie Skills, Fitness, Form, Moral, Vertrag, Training, Verletzungen oder Sperren.
- Saisonstatistik bleibt in `world.history.playerSeasons`, Transfers in `world.history.transfers`.
- Marktwert und `averageStrength` teilen sich `world.history.playerMarketValues[playerId]`; maximal zwei Stichtage pro Saison.
- `world.meta.playerStrengthAccumulator` ist nur persistierbarer Rechenzustand der laufenden Halbserie (`strengthSum`, `strengthSamples`, `lastSampleSlot`) und keine historische Wahrheit.
- Der Stichtagsmarktwert nutzt `calculatePlayerCurrentOverallAdvanced(...)`; der Staerkepunkt nutzt den Durchschnitt der seit dem vorherigen Stichtag gesampelten angezeigten Staerke.
- 0.26.1-Migration ueberfuehrt vorhandene bereits pensionierte Vollobjekte, erfindet aber keine alten Staerkepunkte. Beginnt die Migration mitten in einer Halbserie, wird kein unvollstaendiger Halbserienwert archiviert.

### Weitere Historien

Nach realer Groesse priorisieren:

- Sponsorvertragshistorie
- Marktwerthistorie
- Transfer-/Vertragshistorie
- sonstige Lifecyclehistorie

Erst danach echte Server-/DB-Segmentierung und Lazy Loading ausarbeiten.

## 12. Sponsorstand KF_0.25.5/0.25.6 - unbedingt erhalten

KI-Clubs fuellen freie Sponsorenslots automatisch, Humanclubs nicht.

Volle Sponsorstruktur je KI-Club:

- 1 Hauptsponsor
- 2 grosse Sponsoren
- 3 mittlere Sponsoren
- 4 kleine Sponsoren

KF_0.25.6 bindet den Autofill in den final aktiven Saisonwechsel ein, nach `resetFinanceForNewSeason()` und vor Budgets/Planung.

`kf0256SponsorContractIndexByWorld` ist nur Runtimeindex; persistente Wahrheit bleibt `world.sponsorContracts`.

Regressionen fuer S3/S4/S5 und direkter Algorithmus bis S10 bestanden.

## 13. Slot-Lifecycle KF_0.25.4 - unbedingt erhalten

Normaler Weiter-Pfad und Schnellsimulation muessen denselben `prepareCareerSlotLifecycle` verwenden.

Vor Matches des Slots passieren u. a.:

- Marktwert-/Slotstatuslogik
- Gehaltsbuchung
- faellige Future Moves
- Vertrags-/Optionschecks

Abbruch einer Schnellberechnung nie mitten im Slot committen; gestarteten Slot vollstaendig abschliessen.

## 14. Aufstellungsfix KF_0.25.3 - unbedingt erhalten

Problem: `lineupMaskState` existierte, aber `playerPlacementById` war `null`. KI fiel dadurch auf alte Squad-Reihenfolge zurueck und konnte Feldspieler ins Tor stellen.

Fix: wenn Placements fehlen, Aufstellung sauber initialisieren. Bestehende Trainer-Typ-/Formationlogik verwenden. Kein neuer Optimal-11-KI-Algorithmus.

## 15. Performancefix KF_0.25.2 - unbedingt erhalten

- Matchruntimecache inkrementell statt historischer Vollrebuild nach jedem Match
- die fruehere BonusEvent-Cache-Idee ist ab KF_0.26.1 durch den FinanceEvent-Key-Index ersetzt
- browserseitige Schnellberechnung zeitbudgetiert (`KF0252_SIM_TICK_BUDGET_MS = 12`)
- Fortschrittsupdates gedrosselt (`KF0252_PROGRESS_PAINT_INTERVAL_MS = 120`)
- Matchkern nicht vereinfacht

## 16. Finanz-/Lizenzstand

Saison 1:

- gleichmaessiges Startkapital, weil keine Vorsaisonplatzierung existiert

Saisonende:

- finaler Platzierungsbonus nach exaktem Tabellenplatz, genau einmal

KI-Sponsoren:

- ab S3 kein Wegfall mehr

Aktuelle Finanzregression 0.26.1:

- 432 Clubs
- neutraler Median ca. +0,164 Mio.
- ca. 87,27 % innerhalb +/-2 Mio.
- max. Start-Gehaltsbudgetauslastung ca. 92,61 %
- Lizenzgrenzen 5/15 % bleiben unveraendert

Noch keine neue strategische KI-Finanzphilosophie integrieren; spaeterer KI-Trainer-/Clubphilosophieblock.

## 17. Mehrspielerregel

- Countdown = Schnellberechnung.
- Schnellberechnung beim eigenen Match = Co-Trainer uebernimmt Live-Verantwortung fuer das komplette Match.
- H-v-H: will mindestens ein beteiligter Mensch live, laeuft das Match live.
- Wer schnell simuliert/Timeout hat, darf spaeter nicht live eingreifen.

Diese Regel ist verbindlich.

## 18. Wichtige Tests/Reports

Neue 0.26.2-Tests:

- `tests/run_kf_0_26_2_player_lifecycle_strength_test.js`
- `tests/run_kf_0_26_2_longterm_lifecycle_test.js`

Weiterhin relevant sind die 0.26.0/0.26.1-Historien-/Bonusregressionen sowie Source, Architektur, Multiworld, Server-Foundation, Datenwahrheit, Marktwerthistorie, Saisonwechsel, Sperren, Finance/Lizenz, Verhandlungen, Fixture-ID, Pokal, Match-Feel, Berichtskonsistenz und die Fixregressionen 0.25.1 bis 0.25.6.

Reports:

- `reports/kf_0.26.2_release_notes.md`
- `reports/kf_0.26.2_validation_summary.md`
- `reports/kf_0.26.2_player_lifecycle_strength_test.json`
- `reports/kf_0.26.2_longterm_lifecycle_test.json`

## 19. Langzeit- und Vollweltbefund

Die 0.26.2-Basis wurde ueber fuenf vollstaendige Saisons vermessen. Dabei blieb die Simulationszeit ueber die Saisons stabil genug, waehrend der monolithische WorldRecord vor Saisonwechsel bis ueber 650 MiB anwuchs. Die dauerhafte Historie nach Saisonwechsel wuchs kontrolliert.

Fuer KF_0.27.0 wurde zusaetzlich eine komplette reale Saison mit 432 Clubs und 7.736 Matches durchlaufen. Der WorldRecord lag vor Saisonwechsel bei 206,4 MiB statt 550,9 MiB in der 0.26.2-Vergleichsmessung und konnte wieder erfolgreich serialisiert/gespeichert werden. Der separate Vollmatch-Store enthielt 7.736 Payloads und wurde nach erfolgreichem Saisonwechsel vollstaendig geleert.

Der separate 10-Saison-Ruhestands-Lifecycle aus KF_0.26.2 bleibt ebenfalls gueltig: 3.077 von 10.679 Startspielern wurden archiviert, ohne pensionierte Kaderreferenzen; der kompakte Retiree-Store belegte ca. 31,6 % der geschaetzten Groesse derselben Spieler als aktive Vollobjekte.

## 20. Naechster sinnvoller Entwicklungsschritt

KF_0.27.1 hat nach Vollmatches auch die FinanceEvents der laufenden Saison aus dem WorldRecord entfernt. Der heisse WorldRecord liegt am Ende einer realen Saison nun bei rund 81,7 MiB statt 550,9 MiB auf der 0.26.2-Basis. Als naechster Serverblock soll vor Umsetzung erneut gemessen und fachlich entschieden werden, welcher verbleibende Bereich fuer das Ziel von bis zu 1.000 Welten und unbegrenzten Saisons als naechstes segmentiert werden muss. Naheliegend ist die saisonweise/lazy Historienpersistenz; sie darf aber erst nach einer aktuellen Groessenanalyse festgelegt werden.

## 21. Dokumentationsregel

Bei jedem Export aktualisieren:

- `docs/projekt/Beschreibung_Projekt_fuer_Menschen.md`
- `docs/projekt/Wiederherstellung_Projekt_fuer_ChatGPT.md`

Der menschliche Text erklaert den Spielstand verstaendlich; dieses Wiederherstellungsdokument muss technisch konkret genug sein, um das Projekt nach Kontextverlust fortzusetzen.


## KF_0.27.0 - Current-Season Match Store / Serverpersistenz Phase 1

Ziel: Vollmatches der laufenden Saison duerfen nicht mehr Teil des monolithischen `WorldRecord` sein, sollen aber bis zum Saisonwechsel weiterhin vollstaendig in der Matchinfo lesbar bleiben.

Aktive Bausteine am Ende von `src/app.bundle.js`:

- `CurrentSeasonMatchRepository` - world-/season-/matchId-segmentierter Store; lokaler Adapter speichert serialisierte JSON-Payloads und parst erst bei `load`.
- `kf0270CompactPlayerMatchStat` - reduziert per-Match-Spielerwerte auf die fuer laufende Logik benoetigten Felder.
- `kf0270CompactCurrentMatch` - baut den kompakten Eintrag fuer `world.history.matches`.
- `kf0270LoadFullCurrentSeasonMatch` - expliziter Vollmatch-Leser.
- `kf0270ArchiveExistingCurrentSeasonMatches` - Migration vorhandener 0.26.2-Vollmatches der aktuellen Saison.
- Override `recordPlayedMatch` - speichert Vollmatch im Repository und nur den kompakten Index im WorldRecord.
- Matchinfo-Wrapper um `renderMatchInfoModalBody` - fordert waehrend der Darstellung Vollmatchdaten an.
- Saisonwechsel-Wrapper - loescht den Store der abgeschlossenen Saison erst nach erfolgreichem bestehenden Saisonwechsel/0.26-Historiencommit.
- `WorldRepository.delete` - entfernt auch getrennte Matchsegmente.
- finaler Migrationswrapper setzt `kf-core-0.27.0` / `kf-world-record-0.27.0`.

Wichtig fuer kuenftige Arbeiten:

- `world.history.matches` ist ab 0.27.0 **kein Vollmatchspeicher mehr**, sondern kompakter aktueller Saisonindex.
- Vollmatchwahrheit der laufenden Saison: `CurrentSeasonMatchRepository[worldId][season][matchId]`.
- Historische Saisons bleiben weiterhin bewusst ohne Vollmatcharchiv.
- Der kompakte Index enthaelt weiterhin `playerStats` in reduzierter Form, weil zahlreiche bestehende laufende Systeme (Spielerstatistik, Sperren, Einsatz-/Leihlogik, Team des Tages usw.) daraus lesen. Eine weitere Entfernung waere ein eigener Architekturblock und darf nicht stillschweigend erfolgen.
- Reale S1-Messung: WorldRecord 550,9 -> 206,4 MiB (-62,5 %); Vollmatch-Store 388,7 MiB; kompakter Index 45,2 MiB; kombinierte Datenmenge 595,1 MiB; nach Saisonwechsel WorldRecord 69,8 MiB und Store leer.
- Der naechste grosse saisonale Monolith bleibt `world.clubFinances.byClub[*].financeEvents` (~124,9 MiB im S1-Peak).

Regressionen:

- `tests/run_kf_0_27_0_current_season_match_store_test.js`
- `tests/run_kf_0_27_0_server_storage_test.js`
- `tests/run_kf_0_27_0_compact_index_profile_test.js`
- bestehende Source/DataTruth/Multiworld/ServerFoundation/SeasonTransition/History/Finance/Negotiation/Fixture/Cup/Report/MatchFeel-Tests.

## KF_0.27.1 - Current-Season Finance Store / Serverpersistenz Phase 2

Ziel: Die rund 125 MiB `financeEvents` einer voll laufenden Saison duerfen nicht mehr Teil des monolithischen WorldRecords sein, ohne Finanzlogik oder Idempotenz zu veraendern.

Aktive Bausteine am Ende von `src/app.bundle.js`:

- `CurrentSeasonFinanceRepository` - world-/season-/club-/eventId-segmentierter Ledger-Store.
- `kf0271NormalizeFinanceEntry` - migriert alte Eventarrays und erzeugt kompakten aktuellen Zustand.
- `kf0271BuildFinanceTotals` / `kf0271ApplyFinanceDelta` - kleine aktuelle Summen fuer haeufige Finanzabfragen, keine zweite Eventhistorie.
- Override `addFinanceEvent` - schreibt das vollstaendige Ereignis nur in den Finance-Store und aktualisiert den kompakten Saldo/Summen.
- Override `financeCurrentCash` / `financeEventSum` - nutzt kompakten Zustand fuer haeufige Berechnungen; Details werden nur bei Bedarf aus dem Ledger gelesen.
- Bonus-Idempotenzcache wird aus den `eventKey`s des Finance-Stores rekonstruiert.
- Saisonwechsel-Wrapper - loescht den alten Finance-Store erst nach erfolgreicher Schlussbestandsuebernahme.
- `WorldRepository.delete` entfernt auch Finance-Segmente.
- finaler Migrationswrapper setzt `kf-core-0.27.1` / `kf-world-record-0.27.1`.

Datenwahrheit:

- `world.clubFinances.byClub[clubId]` = kompakter aktueller Finanzzustand.
- `CurrentSeasonFinanceRepository[worldId][season][clubId][eventId]` = einzige vollstaendige Buchungswahrheit der laufenden Saison.
- Keine `financeEvents`-Arrays mehr im WorldRecord.

Realer S1-Test:

- 7.736 Matches
- 256.810 FinanceEvents
- WorldRecord vor Saisonwechsel 81,7 MiB
- Finance-Store 124,2 MiB
- Vollmatch-Store 389,5 MiB
- kombinierte physische Daten 595,4 MiB
- WorldRecord nach Saisonwechsel 68,2 MiB
- alte Match- und Finance-Stores nach Saisonwechsel leer
- Simulation ca. 241 s, Saisonwechsel ca. 18 s; keine erkennbare Regression gegen 0.27.0

Regressionen:

- `tests/run_kf_0_27_1_current_season_finance_store_test.js`
- `tests/run_kf_0_27_1_server_storage_test.js`
- Source, DataTruth, Finance/Licence, SeasonTransition, ServerFoundation, Multiworld, MatchStore und Negotiation.



## Repository-Neustart nach KF_0.27.1 (kein neuer Gameplay-Release)

Ziel: neue saubere GitHub-Basis auf dem vollstaendig abgeschlossenen KF_0.27.1-Stand, ohne Gameplay- oder Sponsorenumbau.

Ergaenzte Werkzeuge:

- `tools/import_club_crests.js`: rekursiver PNG-Import aus einem externen Wappenordner. Matcht Quelldateiname gegen `clubName` Unicode-/Umlaut-tolerant und schreibt nach `assets/clubs/<clubId>/crest.png`.
- `tools/check_club_assets.js`: prueft alle 432 Clubs gegen `crestAsset`, `homeKitAsset`, `awayKitAsset`.
- npm-Skripte: `assets:crests:import` und `assets:check`.
- `.gitignore` schliesst lokale Runtime-/Save-/Serverdaten, `.env`, Importstaging und Release-ZIPs aus.

Aktueller Assetbefund vor Import der Drive-Wappen:

- zentrale Vereinsliste: 432 Clubs
- im KF_0.27.1-Paket vorhandene Wappen: 20
- Drive-Wappenquelle: 24 Ligaordner x 18 PNG = 432 Dateien
- davon 424 nach Vereinsname eindeutig den aktuellen Clubs zuordenbar
- acht Tuerkei-3-Clubs fehlen in der Quelle; stattdessen liegen dort acht abweichende Vereinsnamen. Keine Reihenfolgen-Zuordnung vornehmen.
- bestehende Trikotluecken: Deutschland 3 hat 18 fehlende home.png und 17 fehlende away.png. Nicht Teil dieses Umbaus.

Bekannte acht Wappen-Fallbacks:

- FC Kapıdağ
- SC Marmara Adası
- FC Artvin Yayla
- SC Rize Çay
- FC Harran Ovası
- SC Mardin Taş
- FC Tunceli Munzur
- SC Erzincan Yayla

Die neue Sponsorenbasis aus Google Sheets/Drive wurde analysiert, aber auf Nutzerentscheidung bewusst noch nicht in StaticData oder Gameplay uebernommen. Die KF_0.27.1-Sponsoren-Zwischenloesung bleibt technische Wahrheit, bis ein eigener Sponsorenblock freigegeben wird.

Naechster GitHub-Schritt: neues Repository bzw. GitHub-Verbindung herstellen und diesen bereinigten KF_0.27.1-Root als Ausgangsstand veroeffentlichen. Danach GitHub Pages auf denselben statischen Root legen. Server-/API-Code spaeter daneben entwickeln; der lokale ZIP-/Standalone-Testpfad bleibt erhalten.
