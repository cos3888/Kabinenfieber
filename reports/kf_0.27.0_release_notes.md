# KF_0.27.0 Release Notes

## Schwerpunkt

Serverpersistenz Phase 1: Vollstaendige abgeschlossene Matches der laufenden Saison werden aus dem monolithischen WorldRecord ausgelagert und nur bei Bedarf fuer die Matchinfo geladen.

## Aenderungen

- Version/Schema auf `0.27.0`, `kf-core-0.27.0`, `kf-world-record-0.27.0` angehoben.
- Neuer `CurrentSeasonMatchRepository` mit Segmentierung nach Welt, Saison und Match-ID.
- Lokaler Adapter speichert Vollmatches als serialisierte Payload statt als zweiten lebenden Objektgraphen.
- `world.history.matches` enthaelt nur noch kompakte aktuelle Saisonmatches.
- `recordPlayedMatch` schreibt Vollmatch in den Store und kompakten Index in die Welt.
- Matchinfo laedt Vollmatchdetails gezielt aus dem Store.
- Saisonwechsel loescht die Vollmatches der abgeschlossenen Saison erst nach erfolgreichem bestehenden Historien-/Saisonwechselpfad.
- World-Loeschung entfernt auch Matchsegmente.
- Migration von 0.26.2 lagert vorhandene Vollmatches der aktuellen Saison aus.

## Nicht geaendert

- Matchsimulation und Ergebnisermittlung.
- 0.26-Historienmodell fuer abgeschlossene Saisons.
- Tabellen, Spieler-Saisonstatistiken, Marktwert-/Staerkehistorie und Ruhestaendler.
- FinanceEvents; deren Segmentierung ist ein spaeterer Serverblock.
- Keine dauerhafte Vollmatchhistorie alter Saisons.

## Speicherwirkung (Vollwelt S1, 7.736 Matches)

- WorldRecord 0.26.2 vor Saisonwechsel: 550,9 MiB.
- WorldRecord 0.27.0: 206,4 MiB (-62,5 %).
- Current-Season-Matchindex: 45,2 MiB.
- Vollmatch-Store: 388,7 MiB.
- Kombiniert: 595,1 MiB (~8 % mehr physische Daten als der alte Monolith).
- Nach Saisonwechsel: WorldRecord 69,8 MiB, Vollmatch-Store leer.

Der Gewinn liegt bewusst im kleineren geladenen/serialisierten WorldRecord und in der serverfaehigen Segmentierungsgrenze.
