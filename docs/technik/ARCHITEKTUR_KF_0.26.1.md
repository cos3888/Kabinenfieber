# Architektur KF_0.26.1 - Bonusdaten-Bereinigung

## Ziel

KF_0.26.1 entfernt eine redundante, stark wachsende persistente Datenhaltung fuer bereits verarbeitete Spieler- und Transferpraemien. Es wird keine Praemienhoehe, Vertragslogik, Transferlogik oder Finanzbalance veraendert.

## Ausgangslage

Vor KF_0.26.1 wurden tatsaechliche Praemienzahlungen doppelt repraesentiert:

1. als echtes Finanzereignis in `world.clubFinances.byClub[clubId].financeEvents`,
2. zusaetzlich als Eintrag in `world.history.bonusEvents`.

`bonusEvents` wurde fachlich nicht fuer eine sichtbare Historie benoetigt. Es diente im Wesentlichen als Idempotenz-/Deduplizierungsquelle. Im Mehrsaison-Langlauf entstanden grob rund 250.000 Eintraege pro Saison.

## Neue kanonische Wahrheit

Tatsaechliche Buchung:

`world.clubFinances.byClub[clubId].financeEvents`

Praemien-Idempotenz innerhalb der laufenden Saison:

`financeEvents[].eventKey`

`eventKey` ist kein zweiter fachlicher Datensatz, sondern ein stabiler Schluessel auf der bereits vorhandenen echten Buchung.

`world.history.bonusEvents` bleibt vorerst als **leeres** Legacy-Kompatibilitaetsarray bestehen. Es ist keine kanonische Datenquelle und darf unter dem aktiven KF_0.26.1-Pfad nicht wachsen.

## Runtime-Index

`KF0261FinanceEventKeyCacheByWorld`

- world-spezifisch,
- abgeleitet,
- nicht persistent,
- initialisiert sich bei Bedarf aus allen aktuellen `financeEvents[].eventKey`,
- wird beim Saisonwechsel verworfen,
- wird nach neuen Buchungen inkrementell um den neuen Key erweitert.

Aktive Helfer:

- `kf0261FinanceEventKeyCache(world)`
- `kf0261BonusKeySeen(world, key)`
- `kf0261RegisterBonusKey(world, key)`
- `kf0261ResetBonusRuntimeIndex(world)`

Die bisherigen 0.25.x-Helfer `kf0251BonusKeySeen` und `kf0251RegisterBonusKey` werden auf die neuen Helfer umgebogen, damit bestehende Aufrufer nicht eine zweite Logik pflegen.

## Matchpraemien

Aktive Funktion:

`kf021ProcessMatchContractBonuses(world, match)`

Ablauf pro Praemie:

1. stabilen Key aus Match, Spieler und Praemientyp bilden,
2. `kf0261BonusKeySeen` pruefen,
3. echte Finanzbuchung ueber `kf021ChargePlayerCompensation` erzeugen,
4. `eventKey` wird direkt auf das FinanceEvent geschrieben,
5. Runtime-Key registrieren.

Bei Leihen entstehen je nach Gehaltsanteil zwei FinanceEvents mit demselben `eventKey`. Die Summe entspricht der einen fachlichen Praemie. Der Key verhindert eine zweite Verarbeitung der fachlichen Praemie.

## Saisonpraemien

Aktive Funktion:

`kf021PaySeasonPlayerBonus(...)`

Auch hier wird ausschliesslich ueber `financeEvents[].eventKey` dedupliziert. Es wird kein BonusEvent mehr geschrieben.

## Transferklauseln

Aktive Funktion:

`kf021PayInterClubBonus(...)`

Bei einer Transferklausel entstehen zwei echte Finanzereignisse:

- Ausgabe beim zahlenden Club,
- Einnahme beim beguenstigten Club.

Beide tragen denselben `eventKey`. Dadurch ist die fachliche Zahlung eindeutig markiert und nach Save/Reload rekonstruierbar.

Die eigentlichen Klauselobjekte in `world.transferMarket.activeClauses` behalten weiterhin ihren fachlichen `paid`-Zustand. Dieser wird nicht durch die neue Logik ersetzt.

