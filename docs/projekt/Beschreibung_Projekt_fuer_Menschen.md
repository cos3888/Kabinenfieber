# Kabinenfieber - Stand KF_0.31.4

## 1. Was ist Kabinenfieber?

Kabinenfieber ist ein Fussballmanager mit dem Ziel, sportlich nachvollziehbare Entscheidungen, glaubwuerdige Simulation und Wettbewerb zwischen menschlichen Spielern zu verbinden. Das Spiel soll auch mit nur einem menschlichen Trainer funktionieren; alle nicht menschlich gesteuerten Vereine muessen deshalb eine belastbare KI-/Clubverwaltung besitzen.

Grundsatz der Entwicklung: vorhandene Systeme zuerst sauber abschliessen und technisch tragfaehig machen, bevor weitere grosse Gameplayfeatures hinzukommen.

## 2. Aktueller Versionsstand

App-Version: `KF_0.31.4`

Persistierte Schemas:

- Fussballwelt/GameState: `kf-core-0.27.2`
- WorldRecord: `kf-world-record-0.27.2`

KF_0.26.0 begann den Historien-/Ressourcenumbau, KF_0.26.1 entfernte die redundante BonusEvent-Historie und KF_0.26.2 schloss Spielerlebenszyklus, Staerkehistorie und Ruhestaendler ab. KF_0.27.0 startete den Server-/Persistenzumbau mit ausgelagerten Vollmatches. KF_0.27.1 lagert nun auch die FinanceEvents der laufenden Saison aus dem monolithischen WorldRecord aus.



## KF_0.31.4 – Save Object Isolation & Existing World Integrity

KF_0.31.4 behebt einen reproduzierbar nachgewiesenen Cross-Instance-Race in der Object-Store-Persistenz. Gameplay, Matchsimulation, Balancing, Transfers und Mehrspielerregeln werden nicht veraendert.

### Bestaetigte Ursache

Vor dem Fix konnten zwei unabhaengige Serverinstanzen dasselbe Manifest mit Revision `R` lesen, beide fachlich auf `R+1` speichern und dabei identische deterministische Objektpfade verwenden. Genau ein Save gewann den Manifest-Generation-CAS. Der Verlierer konnte danach beim Cleanup aber denselben Objektpfad loeschen, auf den das Gewinner-Manifest bereits zeigte.

Der Vorher-Regressionstest reproduzierte den Schaden konkret:
- zwei unabhaengige `WorldPersistenceService`-Instanzen lasen dieselbe Revision;
- beide Management-Saves schrieben denselben `world-delta.json.gz`-Pfad;
- genau ein Manifest-CAS gewann;
- der Verlierer loeschte beim Cleanup das referenzierte Gewinnerobjekt;
- der folgende Cold Load scheiterte mit `PERSISTENCE_NOT_FOUND`.

Damit ist die Ursache fuer das Muster "Save scheitert und dieselbe Welt ist spaeter nicht mehr ladbar" technisch nachgewiesen.

### Save Object Isolation

Jeder Save-Versuch besitzt nun eine zufaellige technische Commit-ID. Neue staged Objekte liegen unter Pfaden der Form:

`worlds/<worldId>/revisions/<revision>/commits/<commitId>/...`

Current-Season-Match-/Finance-Segmente verwenden dieselbe Commit-ID in ihrem saisonalen Revisionspfad.

Zusaetzlich werden staged Objekte create-only mit `ifGenerationMatch: 0` geschrieben. Dadurch kann auch eine theoretische Commit-ID-Kollision kein bestehendes staged Objekt ueberschreiben.

Wichtig:
- die Welt-Revision bleibt die einzige fachliche/autoritative Revision;
- die Commit-ID ist nur technische Objektidentitaet und keine zweite Spielwahrheit;
- das Manifest bleibt die atomare Commit-Grenze;
- ein CAS-Verlierer entfernt ausschliesslich seine eigenen staged Objekte;
- keine stillen Last-Write-Wins;
- bestehende alte Objektpfade bleiben lesbar und benoetigen keine Migration.

Abgedeckt sind `initializeWorld()`, `commitWorldDelta()`, `commitSlot()`, `commitWorldRecord()`, `commitRuntimeSnapshot()` und `commitSeasonTransition()`. Die revisionsneutrale Compaction aus KF_0.31.3 behaelt ihren bereits eindeutigen Snapshot-Pfad und ihr Manifest-CAS-Modell.

### Read-only Integritaetsdiagnose

Neu ist `WorldPersistenceService.inspectWorldIntegrity(worldId)` sowie der authentifizierte Diagnoseendpunkt:

`GET /api/v1/worlds/<worldId>/integrity`

Er veraendert keine Welt. Geprueft werden insbesondere:
- Existenz des `worldRecordPath`;
- vorhandene/fehlende `worldDeltaPaths[]`;
- fehlende Matchsegmente;
- fehlende Financesegmente;
- `matchIndex`-Referenzen auf fehlende Objekte;
- Rekonstruierbarkeit des WorldRecord;
- Anzahl der vom Beginn an konsistent vorhandenen Deltas;
- GCS-Schutzstatus fuer Object Versioning und Soft Delete, sofern die Laufzeit die Bucket-Metadaten lesen darf.

Fehlende Deltas oder Segmente werden weder uebersprungen noch automatisch ersetzt. Es gibt keinen automatischen Rollback und keine erfundene Spielwahrheit.

### Bestehende problematische Welten / Recovery

KF_0.31.4 repariert vorhandene Welten nicht automatisch. Die produktiven Problemwelten bleiben wertvolle Diagnosefaelle und duerfen nicht geloescht oder still auf einen aelteren Stand gesetzt werden.

Die Diagnose kann nach Deployment feststellen, welche vom aktuellen Manifest benoetigten Objekte fehlen und ob der GCS-Bucket grundsaetzlich Object Versioning bzw. Soft Delete aktiviert hat. Ob fuer einen konkreten fehlenden Objektpfad noch exakt die richtige Generation wiederherstellbar ist, muss danach separat und read-only geprueft werden. Erst bei eindeutig belegbarer Wiederherstellbarkeit darf ein Reparaturweg geplant werden.

### Nachfix: speicherstabile Rekonstruktion grosser Welten

Der Praxistest mit Welt `123` (`world-mul8kohq-hyn9m0`, Revision 37) hat einen zusaetzlichen Ressourcenfehler sichtbar gemacht. Bei 512 MiB Cloud-Run-RAM brach der read-only Integrity-Check reproduzierbar mit `Reached heap limit / JavaScript heap out of memory` ab. Derselbe Stand war nach temporaerer Erhoehung nur des Testdienstes auf 1 GiB vollstaendig gesund und rekonstruierbar: 18/18 World-Deltas konsistent, keine fehlenden Match-/Finance-Segmente oder MatchIndex-Referenzen und 87/87 referenzierte Objekte vorhanden. Die Welt ist damit nicht als beschaedigt einzustufen.

