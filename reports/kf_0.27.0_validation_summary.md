# KF_0.27.0 Validation Summary

Status: **BESTANDEN**

## Neue Kernpruefungen

- Vollmatch wird nach Spielende nicht mehr im WorldRecord gehalten.
- Pro kompaktem aktuellem Match existiert genau ein Vollmatch im CurrentSeasonMatchRepository.
- Matchinfo kann ein weit zurueckliegendes Match der laufenden Saison weiterhin vollstaendig laden.
- WorldRecord Save/Load bleibt vom Vollmatch getrennt.
- 0.26.2-Migration lagert vorhandene aktuelle Vollmatches verlustfrei aus.
- Nach Saisonwechsel wird der abgeschlossene Vollmatch-Store geloescht.
- Monolithischer WorldRecord ist am Ende einer echten Vollsaison wieder JSON-serialisierbar.

## Vollweltmessung Saison 1

- 432 Clubs
- 7.736 Matches
- WorldRecord vor Saisonwechsel: 206,39 MiB
- Vollmatch-Store: 388,66 MiB
- kompakter Matchindex: 45,22 MiB
- FinanceEvents: 124,85 MiB / 256.984 Eintraege
- kombinierte physische Persistenz: 595,06 MiB
- WorldRecord nach Saisonwechsel: 69,76 MiB
- Vollmatch-Store nach Saisonwechsel: 0 Matches
- WorldRecord-Reduktion gegen 0.26.2-S1-Peak: 62,5 %

## Regressionen bestanden

- Source Integrity
- Data Truth Invariants
- Multiworld Readiness
- Server Foundation
- Season Transition Invariants
- Market Value History
- KF_0.26.0 History Compaction
- KF_0.26.1 Bonus Event Cleanup
- KF_0.26.2 Player Lifecycle/Strength
- Finance Balance/Licence
- Negotiation Regression
- Fixture ID Integrity
- National Cup
- Data/Mail Integrity
- Report Consistency
- Match Feel (20 Matches)

## Kritische Bewertung

Der WorldRecord ist fuer Serverpersistenz deutlich besser beherrschbar. Die gesamte physische Saisonmenge sinkt in dieser Phase noch nicht; sie steigt durch den notwendigen kompakten Laufzeitindex leicht an. Eine weitere Reduktion des Indexes wuerde die heute daraus lesenden Statistik-/Sperr-/Einsatzsysteme betreffen und ist deshalb bewusst nicht Teil von 0.27.0. Der naechste klare Serverkandidat ist die Segmentierung der FinanceEvents.
