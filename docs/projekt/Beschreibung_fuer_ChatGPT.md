# Projektbeschreibung für ChatGPT

## Ziel des Projekts
Kabinenfieber ist ein browserbasiertes Fußballmanager-Spiel mit Fokus auf langfristig spielbare Einzel- und Mehrspieler-Erfahrung. Die aktuelle Priorität ist ein stabiler, wiederholbarer Grundkreislauf ohne unnötige technische Komplexität.

## Aktueller funktionaler Stand
- Startmenü mit Karriere starten / Laden
- Startlogik erzeugt einen neuen Spielstand aus DB1–DB5
- Vereinsauswahl mit Länder- und Liga-Schritt
- Vereinsübernahme
- Büro als Zentrale
- Kaderliste
- Aufstellung mit Raster, Formationen und Positionsmalus
- Spieler- und Vereinsprofil als Popup

## Bewusst noch nicht enthalten
- Spielsimulation
- Saisonabschluss / neue Saison
- Transfermarkt
- Scouting als vollwertiges System
- Finanzsystem über den Startstand hinaus

## Architekturgrundsätze
- Ein Datensatz, viele Ansichten
- Menüs erzeugen keine eigene Wahrheit
- DB1–DB5 bleiben fachlich getrennt
- Startlogik und laufende Spiellogik bleiben getrennt
- Masken und Logik bleiben getrennt

## Datenbankrollen
- DB1 = allgemeine Referenzen
- DB2 = Karrierestart / Initialisierung
- DB3 = Vereine
- DB4 = Spielerstruktur und Spielerlogik
- DB5 = Taktik, Raster, Formationen, Positionspassung

## Aktuelle technische Umsetzung
Die laufende Browser-Version nutzt `src/core/app.js` als zentrale Integrationsdatei. Dort sind die DB-Daten aktuell in den Browserstand eingebettet, damit die lokale HTML-Version ohne Build-Schritt startbar bleibt. Die Original-Datenbankstände bleiben zusätzlich unter `data/` erhalten.

## Wiederherstellungsregel
Wenn ein Teil des Projekts neu aufgebaut werden muss:
1. Projektstruktur beibehalten
2. Masken aus `masks/` nutzen
3. Zentrale Logik in `src/` halten
4. DB1–DB5 aus `data/` und den Beschreibungen rekonstruieren
5. Keine Menüs mit eigenen Demo-Wahrheiten anlegen
