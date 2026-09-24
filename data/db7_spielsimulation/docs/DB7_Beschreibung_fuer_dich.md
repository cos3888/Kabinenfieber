# DB7 – Beschreibung für Menschen

## Was ist DB7?
DB7 ist die Matchsimulation von Kabinenfieber.

Hier wird festgelegt:
- wie ein Spiel vorbereitet wird
- welche Spieler beteiligt sind
- wie Tore und andere Ereignisse entstehen
- wie ein kurzer Spielbericht entsteht

## Was speichert DB7 dauerhaft?
DB7 speichert keine komplette Karrierehistorie.
Die dauerhafte Matchhistorie liegt weiter in DB6.

DB7 dient als Rechen- und Ausgabeschicht zwischen:
- vorhandenem Spielstand
- späterer Matchauslösung im Spiel
- dauerhafter Speicherung in DB6

## Wofür ist das gut?
Dadurch bleibt das System sauber getrennt:
- DB7 = Simulation
- DB6 = Ergebnis / Historie

## Erster Stand
Im ersten Stand ist die Simulation bewusst einfach,
damit sie schon technisch nutzbar ist und später verbessert werden kann.
