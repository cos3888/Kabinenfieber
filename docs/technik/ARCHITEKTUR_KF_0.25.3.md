# Architektur KF_0.25.3

KF_0.25.3 aendert keine persistierte Domainstruktur und keinen fachlichen Matchkern. Der Fix liegt ausschliesslich im Aufstellungs-/Initialisierungspfad vor der Simulation.

## Zentrale Aufstellungswahrheit

Aktuelle Kader, Formation, Aufstellung und Taktik bleiben in `world.squads`. Aktuelle Spieler bleiben in `world.players.byId`. Trainer- und Formationsregeln stammen aus `StaticData`.

`lineupMaskState.playerPlacementById` ist Teil der vorhandenen aktuellen Squad-Struktur. Ein vorhandenes `lineupMaskState`-Objekt mit fehlendem oder `null`-Placement gilt nicht als fertig initialisierte Aufstellung.

## Initialisierung vor der Simulation

`buildSimulatedLineup()` ruft `ensureLineupMaskState()` auf, wenn:

- `lineupMaskState` fehlt oder
- `lineupMaskState.playerPlacementById` fehlt/null ist.

Die Formation wird ueber `currentSquadFormationKey(world, club)` aus der aktuellen Squad-/Vereinswelt bestimmt. Bei regulaeren neuen KI-Clubs entspricht sie der bereits vorhandenen, aus dem `coachTypeKey` abgeleiteten bevorzugten bzw. Default-Formation.

## Positionszuordnung

Fuer die positionsgerecht erzeugte Startelf verwendet `assignOutfieldPlayersToFormationSlotsFast()` einen leichten Pfad:

1. exakte Hauptposition zum Formationsslot
2. falls noetig passende Nebenposition
3. falls damit nicht alle Slots gefuellt werden, Rueckfall auf die bestehende detaillierte Funktion `assignOutfieldPlayersToFormationSlots()`

Der Torwart wird weiterhin explizit als echter `TW` auf `goal_basic_z` gesetzt.

Damit wird keine neue zweite KI-Aufstellungswahrheit aufgebaut. Die Funktion materialisiert nur die bereits in `world.squads` und der Trainerformation vorhandene aktuelle Wahrheit fuer den Simulationspfad.

## Multiworld

`ensureLineupMaskState()` und `optimizeSquadAssignmentsForClub()` verwenden das als Parameter uebergebene `world`. Ein versteckter Rueckgriff auf `AppState.world` in diesen Pfaden wuerde bei mehreren geladenen Welten falsche Daten koppeln und ist deshalb fuer diese Initialisierung nicht zulaessig.

## Matchkern

KF_0.25.3 veraendert nicht die fachliche Logik fuer Situationen, Chancen, Abschluesse, Tore, Paraden, Blocks, Karten, xG, Spielerbewertungen oder Matchereignisse. Geaendert wird die Qualitaet/Korrektheit des Eingabedatums Aufstellung, das der bestehende Matchkern erhaelt.

## Schema

App-Version: 0.25.3.
Persistierte Schemas bleiben `kf-core-0.25.1` und `kf-world-record-0.25.1`, weil keine gespeicherte Struktur geaendert wurde.
