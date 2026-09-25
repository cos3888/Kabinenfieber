# Kabinenfieber - Stand KF_0.29.2

## 1. Was ist Kabinenfieber?

Kabinenfieber ist ein Fussballmanager mit dem Ziel, sportlich nachvollziehbare Entscheidungen, glaubwuerdige Simulation und Wettbewerb zwischen menschlichen Spielern zu verbinden. Das Spiel soll auch mit nur einem menschlichen Trainer funktionieren; alle nicht menschlich gesteuerten Vereine muessen deshalb eine belastbare KI-/Clubverwaltung besitzen.

Grundsatz der Entwicklung: vorhandene Systeme zuerst sauber abschliessen und technisch tragfaehig machen, bevor weitere grosse Gameplayfeatures hinzukommen.

## 2. Aktueller Versionsstand

App-Version: `KF_0.29.2`

Persistierte Schemas:

- Fussballwelt/GameState: `kf-core-0.27.2`
- WorldRecord: `kf-world-record-0.27.2`

KF_0.26.0 begann den Historien-/Ressourcenumbau, KF_0.26.1 entfernte die redundante BonusEvent-Historie und KF_0.26.2 schloss Spielerlebenszyklus, Staerkehistorie und Ruhestaendler ab. KF_0.27.0 startete den Server-/Persistenzumbau mit ausgelagerten Vollmatches. KF_0.27.1 lagert nun auch die FinanceEvents der laufenden Saison aus dem monolithischen WorldRecord aus.


## KF_0.29.2 – Save Integrity & World Navigation

Der zweite Browser-Praxistest zeigte zwei kritische Lücken: Nach Vereinsübernahme und absolviertem Spieltag konnte eine ältere committed Revision geladen werden, und ein fehlgeschlagener Flush beim Wechsel zur Weltliste wurde im Browser still geschluckt.

### Harte Persistenzgrenzen

- die Vereinsübernahme gilt im Browser erst nach erfolgreichem Servercommit als abgeschlossen; vorher wird nicht ins Büro gewechselt.
- schlägt der Commit der Vereinsübernahme fehl, wird die lokale `clubId` zurückgesetzt und die Vereinsauswahl bleibt aktiv.
- ein normaler Kalenderfortschritt sperrt weitere Aktionen, bis der vollständig verarbeitete Slot serverseitig bestätigt wurde.
- ein fehlgeschlagener Checkpoint wird sichtbar angezeigt; der Spieler kann erneut speichern oder bewusst zur Weltliste zurückkehren und dabei nur nicht bestätigte lokale Änderungen verwerfen.
- der Rückweg zur Weltliste schluckt Save-Fehler nicht mehr.

### Versionssicherheit

- Browser und Backend müssen dieselbe App/API-Version melden.
- Login, Session-Restore und Weltladen prüfen `/healthz`; ein Versionskonflikt stoppt den Vorgang mit verständlicher Meldung.
- Create/Save senden zusätzlich `clientVersion`; der Server lehnt abweichende Versionen mit Konflikt ab.
- `index.html` lädt Bundle und CSS mit Versionsparameter, damit GitHub-Pages-/Browser-Caches beim Test keinen alten Client weiterverwenden.

### Datenwahrheit

Unverändert: aktuelle Spielwahrheit = committed `WorldRecord` plus Current-Season-Match-/Finance-Stores. Vereinszuordnung ausschließlich `WorldRecord.memberships`. Weltname und Zugangsmodell ausschließlich World Registry / Firestore. Es entsteht keine zusätzliche persistierte Wahrheit.

Regressionstest: `tests/run_kf_0_29_2_save_integrity_world_navigation_test.js` prüft den Roundtrip „Welt ohne Verein → Vereinsübernahme committen → Runtime entladen → gleicher Verein → Spieltag committen → Runtime entladen → gleicher Verein + exakter Slot + Match-/Finance-Details“.

## KF_0.29.1 – Autosave & benannte Spielwelten

Der erste Praxistest von KF_0.29.0 zeigte, dass ein klassischer manueller Save-Knopf für Kabinenfieber nicht zum vorgesehenen dauerhaften Weltmodell passt. KF_0.29.1 stellt deshalb auf Autosave um und prüft den Reload explizit gegen den committed Kalenderstand.

### Autosave

- nach einem vollständig verarbeiteten normalen Kalenderslot wird unmittelbar ein serverseitiger Snapshot-Checkpoint erzeugt.
- auch der Abschluss einer Kalenderschnellsimulation löst einen unmittelbaren Checkpoint aus.
- relevante Entscheidungen außerhalb des Kalenderfortschritts werden direkt oder mit kurzem Debounce gespeichert, damit z. B. Aufstellung, Taktik, Transfers oder Verträge nicht bis zum nächsten Spieltag verloren gehen.
- beim Verlassen der Welt bzw. Logout wird ein noch offener Autosave abgearbeitet.
- der manuelle „Jetzt speichern“-Knopf entfällt; die Welt selbst ist der Spielstand.
- Vollsnapshot-Saves bleiben weiterhin nur für Welten mit exakt einem menschlichen User erlaubt. Multiplayer benötigt danach serverautoritative Commands.

### Spielweltname und Beitrittsmodell

