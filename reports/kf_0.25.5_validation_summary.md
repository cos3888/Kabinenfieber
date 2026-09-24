# KF_0.25.5 Validation Summary

## Gezielte Regression

`tests/run_kf_0_25_5_fix_regression_test.js`: PASS.

Geprueft werden unter anderem:

- Versionsstand 0.25.5
- Autofill ist in der Saisonwechselpipeline nach dem Finanzreset verankert
- Humanclubs werden nicht automatisch aufgefuellt
- nach Vereinswahl haben KI-Clubs 10/10 reale Sponsorenslots
- nach Vertragsablauf werden alle KI-Slots erneut besetzt
- Standardlaufzeit zwei Saisons
- keine doppelten Sponsoren im Club
- Hauptsponsor-Exklusivitaet pro Land
- Sponsorzahlung entspricht den erzeugten Vertraegen
- idempotenter Wiederholungsaufruf
- Sponsor-Lifecycle bis Saison 10 ohne leere KI-Slots
- keine strukturelle Sponsor-Einnahmeninflation im 10-Saisons-Zieltest

## Finanzwirkung

Im gezielten S1-Test nach AI-Autofill (431 KI-Clubs, ein Humanclub):

- Median neutrale operative Basis: ca. +0,90 Mio. EUR
- P25: ca. +0,14 Mio. EUR
- P75: ca. +1,99 Mio. EUR
- rund 21 % der KI-Clubs weiterhin leicht negativ

Das gesamte KI-Sponsorvolumen blieb im gezielten Saison-1-bis-10-Test grob im Bereich 3,32 bis 3,36 Mrd. EUR je Saison.

## Bestehende Regressionen

Frisch bestanden wurden im 0.25.5-Arbeitsstand unter anderem Source Integrity, Architektur-/Servergrundlage, Multiworld-/Datenwahrheitspruefungen, Fixture-ID, Nationalpokal, Saisonwechsel-Invarianten, Sperren, Finanz-/Lizenzbaseline, Verhandlungen sowie die Fixregressionen 0.25.1 bis 0.25.5. Lange Tests wurden einzeln ausgefuehrt, weil die Node-/VM-Umgebung deutlich langsamer ist als der reale Browser.

## Langlaufgrenze

Der gezielte Sponsor-Lifecycle ist bis Saison 10 geprueft. Ein kompletter Weltlauf mit allen Matches ueber zehn vollstaendig gespielte Saisons wurde in dieser Toolumgebung fuer 0.25.5 nicht vollstaendig abgeschlossen und wird daher nicht als bestanden behauptet.

## Schema

App-Version: `KF_0.25.5`.
Persistierte Schemas: `kf-core-0.25.1`, `kf-world-record-0.25.1`.
