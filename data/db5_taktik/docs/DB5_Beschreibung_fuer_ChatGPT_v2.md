# DB5 – Taktikdatenbank  
## Beschreibung für ChatGPT / technische Weiterarbeit

## Zweck dieses Dokuments
Dieses Dokument erklärt nicht nur das Ergebnis, sondern auch die Herleitung von DB5, damit ein neuer Chat oder ein anderes Projekt den Stand sauber nachvollziehen und weiterführen kann.

DB5 ist die fachliche Taktikdatenbank für **Kabinenfieber**.

Sie deckt ab:
- Positionscodes
- Referenzslots
- malusfreie Positionsbereiche
- Rasterlogik
- Standardformationen
- individueller Aufstellungsmodus
- Regelwerk für Positionspassung
- taktischer Laufzeitzustand eines Vereins

DB5 deckt **nicht** ab:
- allgemeine Spielererzeugung
- Vereinsstammdaten
- Finanzen
- Transfermarkt
- Matchsimulation im Ganzen

---

## Projektkontext
Kabinenfieber arbeitet mit einem zentralen Datenbestand.  
Menüs sollen keine eigene Wahrheit erzeugen, sondern Werte aus den Datenbanken lesen oder sauber daraus ableiten.

Für die Taktik bedeutet das:
- Das Aufstellungsmenü ist eine Ansicht auf DB5
- Standardformationen und individuelle Aufstellungen greifen auf denselben Raster-Unterbau zu
- Positionsbewertung wird zentral aus DB5 abgeleitet

---

## Warum DB5 als eigene Datenbankgruppe
Im bisherigen Projektverlauf war Taktik fachlich zu wichtig, um nur als Nebenlogik in Spieler- oder Vereinsdaten zu hängen.

Deshalb wurde Taktik als eigene Datenbankgruppe definiert.

Ziele:
- Formationen sauber führen
- Raster und Positionslogik sauber führen
- Haupt-/Nebenposition getrennt von Aufstellung bewerten
- spätere Simulation auf taktische Daten aufsetzen

---

## Offizielle Positionscodes
Verbindlich festgelegt wurden diese 13 Positionen:

- TW
- LV
- IV
- RV
- LM
- DM
- ZM
- OM
- RM
- LF
- ST
- HS
- RF

Wichtige Festlegung:
- `DM` ist korrekt
- `OM` ist korrekt
- `ZDM` und `ZOM` sind nicht die offiziellen Zielcodes

Falls alte Dateien oder Rasterbeschriftungen abweichen, ist DB5 auf `DM` und `OM` zu normalisieren.

---

## Grundentscheidung: Raster statt künstlicher Positionsmatrix
Ein zentraler Punkt der Herleitung war die Frage, wie Positionsmalus berechnet werden soll.

Mögliche Wege waren:
1. starre Matrix „Position A auf Position B = x %“
2. frei definierte Nachbarschaften
3. Ableitung direkt aus dem vorhandenen Positionsraster

Festgelegt wurde Weg 3.

Begründung:
- Das Aufstellungsmenü zeigt bereits ein klares Raster
- Das Raster enthält Positionszuordnungen
- Dadurch kann die Taktiklogik direkt am Spielfeldmodell hängen
- So wird keine zweite, parallele Wahrheit geschaffen

Merksatz:
**Das Raster ist die führende Wahrheit für DB5.**

---

## Referenzslot-Logik
Jede Position besitzt einen Referenzslot.

Der Referenzslot ist der feste Ursprung für die Distanzmessung, wenn ein Spieler außerhalb seines malusfreien Positionsbereichs eingesetzt wird.

Die Referenzslots wurden im Excel-Raster visuell markiert und dann fachlich festgezogen.

### Verbindliche Referenzslots
- TW → `goal_basic_z`
- LV → `def_basic_l`
- IV → `def_basic_z`
- RV → `def_basic_r`
- LM → `mid_basic_l`
- DM → `mid_def_z`
- ZM → `mid_basic_z`
- OM → `mid_off_z`
- RM → `mid_basic_r`
- LF → `att_basic_l`
- ST → `att_basic_z`
- HS → `att_def_z`
- RF → `att_basic_r`

Die Namen können technisch anders benannt werden, die fachliche Logik bleibt dieselbe:
**Tor/Abwehr/Mittelfeld/Sturm + Ausrichtung + Seite.**

---

## Malusfreier Positionsbereich
Eine Position ist nicht nur ein einzelner Referenzpunkt, sondern ein Bereich.

Regel:
Alle Raster-Slots, die im Raster denselben Positionscode tragen, gehören zum malusfreien Bereich dieser Position.

