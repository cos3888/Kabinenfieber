# DB5 – Taktikdatenbank  
## Beschreibung für Menschen / Projektpartner

## Wofür DB5 da ist
DB5 ist die fachliche Taktikdatenbank von **Kabinenfieber**.

Sie beschreibt alles, was nötig ist, damit das Aufstellungsmenü, die Formationen und die Positionsbewertung im Spiel sauber funktionieren.

DB5 ist also die Grundlage für:
- das Positionsraster im Aufstellungsmenü
- Standardformationen
- individuelle Abweichungen von Standardformationen
- die Frage, wie gut ein Spieler auf einem bestimmten Slot funktioniert
- die taktische Zustandslogik eines Vereins

DB5 ist **nicht** die komplette Spielerdatenbank und **nicht** die komplette Vereinsdatenbank.  
Sie kümmert sich nur um den taktischen Teil dieser Themen.

---

## Warum DB5 überhaupt nötig ist
Im Projekt wurde festgelegt, dass die Taktik im Spiel **echten Einfluss** haben soll.

Das bedeutet:
- Es reicht nicht, einfach nur 11 starke Spieler aufzustellen.
- Es muss wichtig sein, **wer wo spielt**.
- Ein Spieler soll auf seiner Hauptposition am besten funktionieren.
- Nebenpositionen sollen helfen, aber nicht so stark sein wie die Hauptposition.
- Falsche Einsätze sollen spürbar schlechter sein.
- Das Ganze soll nicht über eine künstliche Liste von „Position A passt zu Position B“, sondern direkt über das **Raster des Spielfelds** erklärt werden.

Genau dafür wurde DB5 aufgebaut.

---

## Die 13 offiziellen Positionen
Für das Spiel wurden diese 13 Positionen verbindlich festgelegt:

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

Diese Positionscodes sind die offizielle Grundlage für DB5.

Wichtig:
Es wird **DM** verwendet, nicht ZDM.  
Es wird **OM** verwendet, nicht ZOM.

---

## Grundidee der Positionslogik
Jede Position ist im Spiel **nicht nur ein einzelner Punkt**, sondern ein Bereich im Raster.

Beispiel:
Ein IV steht nicht nur auf genau einem Feld, sondern mehrere Raster-Slots gehören fachlich zu „IV“.  
Dasselbe gilt für ST, ZM, OM usw.

Zusätzlich hat jede Position einen **Referenzslot**.

Der Referenzslot ist der feste Ausgangspunkt, von dem aus gemessen wird, wie weit ein Spieler von seiner Idealposition entfernt eingesetzt wird.

---

## Was ist der Referenzslot?
Der Referenzslot ist der zentrale Bezugs-Slot einer Position.

Er wurde aus dem Raster abgeleitet und markiert den Punkt, von dem aus der Malus zum Zielslot gezählt wird, wenn ein Spieler außerhalb seines eigentlichen Positionsbereichs eingesetzt wird.

Die Referenzslots sind:

- TW → Tor / grundlegend / Z
- LV → Abwehr / grundlegend / L
- IV → Abwehr / grundlegend / Z
- RV → Abwehr / grundlegend / R
- LM → Mittelfeld / grundlegend / L
- DM → Mittelfeld / defensiv / Z
- ZM → Mittelfeld / grundlegend / Z
- OM → Mittelfeld / offensiv / Z
- RM → Mittelfeld / grundlegend / R
- LF → Sturm / grundlegend / L
- ST → Sturm / grundlegend / Z
- HS → Sturm / defensiv / Z
- RF → Sturm / grundlegend / R

---

## Was ist der malusfreie Positionsbereich?
Der malusfreie Positionsbereich ergibt sich direkt aus dem Raster.

Grundregel:
- Wenn im Raster ein Slot mit einer Position beschriftet ist, gehört dieser Slot zu dieser Position.
- Alle Slots derselben Position gehören zum malusfreien Bereich.
- Die rot markierte Zelle dieser Position ist zusätzlich der Referenzslot.