Neue Welten müssen einen `worldName` mit 3–40 Zeichen besitzen. Dieser Name gehört **nicht** in den WorldRecord, sondern in das bestehende World Registry / Firestore-Metadatum.

Ebenfalls dort liegen die Verwaltungsfelder:

- `visibility: PUBLIC | PRIVATE`
- `joinPolicy: OPEN | APPLICATION | INVITE_ONLY`

Aktuell zulässige Kombinationen:

- offene Welt: `PUBLIC + OPEN`
- Bewerbungswelt: `PUBLIC + APPLICATION`
- private Welt: `PRIVATE + INVITE_ONLY`

Die eigentliche öffentliche Weltsuche, Bewerbungen und der Direktbeitritt werden erst im folgenden Multiplayerblock umgesetzt. `WorldRecord.memberships` bleibt weiterhin alleinige Wahrheit dafür, wer tatsächlich Mitglied der Welt ist, welchen Club der User steuert und welche Weltrolle er besitzt.

### Reload-Wahrheit

Beim Öffnen wird die committed WorldRecord-Revision zusammen mit Current-Season-Match- und Finance-Details geladen. Der Regressionstest für KF_0.29.1 vergleicht insbesondere Saison und `world.calendar.currentSlotKey` vor dem Commit und nach einem Runtime-Unload/Reload.

## KF_0.29.0 – User Identity, World Runtime & Save/Load

Der Browser ist erstmals an den Backend-Spielstand angebunden. Ein Benutzer registriert sich mit Benutzername und Passwort oder meldet sich wieder an. E-Mail ist bewusst noch nicht erforderlich; damit gibt es in diesem Block auch noch keinen automatischen Passwort-Reset.

### Identitaet und Sicherheit

- Auth-Wahrheit: serverseitiger Account mit stabiler `userId`, normalisiert eindeutigem Loginname und gesalzenem `scrypt`-Passwort-Hash.
- sichtbarer Anzeigename ist vom Loginname getrennt.
- eine Session verwendet ein zufaelliges Bearer-Token; der Server persistiert nur dessen SHA-256-Hash.
- Auth-Daten enthalten keine Vereins- oder Weltrollenwahrheit.
- Club und Weltrolle bleiben ausschliesslich in `WorldRecord.memberships`.

### Weltlaufzeit

`WorldRuntimeManager` haelt geladene Welten als temporaere Arbeitskopien im RAM:

- `Map<worldId, runtime>` ermoeglicht mehrere gleichzeitig geladene Welten.
- jede Welt besitzt eine eigene Promise-/Mutation-Queue; Aktionen derselben Welt werden serialisiert, andere Welten bleiben fachlich getrennt.
- bei Inaktivitaet wird eine Welt nach aktuell 15 Minuten aus dem RAM entladen. Persistente Cloud-Daten werden dabei nicht geloescht.
- nach Prozessneustart oder Unload wird die committed Manifest-Revision neu aus dem Object Store geladen.
- Cloud Run bleibt vorerst auf maximal einer Instanz, bis verteilte Locks/Revisionsteuerung fuer mehrere Instanzen umgesetzt sind.

### Save/Load-Bruecke

GitHub Pages kommuniziert nur mit Cloud Run, niemals direkt mit Firestore oder Cloud Storage. Der Browser kann:

1. registrieren/anmelden,
2. die eigenen Welten ueber den rebuildbaren Teilnahmeindex auflisten,
3. eine neue Welt anlegen,
4. eine Welt inklusive Current-Season-Match-/Finance-Details laden,
5. den Einzelspielerstand revisionsgesichert speichern.

Der Vollsnapshot ist eine bewusst begrenzte Uebergangsloesung fuer Singleplayer. Sobald mehr als ein menschlicher User in einer Welt aktiv ist, lehnt der Server Vollsnapshot-Saves ab. Multiplayer-Mutationen muessen spaeter ueber das serverautoritative Command Gateway laufen; dadurch kann kein Browser die gesamte gemeinsame Welt frei ersetzen.

### Datenquellen / keine doppelte Wahrheit

- Auth-Identitaet: UserAccount/`userId`
- Profil: UserProfile
- menschlicher Club + Rolle: **nur `WorldRecord.memberships`**
- persistierte Welt: committed WorldRecord-Revision im Object Store
- Weltliste/5-Welten-Regel: rebuildbarer Firestore-Teilnahmeindex
- geladene Runtime: temporaere RAM-Kopie, keine zweite persistente Wahrheit
- Current-Season-Vollmatches und FinanceEvents: weiterhin fachlich getrennte Detailwahrheiten; der Runtime-Snapshot speichert sie als aktuelle Detailsegmente und der Browser stellt die bestehenden Repositories beim Laden daraus wieder her.


## KF_0.28.1 – Cloud Persistence Verification

Der in KF_0.28.0 vorbereitete Cloud-Backendpfad wird nun beim Start technisch geprüft. Der Server führt genau einen kontrollierten Write/Read/Delete-Roundtrip gegen den konfigurierten Object Store und den Metadata Store aus.

Technische Testbereiche:

- Cloud Storage: `_system/persistence-verification/<probeId>.json`
- Firestore: `<KF_FIRESTORE_PREFIX>_system/persistence-verification-<probeId>`

