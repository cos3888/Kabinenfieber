# KF_0.25.2 Validation Summary

## Ergebnis

Der technische Fix fuer Runtime-Cache und Kalender-Scheduler ist automatisiert bestanden. Die fachliche Matchsimulation wurde nicht veraendert.

Der reale Firefox-Langlauf bis KW 52 bleibt als manueller Abnahmetest offen und ist fuer die Spielerperspektive entscheidend.

## Spezifische KF_0.25.2-Regression

`tests/run_kf_0_25_2_fix_regression_test.js`: PASS

Geprueft:

- Runtime/App-Version 0.25.2
- persistiertes Schema bleibt 0.25.1
- Zeitbudget-Scheduler statt starrem 8er-Batch
- 120-ms-Drosselung der Fortschrittsdarstellung
- identisches Runtime-Cacheobjekt ueber fortlaufende Match-Appends
- jedes kanonische Vereinsmatch genau einmal im Vereinsindex
- Bonus-Key-Set bleibt beim Append dasselbe Objekt
- Slotresultate werden weiterhin gestaged und erst beim Abschluss committed

## A/B-Performanceprobe

Gleicher 180-Fixture-Lauf in derselben Toolumgebung:

| Pfad | KF_0.25.1 | KF_0.25.2 |
| --- | ---: | ---: |
| Matchsimulation | ca. 2,56 s | ca. 2,44 s |
| Record-/History-/Bonuspfad | ca. 2,80 s | ca. 0,057 s |
| Summe | ca. 5,36 s | ca. 2,49 s |

Die Messung bestaetigt, dass die Verbesserung aus dem korrigierten Datenzugriff kommt. Der eigentliche Matchkern bleibt in derselben Laufzeitgroessenordnung.

## Frisch gepruefte Regressionen

PASS:

- Source Integrity
- Architecture Guard
- Multi-World Readiness
- Server Foundation
- Data Truth Invariants
- Market Value History
- Fixture-ID Integrity
- National Cup
- Season Transition Invariants
- Suspension Model
- Finance / Balance / Licence
- Negotiation Regression
- KF_0.25.1 Fix Regression
- KF_0.25.2 Fix Regression
- UI / Ownership Pipeline
- Data / Mail Integrity
- Report Consistency
- Match Feel

Der zentrale Sammelrunner sowie der separate grosse Mehrsaison-Test ueberschritten in der Toolumgebung das aeussere Laufzeitfenster. Diese Timeouts werden ausdruecklich nicht als PASS gewertet. Der gezielte Saisonwechsel-Invariantentest ist frisch bestanden; die bereits vorhandene Mehrsaisonlogik wurde durch KF_0.25.2 nicht fachlich veraendert.

## Noch manuell zu pruefen

Im echten Firefox:

1. neue Welt starten
2. Kalender-Schnellsimulation bis KW 52 Mitte
3. Gesamtzeit notieren
4. auf UI-Reaktion und Browser-Warnungen achten
5. Abbruch waehrend eines laufenden Slots testen
6. danach einen normalen Spielbericht/Statistik sowie den Kalenderstatus stichprobenartig pruefen
