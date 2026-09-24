# KF_0.25.3 Release Notes

## Zweck

KF_0.25.3 ist ein eng begrenzter Aufstellungs-/Initialisierungsfix auf Basis von KF_0.25.2. Es gibt kein neues Gameplayfeature und kein Rebalancing des Matchkerns.

## Anlass

Nach dem erfolgreichen Performance-Retest von KF_0.25.2 konnte eine Saison im Firefox wieder in unter einer Minute schnell simuliert werden. Gleichzeitig fiel ein aelterer sportlicher Fehler auf: Der menschlich uebernommene FC Auenring dominierte mehrere Saisons ohne Aufstellungs- oder Taktikeingriffe.

Die Analyse zeigte, dass bei neuen KI-Kadern `squad.lineupMaskState` bereits vorhanden sein konnte, waehrend `playerPlacementById` noch `null` war. Der Simulationspfad wertete diesen Zustand faelschlich als bereits initialisiert und fiel auf die rohe Reihenfolge von `squad.lineup` zurueck. Dadurch konnten Feldspieler im Matchkontext auf falschen Slots und insbesondere ein Nicht-Torwart im Tor landen.

Bei der menschlichen Vereinsuebernahme wurde die Aufstellungsmaske dagegen korrekt initialisiert. Dadurch entstand ein systematischer Vorteil fuer den menschlichen Verein.

## Korrektur

KF_0.25.3 korrigiert ausschliesslich die Bereitstellung der Aufstellung vor der Matchsimulation:

- `buildSimulatedLineup()` initialisiert die Aufstellungsmaske auch dann, wenn `lineupMaskState` existiert, `playerPlacementById` aber fehlt oder `null` ist.
- `ensureLineupMaskState()` und `optimizeSquadAssignmentsForClub()` verwenden das explizit uebergebene `world` statt versteckt `AppState.world`.
- Die bereits vorhandene, aus dem `coachTypeKey` abgeleitete Vereinsformation bleibt massgeblich. Es wird keine neue parallele KI-Aufstellungslogik eingefuehrt.
- Fuer positionsgerecht erzeugte Startkader gibt es einen leichten Fast-Path: exakte Hauptposition, danach Nebenposition. Nur wenn damit nicht alle Slots besetzt werden koennen, greift die bereits vorhandene detaillierte Positionsbewertung.
- Ein echter Torwart wird weiterhin explizit auf dem Torwartslot gesetzt.

Der Matchkern selbst (`simulateLeagueFixture`, Teamprofil, Situationen, Chancen, Tore, xG, Karten und Bewertungen) wurde fachlich nicht veraendert.

## Trainerlogik

Die Formation der KI kommt weiterhin aus der vorhandenen Trainerlogik:

- Verein besitzt `coachTypeKey`
- daraus entstehen `preferredFormationKey` / `defaultFormationKey`
- diese Formation muss im Favoriten-/Toleranzkorridor des Trainertyps liegen
- KF_0.25.3 sorgt nur dafuer, dass diese vorhandene Formation korrekt in die Simulationsaufstellung ueberfuehrt wird

Der spaetere grosse KI-Trainer-Block fuer intelligente Kaderplanung, Rotation, Transfers und weitergehende Matchentscheidungen bleibt davon getrennt.

## Datenquellen

Unveraendert:

- aktuelle Spieler: `world.players.byId`
- aktuelle Kader/Aufstellung/Taktik: `world.squads`
- Trainer-/Formationsregeln: `StaticData`
- Spielplan: `world.calendar.fixtures`
- historische Matchwahrheit: `world.history.matches`

Es entsteht keine zweite persistente Aufstellungswahrheit.

## Version/Schema

- App/Build: `KF_0.25.3`
- Fussball-Weltschema: weiterhin `kf-core-0.25.1`
- WorldRecord-Schema: weiterhin `kf-world-record-0.25.1`

Es ist keine Datenmigration notwendig.
