# KF_0.25.4 Release Notes

## Ziel

Reiner Finanz-/Kalender-Lifecycle-Fix. Keine neue Gameplayfunktion und kein Rebalancing des Matchkerns.

## Geaendert

- gemeinsamer `prepareCareerSlotLifecycle()` fuer normales Weiter und Kalender-Schnellsimulation
- Schnellsimulation bucht wieder regulaere Slot-Gehaelter und verarbeitet dadurch auch faellige Future Moves / Vertragsoptions-Deadline im selben fachlichen Pfad
- Abbruch nach bereits gestartetem Slot erfolgt erst am sicheren Slot-Rand
- Matchresultate bleiben bis zum Slotabschluss gestaged
- 12-ms-Scheduler und 120-ms-Progress-Drossel bleiben unveraendert

## Platzierungsbonus

Die vorhandene Endbuchung war bereits korrekt und wird nicht umgebaut. Neu abgesichert:

- Saison 1: Startkapital, kein vorab gebuchter Platzierungsbonus
- finaler Bonus aus endgueltigem Tabellenplatz
- Platz 1/5/12/18 exakt geprueft
- keine Doppelzahlung bei wiederholtem Endabschluss

## Finanzbaseline

432 Clubs: Median ca. +0,10 Mio. EUR; 86,8 % innerhalb +/-2 Mio. EUR; Deutschland Liga 1 Median ca. +0,41 Mio. EUR. Keine neue Einkommenskalibrierung.

## Datenquellen

Keine neue persistente Wahrheit. Persistierte Schemas bleiben `kf-core-0.25.1` / `kf-world-record-0.25.1`.