Die Ursache der Memory-Spitze lag in `loadWorldRecordFromManifest()`: Der Basissnapshot wurde geladen und danach wurden alle World-Deltas zwar mit begrenzter Parallelitaet gelesen, aber vollstaendig dekodiert in einem Ergebnisarray gehalten, bevor das erste Delta auf den WorldRecord angewendet wurde. Dadurch blieben bei langen/grossen Delta-Ketten gleichzeitig viele dekodierte JSON-Objekte im Heap.

Ab diesem Nachfix gilt fuer die WorldRecord-Rekonstruktion:
- der Basissnapshot bleibt autoritative Basis;
- `manifest.worldDeltaPaths[]` bleibt die einzige geordnete Deltaquelle;
- World-Deltas werden strikt in Manifest-Reihenfolge jeweils `laden -> dekodieren -> anwenden`;
- bereits angewendete Deltaobjekte werden nicht in einem Sammelarray gehalten;
- Match-/Finance-Segmente und andere voneinander unabhaengige Reads duerfen weiterhin den vorhandenen begrenzt parallelen Pfad verwenden;
- keine Migration, keine automatische Reparatur und keine Aenderung der Spielwahrheit.

Ein neuer Regressionstest `tests/run_kf_0_31_4_large_world_memory_test.js` rekonstruiert 48 World-Deltas mit jeweils 2 MiB Payload unter einem auf 72 MiB begrenzten Node-Heap. Der erfolgreiche CI-Lauf benoetigte fuer Cold Load 854 ms, fuer den anschliessenden Integrity-Check 789 ms und meldete danach rund 19 MiB `heapUsed`. Damit ist die vorherige Delta-Sammelspitze gezielt abgesichert.

Die `MaxListenersExceededWarning` mit 11 `error/close`-Listenern auf `PassThrough` wurde ebenfalls untersucht. Sie stammt nicht aus einer eigenen Listener-Registrierung von Kabinenfieber, sondern entspricht dem offenen Upstream-Fehler `googleapis/google-cloud-node#9185` in `@google-cloud/storage` ab 8.0.1; der Fehler wurde upstream ausdruecklich auch fuer 8.2.0 reproduziert. Es wird **kein** Listener-Limit angehoben. Bis zu einem offiziellen Upstream-Fix wird `@google-cloud/storage` exakt auf die dort als nicht betroffene 8.0.0 gepinnt.

Der Produktivdienst blieb waehrend KF_0.31.4 unveraendert. Der Testdienst wird fuer den weiteren Entwicklungsbetrieb bewusst bei 1 GiB RAM belassen; ein Rueckbau auf 512 MiB ist kein offener Abschluss-Schritt mehr. Die reale grosse Welt `123` wurde auf dieser Konfiguration erfolgreich weitergespielt und zeigte keine erkennbare progressive Verlangsamung.

### Finaler Praxistest und Versionsabschluss

KF_0.31.4 wurde nach den technischen Regressionen auch praktisch erfolgreich verifiziert:
- Testbackend bleibt bei 1 GiB RAM;
- Welt `abc` ist nach dem finalen Pokalauslosungsfix wieder ueber den vorher blockierenden Stand hinaus weiterspielbar;
- grosse Welt `123` wurde erfolgreich bis mindestens Ende 35 weitergespielt;
- normale Slotwechsel waren nach dem Praxistest nach etwa 2-3 Sekunden wieder bedienbar;
- die serverseitige Speicherung lief danach typischerweise noch etwa 4-5 Sekunden weiter;
- `Weiter` blieb bis zur Serverbestaetigung gesperrt;
- ein Spieltag mit Schnellberechnung benoetigte ungefaehr 5 Sekunden bis zur Ergebnisdarstellung;
- es war keine erkennbare progressive Verlangsamung feststellbar.

Der finale Pokalauslosungsfix gilt fuer nationale Pokale und den Fiebercup: faellige Auslosungen werden autoritativ waehrend der Progression erzeugt und gespeichert, bevor ihre UI-Praesentation beginnt. Die Praesentation liest nur bereits gespeicherte Wahrheit und darf weder Fixtures noch Kalenderstand erzeugen oder veraendern. Dadurch kann ein Reload oder eine spaetere Praesentation keine zweite Kalenderwahrheit erzeugen.

Letzter verifizierter funktionaler HEAD vor dem reinen Dokumentationsabschluss:
`52e71747c0cee19b1f9030bc3eeece56520ea7af`

Finale Verifikation dieses funktionalen Stands:
- Fixbranch 32 Commits vor `main`, 0 dahinter;
- KF-0.31.4-CI gruen;
- GitHub Pages Build gruen;
- komplette aktuelle Core-Regressionssuite gruen;
- 45/45 Testskripte erfolgreich;
- authoritative Pokalauslosungs-Regression gruen;
- Large-World-Memory-Test gruen.

Der danach folgende Commit ist ausschliesslich Dokumentationsabschluss und darf keine funktionale Aenderung enthalten.

### Conflict-/Retry-UX

Die vorhandene Save-UX bleibt erhalten:
- Management-409 versucht weiterhin einen Rebase auf den neuen autoritativen Serverstand;
- ein nicht aufloesbarer Savefehler behaelt Dirty-State und expliziten Retry;
- Progression bleibt bis zur Klaerung gesperrt;
- bei einem Progressionskonflikt wird der neue autoritative Weltstand nachgeladen.

### Datenquellen

Unveraendert zentrale fachliche Wahrheit:
- Spieler: `world.players.byId`
- Kader/Aufstellung/Taktik: `world.squads`
- Kalender/Spielstatus: `world.calendar`
- historische Matchwahrheit: `world.history.matches` plus bestehende ausgelagerte Matchdetails
- aktuelle Finance-Wahrheit: bestehender kompakter Finanzzustand plus Current-Season-Finanzsegmente
- Memberships: `WorldRecord.memberships`
- Regeln/Texte: `StaticData`

Commit-ID, Basissnapshots, World-Deltas, Match-/Finance-Segmente und Compaction-Snapshots sind ausschliesslich technische Persistenzformen/Zugriffsstrukturen. Es entsteht keine zweite fachliche Datenhaltung.

### Regressionen

Spezialtests:
- `tests/run_kf_0_31_4_save_object_isolation_test.js`
- `tests/run_kf_0_31_4_large_world_memory_test.js`

CI-Workflow:
`.github/workflows/kf-0.31.4-regression.yml`

