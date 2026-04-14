# Kabinenfieber – DB5 Taktik v1

Dieses Paket enthält die festgezogene Taktikdatenbank für Kabinenfieber.

Inhalt:
- `src/db5_positions.js` – finale Positionen, Referenzslots, malusfreie Bereiche
- `src/db5_grid.js` – das feste Raster mit Slot-IDs und UI-Koordinaten
- `src/db5_formations.js` – alle aus der Excel übernommenen Standardformationen
- `src/db5_rules.js` – Maluslogik, Gruppenwechsel, Hilfsfunktionen
- `src/db5_state.example.js` – Beispiel für den laufenden Taktikzustand eines Vereins
- `docs/DB5_Beschreibung_fuer_dich.md` – menschlich lesbare Projektbeschreibung
- `docs/DB5_Beschreibung_fuer_ChatGPT.md` – technische Arbeitsbeschreibung für die Weiterentwicklung

Hinweis:
- Die Excel nutzte stellenweise `ZDM`. Im finalen DB5-Stand wird daraus durchgehend `DM`.
- Die finale Positionsliste lautet: `TW, LV, IV, RV, LM, DM, ZM, OM, RM, LF, ST, HS, RF`.
