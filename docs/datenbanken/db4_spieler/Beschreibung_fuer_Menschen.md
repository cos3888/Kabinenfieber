# Beschreibung DB4 für Menschen

## Zweck
DB4 beschreibt das Spielerschema, Spielervorlagen und die fachliche Logik der Spielerstärke.

## Typische Inhalte
- Spielerattribute
- Positionslogik
- Charaktere
- Spielertypen
- Zustandsattribute
- Berechnungsgrundlagen für Gruppen und Gesamtstärke

## Führende Attribute
- Identität: Name, Alter, Nationalität
- Positionen: Haupt- und Nebenpositionen
- Zustand: Form, Fitness, Moral
- Profil: Talent, Verlässlichkeit, Charaktere, Spielertypen
- Markt: Marktwert, Gehalt, Vertrag

## Fachlogik
- `potentialOverall` bleibt verborgen
- sichtbares Talent ist eine Einschätzung des Zielniveaus
- Reifegrad wirkt auf Skills
- Form, Fitness und Moral wirken auf Skills oder Gruppen
- Gruppenratings entstehen aus Fähigkeiten
- Overall entsteht aus Gruppen und Positionsgewichtung

## Positionsmalus
- Hauptposition ohne Malus
- Nebenposition mit Grundmalus
- Distanz über Rasterweg
- zusätzlicher Gruppenwechsel-Malus
- Feldspieler im Tor als Sonderfall

## Wichtige Dokumentationspflicht
DB4 muss so beschrieben sein, dass Attribute, Gruppenbildung und Berechnungslogik nachvollziehbar bleiben.