Geprueft werden unter anderem:
- parallele Management-, Slot-, Vollsnapshot-, Runtime-Snapshot- und Saisonwechsel-Saves aus unabhaengigen Persistenzinstanzen;
- genau ein Manifest-CAS-Gewinner;
- eindeutige und create-only staged Objektpfade;
- Verlierer-Cleanup zerstoert keine Gewinnerobjekte;
- Gewinnerwelt bleibt Cold-Load-faehig;
- Revision steigt genau einmal;
- Retry nach Konflikt;
- gesunde Welt sowie fehlender Basissnapshot, World-Delta, Match- und Financesegment;
- Legacy-KF_0.31.3-Layout ohne Migration;
- GCS-Recovery-Metadaten;
- normales Save/Compaction-Zusammenspiel und 12 Spieltage aus der KF_0.31.3-Regression;
- KF_0.31.0 bis KF_0.31.3;
- komplette aktuelle Core-Regression.

## KF_0.31.3 – Cold Load, Delta Compaction & Save Progress

KF_0.31.3 behebt die im Praxistest von KF_0.31.2 sichtbar gewordenen Persistenzprobleme bei grossen, laenger laufenden Spielstaenden. Die Fussballsimulation, das Balancing, Transfers und die Mehrspielerregeln werden dabei nicht veraendert.

### Ursache und Cold Load

Der aktuelle Weltstand bleibt fachlich ein einziger autoritativer `WorldRecord`. Seit KF_0.31.0 kann er technisch als Basissnapshot plus `worldDeltaPaths[]` gespeichert sein.

Vor KF_0.31.3 wurden alle Deltaobjekte beim Cold Load strikt nacheinander aus dem Object Store geladen. Bei einer laengeren Kette summierte sich deshalb insbesondere in Google Cloud Storage die Netzwerklatenz. Ein Save nach entladener Runtime musste diese komplette Kette zuerst rekonstruieren und konnte dadurch ebenfalls in den langsamen Fehlerpfad geraten.

Neu:
- Snapshot-/Delta-/Segmentinhalte koennen ueber einen Body-only-Lesepfad geladen werden; fuer unveraenderliche referenzierte GCS-Objekte ist kein zusaetzlicher Metadata-Request pro Objekt noetig.
- unabhaengige Deltaobjekte werden mit begrenzter Parallelitaet geladen; Standardwert ist 8 gleichzeitige Reads.
- die geladenen Deltas bleiben im Manifest-Array an ihrer urspruenglichen Position und werden danach weiterhin strikt in fachlich korrekter Reihenfolge auf den Basissnapshot angewendet.
- Current-Season-Finance-Segmente werden ebenfalls begrenzt parallel gelesen.
- bei Slot-/Runtime-Snapshots werden voneinander unabhaengige staged Objekte parallel geschrieben; die atomare Manifestgrenze bleibt unveraendert.

### Automatische Delta-Compaction

Die Standardschwelle liegt bei 64 `worldDeltaPaths`.

Ist die Schwelle erreicht, wird der bereits autoritativ rekonstruierte WorldRecord als neuer technischer Basissnapshot geschrieben. Danach wird das Manifest per Generation-CAS atomar auf den neuen Snapshot umgestellt und `worldDeltaPaths` geleert.

Wichtig:
- Compaction verbraucht keine Welt-Revision und veraendert keine Spielwahrheit.
- sie erzeugt keine zweite fachliche Datenquelle.
- ein konkurrierender Save kann nicht still ueberschrieben werden: veraendert sich das Manifest, scheitert die Compaction am Generation-CAS.
- bei einem Fehler vor dem Manifestwechsel bleibt das alte Manifest gueltig.
- der neu vorbereitete Snapshot wird bei fehlgeschlagenem Manifestwechsel wieder entfernt.
- alter Basissnapshot und alte Deltas werden erst nach erfolgreichem Manifestwechsel geloescht.
- ein technischer Compaction-Fehler darf einen bereits erfolgreichen fachlichen Save nicht nachtraeglich als Speicherfehler darstellen.

Bestehende KF_0.31.2-Welten benoetigen keine Migration. Ihre vorhandenen Basissnapshot-/Delta-Manifeste werden normal geladen und koennen beim Erreichen der Schwelle automatisch verdichtet werden.

### Save nach Cold Runtime

`WorldRuntimeManager` rekonstruiert eine entladene Welt weiterhin aus dem aktuellen Manifest. Danach laufen Management- und Slot-Saves in derselben per-Welt-Queue und mit derselben monotonen Revision wie zuvor.

Die neue Regression prueft ausdruecklich:
- Cold Runtime mit langer Delta-Kette -> Management-Save;
- Cold Runtime mit langer Delta-Kette -> Slot-Save;
- einen Spieltag-9-aehnlichen Slot-Pfad;
- korrekte Revision nach Save und revisionsneutrale Compaction;
- konkurrierenden/stalen Save waehrend einer Compaction.

### Weiter-/Save-Anzeige

Der Weiter-/Spiel-starten-Button zeigt jetzt im Button selbst einen phasenbasierten Fortschritt. Es werden keine zeitbasierten Prozentwerte erfunden.

Die sichtbaren Phasen sind:
- Änderung erkannt / wartet;
- wird gespeichert;
- Server bestätigt;
- gespeichert.

Die Fuellung stellt nur diese diskreten technischen Phasen dar. Bei einem Fehler gibt es keine Erfolgsfuellung; der Stand bleibt gesperrt und `Erneut versuchen` bleibt sichtbar. Der ergaenzende Statustext unter dem Button bleibt erhalten.

### Datenquellen

Unveraendert zentrale fachliche Wahrheit:
- Spieler: `world.players.byId`
- Kader/Aufstellung/Taktik: `world.squads`
- Kalender/Spielstatus: `world.calendar`
- historische Matchwahrheit: `world.history.matches` plus bestehende ausgelagerte Matchdetails
- Memberships: `WorldRecord.memberships`
- Regeln/Texte: `StaticData`

Basissnapshots, World-Deltas und Compaction-Snapshots sind nur technische Persistenzformen derselben Weltwahrheit.

### Gemessene KF_0.31.3-Regression

Der CI-Test verwendet einen repräsentativen WorldRecord von 2.629.287 Byte, 96 World-Deltas und 12 ms kuenstliche Latenz pro Body-Read.

Gemessen im erfolgreichen CI-Lauf:
- komprimierte Groesse der 96 Test-Deltas zusammen: 14.363 Byte
- maximale parallele Object-Reads: 8
- Cold Load: 208 ms
- theoretische reine serielle Latenzuntergrenze fuer 96 Delta-Reads: 1.152 ms
- Compaction: 245 ms
- Cold Runtime -> Management-Save: 148 ms
- Cold Runtime -> Slot-Save: 144 ms

