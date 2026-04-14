# Sicherungsbeschreibung

## Was ist in dieser Version festgezogen

- Startmenü, Vereinsauswahl, Büro, Kader und Aufstellung nutzen die vorhandenen Masken
- Vereins- und Spielerprofile laufen als Popup-Fenster innerhalb der Menüs
- Gehaltsbudget wird als Restbudget aus `salaryBudget - Spielergehälter` berechnet
- Für die Vereinsauswahl wird immer nur die aktuell gewählte Liga erzeugt und gespeichert

## Warum nur die gewählte Liga gespeichert wird

Das hält die lokale Version klein und stabil.
So bleibt der Spielstand im Browser speicherbar und die Menüs reagieren schneller.

## Zentrale Wahrheit

- Vereinsstammdaten kommen aus DB3
- Startlogik ist an DB2 angelehnt
- Spielerwerte und Overalls sind an DB4 angelehnt
- Formationen und Feldraster kommen aus DB5

## Assets

Die feste Struktur steht in `ASSET_STRUKTUR.md`.
Neue Wappen und Trikots immer in den Vereinsordner mit der DB3-Club-ID legen.