Bedeutung:
- Ein Spieler auf seiner Hauptposition hat auf allen Slots dieser Hauptposition **keinen Distanzmalus**.
- Ein Spieler auf einer Nebenposition hat auf allen Slots dieser Nebenposition **keinen Distanzmalus**, aber weiterhin den Grundmalus für die Nebenposition.

---

## Hauptposition und Nebenposition
Jeder Spieler hat:
- eine Hauptposition
- optional eine oder mehrere Nebenpositionen

### Hauptposition
Die Hauptposition ist die beste Position des Spielers.  
Hier startet er mit vollem Basiswert.

**Hauptposition = 100 %**

### Nebenposition
Nebenpositionen sind leicht schwächer als die Hauptposition.

Der aktuelle Arbeitswert ist:

**Nebenposition = 94 %**

Das bedeutet:
Ein Spieler, der auf einer perfekten Nebenposition eingesetzt wird, ist leicht schwächer als auf seiner Hauptposition, aber immer noch klar besser als auf einer fremden Position.

---

## Wie der Positionsmalus funktioniert
Wenn ein Spieler auf einem Feldslot eingesetzt wird, wird nicht nur geschaut:
„Welche Position steht da?“

Sondern:
- Auf welchem **konkreten Raster-Slot** steht er?
- Gehört dieser Slot zu seiner Hauptposition?
- Gehört dieser Slot zu einer Nebenposition?
- Wenn nicht: Wie weit ist dieser Slot vom Referenzslot entfernt?

### Grundregel
Es wird immer die **beste verfügbare Ausgangsposition** geprüft:
- Hauptposition
- Nebenposition(en)

Dann wird die beste Variante genommen.

---

## Wie die Distanz gezählt wird
Sobald ein Spieler außerhalb des malusfreien Bereichs seiner besten Position eingesetzt wird, wird die Distanz vom Referenzslot zum Zielslot im Raster gezählt.

Wichtig:
- Es zählt der **konkrete Zielslot**
- nicht nur die Zielposition als Begriff
- dadurch sind Seite, Linie und Ausrichtung relevant

Das bedeutet:
Ein Spieler auf „LF offensiv“ wird anders bewertet als auf „LF grundlegend“, wenn sich die Schrittzahl im Raster unterscheidet.

---

## Warum das Raster die Wahrheit ist
Es wurde bewusst festgelegt:
Es gibt **keine künstliche Positionsmatrix** wie
„ZM auf LM = 85 %“ oder
„IV auf DM = 78 %“.

Stattdessen gilt:
- Das Raster ist die zentrale Wahrheit.
- Der Weg vom Referenzslot zum Zielslot bestimmt den Malus.
- Dadurch ist das System nachvollziehbar und direkt mit dem Aufstellungsmenü verbunden.

Das heißt:
Die Taktiklogik ist nicht von außen erfunden, sondern kommt direkt aus dem Spielfeldmodell.

---

## Maluskurve für die Rasterdistanz
Die Distanz im Raster wird nicht mit einer harten alten Summenlogik bestraft, weil diese extreme Fehlbesetzungen zu stark zerstört hat.

Stattdessen wurde eine **abgeflachte Gesamt-Maluskurve** festgelegt.

Aktueller Stand:

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

Diese Kurve bedeutet:
- kleine Abweichungen tun schon spürbar weh
- mittlere Abweichungen sind deutlich
- extreme Abweichungen werden sehr schlecht
- aber sie kippen nicht mehr so schnell mathematisch auf 0

---

## Zusatzmalus bei Gruppenwechsel
Zusätzlich zur Rasterdistanz gibt es einen einmaligen Malus, wenn ein Spieler die große Feldgruppe wechselt.

Feldgruppen:
- Abwehr
- Mittelfeld
- Sturm

Regel:
Sobald zwischen diesen Gruppen gewechselt wird, gibt es **einmalig** einen Extra-Malus.

Aktueller Arbeitswert:

**Gruppenwechsel = 8 %**

Wichtig:
- Nicht pro übersprungener Gruppe mehrfach
- Nicht doppelt eskalierend
- Nur einmal zusätzlich

Die eigentliche Hauptlogik bleibt also weiterhin die Rasterdistanz.

---

## Torwart als Sonderfall
Der Torwart ist bewusst anders behandelt worden.