Ausserdem erfolgreich getestet:
- identischer autoritativer Zustand vor/nach Compaction;
- keine Revisionsaenderung durch Compaction;
- fehlgeschlagene Compaction laesst alten Stand intakt;
- konkurrierender Save gewinnt sauber gegen stale Compaction;
- 12 aufeinanderfolgende Spieltage mit wiederholten Cold Runtimes/Compactions;
- KF_0.31.0-, KF_0.31.1- und KF_0.31.2-Regression;
- komplette aktuelle Core-Regression-Suite.

Spezialtest: `tests/run_kf_0_31_3_cold_load_compaction_test.js`.


## KF_0.31.2 – Lobby State & UI Save Integrity

KF_0.31.2 ist ein kleiner Nachfix auf KF_0.31.1 nach dem ersten Praxistest. Matchbalancing, Ergebnisentstehung und die eigentliche Fußballsimulation werden nicht verändert.

### Weltenliste / Vereinsstatus

Die fachliche Wahrheit der Vereinszuordnung bleibt ausschließlich `WorldRecord.memberships`. Die Lobby liest für Geschwindigkeit weiterhin einen abgeleiteten Metadata-/Firestore-Index.

Alte oder unvollständige Lobbyprojektionen werden jetzt gezielt repariert:
- bei Legacy-Projektionen ohne vollständige Projektionsmetadaten lädt `listWorlds` einmalig den autoritativen WorldRecord;
- `clubId`, Trainerrolle und Vereinsname werden daraus neu projiziert;
- beim Öffnen einer Welt wird die Projektion ebenfalls gegen die autoritative Membership synchronisiert.

Damit kann ein älterer Spielstand nicht mehr korrekt mit Verein laden, während die Weltenliste gleichzeitig fälschlich „Verein wählen“ anzeigt.

### Aufstellungssortierung

Die Sortierung der Aufstellungstabelle ist reine UI-Präferenz und keine Fußballwahrheit. Sie liegt deshalb nun ausschließlich in `AppState.ui.lineupSort` und `AppState.ui.lineupSortDir`.

`world.squads[clubId].lineupMaskState` enthält nur fachliche Aufstellungsdaten wie Formation und Spielerplatzierungen. Reines Sortieren erzeugt dadurch weder WorldDelta noch Autosave.

### Simulation

Die Matchsimulation bleibt unverändert. Ein zusätzlicher Regressionstest prüft jetzt ausdrücklich, dass bei einem menschlich gesteuerten Verein:
- die im `lineupMaskState.playerPlacementById` gewählte Startelf in `buildSimulatedLineup` landet;
- die aktuelle `world.squads[clubId].tactics` verwendet wird und nicht die KI-Trainer-Taktik.

### Datenquellen

- Vereinszuordnung: `WorldRecord.memberships` – einzige fachliche Wahrheit
- Aufstellung/Taktik: `world.squads`
- Sortierung/Filter: ausschließlich `AppState.ui`
- Lobby-Metadaten: abgeleitete, reparierbare Projektion; keine zweite Wahrheit

### Tests

Spezialtest: `tests/run_kf_0_31_2_lobby_ui_integrity_test.js`

Geprüft werden Legacy-Lobbyreparatur, Reparatur beim Weltöffnen, UI-only-Aufstellungssortierung, unveränderter GameState beim Sortieren, Übernahme der menschlichen Startelf/Taktik in den Matchkontext sowie das Fortbestehen der Save-/Progress-Anzeige aus KF_0.31.1.

## KF_0.31.1 – Save Queue & Progress UX

KF_0.31.1 schliesst den Persistenzblock aus KF_0.31.0 fuer normale Managementarbeit ab. Aufstellung, Taktik und andere Entscheidungen duerfen weiter bearbeitet werden, waehrend ein vorheriger Speicherpunkt im Hintergrund laeuft. Zeitfortschritt ist dagegen erst moeglich, wenn der neueste relevante Stand vom Server bestaetigt wurde.

### Speichermodell

Der lebende `gameState` bleibt die aktuelle Spielwahrheit. `KF029Remote.committedGameState` ist nur die technische ACK-Basis des zuletzt nachweislich serverbestaetigten Zustands und keine zweite fachliche Wahrheit.

Ein erfolgreicher Request bestaetigt nur das Delta, das dieser Request tatsaechlich gesendet hat. Aendert der Spieler den Live-Zustand waehrend des Requests weiter, bleiben diese neueren Aenderungen dirty und werden danach als Folgedelta gespeichert.

Schnelle Aufstellungs-/Taktikaenderungen werden gebuendelt. Nach kurzer Inaktivitaet oder beim Verlassen eines Managementmenues wird geflusht. Endgueltige Vertrags-, Transfer-, Sponsor- und Trikot-Apply-Entscheidungen gehen sofort in dieselbe serielle Save Queue.

Normale Managementaenderungen verwenden `PUT /api/v1/worlds/:worldId/management-delta`. Dieser Endpunkt schreibt nur ein WorldDelta und dieselbe Welt-Revision. Kalender-, Saison- und Matchhistorien-Pfade sind dort serverseitig gesperrt. Slot-/Spieltagfortschritt bleibt deshalb ausschliesslich beim bestehenden `/slot`-Commit mit Match-/Finance-Details und im Mehrspieler mit Progress-Lease.

### Ready / Weiter

Vor einem Ready-Request wird die Management-Queue vollstaendig geflusht. Eine alte Serverrevision kann nicht bereit gemeldet werden, waehrend lokal noch eine neue Aufstellung oder Entscheidung wartet.

Bei Dirty-, Save- oder Checkpoint-Zustand bleiben Menues bedienbar, aber der normale Weiter-/Spiel-starten-Button ist deaktiviert und entsaettigt. Die Bewegung auf dem Button ist bewusst nur ein indeterminierter Aktivitaetsindikator und kein erfundener Prozentwert. Bei einem Speicherfehler bleibt Fortschritt gesperrt und ein Retry ist moeglich.

### Checkpoint-Rennen

Aendert der Spieler im neuen Slot bereits etwas, waehrend der vorherige Slot-Checkpoint noch laeuft, wartet dieser Management-Save hinter dem Slot-Commit. Nach erfolgreicher Slotbestaetigung wird nur ein verbleibender Unterschied nachgespeichert.

Scheitert der Slot-Checkpoint, darf die wartende Management-Queue den unbestaetigten Kalenderstand nicht halb persistieren. Sie wird bis zum Checkpoint-Retry zurueckgestellt; der Server blockiert Progressionspfade am Management-Endpunkt zusaetzlich.

### Mehrspieler / Konflikte

Alle Saves verwenden dieselbe monotone Welt-Revision. Gleichzeitige Saves mit derselben Ausgangsrevision koennen nicht beide gewinnen. Bei 409 wird der aktuelle Serverstand geladen. Disjunkte lokale Pfade koennen auf die neue Revision rebasiert werden; wurde derselbe Pfad anderweitig veraendert, gibt es kein stilles Last-Write-Wins.

