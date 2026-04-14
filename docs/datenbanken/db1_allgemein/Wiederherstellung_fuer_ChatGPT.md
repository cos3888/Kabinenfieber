# Wiederherstellung DB1 für ChatGPT

## Zweck
DB1 ist die allgemeine Referenzdatenbank. Sie enthält keine fertigen Kader, sondern die Grundlagen für DB2: Ligareferenzen, Nationalitäten, Namen, Charaktere und Spielertypen.

## Dateistruktur
- `src/db1_general_reference.js`
- `src/db1_nationality_distribution.js`
- `src/db1_nation_groups.js`
- `src/db1_first_names.js`
- `src/db1_last_names.js`
- `src/db1_character_definitions.js`
- `src/db1_player_type_definitions.js`
- `src/db1_general_rules.js`
- `src/db1_examples.js`

## Führende Konstanten
| Feld | Typ | Wert | Bedeutung |
| --- | --- | --- | --- |
| `maxSquadSlots` | number | 30 | maximaler Kaderreferenzwert |
| `standardSalaryFactorFromMarketValue` | number | 0.12 | Faktor für Standardgehalt |
| `standardSalaryUnit` | string | million_per_season | Einheit des Referenzgehalts |
| `standardPlayerReferenceLeague` | string | Deutschland 1 | Referenzliga des Standardspielers |
| `standardPlayerReferenceOverall` | number | 71 | Referenz-Gesamtstärke |

## Ligareferenzen
Felder pro Eintrag:
- `leagueKey`
- `countryName`
- `leagueLevel`
- `prestige`
- `standardPlayerOverall`
- `averagePlayerMarketValue`
- `standardSalarySeason`

Beispielauszug:
| leagueKey | countryName | leagueLevel | prestige | standardPlayerOverall | averagePlayerMarketValue | standardSalarySeason |
| --- | --- | --- | --- | --- | --- | --- |
| England 1 | England | 1 | 10.0 | 74 | 12.0 | 1.44 |
| Deutschland 1 | Deutschland | 1 | 9.0 | 71 | 9.7 | 1.16 |
| Deutschland 2 | Deutschland | 2 | 6.6 | 65 | 5.2 | 0.62 |
| Spanien 1 | Spanien | 1 | 9.3 | 72 | 10.4 | 1.25 |

## Weitere Referenztabellen
- Nationalitätenverteilung: 500 Einträge
- Nationengruppen: 50 Einträge
- Vornamen: 1578 Einträge
- Nachnamen: 3655 Einträge
- Charakterdefinitionen: 12 Einträge
- Spielertypdefinitionen: 15 Einträge

## Formeln und Regeln
- Standardgehalt: `averagePlayerMarketValue * 0.12`
- Charakter- und Spielertypvergabe ist altersunabhängig in der Zuweisung; das Alter skaliert nur die Effekte.
- Pro Spieler sind am Spielstart maximal zwei Charaktere und maximal zwei Spielertypen vorgesehen.

## Abhängigkeiten
DB2 liest aus DB1: Ligareferenzen, Nationalitätenverteilung, Nationengruppen, Namen, Charaktere und Spielertypen.

## Wiederherstellungsreihenfolge
1. `db1_general_reference.js` anlegen
2. Nationalitätenverteilung und Nationengruppen anlegen
3. Vornamen und Nachnamen anlegen
4. Charaktere und Spielertypen anlegen
5. Regeln und Beispiele ergänzen
6. validieren: pro Liga 100 %, pro Nationalität genau eine Gruppe