Bedeutung:
- Hauptposition auf eigenem Bereich = kein Distanzmalus
- Nebenposition auf eigenem Bereich = kein Distanzmalus, aber Nebenpositions-Grundmalus bleibt

Diese Regel war wichtig, weil Positionen wie IV, ST oder ZM im Raster mehrere Slots belegen können.

---

## Hauptposition und Nebenposition
Ein Spieler besitzt:
- genau eine Hauptposition
- optional eine oder mehrere Nebenpositionen

### Basisfaktoren
Arbeitsstandard:
- Hauptposition = `1.00`
- Nebenposition = `0.94`

Diese Werte liegen in `db5_rules.js` als anpassbare Konstante und nicht fest verdrahtet in verschiedenen Dateien.

Wichtig:
Wenn ein Zielslot bewertet wird, werden Haupt- und Nebenpositionen geprüft.  
Es wird immer das **beste Gesamtergebnis** genommen.

Das bedeutet:
Eine Nebenposition kann einen Spieler auf einem entfernten Slot retten, wenn der Referenzslot dieser Nebenposition deutlich günstiger liegt als der der Hauptposition.

Beispiel:
- Hauptposition `RV`
- Nebenposition `LV`
- Zielslot `LF offensiv`

Dann wird sowohl über `RV` als auch über `LV` gerechnet, und das bessere Ergebnis gewinnt.

---

## Distanzlogik
Die Distanz wird nicht geschätzt und nicht pauschal geglättet, sondern direkt aus dem Raster bestimmt.

Regel:
Wenn ein Zielslot außerhalb des malusfreien Bereichs der besten geprüften Position liegt, wird die Anzahl der Raster-Schritte vom Referenzslot zum Zielslot gezählt.

Diese Schritte ergeben sich aus dem vorhandenen Rastermodell.

Wichtig:
- Der Zielslot ist konkret
- Seite, Linie und Ausrichtung zählen mit
- „Position“ als reiner Text reicht nicht aus

---

## Frühere Diskussion und finale Entscheidung zur Maluskurve
Es wurden mehrere Varianten diskutiert:

### Verworfen
Eine rein aufaddierte Eskalation wie:
- Schritt 1 = 6
- Schritt 2 = 8
- Schritt 3 = 10
- ...
und dann alles aufsummieren

Problem:
Extreme Fehlbesetzungen fielen zu schnell praktisch auf 0, z. B. `RV -> LF offensiv`.

### Festgelegt
Eine **abgeflachte Gesamt-Maluskurve je Schrittzahl**.

Begründung:
- kleine bis mittlere Abweichungen sollen früh schon spürbar sein
- extreme Fälle sollen sehr schlecht sein
- aber nicht unnötig mathematisch kaputt eskalieren

### Verbindliche Gesamt-Maluskurve
- 0 Schritte = 0 %
- 1 Schritt = 8 %
- 2 Schritte = 16 %
- 3 Schritte = 24 %
- 4 Schritte = 31 %
- 5 Schritte = 38 %
- 6 Schritte = 44 %
- 7 Schritte = 49 %
- 8 Schritte = 54 %
- 9 Schritte = 58 %
- 10 Schritte = 62 %
- 11 Schritte = 66 %

Technisch als Mapping hinterlegen, nicht als harte if-Kette.

---

## Gruppenwechsel-Malus
Zusätzlich zur Distanz wurde ein Gruppenwechsel-Malus festgelegt.

Feldgruppen:
- Abwehr
- Mittelfeld
- Sturm

Regel:
Wenn zwischen diesen Feldgruppen gewechselt wird, gibt es **einmalig** einen Zusatzmalus.

Arbeitswert:
- `0.08`

Wichtig:
- nicht mehrfach pro übersprungener Gruppe
- nicht kumulativ eskalieren
- Distanz bleibt Haupttreiber
- Gruppenwechsel markiert nur die fachliche Zusatzschwierigkeit

Diese Entscheidung wurde bewusst getroffen, damit die Distanzlogik nicht doppelt bestraft wird.

---

## Torwart-Sonderfall
Der Torwart wurde explizit aus der normalen Feldspielerlogik herausgenommen.

Begründung:
Ein Feldspieler im Tor kann nicht sinnvoll über `overall * positionsmalus` bewertet werden.  
Für den TW-Slot zählen Torwartfähigkeiten.

Daher gilt:
- TW-Slot = Sonderbewertung
- normale Feldspieler-Effective-Strength ist dort nicht maßgeblich

Für technische Weiterarbeit:
- Feldspieler auf TW-Slot separat bewerten
- bei Bedarf `goalkeepingProfile` oder abgeleitete TW-Werte aus DB4/Spielerlogik nutzen
- Torwart auf Feldslot kann später separat entschieden werden, ist für DB5 v1 aber nicht der zentrale Fall