Die technische Regression misst den Cold Load der anwachsenden Delta-Kette bei 50, 100, 250 und 500 Management-Deltas. Dabei muss der Basis-WorldRecord unveraendert bleiben und der jeweils letzte autoritative Managementwert korrekt rekonstruiert werden.

### Zentrale Datenquellen

- Spieler/Vertraege: `world.players.byId`
- Kader/Aufstellung/Taktik: `world.squads`
- Transfers/Verhandlungen: `world.transferMarket` / `world.negotiations`
- Kalender: `world.calendar`
- historische Matchwahrheit: `world.history.matches` plus ausgelagerte Vollmatchdetails
- Regeln/Texte: `StaticData`

Save-Queue-Flags, Revision und `committedGameState` sind technische Synchronisationszustaende und keine konkurrierende Gameplay-Datenhaltung.

### Bedienzustände und Menüwechsel

Auch Mailzustände gehören zur Weltwahrheit: das Öffnen/Auswählen einer Mail kann den Lesestatus verändern und wird deshalb wie andere kleine Managementänderungen gebündelt gespeichert. Beim Schließen eines Modals sowie beim Verlassen relevanter Managementansichten wird ein vorhandener Dirty-State sofort der Save Queue zugeführt; die Navigation selbst bleibt dabei frei benutzbar.

Die Flush-Erkennung umfasst neben Aufstellung, Verträgen, Kaderplanung und Finanzen auch Büro und Kaderansicht, weil dort managementbezogene Modale und Mailzustände verändert werden können.

### Sicherheitsgrenze vor echtem Mehrspieler

Der Management-Endpunkt schützt bereits Progressionswahrheit serverseitig: Kalender, Meta und zentrale Ergebnis-/Historienpfade dürfen dort nicht verändert werden. Die Mitgliedschaft wird ebenfalls geprüft.

Noch nicht vollständig serverseitig erzwungen ist jedoch eine feingranulare Besitzprüfung, die für jeden generischen Delta-Pfad garantiert, dass Trainer A ausschließlich den fachlich zulässigen Bereich seines eigenen Vereins verändert. Vor offenem echtem Mehrspielerbetrieb muss diese Grenze durch pfadbezogene Ownership-Regeln oder schrittweise Domain-Commands geschlossen werden. Diese offene Sicherheitsgrenze ist keine zweite Datenwahrheit und wird in KF_0.31.1 bewusst nicht durch einen kurzfristigen parallelen Datenpfad umgangen.

### Mobile Vorbereitung

Dirty/Saving/Failed/Ready sind nicht an den Desktop-Button gekoppelt. Eine spaetere eigene Smartphone-Oberflaeche kann dieselbe Welt, API und Save Queue verwenden; es entsteht keine separate mobile Datenwahrheit.


## KF_0.31.0 – Authoritative Persistence & Progression Foundation

KF_0.31.0 beseitigt den monolithischen Slot-Save als dominanten Performanceengpass und legt die transaktionsfaehige Grundlage fuer gemeinsamen Multiplayer-Fortschritt. Die Fussballsimulation selbst, Matchlogik und fachliche Ergebnisentstehung bleiben unveraendert.

### Speichern

Normale Kalender-/Spieltag-Checkpoints senden nicht mehr den kompletten `WorldRecord`. Der Browser haelt einen Snapshot des zuletzt serverbestaetigten `gameState` und erzeugt daraus ein validiertes `kf-world-delta-0.31.0`.

Der Delta-Vertrag:
- darf ausschliesslich Pfade unter `gameState` aendern;
- darf keine Membership-, World-ID- oder Auth-Wahrheit ueberschreiben;
- wird serverseitig validiert und auf die autoritative Runtime angewendet;
- wird als eigenes gzip-Objekt im Revisionsbereich gespeichert;
- wird im Manifest ueber `worldDeltaPaths` in Commit-Reihenfolge referenziert.

Ein normaler Slot schreibt damit:
- World-Delta;
- neue/veraenderte Matchdetails;
- neue/veraenderte FinanceEvents;
- anschliessend atomar den neuen Manifeststand.

Vollsnapshots bleiben fuer Welterstellung, Saisonwechsel, Migration und Kompaktierung erhalten. Bei einem solchen Snapshot werden vorherige Delta-Pfade verworfen und der neue Snapshot wird wieder Basis der Welt.

Persistenzschema Object Store: `kf-storage-0.31.0`.

### Laden

Cold Load rekonstruiert den aktuellen WorldRecord aus:
`Basis-WorldRecord + worldDeltaPaths`.

Vollmatches der laufenden Saison werden beim Weltstart nicht mehr komplett geladen oder uebertragen. Das Manifest pflegt einen kleinen `matchIndex` von Match-ID auf Segmentpfad. Erst beim Oeffnen einer Spielinfo wird genau das benoetigte Vollmatch ueber einen autorisierten Match-Endpunkt geladen.

FinanceEvents werden in diesem Block beim Cold Load weiterhin rekonstruiert, weil laufende Finanzlogik, Bonus-Idempotenz und fortgeschriebene Events wie `salaryExpenseSeason` derzeit noch den aktuellen Ledgerzustand benoetigen. Eine spaetere Finance-Lazy-Stufe darf erst erfolgen, wenn dafuer ein fachlich vollstaendiger kompakter Sync-State existiert.

### Lobby

Die Lobby liest keine kompletten WorldRecords mehr. Firestore/File-Metadata enthalten eine kleine abgeleitete Lobby-Projektion:
- aktuelle Saison;
- maximale Trainer-/Vereinskapazitaet;
- Clubnamen fuer die Anzeige;
- Trainer-ID;
- Club-ID;
- Rolle;
- Anzeigename.

Diese Projektion ist keine zweite fachliche Wahrheit. Die kanonische Membership bleibt im WorldRecord; die Projektion dient nur der schnellen Lobbydarstellung und kann aus der Welt rekonstruiert werden.

### Multiplayer-Progression

Ready-/Countdown-Zustand liegt ausserhalb des grossen WorldRecords in einer kleinen transaktionsfaehigen Progression-Entitaet:
- `revision`;
- `readyUserIds`;
- `deadlineAt`;
- `status`;
- `leaseId`;
- `leaseExpiresAt`.

Der erste Ready-Klick setzt die Deadline. Weitere Klicks fuegen nur Ready-IDs hinzu. Sind alle aktiven Trainer bereit oder ist die Deadline erreicht, kann genau eine Transaktion die Progress-Lease beanspruchen. Nur der Lease-Inhaber darf in einer Mehrspielerwelt den Slot committen. Nach erfolgreichem Commit wird der Progressionszustand auf die neue Revision zurueckgesetzt.

