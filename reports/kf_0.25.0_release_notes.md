# KF_0.25.0 Release Notes

## Ziel

Technische Grundarchitektur fuer spaetere serverbasierte Multi-World-/Multiplayer-Nutzung, ohne neue Multiplayer-Spielmechaniken zu implementieren.

## Aenderungen

- `UserProfile` mit maximal 5 aktiven Trainerplaetzen eingefuehrt.
- Trainer dauerhaft an genau eine Welt gebunden; kein Transfer zwischen Welten.
- Profilweite Lifetime-Statistik, Cosmetics und abgeschlossene Trainerkarrieren vorbereitet.
- `WorldRecord` als organisatorischer Container um den Fussball-`gameState` eingefuehrt.
- Welt-Ersteller nur als historische Information; kein `ownerUserId`/Sonderrecht.
- Memberships als einzige aktuelle menschliche Clubsteuerungsquelle eingefuehrt.
- maximal 432 aktive menschliche Trainer je Welt; maximal ein Mensch je Verein.
- leere Welt wird nach Entfernen des letzten menschlichen Trainers aus dem Repository geloescht.
- Progressionsfelder fuer spaetere Deadline-/Aktivitaetslogik vorbereitet.
- `world.control`, `singleplayer` und Sessionreferenz aus neuen Fussballwelten entfernt; 0.24-Legacymigration vorhanden.
- World-/User-Repository-Grenze eingefuehrt. WorldRepository speichert serialisierte Payloads statt zweiter mutable Weltkopie.
- Runtime-Derived-Indizes pro Welt getrennt.
- erste World-Commands fuer Vereinszuordnung, Formation und Taktik eingefuehrt.
- UI-Formation und UI-Taktik nutzen die Command-Grenze.
- Saisonwechsel-Abschlussrefresh auf notwendige Aggregate beschraenkt und dadurch Langzeitlauf weiter beschleunigt.

## Nicht enthalten

- echter Server/Backend
- Datenbank
- Login/Registrierung
- Einladungen
- Abstimmungen
- Rundentimer/Ready-Engine
- Inaktivitaetswarnungen/-loeschjobs
- Netzwerk-Synchronisation
- neue Fussballfeatures

## Datenquellen

Fussballzustand bleibt `WorldRecord.gameState` mit den bisherigen kanonischen Quellen (`world.players.byId`, `world.squads`, `world.calendar.fixtures`, `world.history.matches` usw.). Benutzer-/Trainer-/Membership-/Progressionsdaten liegen ausserhalb des Fussballzustands.
