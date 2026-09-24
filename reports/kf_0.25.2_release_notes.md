# KF_0.25.2 Release Notes

## Zweck

KF_0.25.2 korrigiert ausschliesslich die Performance und Browser-Responsiveness der Kalender-Schnellsimulation aus KF_0.25.1. Es gibt keine neue Gameplayfunktion und keine vereinfachte Matchsimulation.

## Anlass

Im manuellen Firefox-Test benoetigte die Schnellsimulation vom Saisonstart bis etwa Ende KW 25 bereits rund sechs Minuten. Firefox zeigte wiederholt "Diese Seite antwortet nicht".

## Behobene technische Ursache

Der 0.25.1-Runtimecache verglich seine gespeicherte Laenge mit der bereits erweiterten kanonischen Historie. Beim anschliessenden Registrieren eines neuen Matches oder BonusEvents wurde dadurch der komplette Cache erneut aus der gesamten Historie aufgebaut.

Bei Matches konnte das gerade neu eingelesene Match danach ausserdem ein zweites Mal in den Vereinsindex geschrieben werden.

KF_0.25.2 erkennt append-only Wachstum desselben kanonischen Arrays und indexiert nur den neuen Bereich. Array-Austausch, Schrumpfen oder nicht fortsetzbare Historie fuehren weiterhin sicher zu einem Neuaufbau.

## Browser-Scheduler

Das starre 8er-Batching wurde durch ein Zeitbudget ersetzt:

- `KF0252_SIM_TICK_BUDGET_MS = 12`
- mindestens ein Match pro Tick
- Yield an den Browser, sobald das Zeitbudget erreicht ist
- Fortschritts-DOM/Debug-Ausgabe auf 120 ms gedrosselt

Der Slot-Commit bleibt atomar. `pendingSlot.stagedResults` wird erst nach vollstaendiger Berechnung des Slots ueber `recordPlayedMatch()` in die Historie geschrieben.

## Datenquellen

Unveraendert:

- `world.history.matches`
- `world.history.bonusEvents`
- `world.calendar.fixtures`
- `world.players.byId`
- `world.squads`
- `StaticData`

Runtime-Indizes sind nur abgeleitete Caches.

## Version/Schema

- App/Build: `KF_0.25.2`
- Fussball-Weltschema: weiterhin `kf-core-0.25.1`
- WorldRecord-Schema: weiterhin `kf-world-record-0.25.1`

Es ist keine Datenmigration notwendig.
