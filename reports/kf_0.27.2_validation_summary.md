# KF_0.27.2 – Validation Summary

Stand: 2026-09-24

KF_0.27.2 bereinigt bestaetigte Repository-/Asset-Altlasten, ohne den aktuellen Gameplay- oder Simulationspfad zu veraendern.

## Asset-/Repository-Pruefung
- 432 Vereine in DB3/StaticData.
- Club-spezifische `home.png`/`away.png`-1x1-Platzhalter und Club-README-Platzhalter entfernt.
- `homeKitAsset`/`awayKitAsset` aus DB3, StaticData und neuen Weltobjekten entfernt; Altspielstaende werden migriert.
- Trikotdesigner vollstaendig: 20 Basisfarben, 5 Stilmasken, 3 Akzentmasken, 0 fehlende Designer-Assets.
- Wappenstand vor der separaten Wappenintegration: 20 im Repository vorhanden. Die Drive-Quelle enthaelt 424 fachlich zuordenbare aktuelle Wappen; 8 Tuerkei-3-Wappen bleiben offen.
- Reproduzierbare `reports/*.json` werden nicht mehr versioniert.

## Zusaetzlicher Migrationsfix
Ein echter Altspielstand-Randfall wurde waehrend der Regression gefunden und behoben: bei einer noch nicht migrierten KF_0.26.0-Welt liegen FinanceEvents vor der 0.27.1-Auslagerung noch eingebettet im WorldRecord. Die Migrationshilfe liest deshalb zuerst ein vorhandenes Legacy-Array und faellt erst bei aktuellen Welten auf den externen Finance-Store zurueck.

## Lokal erfolgreich ausgefuehrte Tests
Source-Integritaet, Architektur, Multiworld, Server-Foundation, Datenwahrheit, Marktwerthistorie, Fixture-ID, Pokal, Saisonwechsel, Sperren, Finance/Lizenz, Verhandlungen, Fixregressionen 0.25.1–0.25.6, Historienkompaktion, Bonusmigration, Spielerlebenszyklus, Match-/Finance-Stores 0.27.0/0.27.1, neuer 0.27.2-Assettest, UI-Ownership, Mail-/Datenintegritaet, Berichtskonsistenz, Match-Feel und Mehrsaison-Stabilitaet.

Match-Feel-Stichprobe: Ø 2,85 Tore, Ø 2,88 xG, Ø 15,95 Schuesse, Ø 14,75 Berichtsevents; keine Bericht-Ueberbehauptungen oder problematischen Textplatzhalter.

## Bewusst offen
- Wappenintegration: 424 passend vorliegende Drive-Wappen muessen noch optimiert und in die `clubId`-Pfade uebernommen werden; 8 Tuerkei-3-Wappen werden nachgereicht.
- Die statischen Vereinsstammdaten werden weiterhin teilweise aus StaticData in jede Welt kopiert; das bleibt ein spaeterer Architekturblock.
- Der neue Sponsorenbestand bleibt ein spaeterer eigener Funktionsblock.