Die Testdaten sind keine fachlichen Spiel- oder Historiedaten und werden nach der Prüfung wieder gelöscht. Weder Weltslots noch `WorldRecord`, Mitgliedschaften, Matchsegmente oder Finanzsegmente werden verändert.

`GET /api/v1/persistence/status` zeigt jetzt zusätzlich einen `verification`-Block mit dem tatsächlichen Zustand beider Speicherwege. Berechtigungsfehler werden u. a. als `permission_denied` sichtbar. Ein Fehler stoppt den Server nicht, damit die Ursache über den Status diagnostiziert werden kann.

Zusätzlich wurde im Google-Cloud-Storage-Adapter die Option `metadadata` zu `metadata` korrigiert; damit wird der Content-Type eines gespeicherten Objekts korrekt an den GCS-Client weitergereicht.

Zentrale Datenquellen bleiben unverändert. Es entsteht keine zweite fachliche Datenhaltung.

Test: `tests/run_kf_0_28_1_cloud_persistence_verification_test.js` – **9/9 Checks bestanden**.


## KF_0.28.0 – Backend Persistence Foundation

KF_0.28.0 ergänzt eine getrennte Server-/Persistenzschicht; Gameplay und Matchsimulation des Browser-Clients werden in diesem Block bewusst nicht verändert.

### Entwicklungsarchitektur

- GitHub: Code, Tests, Dokumentation, StaticData/Assets
- Google Cloud Run: geplanter Serverprozess
- Google Cloud Storage: komprimierter WorldRecord sowie slotweise Match-/Finance-Segmente
- Firestore: Weltslots, Weltregister, Einladungen und rebuildbarer User-Welt-Teilnahmeindex
- lokale File-Adapter: identische Schnittstellen für Tests und einen später möglichen Pi-/Eigenserverbetrieb

### Zentrale Wahrheiten

`WorldRecord.memberships` bleibt die einzige persistente Wahrheit für menschliche Trainerzuordnung, `clubId` und `PLAYER`/`WORLD_ADMIN`. Firestore speichert diese Angaben bewusst nicht nochmals. Der Firestore-Teilnahmeindex ist nur ein rebuildbarer Lookup für die Regeln „maximal 5 aktive Welten je User“ und Weltlisten.

Globale Produktregeln dieses Blocks:

- maximal 1000 Weltslots,
- maximal 5 aktive Weltteilnahmen je User,
- Ersteller wird initial erster `WORLD_ADMIN`,
- weitere Weltadmins können nachträglich ernannt oder zurückgestuft werden,
- mindestens ein Weltadmin muss erhalten bleiben.

### Spielstandspeicherung

Der WorldRecord wird gzip-komprimiert gespeichert. Vollmatch- und Finance-Details der laufenden Saison werden nicht pro Match/Event als eigenes Cloudobjekt geschrieben, sondern pro abgeschlossenem Kalenderslot gebündelt. Ein Manifest zeigt atomar auf die aktuell gültige WorldRecord-Revision und die Current-Season-Segmente. Veraltete Revisionen werden über Generation/Revision abgewiesen. Alte WorldRecord-Snapshots werden nach erfolgreichem Commit entfernt; Current-Season-Detailsegmente der abgeschlossenen Saison werden erst nach erfolgreichem Saisonwechsel physisch bereinigt.

Damit wächst der Speicher nicht durch jede Autosave-Revision und die bestehende Trennung zwischen aktueller und historischer Wahrheit bleibt erhalten.

### Teststand

Der isolierte Backendtest `tests/run_kf_0_28_0_backend_persistence_foundation_test.js` bestand mit 20/20 Checks. Geprüft wurden u. a. Datenquellen-Trennung, 1000-Slot-Regel, 5-Welten-Limit, Weltadmin-Rollen, Adminberechtigung für Einladungen, Restart/Reload, Revisionskonflikte, Slot-Segmentierung, Speicherretention und Saisonwechsel.

Die bestehende Browser-Regressionssuite wurde in dieser Arbeitsumgebung nicht frisch ausgeführt; der Browser-Bundle wurde in KF_0.28.0 nicht verändert.


## 3. Historien-/Ressourcenumbau KF_0.26.0 und KF_0.26.1

Bisher blieben Matchobjekte vergangener Saisons trotz bereits vorhandener Reduktion weiter Teil der aktiven Welt. Dadurch wuchs jeder Spielstand Saison fuer Saison stark an. Das ist insbesondere mit Blick auf spaetere Serverpersistenz und viele moegliche Spielstaende unguenstig.

Gleichzeitig zeigte die Benutzeroberflaeche, dass Kabinenfieber aktuell gar keine vergangenen Einzelspiele mit altem Spielbericht erneut oeffnet. Historisch benoetigt werden vor allem Tabellen, Spielerstatistiken sowie Vereins-/Spielerprofile.

Deshalb gilt ab KF_0.26.0 bewusst:

### Laufende Saison

Seit KF_0.27.0 wird zwischen einem kompakten laufenden Matchindex und den Vollmatchdetails getrennt. `world.history.matches` behaelt nur die fuer laufende Statistik-/Sperr-/Form-/Wettbewerbslogik benoetigten kompakten Daten. Die vollstaendigen Matchdetails liegen getrennt im `CurrentSeasonMatchRepository` und werden fuer die Matchinfo bzw. den Spielbericht gezielt geladen.

