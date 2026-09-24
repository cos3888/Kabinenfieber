# KF_0.25.6 Validation Summary

## Gezielte Regression

`tests/run_kf_0_25_6_fix_regression_test.js`: PASS.

Geprueft:

- Version 0.25.6
- Sponsor-Aufruf in der final aktiven licence-aware Saisonwechselvariante
- Runtime-Sponsorindex entspricht der kanonischen Vertragshistorie
- echter kritischer S2 -> S3-Wechsel ueber `advanceIntoNextSeason()`
- 431/431 KI-Clubs danach 10/10 Sponsorenslots
- 4.310 S3-Neuvertraege im Test
- Humanclub in S3 weiterhin ohne Auto-Auffuellung
- keine Sponsor-Duplikate
- keine Hauptsponsor-Konflikte
- Sponsorzahlungen fuer neue S3-Vertraege vorhanden
- S4 ohne unnoetige Neuvertragswelle
- S5 erneuert den Zweijahreszyklus erneut vollstaendig

Der fokussierte VM-Integrationslauf benoetigte fuer den echten S2->S3-Saisonwechselschritt rund 3,5 s, nachdem sponsor-fremde teure Subsysteme testseitig gestubbt wurden.

## Weitere Regressionen

Source Integrity, Architektur, Multiworld-/Servergrundlage und Datenwahrheit wurden im 0.25.6-Arbeitsstand frisch bestanden. Weitere lange Gesamttests der Node-/VM-Umgebung sind nicht als vollstaendig neu bestanden zu behaupten, wenn sie das jeweilige Tool-Zeitfenster ueberschritten.

## Langlauf

Der komplette 10-Saisons-Weltlauf mit allen Matches wird nach diesem Integrationsfix erneut benoetigt. Der 0.25.5-Lauf wurde zu Recht abgebrochen, sobald die fehlende echte S3-Integration erkannt war.

## Schema

App-Version: `KF_0.25.6`. Persistierte Schemas: `kf-core-0.25.1`, `kf-world-record-0.25.1`.
