# Architektur KF_0.25.4

KF_0.25.4 aendert keine persistierte Domainstruktur und keinen Matchkern. Der Fix zentralisiert den fachlichen Start eines Kalenderslots, damit normaler Fortschritt und Kalender-Schnellsimulation dieselben World-Mutationen ausfuehren.

## Gemeinsamer Slot-Start

`prepareCareerSlotLifecycle(world, slot)` ist die gemeinsame Eintrittsstelle fuer:

1. `runMidseasonMarketValuationIfDue(world, slot)`
2. Setzen von `world.calendar.currentSlotKey`
3. `applySlotSalaryExpenses(world, slot)`

Der vorhandene `applySlotSalaryExpenses`-Wrapper verarbeitet zusaetzlich bestehende fachliche Vorbedingungen wie Insolvenz-Mindestkader, Vertragsoptions-Deadline und faellige Future Moves. Dadurch wird keine zweite Schnellberechnungswahrheit erzeugt.

## Atomarer Abbruch

Vor Start eines Slots kann sofort abgebrochen werden. Nach Start des gemeinsamen Lifecycles wird der Slot fertig simuliert und committed; erst dann endet die Schnellsimulation. Matchresultate bleiben bis zum Slotabschluss gestaged.

## Datenwahrheit

- Spieler: `world.players.byId`
- Kader/Aufstellung/Taktik: `world.squads`
- Fixtures/Slotstatus: `world.calendar.fixtures` + `world.calendar.currentSlotKey`
- Matchhistorie: `world.history.matches`
- Bonus-/Vertragshistorie: `world.history.bonusEvents`
- Finanzereignisse: vorhandener Club-Finanzzustand

Keine neue persistente Datenquelle.

## Version/Schema

App-Version: 0.25.4. Persistierte Schemas bleiben `kf-core-0.25.1` und `kf-world-record-0.25.1`.