Zentrale Quellen:

- kompakter laufender Index: `world.history.matches`
- Vollmatchdetails: `CurrentSeasonMatchRepository[worldId][season][matchId]`

### Abgeschlossene Saisons

Vollstaendige alte Matchobjekte werden nicht dauerhaft behalten. Stattdessen bleiben:

- Paarung und Ergebnis
- Saison/Wettbewerb
- Spieltag/Runde/Slot
- notwendige K.-o.-Metadaten
- historische Tabellen
- kompakte Spieler-Saisonstatistiken

Zentrale Quellen:

- `world.history.seasonResults`
- `world.history.seasonStandings`
- `world.history.playerSeasons`

Ein alter Spielbericht, Live-Ticker, detaillierter Taktikverlauf oder alte Situationskette muss nach Saisonabschluss nicht mehr rekonstruierbar sein.

Das ist eine bewusste Produktentscheidung, kein Datenverlust-Bug.

### Ergaenzung KF_0.26.1: Bonusdaten-Bereinigung

`world.history.bonusEvents` war bisher eine zweite, dauerhaft wachsende Liste fuer bereits gebuchte Spieler- und Transferpraemien. Im 0.25.6-Langlauf entstanden grob rund 250.000 Eintraege pro Saison, obwohl die tatsaechliche Geldbewegung bereits als `financeEvents` des jeweiligen Clubs vorlag.

Ab KF_0.26.1 gilt deshalb:

- bis KF_0.27.0 lag die echte finanzielle Buchung ausschliesslich in `world.clubFinances.byClub[clubId].financeEvents`; ab KF_0.27.1 liegt sie im `CurrentSeasonFinanceRepository`,
- praemienbezogene FinanceEvents tragen weiterhin einen stabilen `eventKey`,
- dieser `eventKey` verhindert Doppelzahlungen auch nach Save/Reload,
- Transferklauselzahlungen tragen denselben `eventKey` auf Ausgabe und korrespondierender Einnahme,
- die bestehende Mailcenter-Meldung bei einer fuer einen menschlichen Club relevanten Transferklausel bleibt erhalten und wird bei erneutem Idempotenz-Treffer nicht dupliziert,
- `world.history.bonusEvents` ist keine historische Wahrheit mehr und bleibt nur als leerer Legacy-Kompatibilitaetscontainer bestehen,
- der Runtime-Key-Set ist rein abgeleitet und wird beim Saisonwechsel neu aufgebaut bzw. verworfen.

Damit entsteht fuer Praemien keine zweite persistente Datenhaltung mehr. Alte 0.26.0-Spielstaende werden migriert; vorhandene aktuelle Transferklausel-Keys werden soweit erforderlich auf die entsprechenden FinanceEvents uebertragen, bevor der alte BonusEvent-Container geleert wird.

## 4. Welche Fussballgeschichte bleibt erhalten?

Die langfristig relevante Spielwelt soll auch nach vielen Saisons nachvollziehbar bleiben.

Dauerhaft erhalten werden:

- Abschlusstabellen je Saison
- Meister/Auf-/Absteiger ueber die bestehenden Tabellen-/Wettbewerbsdaten
- Pokal-/Fiebercup-Ergebnisse und Sieger
- kompakte historische Paarungen/Resultate
- Spieler-Saisonstatistiken
- daraus abgeleitete Karrierewerte
- Vereins-Saison-/Wettbewerbsstatistiken

Damit ist spaeter ohne neue Datenmigration zum Beispiel eine historische Spielplanansicht moeglich. Ein alter Matchbericht wird dafuer nicht benoetigt.

## 5. Spielerhistorie

Ein wichtiger Befund vor KF_0.26.0 war, dass viele historische Spielerwerte direkt aus einzelnen Matchobjekten rekonstruiert wurden. Alte Matches konnten deshalb nicht einfach geloescht werden, ohne Spielerkarrieren zu zerstoeren.

KF_0.26.0 materialisiert deshalb pro Saison einen kompakten Spieler-Snapshot:

`world.history.playerSeasons[season].byPlayerId[playerId]`

Gespeichert werden unter anderem:

- Einsaetze
- Einsatzminuten
- Tore
- Vorlagen
- Karten
- Rating-Summe und Rating-Anzahl
- Team-des-Tages-Nominierungen
- Torwartwerte wie Zu-Null-Spiele/Gegentore
- Aufteilung nach Wettbewerb und damaligem Verein

Damit bleiben Spielerprofile und Karrierewerte auch dann erhalten, wenn die zugrunde liegenden Vollmatches entfernt wurden.

Seit KF_0.26.2 ist der Spielerlebenszyklus umgesetzt:

- Staerkeentwicklung wird an genau denselben zwei Stichtagen wie der Marktwert fortgeschrieben.
- `averageStrength` liegt im bestehenden Marktwerthistorieneintrag und ist der Durchschnitt der angezeigten Gesamtstaerke seit dem vorherigen Stichtag.
- Form, Fitness, Moral und alle bereits in der sichtbaren Gesamtstaerke enthaltenen Faktoren wirken dadurch auf den Halbserienwert.
- Der Marktwert am Stichtag nutzt dagegen bewusst den aktuellen sichtbaren Zustand und kann deshalb schneller auf eine Erholung oder ein Formtief reagieren.
- Einzel-Faehigkeiten werden nicht historisch gemittelt.
- Ruhestaendler werden kompakt in `world.history.retiredPlayers.byId` archiviert und aus der aktiven Spielerwahrheit entfernt; Saisonstatistik, Transfers sowie Marktwert-/Staerkeverlauf bleiben in ihren bestehenden Historien.

