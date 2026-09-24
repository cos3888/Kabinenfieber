# KF_0.26.0 Validation Summary

## Ergebnis

Die gezielten 0.26.0-Regressionen und die relevanten bestehenden Kernregressionen sind bestanden.

## Historienverdichtung - synthetischer Integritaetstest

`tests/run_kf_0_26_0_history_compaction_test.js`

Geprueft wurden unter anderem:

- Vollmatches werden nach Saisonabschluss entfernt.
- kompakte Ergebnisse bleiben vollstaendig fuer Paarung/Resultat erhalten.
- keine Matchdetailpayloads in `seasonResults`.
- Spieler-Saisonaggregate werden materialisiert.
- Spielerprofil-, Wettbewerbs-, Ligaspieler-, Vereins-, ewige Tabellen- und Rankingwerte bleiben vor/nach Verdichtung identisch.
- Gegneranalyse und letzte bekannte Aufstellung bleiben ueber den begrenzten Recent-Context identisch.
- maximal fuenf Vorsaisonspiele je Club im Simulationskontext.
- 0.25.x-Migration verdichtet abgeschlossene Vollmatches automatisch.

Testdaten: 12 detailreiche Matchobjekte; Historienpayload 285.814 -> 45.879 Byte (ca. 84 % Reduktion in dieser synthetischen Stichprobe).

## Stichprobe mit echten Matchobjekten

`tests/run_kf_0_26_0_real_match_storage_sample_test.js`

180 Spiele aus einer realen Liga wurden durch den echten KF-Matchkern simuliert und anschliessend mit dem 0.26.0-Pfad verdichtet.

Ergebnis fuer den historienrelevanten Payload:

- Vollmatches: 9.227.101 Byte / ca. 8,80 MB
- kompakte Historie: 565.944 Byte / ca. 0,54 MB
- davon kompakte Ergebnisse: 75.324 Byte
- Spieler-Saisonaggregate: 271.342 Byte
- Recent-Context: 219.234 Byte
- Historienvorbereitung in dieser Stichprobe: 53 ms; Commit: <1 ms
- Reduktion: ca. 93,9 %
- Recent-Context: maximal 5 Spiele je Club; 45 gemeinsam referenzierte Matches fuer 18 Clubs

Die Stichprobe ist kein kompletter Welt-Save und keine direkte Hochrechnung auf 1000 Spielstaende. Sie belegt die Wirkung der neuen Matchhistorienstruktur.

## Weitere bestandene Regressionen

- `run_current_source_integrity_test.js`
- `run_architecture_guard_test.js`
- `run_current_multiworld_readiness_test.js`
- `run_current_server_foundation_test.js`
- `run_current_data_truth_invariants_test.js`
- `run_current_market_value_history_test.js`
- `run_fixture_id_integrity_test.js` (einzeln bestanden)
- `run_national_cup_test.js`
- `run_current_season_transition_invariants_test.js`
- `run_current_suspension_model_test.js`
- `run_current_finance_balance_licence_test.js`
- `run_current_negotiation_regression_test.js`
- Fixregressionen KF_0.25.1 bis KF_0.25.6

Hinweis: Ein kompletter realer Vollwelt-Saisontest im langsamen Node/VM-Harness wurde nicht als Release-Gate verwendet, weil dieser Harness fuer eine Vollsaison in der aktuellen Umgebung deutlich zu langsam ist. Stattdessen wurde die neue Struktur mit echten Matchobjekten plus separaten Saisonwechsel-/Datenwahrheitsregressionen geprueft.

## Bekannte offene Ressourcenpunkte

- `world.history.bonusEvents` bleibt unveraendert und waechst im Langlauf stark.
- Ruhestaendler bleiben derzeit als vollstaendige Objekte in `world.players.byId` erhalten.
- Server-/DB-seitiges Lazy Loading historischer Segmente ist noch nicht umgesetzt.
