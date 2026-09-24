# Beschreibung DB1 für Menschen

## Zweck
DB1 enthält allgemeine Referenzdaten und Startreferenzen. Diese Daten sind fachliche Grundlagen, die von anderen Systemen genutzt werden, aber nicht selbst der laufende Karriere-Spielstand sind.

## Typische Inhalte
- Länder- und Nationalitätsreferenzen
- Namenspools und Verteilungen
- allgemeine Labels, Konstanten und Hilfsreferenzen
- feste Zuordnungen, die beim Karrierestart benötigt werden

## Rolle im Projekt
DB1 liefert Eingabematerial für die Startlogik. DB1 erzeugt keine Karriereobjekte selbst, sondern stellt Referenzen bereit, aus denen Startobjekte abgeleitet werden.

## Wichtige Regel
DB1 bleibt referenziell. Änderbare Karrierezustände gehören nicht hier hinein.