Der aktuelle Browser pollt waehrend des Wartens klein gegen den Ready-Endpunkt und zeigt `x/y Trainer bereit · mm:ss`. Damit funktioniert Countdown-Fortschritt, solange mindestens ein beteiligter Browser aktiv ist. Ein serverseitiger Hintergrundtrigger fuer Welten ohne aktive Clients ist in KF_0.31.0 noch nicht Bestandteil der Umsetzung und muss vor dem vollstaendigen asynchronen Multiplayerbetrieb ergaenzt werden.

### Zentrale Datenquellen

- aktuelle Spieler: `world.players.byId`
- Kader/Aufstellung/Taktik: `world.squads`
- Spielplan/Status: `world.calendar`
- kompakte laufende Matchergebnisse: `world.history.matches`
- Vollmatches: CurrentSeasonMatchRepository/GCS-Segmente
- kompakter Finanzzustand: `world.clubFinances.byClub`
- Finance-Ledger: CurrentSeasonFinanceRepository/GCS-Segmente
- Membership-Wahrheit: `WorldRecord.memberships`
- Lobby-Projektion: Metadata Repository, abgeleitet
- Ready/Deadline/Lease: Metadata Repository/Firestore Progression
- Regeln/Texte: `StaticData`

Doppelte fachliche Datenhaltung entsteht nicht. World-Deltas, Lobby-Projektionen, MatchIndex und Client-Sync-Indizes sind technische Persistenz-/Zugriffsstrukturen und keine eigene fachliche Wahrheit.

Pflichtregression: `tests/run_kf_0_31_0_authoritative_persistence_progression_test.js` plus komplette bisherige Regression-Suite.


## KF_0.30.1 – Delta-Korrektheit & Match-Delta-Performance

KF_0.30.1 ist der erste Performance-Fixblock nach dem Benchmark auf KF_0.30.0. Die Fussballsimulation, Matchengine und fachliche Spielwirkung bleiben unveraendert. Der Block korrigiert ausschliesslich die Synchronisation ausgelagerter Match-/Finance-Details und vermeidet unnoetiges Parsen bereits bestaetigter Vollmatches.

Aenderungen:

- `kf029PendingMatches()` prueft zuerst nur die Match-IDs aus dem `CurrentSeasonMatchRepository` und laedt/parst danach ausschliesslich uncommitted Vollmatches.
- Finance-Commitzustand wird nicht mehr global nur nach `event.id` bestimmt. Technische Identity ist `seasonId + clubId + eventId`; zusaetzlich wird der vom Server bestaetigte Eventinhalt als temporaere Signatur gemerkt.
- Dadurch werden gleiche Event-IDs verschiedener Clubs getrennt behandelt und spaeter veraenderte Events desselben Clubs erneut uebertragen.
- Das ist insbesondere fuer die fortgeschriebene Gehaltsbuchung relevant: `salaryExpenseSeason` behaelt absichtlich dieselbe Event-ID, waehrend Betrag, letzter Slot und `slotsApplied` wachsen.
- Timeout-Recovery bestaetigt Finance-Deltas nur noch, wenn Identity **und Inhalt** im geladenen Serverstand uebereinstimmen.
- `WorldRuntimeManager` verwendet getrennte Merge-Regeln fuer Matches und Finance. Finance wird in warmer und kalter Runtime nach derselben club-/saisonbezogenen Identity kanonisiert; die neueste Segmentversion ersetzt die aeltere.
- Der grosse `/slot`-WorldRecord-Vollsnapshot bleibt bewusst unveraendert und ist der naechste groessere Performanceblock.

Zentrale Datenquellen bleiben unveraendert:

- Vollmatches aktuelle Saison: `CurrentSeasonMatchRepository[worldId][season][matchId]`.
- Finance-Ledger aktuelle Saison: `CurrentSeasonFinanceRepository[worldId][season][clubId][eventId]`.
- kompakter Finanzzustand: `world.clubFinances.byClub`.
- Runtime und `KF029Remote.committed*` sind nur technische Caches/Sync-Indizes und keine persistente fachliche Wahrheit.

Doppelte Datenhaltung: **nein**. Die Finance-Signatur speichert nur temporaer, welcher konkrete Ledgerzustand bereits serverseitig bestaetigt wurde.

Versionierung: Browser-/Service-Build `0.30.1`; der Remote/API-Vertrag bleibt `0.30.0`, weil Request-/Response-Schema und Endpunkte unveraendert sind.

Regression: `tests/run_kf_0_30_1_delta_correctness_performance_test.js` prueft Cross-Club-ID-Kollisionen, aktualisierte Same-Club-Events, Warm-/Cold-Gleichheit, Match-ID-Vorfilterung und exakte Finance-Recovery.

## KF_0.30.0 – Startbereich & Spielwelt-Lobby

KF_0.30.0 schliesst den Einstieg in Kabinenfieber als zusammenhaengenden Welt-Lifecycle ab. Nach dem Login ist die Spielwelt-Lobby die zentrale Startseite. Sie zeigt alle sichtbaren oeffentlichen Welten sowie die eigenen privaten Welten in einer Tabelle mit Slot, Name, Beschreibung, Saison, Teilnehmerzahl/Kapazitaet, Zugang, eigenem Status und kontextabhaengigen Aktionen.

Wesentliche Aenderungen:

- sichtbarer Zaehler `Aktive Welten: x / 5`; die Zahl wird aus dem Participation Index abgeleitet und nicht separat gespeichert.
- Filter fuer `Alle Welten / Meine Welten` sowie `Offen / Bewerbung / Einladung`.
- Weltbeschreibung ist Registry-Metadatum in Firestore/File-Metadata.
- offene Welten koennen direkt betreten werden; Bewerbungswelten speichern eine serverseitige Bewerbung, die World Admins annehmen oder ablehnen koennen.
- Austritt entfernt die eigene aktive Teilnahme. Ist der austretende Spieler der letzte Teilnehmer, wird die Welt vollstaendig geloescht.
- ein letzter World Admin mit weiteren Spielern muss vor dem Austritt die Administration an einen aktiven Mitspieler uebertragen.
- eine Welt mit weiteren aktiven Spielern kann nicht ueber die normale Loeschaktion entfernt werden.
- Weltloeschung entfernt Registry/Slot/Participation/Einladungen/Bewerbungen und den kompletten GCS-/Object-Store-Prefix der Welt; die Runtime wird vorher entladen.
- neue Welten werden lokal initialisiert, aber die Vereinsauswahl wird erst nach erfolgreicher serverseitiger Weltanlage freigegeben. Damit existiert kein spielbarer halbfertiger Create-Zustand mehr.
- die bestehende Vereinsauswahl bleibt erhalten. Bereits von anderen aktiven Memberships belegte Vereine werden aus `WorldRecord.memberships` abgeleitet, sichtbar als belegt markiert und clientseitig nicht auswaehlbar; die serverseitige Doppelbelegungspruefung bleibt autoritativ.
- Rueckkehr aus dem Spiel fuehrt zur Lobby, ohne den User auszuloggen.