## 6. Vorsaison-Kontext fuer die Simulation

Die Simulation benoetigt direkt nach einem Saisonwechsel noch einen kleinen Teil der Vorsaison:

- Gegneranalyse nutzt die letzten Spiele, Tore, xG, Angriffszonen und verwendete Taktiken.
- Teamchemie/Prognose benoetigt letzte eingesetzte Spieler bzw. Aufstellungen.

Deshalb gibt es:

`world.history.previousSeasonRecentContext`

Dieser Snapshot ist strikt begrenzt auf maximal die letzten fuenf relevanten Spiele je Club. Gemeinsame Matches werden nur einmal gespeichert und ueber Schluessel referenziert.

Wichtig: Dieser Snapshot ist abgeleitet und keine zweite persistente Historienwahrheit.

## 7. Saisonwechsel und Sicherheit

Die neuen historischen Daten werden vor dem Saisonwechsel aus den noch vollstaendigen Matches vorbereitet. Der bestehende fachliche Saisonwechsel laeuft danach vollstaendig durch. Erst wenn dieser erfolgreich abgeschlossen ist, werden die neuen historischen Daten committed und die alten Vollmatches entfernt.

Dadurch werden keine halbfertigen Saisonarchive erzeugt.

Der bestehende Saisonwechsel verarbeitet weiterhin unter anderem:

- Finanzen/Gehaelter
- Platzierungsbonus
- Lizenz
- Vertragsenden/Optionen
- Future Moves/Transfers
- Spielerlebenszyklus
- Kaderabsicherung
- Auf-/Abstieg
- Sponsoren
- neue Wettbewerbe und Spielplaene

## 8. Datenquellen-Regel - aktueller Stand

### Aktuelle Wahrheit

- Spieler: `world.players.byId`
- Kader/Aufstellung/Taktik: `world.squads`
- Kalender/Fixturestatus: `world.calendar.fixtures`
- kompakter Index abgeschlossener Matches der laufenden Saison: `world.history.matches`
- Vollmatchdetails der laufenden Saison: `CurrentSeasonMatchRepository[worldId][season][matchId]`
- kompakter Finanzzustand: `world.clubFinances.byClub`
- vollstaendiger laufender Finanzledger: `CurrentSeasonFinanceRepository[worldId][season][clubId][eventId]`
- aktuelle Spielervertraege: `world.players.byId[playerId].contract`
- Sponsorenvertraege: `world.sponsorContracts.byId`

### Historische Wahrheit

- kompakte Resultate: `world.history.seasonResults`
- Spieler-Saisonwerte: `world.history.playerSeasons`
- Abschlusstabellen: `world.history.seasonStandings`
- Marktwert- und Staerkeverlauf: `world.history.playerMarketValues`
- kompakte Ruhestaendleridentitaet: `world.history.retiredPlayers.byId`
- tatsaechlich gebuchte aktuelle Finanzereignisse inkl. Praemien-Idempotenz: `CurrentSeasonFinanceRepository[worldId][season][clubId][eventId]` mit `eventKey`
- `world.history.bonusEvents`: nur leerer Legacy-Kompatibilitaetscontainer, keine Wahrheit

### Ableitungen

Runtime-Indizes und Caches duerfen genutzt werden, sind aber nie persistente zweite Wahrheiten.

`previousSeasonRecentContext` ist ein bewusst begrenzter fachlicher Snapshot fuer die Simulation.

## 9. Messergebnis des neuen Historienmodells

In einer Regression wurden 180 echte Ligaspiele durch den normalen Kabinenfieber-Matchkern simuliert. Danach wurde genau der neue Historienpfad angewendet.

Historienrelevanter Payload der Stichprobe:

- Vollmatches: ca. 8,80 MB
- kompakte Ergebnisse + Spieler-Saisonwerte + Recent-Context: ca. 0,54 MB
- Reduktion: ca. 93,9 %

Die 180 Spiele stammen aus einer Liga ueber mehrere Spieltage. Dadurch wird der Fuenf-Spiele-Kontext realistisch begrenzt; fuer 18 Clubs blieben 45 gemeinsam referenzierte Recent-Matches.

Diese Zahl ist kein kompletter Welt-Save und keine direkte Hochrechnung auf 1000 Spielstaende. Andere Datenbloecke bleiben im Save enthalten.

## 10. Warum wir nicht einfach alle alten Matches behalten

Kabinenfieber soll langfristig serverfaehig werden. Bei bis zu vielen gespeicherten Welten ist entscheidend, dass eine aktive Welt nicht jede historische Simulationsrohdatenmenge permanent im RAM und bei jedem Save mitfuehrt.

Langfristig relevante Fussballgeschichte wird deshalb auf der passenden Aggregationsebene gespeichert. Die vollstaendige Matchsimulation ist nur fuer die laufende Saison erforderlich.


