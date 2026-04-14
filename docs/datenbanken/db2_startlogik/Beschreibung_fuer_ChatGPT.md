# DB2 – Beschreibung für ChatGPT

## Rolle
DB2 ist die operative Startlogik. Sie erzeugt aus DB1, DB3, DB4 und DB5 einen neuen Spielstand für die spielbare Browser-Version.

## Aufgaben
- Länder-/Liga-Kontext anlegen
- Vereine einer Liga laden
- Spieler generieren
- Kader aufbauen
- Startformation und Aufstellung initialisieren
- Managerverein übernehmen
- Gehaltsbudgetverbrauch und Trikotnummern im Startstand setzen

## Enthält nicht
- Saisonfortschritt
- Transfermarkt
- laufende Matchsimulation
- Vereinsentwicklung über den Start hinaus

## Wiederherstellung / Neuerstellung
1. Referenzen aus DB1 laden
2. Vereinsbasis aus DB3 laden
3. Spielerstruktur und Bewertungslogik aus DB4 verwenden
4. Raster und Formationen aus DB5 anwenden
5. pro Verein Kader erzeugen
6. Spieler Vereinskadern zuordnen
7. Startformation setzen
8. Trikotnummern nach Hauptposition vergeben
9. Spielstand zentral als `gameState` ausgeben

## Besondere Projektregeln
- Startlogik und laufende Spiellogik trennen
- keine HTML-Dummydaten als Quelle
- ein zentraler Spielstand für alle Menüs