Zentrale Datenquellen:

- User/Auth: bestehende Auth-Repositories.
- Weltname, Beschreibung, Slot, Visibility, JoinPolicy: World Registry / Metadata Repository.
- aktive Beteiligungen und 5er-Limit: Participation Index.
- Rolle, Trainername und Verein: `WorldRecord.memberships`.
- Welt-/Match-/Finanzzustand: bestehender WorldRecord/Object Store plus Current-Season-Segmente.
- Runtime ist Cache/Beschleunigung und keine persistente Wahrheit.

API-/Remote-Vertrag: Browser, Service und API stehen auf `0.30.0`, da Join/Apply/Leave/Delete/Application-Endpunkte neu hinzugekommen sind.

Regression: `tests/run_kf_0_30_0_start_lobby_world_lifecycle_test.js` prueft u. a. 5er-Limit, Freigabe eines Slots nach Loeschung, Direct Join, Austritt, Bewerbung/Annahme, Adminuebergabe, automatische Weltloeschung beim letzten Teilnehmer sowie Lobby-/Vereinsbelegungs-Invarianten.


## KF_0.29.6 – Takeover Creation Race Fix

Der Browser-Praxistest von KF_0.29.5 zeigte unmittelbar nach der Weltanlage, dass kein Verein uebernommen werden konnte. Cloud Run, Build und API wurden kontrolliert und liefen tatsaechlich auf KF_0.29.5 / API 0.29.5. Ursache war damit kein Deploymentfehler, sondern eine Race Condition im neuen schnellen Vereinsuebernahme-Pfad.

Aenderungen:

- der dedizierte `/club`-Commit bleibt bestehen; es gibt keinen Rueckfall auf den langsamen Vollsnapshot.
- `kf029CommitClubTakeover(...)` wartet zwingend auf eine noch laufende `KF029Remote.createPromise`.
- die fuer `/club` verwendete `expectedRevision` wird erst **nach** abgeschlossener Weltanlage gelesen.
- schlaegt die Weltanlage fehl, wird kein `/club`-Request gesendet und die lokale vorlaeufige Vereinszuordnung sauber zurueckgesetzt.
- waehrend die Vereinsuebernahme bereits laeuft, werden weitere Klicks abgefangen; der Button wird sichtbar deaktiviert.
- Browser-/Service-Build stehen auf `0.29.6`; der Remote/API-Vertrag bleibt `0.29.5`, da sich die Server-API nicht geaendert hat.

Zentrale Datenquelle bleibt `WorldRecord.memberships`; die Revisionswahrheit bleibt das serverseitige World-Manifest. `createPromise` ist ausschliesslich technischer Synchronisationszustand im Browser und keine persistente Spielwahrheit. Es entsteht keine doppelte Datenhaltung.

Regression: `tests/run_kf_0_29_6_takeover_creation_race_test.js` fuehrt den Takeover-Helper isoliert aus und prueft, dass vor Abschluss der Welterstellung kein `/club`-Request entsteht, danach die neu erzeugte Revision verwendet wird und ein fehlgeschlagener Create den Takeover vollstaendig verhindert.

Betriebshinweis aus der Fehlersuche: In der Cloud-Run-Oberflaeche wurde fuer die aktuelle Revision `max instances = 3` angezeigt. Projektregel bleibt **max instances = 1**, bis eine verteilte Lock-/Lease-Logik existiert; die Cloud-Konfiguration muss daher wieder auf 1 gesetzt werden.

## KF_0.29.5 – Progress Checkpoints & Save Performance

Der Praxistest von KF_0.29.4 zeigte: Simulation und Spieltag selbst liefen, aber Vereinsuebernahme und Kalenderfortschritt warteten sehr lange auf Server-Saves. Bei Save-Fehlern blockierte der globale Checkpoint-Zustand auch reine Navigation wie `matchday-next`, wodurch Kalender/Spieltag wie eingefroren wirkten.

Wichtige Korrektur zur Ursachenanalyse von KF_0.29.4: Die produktive Cloud-Run-Konfiguration ist weiterhin auf `max instances = 1` begrenzt. Der 0.29.4-Cachefix schuetzt damit einen realen kuenftigen Mehrinstanzfall, war aber nicht die Ursache der beobachteten Produktionsprobleme.

### Speichergrenzen

- gespeichert wird bei Welterstellung, bestaetigter Vereinsuebernahme und vollstaendig verarbeitetem Kalender-/Spieltag-Fortschritt.
- normale Managemententscheidungen wie Aufstellung, Taktik, Transfers oder Formularaenderungen loesen keinen Debounce-Server-Save mehr aus.
- beim Verlassen der Welt wird kein zusaetzlicher Vollsnapshot erzwungen; ungespeicherte Managementaenderungen seit dem letzten Fortschritts-Checkpoint koennen damit bewusst verloren gehen.

### Performancepfad

- Vereinsuebernahme nutzt einen kleinen `/club`-Request statt eines Browser-Vollsnapshots.
- Kalender-/Spieltag-Fortschritt nutzt `/slot` und `WorldPersistenceService.commitSlot(...)`.
- Vollmatch- und Finance-Details werden clientseitig gegen die zuletzt bestaetigten IDs differenziert; pro Checkpoint werden nur neue Details uebertragen.
- der komplette laufende Match-/Finance-Bestand wird nicht mehr bei jedem Spieltag erneut hochgeladen.
- `WorldSessionService.saveWorld()` fuehrt vor dem eigentlichen Save kein zusaetzliches `openWorld()` mit Vollkopie mehr aus.
- serverseitige Snapshot-/Slot-Pfade vermeiden vermeidbare JSON-Deep-Clones eingehender Requestdaten.
- der WorldRecord selbst wird in 0.29.5 weiterhin vollstaendig committed. Eine weitere Verkleinerung erfordert einen eigenen serverautoritativen Command-/Delta-Architekturblock und darf nicht durch unvollstaendige Teilfelder erkauft werden.

### Recovery und Bedienung

- Save-Requests haben einen endlichen Timeout.
- nach verlorener Save-Antwort prueft der Browser den committed Serverstand; ist der Club bzw. Slot bereits korrekt vorhanden, wird der Vorgang als erfolgreich reconciled statt doppelt geschrieben.
- ein laufender/fehlgeschlagener Save blockiert nur weiteren **Fortschritt**, nicht Ergebnisse, Statistiken, Team des Tages, Buero oder andere reine Navigation.
- der Retry-Dialog wird nicht mehr vorzeitig geschlossen; nach erfolgreicher Wiederholung wird er sauber beendet.