---

## Standardformationen
Alle Standardformationen aus dem Raster/Excel sollen in DB5 integriert werden.

Regeln:
- Formationen speichern nur Slot-Belegungen
- Formationen speichern keine Spieler
- dieselbe Rasterstruktur muss sowohl Standardformationen als auch individuelle Aufstellungen tragen

Wichtige UI-Regel:
Sobald die aktuelle Belegung nicht mehr exakt einer Standardformation entspricht, ist der Modus:
- `individual`

Diese Logik orientiert sich direkt am vorhandenen Aufstellungsmenü.

---

## Laufender Taktikzustand eines Vereins
Neben den statischen Taktikdaten braucht DB5 auch Laufzeitdaten.

Dazu gehören:
- aktive Formation
- Modus `standard` oder `individual`
- Feldbelegungen
- Bankbelegungen
- Reserve
- gewähltes Preset

Diese Daten gehören nicht in die allgemeine Rasterdefinition, sondern in einen separaten Taktik-State pro Verein / Savegame.

---

## Empfohlene Dateiaufteilung
DB5 ist fachlich eine Datenbankgruppe, darf technisch aber auf mehrere Dateien verteilt werden.

### `db5_positions.js`
Enthält:
- Positionen
- Gruppenzuordnung
- Referenzslots

### `db5_grid.js`
Enthält:
- Slotdefinitionen des Rasters
- Linien, Seiten, Ausrichtungen
- Position pro Slot

### `db5_formations.js`
Enthält:
- Standardformationen
- belegte Slots je Formation

### `db5_rules.js`
Enthält:
- Hauptpositionsfaktor
- Nebenpositionsfaktor
- Distanz-Maluskurve
- Gruppenwechsel-Malus
- Bewertungsfunktionen

### `db5_state.js`
Enthält:
- Laufzeitstruktur für die Taktik eines Vereins
- aktuelle Belegungen
- Formation/Individualstatus

---

## Rechenlogik für Feldspieler auf Feldslots
Empfohlener Ablauf:

1. Zielslot bestimmen
2. Hauptposition prüfen
3. Nebenposition(en) prüfen
4. Für jede geprüfte Position:
   - prüfen, ob Zielslot im malusfreien Bereich liegt
   - falls nein, Distanz vom Referenzslot zum Zielslot zählen
   - Distanzmalus aus Kurve holen
   - Gruppenwechsel prüfen
   - Basisfaktor anwenden
5. Bestes Ergebnis wählen
6. Effektive Stärke berechnen

Formel:
`effectiveStrength = baseStrength * max(0, finalFactor)`

mit:
`finalFactor = positionBaseFactor - distancePenalty - groupChangePenalty`

wobei `distancePenalty` aus der Gesamt-Maluskurve stammt.

---

## Wichtige Prüffälle
Diese Fälle wurden im Projekt verwendet und sollten bei späteren Umbauten als Regressionstests erhalten bleiben:

### Prüffall 1
- Spieler: `ZM`
- Stärke: `80`
- Zielslot: `LM`
- Erwartung: ungefähr `66`

### Prüffall 2
- Spieler: `RV`
- Nebenposition: `LV`
- Stärke: `80`
- Zielslot: `LF offensiv`
- Erwartung: über `RV` schlechter als über `LV`
- Endergebnis: ungefähr `30`

### Prüffall 3
- Kleine Verschiebungen innerhalb naher Bereiche sollen spürbar, aber nicht zerstörerisch sein

### Prüffall 4
- Extreme Fehlbesetzungen sollen sehr schlecht sein, aber nicht wegen einer zu harten Kurve unnötig zusammenbrechen

Diese Prüffälle sind wichtig, um in neuen Chats dieselbe Logik wiederzuerkennen.

---

## Regeln für Weiterentwicklung
Wer DB5 weiterentwickelt, sollte diese Grundsätze einhalten:

1. Raster bleibt führende Wahrheit  
2. Keine zweite künstliche Positionsmatrix einführen  
3. Referenzslot-Prinzip nicht aufweichen  
4. Distanzlogik und Gruppenwechsel nicht doppelt eskalieren  
5. Torwart-Sonderfall beibehalten  
6. Formationen und Spielerbelegung trennen  
7. Laufzeitdaten nicht mit statischen Rasterdaten vermischen  

---

## Kurzdefinition
DB5 ist die Taktikdatenbank von Kabinenfieber.  
Sie verbindet Raster, Formationen und Positionsbewertung zu einem zentralen System, das bestimmt, wie gut ein Spieler je nach Hauptposition, Nebenposition, Rasterdistanz und Gruppenwechsel auf einem konkreten Slot funktioniert.