## Saisonwechsel

`resetFinanceForNewSeason(world, previousSeason)` bleibt fuer die finanzielle Saisonlogik verantwortlich. KF_0.26.1 legt lediglich einen Wrapper darum:

- Basis-Finanzreset ausfuehren,
- Runtime-Key-Index verwerfen,
- Legacy-Container `world.history.bonusEvents` leer halten.

Damit ist die Deduplizierungsperiode sauber an die aktuelle Finanzsaison gekoppelt.

## Migration 0.26.0 -> 0.26.1

`migrateWorldDataTruthToCurrent(world)` besitzt am Bundle-Ende einen neuen finalen Wrapper.

Ablauf:

1. alle bisherigen Migrationen inkl. KF_0.26.0 Historienmigration ausfuehren,
2. `kf0261MigrateLegacyBonusEvents(world)` ausfuehren,
3. aktuelle Legacy-Transferklausel-BonusEvents untersuchen,
4. bei eindeutig zuordenbaren alten Transferklausel-Finanzereignissen den fehlenden `eventKey` auf Ausgabe und Einnahme nachtragen,
5. `world.history.bonusEvents` leeren,
6. Runtime-Key-Index invalidieren,
7. Schema auf `kf-core-0.26.1` setzen,
8. registrierten WorldRecord auf `kf-world-record-0.26.1` / `gameVersion 0.26.1` setzen.

Spieler-/Saisonpraemien aus 0.26.0 trugen ihren `eventKey` bereits direkt auf den FinanceEvents. Fuer sie ist keine Nachtragung notwendig.

## Doppelte Datenhaltung

Nach KF_0.26.1 gibt es fuer eine tatsaechlich verarbeitete Praemie keine zweite persistente Bonus-Historie mehr.

- echte Geldbewegung: FinanceEvent,
- Deduplizierung: `eventKey` auf demselben FinanceEvent,
- Runtime-Beschleunigung: abgeleiteter Set,
- Vertrags-/Transferklauselwahrheit: jeweiliges Vertrags-/Klauselobjekt.

Damit wird die Datenquellen-Regel eingehalten.

## Tests

Gezielter Test:

`tests/run_kf_0_26_1_bonus_event_cleanup_test.js`

Prueft:

- Matchpraemie einmalig,
- Save/Reload-Deduplizierung,
- Saisonpraemie einmalig,
- Leihpraemie 40/60 mit gemeinsamem Key,
- Transferklausel Ausgabe/Einnahme mit gemeinsamem Key,
- Transferklausel-Deduplizierung nach Reload,
- Migration eines alten 0.26.0-Transferklausel-BonusEvents,
- Schema 0.26.1,
- leerer Legacy-BonusEvent-Container.

Reale Matchstichprobe:

`tests/run_kf_0_26_0_real_match_storage_sample_test.js`

Unter KF_0.26.1 bei 180 echten simulierten Ligaspielen:

- `bonusEvents`: 0,
- FinanceEvents mit `eventKey`: 5.401,
- Historienverdichtung weiterhin ca. 93,8 % fuer den getesteten Match-Historienpayload.

Weitere relevante Regressionen:

- Datenwahrheit / Schema,
- Source Integrity,
- Multiworld / Server Foundation,
- Marktwerthistorie,
- Fixture-IDs,
- Pokal,
- Saisonwechsel-Invarianten,
- Sperren,
- Finanz-/Lizenzbaseline,
- Verhandlungen,
- Fixregressionen KF_0.25.1 bis KF_0.25.6,
- KF_0.26.0 Historienverdichtung.

## Nicht Teil von KF_0.26.1

- Ruhestaendler-Komprimierung,
- Staerkehistorie im Spielerprofil,
- historische Einzel-Faehigkeiten,
- neue Gameplay-/KI-Logik,
- Serverdatenbank/Lazy Loading.

Fuer den naechsten Spielerlebenszyklus-Block ist bereits fachlich festgelegt: Staerke zwei Mal pro Saison parallel zu den Marktwert-Stichtagen speichern, jeweils als durchschnittliche Gesamtstaerke seit dem vorherigen Stichtag. Einzelattribute werden nicht historisch gemittelt.