Zentrale Wahrheiten bleiben unveraendert: `WorldRecord.memberships` fuer User/Verein/Rollen, `world.calendar.fixtures` fuer Kalenderzustand, `CurrentSeasonMatchRepository` fuer Vollmatches und `CurrentSeasonFinanceRepository` fuer laufende Finanzereignisse. Keine neue persistente Doppelwahrheit. Der Remote/API-Vertrag ist mit den neuen `/club`- und `/slot`-Endpunkten auf `0.29.5` angehoben.

Regression: `tests/run_kf_0_29_5_progress_checkpoint_performance_test.js` prueft dedizierte Vereinsuebernahme, zwei aufeinanderfolgende Slot-Commits mit nur neuen Detaildaten, Rekonstruktion beider Slots nach Reload sowie die neue Browser-Sperr-/Autosave-Logik.

## KF_0.29.4 – Authoritative World Reload

Der reale Browser-Praxistest nach KF_0.29.3 zeigte weiterhin, dass eine erfolgreich gespeicherte Welt beim erneuten Oeffnen auf einen aelteren Stand zurueckfallen konnte. Die Ursache lag im serverseitigen Runtime-Cache: eine bereits geladene Runtime wurde ohne Vergleich mit der aktuell committed Manifest-Revision wiederverwendet. In einer Umgebung mit mehreren Backend-Instanzen konnte dadurch eine Instanz Revision N+1 speichern, waehrend eine andere Instanz weiterhin Revision N aus ihrem RAM auslieferte.

Aenderungen:

- `WorldRuntimeManager` prueft vor Wiederverwendung einer gecachten Welt die aktuelle Manifest-Revision.
- weicht die Runtime-Revision ab, wird die Runtime aus dem zuletzt committed Snapshot neu aufgebaut.
- WorldRecord, Current-Season-Matches und Current-Season-FinanceEvents werden fuer den Runtime-Reload nun aus **einem einzigen Manifest-Snapshot** geladen.
- der Runtime-Cache bleibt damit reine Beschleunigung und ist nie autoritativer als die persistierte Welt.
- der Remote-Vertrag bleibt `0.29.2`; das ist ein Server-/Ladefix und kein neues Multiplayer-API-Modell.

Zentrale Datenquelle bleibt unveraendert: committed Manifest + WorldRecord + CurrentSeasonMatchRepository + CurrentSeasonFinanceRepository. Vereinszuordnung bleibt ausschliesslich `WorldRecord.memberships`. Es entsteht keine doppelte persistente Wahrheit.

Neue Regression: `tests/run_kf_0_29_4_authoritative_world_reload_test.js` verwendet zwei voneinander getrennte `WorldRuntimeManager`-Instanzen mit demselben Persistenzspeicher. Instanz B cached zunaechst einen alten Stand, Instanz A committed anschliessend Vereinsuebernahme und Spieltag. B muss beim erneuten Oeffnen ohne explizites Unload jeweils auf die neueste Manifest-Revision wechseln und Club, Slot, Fixturestatus, kompakte Matchhistorie, Vollmatch und FinanceEvent gemeinsam korrekt laden.

## KF_0.29.3 – Backend Compatibility

Der 0.29.2-Praxistest zeigte beim Login sofort „Backend nicht erreichbar“, obwohl der gleiche Cloud-Run-Dienst vorher funktionierte. Ursache war die neue vorgeschaltete `/healthz`-Prüfung.

- Login, Session-Restore und Weltladen greifen wieder direkt auf die produktiven Auth-/World-Endpunkte zu.
- `/healthz` ist nur noch Diagnose und keine Zugangsvoraussetzung.
- Spielversion und Remote-Vertrag sind getrennt: `KF_VERSION = 0.29.3`, `KF029_REMOTE_CONTRACT_VERSION = 0.29.2`.
- Create/Save senden weiterhin `clientVersion`, aber mit der Remote-Vertragsversion statt der Spielversion.
- Ein kompatibles 0.29.1-Backend ignoriert dieses Feld; ein 0.29.2-Backend akzeptiert weiterhin den Vertrag `0.29.2`.
- Hard Checkpoints, Takeover-Commit, Save-Recovery und Weltlisten-Rückweg aus 0.29.2 bleiben unverändert.

Zentrale Datenquellen bleiben unverändert: committed `WorldRecord`, `WorldRecord.memberships`, CurrentSeasonMatchRepository, CurrentSeasonFinanceRepository sowie World Registry/Firestore. Es entsteht keine doppelte Datenhaltung.

## KF_0.29.2 – Save Integrity & World Navigation

Der zweite Browser-Praxistest zeigte zwei kritische Lücken: Nach Vereinsübernahme und absolviertem Spieltag konnte eine ältere committed Revision geladen werden, und ein fehlgeschlagener Flush beim Wechsel zur Weltliste wurde im Browser still geschluckt.

### Harte Persistenzgrenzen

- die Vereinsübernahme gilt im Browser erst nach erfolgreichem Servercommit als abgeschlossen; vorher wird nicht ins Büro gewechselt.
- schlägt der Commit der Vereinsübernahme fehl, wird die lokale `clubId` zurückgesetzt und die Vereinsauswahl bleibt aktiv.
- normaler Kalenderfortschritt und abgeschlossene Kalenderschnellsimulation sperren weitere Aktionen, bis der vollständig verarbeitete Stand serverseitig bestätigt wurde.
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


## Testauslieferung KF_0.32.0 (9. Oktober 2026)

Der stabile Spielcode auf main bleibt KF_0.31.4. Nur das Root-index.html auf main ist ein Test-Launcher. Dieser lädt CSS, StaticData, DB-Daten und das Frontend-Bundle gemeinsam aus dem unveränderlichen Feature-Commit `a68ae9ff71ea8928900549d9fe6b70d93d5912b5` über jsDelivr. Es gibt damit keine zweite 0.32-Codebasis auf main. Der öffentliche Testlink bleibt `https://cos3888.github.io/Kabinenfieber/`. Das Banner zeigt KF_0.32.0 / TESTBUILD / TESTBACKEND plus die Kurz-SHA. Backend-Ziel ausschließlich: `https://kabinenfieber-backend-test-458781449503.us-central1.run.app`.

Der Loader-Commit lautet `515dd004d329fa0d9f6efda3641bacaeea1c9147`. Der Pages-Deploymentstand und die aktuell laufende Testbackend-Version sind noch live zu verifizieren. Der PR #11 bleibt Draft und ungemergt, das Produktivbackend unangetastet, und das Testbackend bei 1 GiB. Keine Aussage zur Behebung von „Runde läuft“ vor erfolgreich nachgewiesenem Frontend-/Backend-Gleichstand. Nachfolgetests: Root-Seite und Ressourcen, Healthz 0.32.0, Auth-/Round-Endpunkte, Solospiel, Altwelt, neue Welt, Countdown, fester Zeitplan, Regressionen 0.31.2–0.32.0 und Spielerperspektive.