Warum?
Weil ein Feldspieler im Tor nicht sinnvoll über seine normale Gesamtstärke mit Positionsmalus bewertet werden kann.

Für den TW-Slot gilt deshalb:
- Dort sind die **Torwartfähigkeiten** des Spielers entscheidend
- die normale Feldspieler-Gesamtstärke ist dafür nicht maßgeblich

Das ist wichtig für spätere Simulation und Bewertung.

Kurz gesagt:
**Torwart ist keine normale Feldposition.**

---

## Standardformationen und individuelle Aufstellungen
DB5 speichert nicht nur Positionslogik, sondern auch die Formationen.

Dabei gilt:
- Standardformationen bestehen aus belegten Raster-Slots
- sie enthalten **keine festen Spieler**
- sie beschreiben nur die Grundordnung

Zusätzlich wurde festgelegt:
- Spieler dürfen die Aufstellung individuell ändern
- sobald man von einer Standardformation abweicht, wechselt der Modus im Spiel auf:

**individuell**

Das entspricht genau dem Aufbau des Aufstellungsmenüs.

---

## Was DB5 technisch ungefähr enthält
DB5 wurde so gedacht, dass es intern auf mehrere Dateien verteilt werden kann.

Sinnvolle Aufteilung:

### `db5_positions.js`
Enthält:
- die 13 Positionen
- Gruppenzuordnung
- Referenzslots

### `db5_grid.js`
Enthält:
- das Raster
- alle Slots
- Seiten, Linien, Ausrichtungen
- welche Position an welchem Slot steht

### `db5_formations.js`
Enthält:
- Standardformationen
- welche Slots je Formation belegt sind

### `db5_rules.js`
Enthält:
- Hauptpositionsfaktor
- Nebenpositionsfaktor
- Maluskurve
- Gruppenwechsel-Malus
- Bewertungsfunktionen

### `db5_state.js`
Enthält:
- den laufenden Taktikzustand eines Vereins
- aktuelle Formation
- individueller Modus
- Spieler auf Feld, Bank und Reserve

---

## Wofür diese Datenbank später wichtig ist
DB5 ist nicht nur für das Aufstellungsmenü da.

Sie ist später auch wichtig für:
- die Teamstärkeberechnung
- Taktik-Effekte in der Simulation
- KI-Aufstellungen
- automatische Startaufstellungen
- Kaderplanung
- die Bewertung, wie flexibel ein Spieler einsetzbar ist

DB5 ist also ein zentrales taktisches Fundament des Spiels.

---

## Wichtige Beispiele aus der Festlegung
Ein paar Beispiele wurden im Projekt bewusst als Prüffälle genutzt:

- **ZM mit Stärke 80 auf LM** → ungefähr **66**
- **RV/LV mit Stärke 80 auf LF offensiv** → ungefähr **30**
- kleine Positionsverschiebungen innerhalb ähnlicher Bereiche sollen spürbar, aber nicht zerstörerisch sein
- extreme Fehlbesetzungen sollen sehr schlecht sein, aber durch die abgeflachte Kurve nicht unnötig kaputt gerechnet werden

Diese Beispiele helfen später beim Prüfen, ob die Logik noch richtig verstanden wird.

---

## Kurzfassung für Kollegen
Wenn man DB5 in einem Satz erklären will:

**DB5 ist die Taktikdatenbank, die das Spielfeldraster, die Formationen und die Positionsbewertung im Spiel definiert.  
Sie sorgt dafür, dass Spieler je nach Hauptposition, Nebenposition, Rasterdistanz und Gruppenwechsel unterschiedlich gut auf einem Slot funktionieren.**

---

## Wichtig für spätere Weiterentwicklung
Wenn DB5 später erweitert wird, sollte man diese Grundprinzipien beibehalten:

- Das Raster bleibt die führende Wahrheit
- Keine zweite Schattenlogik neben dem Raster einführen
- Positionslogik und Formationslogik sauber trennen
- Torwart weiter als Sonderfall behandeln
- Neue Taktiksysteme auf DB5 aufbauen, nicht daneben

So bleibt die Taktikdatenbank nachvollziehbar und stabil.
