# Projektbeschreibung für Menschen

## Was Kabinenfieber ist
Kabinenfieber ist ein Fußballmanager für den Browser. Der Schwerpunkt liegt auf einem zugänglichen, aber langfristig interessanten Spielgefühl. Aktuell steht nicht die Feature-Masse im Vordergrund, sondern ein sauberer Grundablauf.

## Was aktuell schon klappt
Du kannst lokal eine Karriere starten, ein Land und eine Liga wählen, Vereine vergleichen, einen Verein übernehmen und danach im Büro die Menüs Kader und Aufstellung nutzen. Spieler- und Vereinsprofile lassen sich als Popup öffnen.

## Was noch nicht drin ist
Spieltag, Simulation, Saisonwechsel, Transfers, Scouting und weitere Systeme sind in diesem Stand noch nicht spielbar.

## Warum die Ordner so aufgebaut sind
- `masks/` enthält die HTML-Masken
- `src/` enthält die Logik
- `data/` enthält die Datenbanken und Originalarchive
- `assets/` enthält austauschbare Grafiken
- `docs/` erklärt Projekt und Datenbanken

## Wie du das Projekt weiterpflegen kannst
- Wappen und Trikots direkt in den Vereinsordnern unter `assets/clubs/<clubId>/` austauschen
- den Spielfeldhintergrund unter `assets/ui/lineup/field_background.png` ersetzen
- Datenbanklogik anhand der Beschreibungen in `docs/datenbanken/` weiterentwickeln
