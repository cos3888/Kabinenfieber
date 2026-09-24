# KF_0.26.1 Validation Summary

## Ergebnis

Die gezielte Bonus-/Finanzdatenbereinigung ist bestanden. Die neue Version veraendert die Praemienberechnung nicht, sondern nur die persistente Deduplizierungsquelle.

## Gezielte KF_0.26.1-Regression

`tests/run_kf_0_26_1_bonus_event_cleanup_test.js`

Bestanden:

- Runtime/Schema `0.26.1`.
- Neuwelt hat leeren Legacy-BonusEvent-Container.
- Matchpraemien werden exakt einmal gebucht.
- Idempotenzschluessel liegen auf den echten FinanceEvents.
- Save/Reload verhindert dieselbe Matchpraemie erneut.
- Saisonpraemie wird exakt einmal gebucht.
- Leihpraemie wird korrekt 40/60 auf zwei FinanceEvents verteilt und nur einmal fachlich verarbeitet.
- Transferklausel schreibt denselben Key auf Ausgabe und Einnahme.
- Transferklausel-Mail bei menschlicher Beteiligung bleibt erhalten und wird bei erneutem Idempotenz-Treffer nicht dupliziert.
- Transferklausel wird nach Reload nicht doppelt gebucht.
- Alte 0.26.0-Transferklauselzahlung wird migriert; fehlender Key wird auf beide FinanceEvents uebertragen; BonusEvent-Liste wird geleert.

## 180-Match-Stichprobe

`tests/run_kf_0_26_0_real_match_storage_sample_test.js` unter aktuellem Runtime-Stand:

- Spiele: 180
- Simulationszeit im letzten Test: ca. 3,61 s
- `bonusEvents`: 0
- FinanceEvents mit `eventKey`: 5.395
- Vollmatch-Payload: 9.121.688 Byte (~8,70 MB)
- kompakte Historie: 566.063 Byte (~0,54 MB)
- Historienreduktion: ca. 93,8 %

Damit zeigt die reale Stichprobe, dass die neue Match-/Saisonhistorie aus KF_0.26.0 unveraendert arbeitet und gleichzeitig die fruehere BonusEvent-Liste nicht mehr waechst.

## Vollstaendige Core-Regressionssuite

Der finale Lauf von `tests/run_current_regression_suite.js` ist vollstaendig bestanden: **21/21 Tests erfolgreich**.

## Weitere bestandene Regressionen im aktuellen Runtime-Stand

- `run_current_source_integrity_test.js`
- `run_architecture_guard_test.js`
- `run_current_multiworld_readiness_test.js`
- `run_current_server_foundation_test.js`
- `run_current_data_truth_invariants_test.js`
- `run_current_market_value_history_test.js`
- `run_fixture_id_integrity_test.js`
- `run_national_cup_test.js`
- `run_current_season_transition_invariants_test.js`
- `run_current_suspension_model_test.js`
- `run_current_finance_balance_licence_test.js`
- `run_current_negotiation_regression_test.js`
- Fixregressionen KF_0.25.1 bis KF_0.25.6
- KF_0.26.0 Historienverdichtung

Die Saisonwechsel-Invarianten blieben ohne Kader-/Vertrags-/Formationabweichungen. Die Finanzbaseline blieb stabil. Im letzten Lauf lag der Median bei ca. +0,164 Mio.; ca. 87,27 % der Clubs lagen innerhalb +/-2 Mio. des neutralen operativen Saisonergebnisses.

## Testgrenze

Ein neuer kompletter 10-Saisons-Vollweltlauf wurde fuer KF_0.26.1 nicht wiederholt. Die Aenderung ist eng auf die Bonus-Datenhaltung begrenzt und wurde stattdessen mit gezielten Idempotenz-/Migrationstests, einer realen 180-Match-Stichprobe sowie den bestehenden Kernregressionen abgesichert. Der bekannte Vollwelt-Node/VM-Harness bleibt in der aktuellen Umgebung sehr langsam.
