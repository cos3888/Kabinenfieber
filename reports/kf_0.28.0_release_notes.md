# KF_0.28.0 - Backend Persistence Foundation

## Ziel
KF_0.28.0 legt die persistente Backend-Grundlage fuer die spaetere Multiplayer-Runtime, ohne Gameplay oder Matchsimulation zu veraendern.

## Zentrale Datenquellen
- Fussballwahrheit bleibt im bestehenden `WorldRecord.gameState` und den bekannten zentralen Weltquellen.
- Clubzuordnung und Weltrolle eines menschlichen Trainers bleiben in `WorldRecord.memberships` die kanonische Wahrheit.
- Firestore bzw. der lokale Metadata-Adapter speichert nur Weltslots, Weltregistrierung, Einladungen und einen **rebuildbaren** User-Welt-Teilnahmeindex. Dieser Index enthaelt bewusst weder `clubId` noch `WORLD_ADMIN`.
- Vollmatch- und Finance-Details bleiben fachlich getrennt und werden serverseitig slotweise segmentiert.
- Das Manifest ist der atomare Zeiger auf die aktuell committed WorldRecord-Revision und deren Current-Season-Segmente.

Damit entsteht keine zweite persistente Club-/Rollen- oder Fussballwahrheit.

## Neu
- persistenter lokaler File-Adapter fuer Entwicklung/Pi
- Google-Cloud-Storage-Adapter fuer grosse Welt-/Match-/Finance-Segmente
- Firestore-Metadata-Adapter fuer Slots, Weltregister, Einladungen und rebuildbaren Teilnahmeindex
- `WorldPersistenceService` mit gzip-komprimierten WorldRecords, Revisionen und Manifest-Commit
- alte WorldRecord-Snapshots werden nach erfolgreichem Commit entfernt
- Current-Season-Segmente werden nach erfolgreichem Saisonwechsel physisch bereinigt
- 1000 globale Welt-Slots
- maximal 5 aktive Weltteilnahmen je User, geprueft ueber den rebuildbaren Teilnahmeindex
- `WORLD_ADMIN` als Rolle in `WorldRecord.memberships`; Ersteller wird bei Legacy/Initialisierung erster Admin, weitere Admins koennen spaeter ernannt oder zurueckgestuft werden
- letzter Weltadmin kann nicht versehentlich entfernt werden
- Admin-Service prueft Einladungsberechtigung gegen die WorldRecord-Mitgliedschaft
- slotweise Match-/Finance-Segmente statt Datei pro Match/Event
- optimistische Revisionsabsicherung ueber Manifest-Generation
- lokaler File-Fallback verwendet dieselben fachlichen Schnittstellen und ist spaeter fuer Pi/anderen Host nutzbar
- Cloud-Run-faehiger Health-Endpunkt, Dockerfile und Cloud-Konfigurationsvorlagen

## Bewusst noch nicht enthalten
- Browser/Game-Runtime ist noch nicht an den neuen Backend-Service gekoppelt.
- Auth/Login, Lobby und Einladungs-UI folgen in einem separaten Block.
- Beitritt/Verlassen einer Welt wird erst im Coordinator-Block atomar zwischen WorldRecord und rebuildbarem Firestore-Index orchestriert.
- Command Gateway und serverautoritatives Fortschreiten folgen separat.
- Keine Sponsor-/ClubStaticData-/Gameplay-Aenderung.

## Tests
`tests/run_kf_0_28_0_backend_persistence_foundation_test.js`

Geprueft werden u. a. Datenquellen-Trennung, Rollen, 1000 Slots, 5-Welten-Limit, Adminberechtigung, Neustart/Reload, Revisionen, Slot-Segmente, Gzip, Retention und Saisontransition.
