# KF_0.27.1 Release Notes

## Schwerpunkt

Serverpersistenz Phase 2: Die vollstaendigen `financeEvents` der laufenden Saison werden aus dem monolithischen WorldRecord ausgelagert. Die Finanzlogik selbst bleibt unveraendert.

## Aenderungen

- Version/Schema auf `0.27.1`, `kf-core-0.27.1`, `kf-world-record-0.27.1` angehoben.
- Neuer `CurrentSeasonFinanceRepository` mit Segmentierung nach Welt, Saison, Verein und Event-ID.
- `world.clubFinances.byClub[clubId]` enthaelt nur noch kompakten aktuellen Zustand: Startsaldo, aktueller Saldo, Eventanzahl, kleine laufende Summen, Lizenzwarnungen und Sanktionen.
- `addFinanceEvent` schreibt das vollstaendige Ereignis ausschliesslich in den Finance-Store und aktualisiert den kompakten Zustand.
- Hauefige Finanzsummen werden aus kleinen laufenden Aggregaten gelesen; Detailbuchungen muessen dafuer nicht komplett geladen werden.
- `eventKey` bleibt Idempotenzanker fuer Vertrags-, Match-, Saison- und Transferklauselpraemien.
- Saisonwechsel behaelt den alten Ledger bis zur Schlussbestandsuebernahme und loescht ihn erst danach.
- World-Loeschung entfernt Finance- und Matchsegmente.
- Migration von 0.27.0 verschiebt vorhandene `financeEvents` verlustfrei in den neuen Store.

## Nicht geaendert

- Finanzformeln und Lizenzlogik.
- Gehalts-, Sponsor-, Transfer- und Praemienregeln.
- Matchsimulation und Ergebnisermittlung.
- Match-Store aus KF_0.27.0.
- Historienmodell abgeschlossener Saisons.
- Keine neue dauerhafte Vollmatch- oder FinanceEvent-Historie alter Saisons.

## Speicherwirkung (Vollwelt S1, 7.736 Matches)

- WorldRecord KF_0.26.2: 550,9 MiB.
- WorldRecord KF_0.27.0: 206,4 MiB.
- WorldRecord KF_0.27.1: 81,66 MiB.
- Reduktion gegen KF_0.27.0: 60,4 %.
- Reduktion gegen KF_0.26.2: 85,2 %.
- Vollmatch-Store: 389,53 MiB.
- Finance-Store: 124,21 MiB / 256.810 Events.
- kombinierte physische Daten: 595,4 MiB.
- WorldRecord nach Saisonwechsel: 68,17 MiB.
- alter Match- und Finance-Store nach erfolgreichem Saisonwechsel: leer.

## Laufzeit

- Vollsaison-Simulation KF_0.27.1: 241,3 s.
- Saisonwechsel: 18,4 s.
- Vergleichslauf KF_0.27.0: 265,2 s Simulation / 20,4 s Saisonwechsel.

Die Segmentierung verschlechtert die Laufzeit damit nicht erkennbar. Der Gewinn liegt weiterhin in der Trennung zwischen heissem Weltzustand und grossen saisonalen Detaildaten.