## 10a. Serverumbau KF_0.27.0 - Current-Season Match Store

Der reale 0.26.2-Langzeittest zeigte, dass der monolithische `WorldRecord` bereits am Ende der ersten Saison rund 550,9 MiB erreichte und `JSON.stringify(WorldRecord)` an die String-Grenze lief. Hauptverursacher waren die Vollmatches der laufenden Saison und die FinanceEvents.

KF_0.27.0 loest bewusst nur den Matchanteil:

1. Nach Abschluss eines Matches wird das volle Matchobjekt im `CurrentSeasonMatchRepository` unter Welt/Saison/Match-ID gespeichert.
2. Im `WorldRecord` bleibt nur `kf0270CompactCurrentMatch(...)` in `world.history.matches`.
3. Normale Tabellen-/Form-/Sperr-/Spielerstatistikpfade arbeiten mit diesem kompakten Index.
4. Die Spielinfo laedt das Vollmatch gezielt aus dem Repository und haengt es nicht dauerhaft wieder in den WorldRecord ein.
5. Beim Saisonwechsel erzeugt der bestehende 0.26-Historienpfad weiterhin `seasonResults`, `playerSeasons`, `seasonStandings` und den begrenzten Vorsaison-Kontext. Erst nach erfolgreichem Wechsel wird der Vollmatch-Store der alten Saison geloescht.
6. 0.26.2-Welten werden migriert, indem aktuelle Vollmatches in den Store verschoben und im WorldRecord durch kompakte Eintraege ersetzt werden. Historische alte Vollmatches werden nicht neu erfunden.

Datenwahrheit:

- Das Vollmatch existiert genau einmal im `CurrentSeasonMatchRepository`.
- `world.history.matches` ist ein kompakter aktueller Saisonindex und keine zweite Vollmatchwahrheit.
- Nach Saisonabschluss bleibt wie bisher nur die kompakte Historie dauerhaft erhalten.

Vollwelt-Messung Saison 1 (7.736 Matches):

- 0.26.2 WorldRecord vor Saisonwechsel: 550,9 MiB
- 0.27.0 WorldRecord vor Saisonwechsel: 206,4 MiB (-62,5 %)
- kompakter Matchindex: 45,2 MiB
- separater Vollmatch-Store: 388,7 MiB
- kombinierte physische Datenmenge: 595,1 MiB (ca. +8 % gegenueber dem alten Monolithen)
- WorldRecord nach Saisonwechsel: 69,8 MiB
- Vollmatch-Store nach erfolgreichem Saisonwechsel: leer

Die erste Segmentierungsphase optimierte vor allem den geladenen/serialisierten Weltzustand. KF_0.27.1 setzt dieses Prinzip nun fuer `financeEvents` fort.


## 10b. Serverumbau KF_0.27.1 - Current-Season Finance Store

KF_0.27.1 segmentiert den zweiten grossen Saisonmonolithen. Einzelne `financeEvents` liegen nicht mehr im WorldRecord. `world.clubFinances.byClub[clubId]` behaelt nur den fuer laufende Berechnungen benoetigten kompakten Zustand mit Startsaldo, aktuellem Saldo, Eventanzahl, kleinen Summen nach Buchungstyp sowie Lizenz-/Sanktionsdaten.

Vollstaendige Buchungswahrheit der laufenden Saison:

- `CurrentSeasonFinanceRepository[worldId][season][clubId][eventId]`

Die Buchungslogik wurde nicht neu erfunden. Gehaelter, Sponsoren, Transfers, Praemien und Lizenzberechnungen erzeugen dieselben fachlichen Ereignisse. `eventKey` bleibt der Idempotenzanker fuer bereits verarbeitete Praemien.

Beim Saisonwechsel bleibt der alte Ledger bis zur Uebernahme des Schlussbestands erhalten. Erst danach wird der Ledger der abgeschlossenen Saison geloescht und fuer die neue Saison ein neuer Ledger aufgebaut.

Vollwelt-Messung Saison 1 (432 Clubs, 7.736 Matches):

- KF_0.27.0 WorldRecord vor Saisonwechsel: 206,4 MiB
- KF_0.27.1 WorldRecord vor Saisonwechsel: 81,7 MiB (-60,4 %)
- gegen KF_0.26.2: -85,2 %
- separater Finance-Store: 124,2 MiB / 256.810 Events
- separater Vollmatch-Store: 389,5 MiB
- kombinierte physische Daten: 595,4 MiB
- WorldRecord nach Saisonwechsel: 68,2 MiB
- alte Match- und Finance-Stores nach erfolgreichem Saisonwechsel: leer

Die physische Gesamtmenge wird damit nicht wesentlich kleiner. Fuer das Serverziel ist entscheidend, dass selten benoetigte Detaildaten nicht Teil des heissen WorldRecords sind.

## 11. Bisherige wichtige Fixbloecke 0.25.x

### KF_0.25.2

- inkrementelle Match-/Bonus-Runtimecaches
- zeitbudgetierter Kalendersimulations-Scheduler
- gedrosselte Fortschrittsanzeige
- deutliche Performanceverbesserung ohne Vereinfachung des Matchkerns

### KF_0.25.3

