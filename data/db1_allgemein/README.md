# Kabinenfieber – DB1 Allgemein v3

Referenzstand für DB1 Allgemein nach der Erweiterung um Nationengruppen, Charaktere und Spielertypen.

## Inhalt
- src/db1_general_reference.js
- src/db1_general_rules.js
- src/db1_nationality_distribution.js
- src/db1_nation_groups.js
- src/db1_first_names.js
- src/db1_last_names.js
- src/db1_character_definitions.js
- src/db1_player_type_definitions.js
- src/db1_examples.js
- docs/DB1_Beschreibung_fuer_dich.md
- docs/DB1_Beschreibung_fuer_ChatGPT.md
- docs/DB1_Datenueberblick.md
- source/Anteil_Namen.xlsx

## Fachliche Rolle von DB1
DB1 enthält die allgemeinen Referenzdaten der Spielwelt:
- Ligareferenzen
- Nationalitätenverteilung je Liga
- Nationengruppen je Nationalität
- Vornamen je Nationalität
- Nachnamen je Nationalität
- Charakterdefinitionen
- Spielertypdefinitionen

DB1 enthält bewusst keine Startlogik und keine generierten Spielstände.
Diese Aufgaben gehören in DB2.

## Kurzstatus
- Ligareferenzen: 24 Ligen
- Nationalitätenverteilung: 500 Einträge
- Nationengruppen: 50 Einträge
- Vornamen: 1578 Einträge
- Nachnamen: 3655 Einträge
- Charakterdefinitionen: 12
- Spielertypdefinitionen: 15
- bekannte Nationalitäten: 51

## Festgezogene Regeln für DB2-Nutzung
- Charaktere werden bei der Startgenerierung unabhängig vom Alter vergeben.
- Spielertypen werden bei der Startgenerierung unabhängig vom Alter vergeben.
- Das Alter skaliert nur die Wirkung von Charakter- und Spielertyp-Effekten auf Fähigkeiten.
- Spieler können beim Spielstart 0 bis maximal 2 Charakterzüge erhalten.
- Spieler können beim Spielstart 0 bis maximal 2 Spielertypen erhalten.
- Eine spätere Freischaltlogik für Spielertypen ist vorgesehen, aber noch nicht als eigene Aktivierungstabelle in DB1 hinterlegt.
