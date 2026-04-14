# Wiederherstellung DB5 für ChatGPT

## Zweck
DB5 ist die Taktikdatenbank. Sie ist die fachliche Wahrheit für Positionscodes, Referenzslots, malusfreie Slotbereiche, Raster-Slots, Standardformationen und Positionsbewertung.

## Dateistruktur
- `db5_positions.js`
- `db5_grid.js`
- `db5_formations.js`
- `db5_rules.js`
- `db5_state.example.js`

## Offizielle Positionscodes
TW, LV, IV, RV, LM, DM, ZM, OM, RM, LF, ST, HS, RF

## Referenzslots
- TW → `goal_basic_z`
- LV → `defense_basic_l`
- IV → `defense_basic_z`
- RV → `defense_basic_r`
- LM → `midfield_basic_l`
- DM → `midfield_def_z`
- ZM → `midfield_basic_z`
- OM → `midfield_off_z`
- RM → `midfield_basic_r`
- LF → `attack_basic_l`
- ST → `attack_basic_z`
- HS → `attack_def_z`
- RF → `attack_basic_r`

## Raster
- 41 feste Slots
- jeder Slot hat Gruppe, Ausrichtung, Lane und UI-Koordinaten

## Standardformationen
- 28 Formationen
- jede Formation enthält `id`, `label`, `occupiedSlots`, `positionMap`

## Bewertungsregeln
- Hauptposition = 1.00
- Nebenposition = 0.94
- Gruppenwechsel-Malus = 0.08
- Distanzkurve: 0→0.00, 1→0.08, 2→0.16, 3→0.24, 4→0.31, 5→0.38, 6→0.44, 7→0.49, 8→0.54, 9→0.58, 10→0.62, 11→0.66
- Torwart-Slot = Sonderfall

## Zusatzregeln im Projekt
- Spielfeldhintergrund unter `assets/ui/lineup/field_background.png`
- Linien als Overlay, nicht im Bild
- wenn keine Standardformation exakt passt, zeigt die UI `Individuell`

## Wiederherstellungsreihenfolge
1. Positionscodes und Slotbereiche anlegen
2. Raster-Slots anlegen
3. Formationen anlegen
4. Bewertungsregeln anlegen
5. Testen: 11 Slots pro Formation, gültige Referenzslots
