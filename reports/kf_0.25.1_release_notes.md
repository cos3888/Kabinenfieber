# KF_0.25.1 Release Notes

## Zweck

KF_0.25.1 ist ein reiner Fix-, Performance- und Historienblock auf Basis von KF_0.25.0. Es wurden keine neuen Gameplay-Systeme und keine vereinfachte Matchsimulation integriert.

## Behobene Fehler

- Aufstellungsmenue: `ReferenceError: world is not defined` in `playerFieldAssignment()` beseitigt.
- Historische Bonuspruefung: wiederholte Vollscans von `world.history.bonusEvents` durch world-spezifischen Runtime-Key-Index ersetzt.
- Matchindex: neue Matches werden inkrementell an vorhandene Runtime-Indizes angehaengt.
- Fixture-Verknuepfung: vorhandene Matchlinks werden ueber `matchByFixtureId` statt Karriere-Vollscan geprueft.
- Saisonwechsel: abgearbeitete `pendingInsolvencies` werden entfernt und nicht spaeter erneut angewendet.
- Kaderintegritaet: normale KI-Clubs werden nach Future Moves technisch auf mindestens 22 Spieler abgesichert; aktive Insolvenzclubs bleiben im gesonderten Wiederaufbaupfad.

## Performance

- `recentMatchesForClub()` nutzt einen world-spezifischen Vereins-Matchindex.
- Saisonbezogene Minuten-/Einsatzpruefungen nutzen Saisonindizes.
- Der historische Matchindex bleibt bei einem reinen Saisonwechsel erhalten; nur Kalender-/Fixture-Indizes werden erneuert.
- Reale Slot-Gehaltsbuchung summiert direkt garantiertes `player.contract.salaryBase` inklusive Leihanteil, statt die komplette Vertragsprojektion aufzubauen.
- Kalender-Schnellsimulation verarbeitet bis zu acht Matches pro Browser-Tick; ein Slot wird weiterhin nur vollstaendig committed.
- Matchlokaler Bewertungs-Cache vermeidet identische Gruppenwertberechnungen innerhalb eines Matches und wird danach verworfen.

## Historienarchiv

Die aktuelle Saison behaelt volle Matchdetails. Beim Saisonwechsel werden Matches der abgeschlossenen Saison auf langfristig relevante Fakten reduziert.

Erhalten bleiben unter anderem:

- Ergebnis und Wettbewerb
- `matchStats` inklusive xG
- Aufstellungen
- `playerStats` inklusive Matchbewertungen, Einsatzminuten, Tore, Vorlagen und Karten
- Wechsel und Verletzungen
- wichtige Tor-/Karten-/Wechsel-/Verletzungsereignisse mit Minuten

Nicht dauerhaft mitgefuehrt werden der komplette alte Live-/Bericht-Rohdatenstrom, die Taktik-Timeline und reine Simulationsmetadaten. Alte Detailberichte koennen daher weniger zeigen als in der laufenden Saison, duerfen aber nie mehr behaupten als die archivierten Fakten hergeben.

## Datenquellen

Unveraendert zentral:

- `world.players.byId`
- `world.squads`
- `world.calendar.fixtures`
- `world.history.matches`
- `world.history.bonusEvents`
- `StaticData`

Runtime-Indizes sind abgeleitete, nicht persistente Caches.

## Langzeitmessungen waehrend der Entwicklung

Der erfolgreiche 5-Saisons-Abnahmelauf nach Historienarchiv und Kaderfix lief ohne Heap-Absturz. Gemessene Saisonzeiten inklusive Saisonwechsel lagen bei ungefaehr:

- S1 2:44,6
- S2 2:51,2
- S3 3:04,0
- S4 3:17,5
- S5 3:17,6

Die Save-Schaetzung wuchs dabei ungefaehr linear auf 163 / 290 / 419 / 549 / 669 MB. Die Matchsimulation selbst wurde im spaeteren Phasenprofil nicht langsamer (ca. 117,3 / 117,7 / 116,3 Sekunden fuer S1-S3); der wachsende Rest lag vor allem im separaten Saisonwechsel-Verwaltungsblock.

## Bewusst nicht Teil von KF_0.25.1

- neuer KI-Trainer / intelligente Kaderplanung
- Saisonwechsel-Ladebalken (vorgemerkt)
- echter Server / Datenbank / Login / Lobby
- serverseitiges Lazy Loading alter Saisonarchive
- neue Gameplayfeatures
