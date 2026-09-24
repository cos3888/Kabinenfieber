# KF_0.26.0 Release Notes

## Schwerpunkt

Historienverdichtung und Vorbereitung der aktiven Welt auf serverseitige Persistenz.

## Aenderungen

- App-Version auf `0.26.0` angehoben.
- GameState-Schema auf `kf-core-0.26.0` angehoben.
- WorldRecord-Schema auf `kf-world-record-0.26.0` angehoben.
- Neue historische Ergebnisquelle `world.history.seasonResults`.
- Neue Spieler-Saisonhistorie `world.history.playerSeasons`.
- Neuer begrenzter Vorsaison-Simulationssnapshot `world.history.previousSeasonRecentContext`.
- `world.history.matches` enthaelt nach einem Saisonwechsel nur noch Vollmatches der aktuellen Saison.
- Historische Spieler-/Vereins-/Wettbewerbsleser auf die neuen kompakten Quellen umgestellt.
- Alte 0.25.x-Welten mit abgeschlossenen Vollmatches werden beim Migrationspfad automatisch verdichtet.
- WorldRecord-Schema und `gameVersion` werden bei der Migration ebenfalls aktualisiert.

## Bewusst nicht umgesetzt

- keine neue historische Einzelspiel-/Spielbericht-UI
- keine Komprimierung von Ruhestaendlern
- keine Verdichtung von `bonusEvents`
- keine Aenderung der Matchsimulation oder des Balancings
- noch keine echte Serverdatenbank/Lazy-Loading-Persistenz
