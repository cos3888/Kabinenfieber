# KF_0.27.1 Validation Summary

Status: **BESTANDEN**

## Neue Kernpruefungen

- Vorhandene 0.27.0-`financeEvents` werden vollstaendig in den Finance-Store migriert.
- Im WorldRecord verbleibt keine `financeEvents`-Liste.
- `currentCash`, Eventanzahl und laufende Summen bleiben korrekt.
- Finanzledger ist weiterhin vollstaendig pro Verein/Saison abrufbar.
- identische Event-ID wird nicht doppelt gebucht.
- `eventKey`-Idempotenz funktioniert aus dem ausgelagerten Ledger.
- WorldRepository Save/Load trennt Weltzustand und Finance-Ledger.
- Saisonwechsel uebernimmt den Schlussbestand korrekt und loescht erst danach den alten Ledger.
- neuer Saisonledger wird korrekt erzeugt.

## Vollweltmessung Saison 1

- 432 Clubs
- 7.736 Matches
- 256.810 FinanceEvents
- WorldRecord vor Saisonwechsel: 81,66 MiB
- kompakter Matchindex: 45,23 MiB
- Vollmatch-Store: 389,53 MiB
- Finance-Store: 124,21 MiB
- kombinierte physische Persistenz: 595,40 MiB
- WorldRecord nach Saisonwechsel: 68,17 MiB
- abgeschlossener Vollmatch-Store nach Saisonwechsel: 0 Matches
- abgeschlossener Finance-Store nach Saisonwechsel: 0 Events
- neuer Saison-2-Finance-Store: 5.184 Events
- WorldRecord-Reduktion gegen KF_0.27.0: 60,4 %
- WorldRecord-Reduktion gegen KF_0.26.2: 85,2 %

## Laufzeit

- Initialisierung: 15,2 s
- komplette S1-Simulation: 241,3 s
- Saisonwechsel: 18,4 s
- keine erkennbare Performanceverschlechterung gegen den 0.27.0-Vollsaisonlauf

## Regressionen in diesem Block bestanden

- Current Source Integrity
- Current Data Truth Invariants
- Finance Balance / Licence
- Season Transition Invariants
- Server Foundation
- Multiworld Readiness
- KF_0.27.0 Current-Season Match Store
- KF_0.27.1 Current-Season Finance Store
- Negotiation Regression
- Report Consistency
- Match Feel

## Kritische Bewertung

KF_0.27.1 erreicht das fuer diesen Block gesetzte Serverziel: Der heisse WorldRecord liegt selbst am Ende einer vollstaendigen Saison unter 100 MiB, obwohl die fachlich vollstaendigen Match- und Finanzdetails erhalten bleiben. Die gesamte physische Datenmenge bleibt mit rund 595 MiB nahezu unveraendert; das ist bewusst so, weil dieser Block Detaildaten segmentiert statt sie zu loeschen.

Fuer das Ziel von bis zu 1.000 Welten und unbegrenzten Saisons ist der naechste wichtige Schritt deshalb nicht weiteres Loeschen aktueller Saisondaten, sondern die saisonweise/lazy Segmentierung dauerhaft wachsender Historienbereiche nach erneuter Groessenmessung.
