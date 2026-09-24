# Architektur KF_0.26.0 - Historienverdichtung und Saisonaggregate

## Ziel

Die aktive Welt soll nicht mehr mit jeder abgeschlossenen Saison die komplette Matchsimulation mitschleppen. Gleichzeitig muessen die fuer Kabinenfieber relevante Fussballgeschichte, Spielerkarrieren und bestehende Statistikansichten erhalten bleiben.

KF_0.26.0 trennt deshalb die vollstaendige aktuelle Matchwahrheit von dauerhaft benoetigten historischen Aggregaten.

## Persistierte Datenwahrheiten

### Laufende Saison

`world.history.matches`

Enthaelt nur Vollmatches der laufenden Saison. Diese Matchobjekte duerfen weiterhin alle fuer Live-/Bericht-/Statistikfunktionen benoetigten Informationen tragen, insbesondere Events, Situationen, Aufstellungen, Taktiken, xG und Spielerstatistiken.

### Abgeschlossene Spiele

`world.history.seasonResults[season]`

Pro abgeschlossenem Spiel bleibt ein kompakter Ergebnisdatensatz. Typische Felder:

- Saison
- Wettbewerb
- Liga/Land
- Runde/Spieltag/Slot
- Heim-/Auswaertsclub
- Ergebnis
- Sieger/Tie-Decider falls erforderlich
- fuer K.-o.-Wettbewerbe notwendige Paarungs-/Rundenmetadaten

Nicht enthalten sind absichtlich Match-ID fuer einen Bericht-Button, `playerStats`, detaillierte Events, `matchStats`, Aufstellungen oder Taktikpayloads.

### Spieler-Saisonhistorie

`world.history.playerSeasons[season].byPlayerId[playerId]`

Enthaelt pro eingesetztem Spieler einen kompakten Saison-Snapshot mit Gesamtwerten und Wettbewerbsaufteilung. Unter anderem:

- Einsaetze
- Minuten
- Tore
- Vorlagen
- Karten
- Rating-Summe und Rating-Anzahl
- Team-des-Tages-Anzahl
- Torwart: Zu-Null-Spiele und Gegentore
- Club-/Wettbewerbs-Snapshot

`ratingTotal` und `ratingCount` werden statt nur einer fertigen Durchschnittsnote gespeichert, damit spaetere Karriereaggregate mathematisch korrekt bleiben.

### Historische Tabellen

`world.history.seasonStandings`

Bleibt die zentrale Wahrheit fuer abgeschlossene Ligatabellen.

### Vorsaison-Simulationskontext

`world.history.previousSeasonRecentContext`

Dieser Datensatz ist KEINE zweite Historienwahrheit, sondern ein begrenzter abgeleiteter Snapshot. Er enthaelt nur die letzten maximal fuenf relevanten Spiele je Club und nur Felder, die fuer den Saisonuebergang noch benoetigt werden:

- Ergebnis
- letzte eingesetzte Aufstellungen/Spieler
- minimale Spieler-Einsatzinformationen
- xG
- Angriffszonen
- verwendete Taktik

Die Snapshots werden ueber gemeinsame `matchesById`-Eintraege referenziert, damit ein Spiel nicht fuer Heim- und Auswaertsclub doppelt persistiert wird.

## Saisonwechsel

Ablauf fuer die beendete Saison:

1. Vor dem eigentlichen Saison-Lifecycle werden aus den noch vollstaendigen Matches `seasonResults`, `playerSeasons` und der Recent-Context vorbereitet.
2. Der bestehende Saisonwechsel laeuft vollstaendig durch (Finanzen, Lizenz, Vertrage, Auf-/Abstieg, Sponsoren, Kader usw.).
3. Erst nach erfolgreichem Saisonwechsel werden die vorbereiteten historischen Daten committed.
4. Die Vollmatches der beendeten Saison werden aus `world.history.matches` entfernt.
5. Match-/Statistik-Runtimecaches werden invalidiert und bei Bedarf neu aus den kanonischen Daten aufgebaut.

Damit wird kein halb abgeschlossener Historienzustand geschrieben, falls der fachliche Saisonwechsel vorher scheitert.

## Historische Leser

Fuer abgeschlossene Saisons wurden die bestehenden Leser auf die neuen Quellen umgestellt:

- Spielerprofil-Gesamt-/Saisonwerte -> `playerSeasons` + laufende Vollmatches
- Spielerstatistiken Liga/Pokal/Fiebercup -> `playerSeasons`
- Vereins-Wettbewerbsstatistik -> `seasonResults` + laufende Vollmatches
- ewige Tabellen / Clubranking -> kompakte Resultate + laufende Vollmatches
- Pokal-/Fiebercuphistorie -> kompakte Resultate + bestehende Siegerhistorie
- Saisonoptionen im Vereins-/Spielerprofil -> Aggregate/Resultate

Aktuelle Saisonansichten lesen weiterhin aus Vollmatches.

## Migration 0.25.x -> 0.26.0

`migrateWorldDataTruthToCurrent(world)` erkennt Vollmatches abgeschlossener Saisons in aelteren Welten und materialisiert daraus:

- `seasonResults`
- `playerSeasons`
- soweit relevant den Recent-Context

Danach werden die alten Vollmatchobjekte der abgeschlossenen Saisons entfernt.

Schema nach Migration:

- GameState: `kf-core-0.26.0`
- WorldRecord: `kf-world-record-0.26.0`
- WorldRecord `gameVersion`: `0.26.0`

## Doppelte Datenhaltung

Dauerhaft gibt es fuer ein abgeschlossenes Match keine parallele Vollmatch- und Ergebniswahrheit. Nach Commit wird das Vollmatch entfernt.

Die Spieler-Saisonaggregate sind eine bewusst materialisierte historische Wahrheit, weil die entsprechenden Karrierewerte nach Entfernen der Vollmatches sonst nicht mehr rekonstruierbar waeren.

Der `previousSeasonRecentContext` ist ein fachlich begruendeter, begrenzter Simulationssnapshot und wird nicht als historische UI-Quelle behandelt.

## Nicht veraendert

- Matchsimulation und Ergebnisentstehung
- aktuelle Spielerwahrheit `world.players.byId`
- Kader-/Taktikwahrheit `world.squads`
- Fixturewahrheit `world.calendar.fixtures`
- Finanz-/Bonuslogik
- Sponsorlogik KF_0.25.5/0.25.6

## Folgethemen

1. Ruhestaendler: komplette ehemalige Spielerobjekte durch kompakte Karriereprofile ersetzen, ohne Karrierehistorie zu verlieren.
2. `world.history.bonusEvents`: Wachstum messen und historisch sinnvoll verdichten/segmentieren.
3. Weitere persistente Langzeitdaten (Sponsorvertraege, Marktwerte, Transferhistorie) nach Groesse priorisieren.
4. Physische Serverpersistenz/Lazy Loading: aktive Welt und historische Segmente getrennt laden/speichern.
