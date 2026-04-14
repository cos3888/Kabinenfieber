# Kabinenfieber – GitHub-Strukturstand

Dies ist der aktuell akzeptierte lokale Spielstand in einer lesbaren Projektstruktur.

## Direkt starten
- `index.html` im Browser öffnen
- `Neue Karriere` starten
- Land → Liga → Verein wählen

## Was in diesem Stand funktioniert
- Startmenü mit neuer Karriere und Laden
- Karrierestart über Startlogik
- Vereinsauswahl mit Vereinsprofil-Popup
- Büro
- Kaderliste
- Aufstellungsmenü
- Spieler- und Vereinsprofile als Popup

## Was bewusst noch nicht enthalten ist
- Spielsimulation
- Saisonfortschritt
- Transfermarkt
- Finanzen als eigenes Spielsystem
- Editor im Startmenü

## Projektaufbau
- `docs/` – Projekt- und Datenbankbeschreibungen für KI und Menschen
- `data/` – DB1 bis DB5 plus Original-ZIP-Archive
- `src/` – zentrale Browser-Logik
- `masks/` – HTML-Masken
- `assets/` – UI-Grafiken, Wappen, Trikots, Platzhalter
- `tools/` – Hilfsseiten für lokale Prüfung

## Wichtige Asset-Pfade
- Spielfeldhintergrund: `assets/ui/lineup/field_background.png`
- Vereinswappen/Trikots: `assets/clubs/<clubId>/`

## Aktuelle Vereinsdateien
Jeder Vereinsordner ist für diese Dateinamen vorbereitet:
- `crest.png`
- `home.png`
- `away.png`