- KI-Aufstellungen wurden korrekt initialisiert, wenn `lineupMaskState` existierte, aber `playerPlacementById` fehlte
- bestehende Trainer-/Formationstypen werden genutzt
- kein versteckter menschlicher Aufstellungsvorteil mehr durch falsche KI-Positionszuordnung

### KF_0.25.4

- normaler Weiter-Pfad und Kalender-Schnellsimulation verwenden denselben Slot-Lifecycle
- Gehaelter, faellige Transfers/Future Moves und Optionspruefungen laufen auch bei Schnellberechnung korrekt
- Slot bleibt atomar; Abbruch beendet erst am sicheren Slotrand

### KF_0.25.5 / KF_0.25.6

- KI-Clubs fuellen freie Sponsorenslots automatisch
- alle zehn realen Sponsorenslots: 1 Haupt-, 2 grosse, 3 mittlere, 4 kleine Sponsoren
- Humanclub wird nicht automatisch kommerziell verwaltet
- KF_0.25.6 verdrahtete den Autofill im final aktiven Saisonwechsel und fuehrte einen abgeleiteten Sponsor-Runtimeindex ein

## 12. Finanzen - aktueller Befund

Nach den Sponsorfixes ist der fruehere Sponsorwegfall ab Saison 3 beseitigt. Die Finanz-Baseline-Regression unter KF_0.26.1 bleibt bestanden:

- Median neutraler operativer Saisonplanung ca. +0,164 Mio.
- ca. 86,6 % der Clubs innerhalb +/-2 Mio.
- Gehaltsbudgetauslastung der Startkader bleibt unter dem vorgesehenen Reservekorridor
- Lizenzschwellen und Platzierungsbonusregeln unveraendert

Die langfristige KI-Finanzstrategie bzw. unterschiedliche Club-Risikophilosophien ist weiterhin ein spaeterer KI-/Clubverwaltungsblock und wurde mit 0.26.1 nicht neu balanciert.

## 13. Mehrspielergrundsatz

- Countdown bedeutet Schnellberechnung.
- Waehlt ein Mensch beim eigenen Spiel Schnellberechnung oder laesst den Countdown verstreichen, uebernimmt der Co-Trainer die komplette Live-Verantwortung fuer dieses Match.
- In Mensch-gegen-Mensch-Spielen fuehrt der Live-Wunsch eines beteiligten Menschen dazu, dass das Spiel live laeuft.
- Wer Schnellberechnung gewaehlt hat bzw. den Countdown verstreichen liess, kann fuer dieses Match nicht spaeter live eingreifen.

Diese Regel wurde durch KF_0.26.1 nicht veraendert.

## 14. Was ist noch offen?

### Ressourcen / Servermigration

1. Historienverdichtung, BonusEvent-Bereinigung und Ruhestaendler-/Staerkehistorie sind bis KF_0.26.2 abgeschlossen.
2. KF_0.27.0 lagert die vollstaendigen Matchdetails der laufenden Saison aus dem WorldRecord aus; sie bleiben bis zum Saisonwechsel bei Bedarf lesbar.
3. KF_0.27.1 lagert zusaetzlich die FinanceEvents der laufenden Saison aus. Der heisse WorldRecord lag im realen S1-Volltest damit bei ca. 81,7 MiB statt 550,9 MiB in KF_0.26.2.
4. Naechster technischer Schwerpunkt ist die echte lokale Server-/API-Testumgebung mit weiterhin lokal testbarem Spielkern. Historische Saisonsegmente/Lazy Loading folgen nach Messung und Bedarf.
5. Weitere Historien- oder Gameplaybloecke werden nicht vorsorglich umgebaut.

### Gameplay / KI

Der groessere KI-Trainer-/Clubphilosophieblock bleibt geplant, wird aber nicht vor die technische Bereinigung geschoben.

## 15. Tests aktueller Stand KF_0.27.2

Die vorhandenen Core-/Finance-/Historien-/Sponsor-/Transfer-/Matchregressionen sowie die neuen 0.26.2-Spezialtests sind bestanden.

Bestanden sind insbesondere:

- Historienverdichtung inkl. 0.25.x-Migration
- BonusEvent-Bereinigung inkl. 0.26.0-Migration und Save/Reload-Deduplizierung
- Match-, Saison-, Leih- und Transferklausel-Praemien ohne Doppelbuchung
- Transferklausel-Mail bei menschlicher Beteiligung bleibt erhalten und wird bei erneutem Key nicht dupliziert
- Stichprobe mit 180 echten KF-Matches: 0 `bonusEvents`, rund 5.400 aktuelle FinanceEvents mit `eventKey`
- Datenwahrheits-/Schema-Invarianten
- Saisonwechsel-Invarianten
- Source-/Architektur-/Multiworld-/Server-Foundation-Checks
- Marktwerthistorie
- Fixture-ID-Integritaet
- Nationaler Pokal
- Sperren
- Finanzen/Lizenz
- Verhandlungen
- Fixregressionen KF_0.25.1 bis KF_0.25.6

Ein kompletter Vollwelt-Saisontest im langsamen Node/VM-Harness wurde nicht als Release-Gate genutzt, weil dieser Harness in der aktuellen Umgebung fuer eine vollstaendige Welt extrem langsam ist. Die neue Struktur wurde stattdessen mit echten Matchobjekten sowie separaten Saisonwechsel- und Historienregressionen geprueft.

