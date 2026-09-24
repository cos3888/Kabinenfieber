# Architektur KF_0.25.1

KF_0.25.1 baut auf der WorldRecord-/Profilarchitektur von KF_0.25.0 auf und veraendert keine grundlegende Serverdomäne.

## Datenwahrheit

- aktuelle Spieler: `world.players.byId`
- aktuelle Kader/Aufstellung/Taktik: `world.squads`
- Fixtures: `world.calendar.fixtures`
- historische Matches: `world.history.matches`
- Bonusereignisse: `world.history.bonusEvents`
- Regeln/Texte: `StaticData`

Runtime-Indizes und Match-Caches sind nicht persistent und duerfen niemals als zweite Wahrheit verwendet werden.

## Runtime-Indizes

Der Matchindex ist world-spezifisch. Neue Matches werden inkrementell eingetragen. Saisonwechsel invalidieren Kalender-/Fixture-Indizes, aber nicht automatisch die unveraenderte historische Matchmenge.

Zusaetzliche Ableitungen dienen Bonus-Key-Deduplizierung, letzten Vereinsspielen und saisonalen Einsatz-/Minutenauswertungen.

## Historienarchiv

Waehren der aktuellen Saison sind volle Events vorhanden. Nach dem Saisonwechsel wird das abgeschlossene Match auf dauerhafte Fakten reduziert. `playerStats` inklusive Matchbewertung bleiben unveraendert erhalten.

## Kalender-Schnellsimulation

Simulation erfolgt weiterhin pro vollwertigem Match. Der Browser verarbeitet bis zu acht Matches pro Tick. Historiencommit erfolgt erst nach dem vollstaendigen Slot.

## Matchlokaler Cache

`calculateGroupRatingsAdvanced` kann waehrend eines einzelnen Matches identische Werte aus einem lokalen Cache lesen. Rueckgaben werden kopiert, damit nachfolgende Mutationen keinen Cachezustand veraendern. Nach dem Match wird der Cache verworfen.

## Saisonwechsel

Abgearbeitete Insolvenzen werden aus `pendingInsolvencies` entfernt. Normale KI-Clubs werden nach allen Future Moves technisch auf 22 Spieler abgesichert. Aktuelle Insolvenzclubs verwenden weiterhin ihren gesonderten Wiederaufbaupfad.
