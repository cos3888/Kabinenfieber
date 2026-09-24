# KF_0.25.6 Release Notes

KF_0.25.6 korrigiert die Integration des in KF_0.25.5 eingefuehrten KI-Sponsor-Lifecycles.

## Ursache

Die Sponsor-Funktion selbst war korrekt. Im Bundle existieren jedoch mehrere historische `advanceIntoNextSeason()`-Stufen. Der 0.25.5-Aufruf lag nicht in der spaeter tatsaechlich aktiven licence-aware Variante. Im echten Spiel wurden auslaufende KI-Vertraege daher ab Saison 3 nicht erneuert.

## Aenderung

- Sponsor-Autofill direkt im final aktiven `finance_new_season`-Schritt nach `resetFinanceForNewSeason()`.
- Humanclubs bleiben unangetastet.
- Bestehender Sponsoralgorithmus unveraendert.
- Neuer WeakMap-Runtimeindex fuer `sponsorContractsForClub()`; keine persistente zweite Datenhaltung.
- Keine Aenderung an Matchsimulation, Taktik, Aufstellung oder Finanzkalibrierung.
- Persistierte Schemas unveraendert.