## 16. Spielerperspektive

KF_0.26.2 ist erstmals auch im Spielerprofil sichtbar:

- Marktwert- und Staerkeentwicklung lassen sich auf derselben Zeitachse nachvollziehen.
- Laengere Formtiefs/-hochs koennen den Marktwert glaubwuerdig beeinflussen; der aktuelle Stichtagszustand und der Halbseriendurchschnitt bleiben bewusst verschieden.
- Ruhestaendler bleiben historisch anklickbar, bieten aber keine irrefuehrenden aktiven Aktionen mehr.
- aktuelle Spielberichte und Matchdetails bleiben unveraendert.
- langfristig bleibt mehr technischer Spielraum fuer viele Saisons und Mehrspielerwelten.

Das entspricht dem Projektgrundsatz: Ressourcen sparen, ohne relevante Fussballgeschichte oder nachvollziehbare Entscheidungen zu opfern.


## 17. Repository-Neustart / Assets (nach KF_0.27.1)

- KF_0.27.1 bleibt die technische Spielbasis; der Repository-Neustart ist noch kein neuer Gameplay-Release.
- Die bestehende Dateistruktur bleibt zunaechst erhalten, damit lokale ZIP-Tests und GitHub Pages denselben Frontendpfad verwenden.
- Neue Werkzeuge: `tools/import_club_crests.js` und `tools/check_club_assets.js`.
- Vereinswappen werden einmalig ueber den normalisierten Vereinsnamen importiert und danach ausschliesslich ueber `clubId`/`crestAsset` referenziert.
- Die UI nutzt bei fehlendem Wappen weiterhin den vorhandenen Crest-Placeholder.
- Acht aktuelle Vereine aus Tuerkei 3 haben in der bereitgestellten Wappenquelle noch kein passendes Wappen und bleiben bis zur Nachlieferung im Fallback.
- Beim Audit des KF_0.27.1-Standes wurden fehlende club-spezifische Heim-/Auswaerts-PNGs sichtbar. KF_0.27.2 hat anschliessend geklaert, dass diese Dateien nur alte 1x1-Platzhalter waren und vollstaendig entfallen koennen, weil der Trikotdesigner die aktuelle Wahrheit ist.
- Die neue Sponsorenliste und Sponsorengrafiken werden bewusst **nicht** integriert; sie bleiben ein spaeterer eigener Funktionsblock.
- Lokale Save-/Serverdaten, `.env` und Import-Zwischenordner werden ueber `.gitignore` aus dem Repository gehalten.


## 18. KF_0.27.2 - Repository-/Asset-Bereinigung

KF_0.27.2 veraendert kein Gameplay. Die Version entfernt nachweislich obsolete Repository-/Assetreste, damit der neue GitHub-Stand nicht alte Wahrheiten weitertraegt.

- Vereinswappen bleiben unter `assets/clubs/<clubId>/crest.png` die einzige club-spezifische Bilddatei.
- `homeKitAsset` und `awayKitAsset` wurden aus DB3, StaticData und neuen Weltobjekten entfernt; alte Spielstaende verlieren diese zwei ungenutzten Legacy-Felder bei der Migration.
- Heim-/Auswaertstrikots werden aus den bestehenden Trikotdesigner-Daten und den gemeinsamen Bases/Masken unter `assets/kits` gerendert.
- alte 1x1-Trikotplatzhalter, tote Kit-Templates, doppelte Icons/Tiles und sonstige bestaetigte Altassets wurden entfernt.
- reproduzierbare Test-JSONs werden nicht mehr versioniert; die fachlichen Release-/Validierungsberichte bleiben erhalten.
- die groessere Doppelung unveraenderlicher Vereinsstammdaten zwischen StaticData und `world.clubs` ist bewusst **nicht** Teil dieses Fixes und bleibt ein spaeterer Strukturblock.
- Bei der Regression wurde ein Legacy-Migrationsrandfall korrigiert: noch eingebettete KF_0.26.0-FinanceEvents werden fuer die eventKey-Nachmigration gelesen, bevor der Ledger in den CurrentSeasonFinanceRepository verschoben wird.

Validierung KF_0.27.2: Kern-, Migrations-, UI-, Match-, Finance- und Mehrsaisontests bestanden. Der Trikotdesigner besitzt 20/20 Basisfarben, 5/5 Stilmasken und 3/3 Akzentmasken. Details: `reports/kf_0.27.2_validation_summary.md`.


## 19. KF_0.27.3 - Vereinswappen-Integration

- 424 der 432 aktuellen Vereine besitzen nun ihr echtes Wappen unter `assets/clubs/<clubId>/crest.png`.
- Google Drive ist nur Master-/Importquelle. Runtime-Wahrheit bleibt `clubId` + `crestAsset`.
- Runtime-Wappen wurden auf maximal 512×512 Pixel optimiert.
- Acht Tuerkei-3-Vereine bleiben bewusst beim bestehenden Fallback, weil die acht uebrigen Dateien im Quellordner nicht zu den aktuellen fiktiven Vereinen gehoeren.
- Keine Gameplay-, Simulations- oder Persistenzlogik wurde veraendert. `kf-core-0.27.2` und `kf-world-record-0.27.2` bleiben deshalb unveraendert.
