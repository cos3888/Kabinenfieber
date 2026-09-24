# Architektur KF_0.25.6

KF_0.25.6 behebt ausschliesslich die Integration des KI-Sponsor-Lifecycles in den final aktiven Saisonwechsel und optimiert Sponsor-Lookups als abgeleiteten Runtimeindex.

## Saisonwechsel

Im final aktiven licence-aware `advanceIntoNextSeason()` gilt fuer `finance_new_season`:

1. `resetFinanceForNewSeason(world, previousSeason)`
2. `kf0255AutoFillAiSponsorSlots(world, world.meta.seasonNumber)`
3. Clubaggregate aktualisieren
4. Saisonstart-Budgets/Ziele aktualisieren
5. Verhandlungsantworten verarbeiten

Damit werden neue KI-Sponsorvertraege noch im neuen Finanzjahr erzeugt und ihre Zahlungen durch `createSponsorContract()` gebucht, bevor die neue Planung finalisiert wird.

## Sponsor-Runtimeindex

Persistente Wahrheit bleibt `world.sponsorContracts.byId` / `.order`. `kf0256SponsorContractIndexByWorld` ist eine `WeakMap`, die pro World lediglich `clubId -> Vertragsreferenzen` ableitet. Sie wird bei wachsender `order` inkrementell ergaenzt. Status und Saisonlaufzeit werden bei jeder Abfrage am kanonischen Vertrag geprueft.

Keine Schemaaenderung: `kf-core-0.25.1`, `kf-world-record-0.25.1`.

## Test

`tests/run_kf_0_25_6_fix_regression_test.js` testet den finalen Saisonwechsel im kritischen S2->S3-Fall. Sponsor-fremde teure Subsysteme werden im VM-Test gestubbt; die reale finale Saisonwechsel-Funktion, `resetFinanceForNewSeason()` und der reale Sponsor-Autofill laufen unveraendert. Zusaetzlich wird die Gleichheit des Runtimeindex mit einem Rohscan der kanonischen Vertragshistorie geprueft.
