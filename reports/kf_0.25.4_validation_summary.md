# KF_0.25.4 Validation Summary

## Ergebnis

KF_0.25.4 behebt den abweichenden Slot-Lifecycle der Kalender-Schnellsimulation, ohne den Matchkern oder persistierte Schemas zu aendern.

## Spezifische KF_0.25.4-Regression

`tests/run_kf_0_25_4_fix_regression_test.js`: PASS, 18/18 Checks.

Geprueft wurden insbesondere:

- Version/Build 0.25.4
- gemeinsamer Slot-Lifecycle fuer normales Weiter und Schnellsimulation
- regulare Gehaltsbuchung im Schnellpfad
- faelliger Future Move vor dem Match in beiden Pfaden identisch
- identische Matchresultate fuer denselben Vergleichsslot
- Abbruch erst am sicheren Slot-Rand, wenn der Slot bereits fachlich gestartet wurde
- vollstaendiger statt halber Slot-Commit
- Saison-1-Startkapital ohne vorab gebuchten Platzierungsbonus
- finaler Platzierungsbonus fuer Platz 1, 5, 12 und 18 exakt und jeweils nur einmal

Vergleichsslot im Test: `w7-middle`, 112 Fixtures.

## Finanzbaseline

`tests/run_current_finance_balance_licence_test.js`: PASS.

- 432 Clubs
- neutraler operativer Median: ca. +0,10 Mio. EUR
- ca. 86,8 % innerhalb +/-2 Mio. EUR
- Deutschland Liga 1 Median: ca. +0,41 Mio. EUR
- maximaler Startverbrauch des Basis-Gehaltsbudgets: ca. 92,6 %
- Laender-/Liga-Mediane bleiben innerhalb des vorhandenen Toleranzkorridors

Daher keine neue Einkommenskalibrierung in KF_0.25.4.

## Frisch bestaetigte Regressionen

PASS:

- Source Integrity
- Architecture Guard
- Multiworld Readiness
- Server Foundation
- Data Truth Invariants
- Market Value History
- Fixture-ID Integrity
- National Cup
- Season Transition Invariants
- Suspension Model
- Finance Balance / Licence
- Negotiation Regression
- KF_0.25.1 Fix Regression
- KF_0.25.2 Fix Regression
- KF_0.25.3 Fix Regression
- KF_0.25.4 Fix Regression
- Data / Mail Integrity
- Report Consistency
- Match Feel
- UI / Ownership Pipeline

Der grosse Mehrsaison-Gesamttest wurde fuer diesen Export nicht erneut vollstaendig ausgefuehrt; der Nutzer hat KF_0.25.3 zuvor bereits ueber mehrere Saisons im Browser getestet. Nach dem 0.25.4-Export ist deshalb ein erneuter realer Browser-Retest von Saisonstart bis etwa KW 52 sinnvoll, insbesondere fuer Laufzeit und Finanzbuchungen.

## Performance

Der 12-ms-Zeitbudget-Scheduler aus 0.25.2 bleibt unveraendert. Ein isolierter Entwicklungs-Microbenchmark fuer den neu gemeinsam genutzten Slot-Start ueber 432 Clubs lag in der Toolumgebung im Mittel bei rund 20 ms pro Slot. Das ist kein Browser-End-to-End-Benchmark, zeigt aber, dass die wiederhergestellte Finanz-/Vertragsverarbeitung den Slot-Start nicht in einen mehrsekundigen Block verwandelt.

## Schema / Datenwahrheit

App-Version: `KF_0.25.4`.

Persistierte Schemas bleiben bewusst:

- `kf-core-0.25.1`
- `kf-world-record-0.25.1`

Keine neue persistente Datenquelle und keine doppelte Datenhaltung.
