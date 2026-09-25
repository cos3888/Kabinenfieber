# KF_0.29.1 – Autosave & World Metadata

## Ziel

KF_0.29.1 korrigiert den ersten Praxistest von KF_0.29.0. Kabinenfieber soll sich nicht wie ein klassisches lokales Savegame verhalten, sondern wie eine dauerhaft gespeicherte Online-Welt. Gleichzeitig erhalten Spielwelten einen verpflichtenden Namen und ein vorbereitetes Zugangsmodell für den kommenden Multiplayerblock.

## Änderungen

### Autosave

- der manuelle „Jetzt speichern“-Knopf wurde aus der normalen Spielerführung entfernt.
- normaler Kalenderfortschritt erzeugt nach vollständiger Verarbeitung einen sofortigen serverseitigen Checkpoint.
- eine abgeschlossene Kalenderschnellsimulation erzeugt ebenfalls einen sofortigen Checkpoint.
- relevante Managemententscheidungen werden sofort oder mit 1,4 s Debounce gespeichert.
- zusätzliche `change`-/`drop`-Hooks sichern Formular- und Lineupänderungen in den zentralen Managementansichten ab.
- beim Verlassen einer Welt und beim Logout wird ein offener Autosave vor dem Wechsel geflusht.
- fehlgeschlagene Saves bleiben sichtbar; Revisionskonflikte überschreiben die Serverwelt nicht.

### Reload

Der neue Regressionstest schreibt bewusst einen späteren Kalenderstand und eine neue Saison, entlädt die Runtime und lädt die Welt erneut. Erwartet werden identisch:

- `world.calendar.currentSlotKey`
- `world.meta.seasonNumber`
- Current-Season-Vollmatches
- Current-Season-FinanceEvents

Die angezeigte UI-Seite ist keine persistente Fußballwahrheit. Nach dem Laden einer übernommenen Mannschaft wird weiterhin das Büro geöffnet.

### Weltname / Zugangsmodell

Neue Welten benötigen `worldName` mit 3–40 Zeichen.

Verwaltungsmetadaten im World Registry:

- `worldName`
- `visibility`
- `joinPolicy`

Zulässige Kombinationen:

- `PUBLIC + OPEN` – offene Welt
- `PUBLIC + APPLICATION` – Bewerbungswelt
- `PRIVATE + INVITE_ONLY` – private Welt

Diese Felder werden **nicht** in den WorldRecord kopiert. `WorldRecord.memberships` bleibt alleinige Wahrheit für tatsächliche menschliche Mitgliedschaft, Clubzuordnung und `PLAYER`/`WORLD_ADMIN`.

Bestehende KF_0.29.0-Welten ohne Namen bleiben ladbar. In der Weltliste wird für solche Altbestände ein Fallbackname verwendet.

## Noch nicht umgesetzt

- öffentliche Weltsuche
- Bewerbungsannahme/-ablehnung
- Direktbeitritt in offene Welten
- Einladungs-UI
- serverautoritative Multiplayer-Gameplay-Commands
- Ready/Deadline/Countdown

## Zentrale Datenquellen

- aktuelle Spielwelt: committed WorldRecord-Revision
- aktuelle Vollmatches: Current-Season-Match-Details
- aktueller Finanzledger: Current-Season-Finance-Details
- Weltname/Sichtbarkeit/Join-Policy: World Registry / Firestore
- tatsächliche Mitgliedschaft/Club/Rolle: ausschließlich `WorldRecord.memberships`

## Doppelte Datenhaltung

Nein. Die neuen Weltmetadaten liegen nur im World Registry. Autosave erzeugt lediglich neue Revisionen derselben persistierten Wahrheit.

## Tests

- `tests/run_kf_0_29_1_autosave_world_metadata_test.js`
- angepasste KF_0.29.0 Auth-/Runtime-/HTTP-Regressions
- vollständige aktuelle Regression
- Syntaxcheck für Server und Browserbundle
