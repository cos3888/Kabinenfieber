# DB1 – Datenüberblick

## Umfang
- Ligen: 24
- Nationalitätenverteilungs-Einträge: 500
- Nationengruppen: 50
- Vornamen: 1578
- Nachnamen: 3655
- Charakterdefinitionen: 12
- Spielertypdefinitionen: 15
- bekannte Nationalitäten: 51

## Validierung
- Alle 24 Liga-Spalten der Nationalitätenverteilung summieren sich jeweils auf 100,00.
- Die Hilfsspalte `Gesamt %` aus der Excel-Datei bleibt nur Quell-/Kontrollwert und wird nicht als Kernstruktur in die Zieldatei übernommen.
- Jede bekannte Nationalität besitzt genau eine Nationengruppe.

## Technische Dateien
- `src/db1_general_reference.js`: Ligareferenzen und Konstanten
- `src/db1_general_rules.js`: Regeln und feste DB1-Nutzungshinweise
- `src/db1_nationality_distribution.js`: flache Ligaverteilung nach `leagueKey`
- `src/db1_nation_groups.js`: Nation-zu-Gruppe-Zuordnung
- `src/db1_first_names.js`: Vornamen je Nationalität mit Altersgewichten
- `src/db1_last_names.js`: Nachnamen je Nationalität mit Gewichten
- `src/db1_character_definitions.js`: Charakterdefinitionen
- `src/db1_player_type_definitions.js`: Spielertypdefinitionen

## Hinweise für DB2
- Nationalität eines neuen Spielers zuerst über `leagueKey` aus `db1_nationality_distribution.js` ziehen.
- Danach Nationengruppe über `db1_nation_groups.js` auflösen.
- Danach Charaktere über die Gruppen-Gewichtungen ziehen.
- Position bestimmen und danach Spielertypen über die Positions-Gewichtungen ziehen.
- Alter beeinflusst nicht die Vergabe von Charakteren oder Spielertypen, sondern nur die Stärke ihrer Effekte auf Fähigkeiten.
- Pro Spieler sind beim Spielstart 0 bis maximal 2 Charakterzüge und 0 bis maximal 2 Spielertypen vorgesehen.

## Beispiele
- Beispiel Nationalitätenverteilung Deutschland 2: Deutschland 61.0%, Frankreich 3.3%, Niederlande 1.3%, Portugal 1.2%, Türkei 1.0%, Spanien 0.6%
- Beispiel Nationengruppe: Deutschland → DIS
- Beispiel Vorname: Algerien / Adam
- Beispiel Nachname: Algerien / Abdelli
- Beispiel Charakter: Teamspieler (teamspieler)
- Beispiel Spielertyp: Linienkeeper (linienkeeper)
