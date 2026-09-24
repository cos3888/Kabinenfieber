# DB1 – Allgemeine Referenzdaten
## Beschreibung für ChatGPT / technische Weiterarbeit

DB1 Allgemein ist die fachliche Referenzbasis für allgemeine Weltinformationen und Definitionslisten.
Es enthält keine Startlogik und keine generierten Spieler- oder Vereinsdaten.

## Enthalten
- Liga-Prestige
- Standardspieler je Liga
- durchschnittlicher Spieler-Marktwert je Liga
- Standardgehalt je Liga
- wenige globale Konstanten
- Nationalitätenverteilung je Liga
- Nationengruppen je Nationalität
- Vornamen je Nationalität mit Altersgewichten
- Nachnamen je Nationalität mit Häufigkeiten
- Charakterdefinitionen mit Gruppen-Gewichtungen und altersabhängiger Wirk-Skalierung
- Spielertypdefinitionen mit Positions-Gewichtungen und altersabhängiger Wirk-Skalierung

## Nicht enthalten
- Vereins-Startlogik
- Spielergenerierung selbst
- Kader- und Spielererstbefüllung
- Startzustände wie Form/Fitness/Moral
- generierte Spielstände
- laufende Spiellogik

## Hauptreferenzen
Wichtige feste Referenzen:
- Deutschland 1
- Standardspieler = 71
- Standardgehalt = durchschnittlicher Spieler-Marktwert * 0.12

## Technische Grundregeln
- `leagueKey` ist der Primärbezug für ligabezogene Referenzen.
- `nationality` ist der Primärbezug für Namens- und Gruppenzuordnungen.
- Nationengruppen werden über `db1_nation_groups.js` an Nationalitäten gebunden.
- Charaktere werden in DB2 unabhängig vom Alter vergeben; Alter skaliert nur ihre Effekte.
- Spielertypen werden in DB2 unabhängig vom Alter vergeben; Alter skaliert nur ihre Effekte.
- Pro Spieler sind beim Spielstart 0 bis maximal 2 Charakterzüge und 0 bis maximal 2 Spielertypen vorgesehen.
- Spielertypen können später eine separate Freischaltlogik erhalten; in dieser DB1-Version sind die Definitionen zunächst allgemein verfügbar.

## Tabellenlogik
### Ligareferenzen
Eine Zeile pro Liga mit den festen Vergleichswerten.

### Nationalitätenverteilung je Liga
Flache Struktur mit:
- `leagueKey`
- `nationality`
- `sharePercent`

### Nationengruppen
Flache Struktur mit:
- `nationality`
- `groupKey`

### Charakterdefinitionen
Pro Charakter:
- `key`
- `name`
- `effects`
- `groupWeights`
- `ageEffectMultipliers`

### Spielertypdefinitionen
Pro Spielertyp:
- `key`
- `name`
- `effects`
- `positionWeights`
- `ageEffectMultipliers`

## Hinweise für DB2
Empfohlene Grundreihenfolge:
1. Liga-Kontext bestimmen
2. Nationalität ziehen
3. Nationengruppe bestimmen
4. Position bestimmen
5. Charakter(e) über Gruppen-Gewichte ziehen
6. Spielertyp(en) über Positions-Gewichte ziehen
7. Fähigkeiten erzeugen
8. Altersabhängige Effekt-Skalierung auf Charakter und Spielertyp anwenden
9. finalen Overall nach DB4-Formel berechnen
