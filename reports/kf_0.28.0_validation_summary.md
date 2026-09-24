# KF_0.28.0 Validation Summary

Datum: 2026-09-24

## Ergebnis
Backend-Persistenz-Fundament: **20/20 Checks bestanden**.

## Geprueft
- Weltregister belegt einen der Slots 1..1000.
- Firestore/File-Metadata enthaelt keine `clubId`-/`WORLD_ADMIN`-Wahrheit, sondern nur einen rebuildbaren User-Welt-Index.
- `WorldRecord.memberships` bleibt kanonische Club-/Rollenquelle.
- Ersteller wird initialer `WORLD_ADMIN`.
- `WORLD_ADMIN` kann spaeter vergeben werden und ist nicht dauerhaft an den Ersteller gebunden.
- Der letzte Weltadmin kann nicht versehentlich zurueckgestuft werden.
- Pro User maximal 5 aktive Welten.
- WorldRecord wird gzip-komprimiert revisionsbasiert gespeichert.
- Adminberechtigung fuer Einladungen wird aus dem geladenen WorldRecord geprueft.
- Nicht-Admin-Einladung wird abgewiesen.
- Match- und Finance-Daten werden slotweise segmentiert.
- stale revisions werden abgewiesen.
- Persistenz ueberlebt Repository-/Server-Neustart.
- alter WorldRecord-Snapshot wird nach neuem Commit entfernt.
- Saisontransition setzt Current-Season-Segmentzeiger zurueck.
- abgeschlossene Current-Season-Detailsegmente werden nach erfolgreichem Saisonwechsel physisch entfernt.
- alte Current-Season-Details werden nicht mehr als aktuelle Wahrheit exponiert.
- nach Saisontransition verbleibt im Test nur der aktuelle gzip-WorldRecord-Snapshot.
- rebuildbarer Teilnahmeindex ueberlebt Repository-Neustart.

## Testhinweis
Der neue Test wurde in einer lokalen Node-Laufzeit gegen den isolierten Backendblock ausgefuehrt. Die bestehende Browser-Regressionssuite konnte in dieser Arbeitsumgebung nicht direkt aus dem GitHub-Repository ausgefuehrt werden, weil der Container keinen Netzwerkzugriff auf GitHub hat. Der neue Block greift den Browser-Bundle noch nicht an; bestehende Gameplaypfade bleiben daher unveraendert.
