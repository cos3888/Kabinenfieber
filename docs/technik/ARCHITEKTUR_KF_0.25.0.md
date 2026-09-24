# Architektur KF_0.25.0

## Runtime

`index.html` laedt `src/static-data.js`, `src/db1-db2-data.js` und `src/app.bundle.js`. Styling: `src/styles/app.css`. Keine aktive Versions-Patchbuildkette.

## Ebenen

KF_0.25.0 trennt erstmals vier Zustandsbereiche:

1. `UserProfile` - dauerhafte Benutzeridentitaet, Trainerplaetze, Lifetime-Statistik, Cosmetics.
2. `WorldRecord` - Weltorganisation, Memberships, Progression und Persistenzmetadaten.
3. `WorldRecord.gameState` - eigentliche Fussballwelt.
4. `AppState.session`/`AppState.ui` - lokaler Client- und Darstellungszustand.

Benutzer- oder Serverorganisation darf nicht als zweite Fussballwahrheit in `gameState` gespiegelt werden.

## UserProfile/Trainer

- maximal 5 aktive Trainer (`KF_SERVER_POLICY.maxActiveTrainersPerUser`)
- Trainer ist dauerhaft genau einer Welt zugeordnet
- maximal ein aktiver Trainer desselben Benutzerprofils pro Welt
- Profil besitzt Lifetime-Statistik und Cosmetics
- abgeschlossene Trainer werden kompakt in `pastTrainerCareers` erhalten

## WorldRecord

Zentrale Felder:

- `id`
- `schemaVersion = kf-world-record-0.25.0`
- `gameVersion`
- `createdAt`
- `createdByUserId` nur historisch
- `creationRules`
- `runtimeSettings`
- `progression`
- `memberships`
- `gameState`

Kein Weltbesitzer mit Sonderrechten.

## Memberships

`WorldRecord.memberships` ist die Steuerungswahrheit fuer menschliche Trainer.

- maximal 432 aktive menschliche Trainer je Welt
- maximal ein Mensch je Verein
- menschliche Clubkontrolle ueber `activeMembershipForClub(...)`
- `world.control` ist Legacy und wird bei Migration entfernt

## Progression

Vorbereitet:

- `deadlineAt`
- `readyTrainerIds`
- `lastHumanActivityAt`
- Membership-`lastActivityAt`

Noch keine automatische Runden- oder Inaktivitaetslogik.

## Persistenz

`WorldRepository`/`UserProfileRepository` sind lokale Adapter und keine echte DB.

Worlds werden als serialisierte JSON-Payloads gespeichert. Laden liefert eine isolierte Instanz. Keine zweite mutable Live-World im Repository halten.

## Runtime-Caches

`RuntimeDerivedIndexByWorld` trennt abgeleitete Match-/Fixture-/Slot-Indizes nach Welt-ID. Welt A und Welt B duerfen nie denselben Index teilen.

## Commands

`executeWorldCommand` ist die vorbereitete serverseitig nutzbare Mutationsgrenze.

Aktuell:

- `ASSIGN_TRAINER_CLUB`
- `SET_FORMATION`
- `SET_TACTIC`

Die Command-Abdeckung wird spaeter schrittweise erweitert; kein Big-Bang-Umbau der gesamten Fachlogik.

## gameState-Datenwahrheiten

- Spieler: `world.players.byId`
- Vertrag: `player.contract`
- Marktwert: `player.marketValue`
- Verletzung: `player.injurySlotsLeft`
- Sperren: `player.suspensions[]`
- Kader/Aufstellung/Taktik/Formation: `world.squads`
- Fixtures: `world.calendar.fixtures`
- Finanzen: `world.clubFinances.byClub`
- Zukunftstransfers: `world.transferMarket.futureMoves`
- Matchhistorie: `world.history.matches`
- Marktwerthistorie: `world.history.playerMarketValues[playerId]`

## Migration

`migrateLegacyWorldToRecord(world, profile)` ueberfuehrt die alte 0.24-Steuerungsinformation aus `world.control` in Trainer/Membership und entfernt `singleplayer`-/Sessionmetadaten aus der Fussballwelt.

## Performance

Runtime-Repositories duerfen keine zweite mutable Vollwelt halten. Saisonwechsel-Abschlussaggregate werden nur fuer die tatsaechlich benoetigten Werte neu berechnet. Der aktuelle Mehrsaison-Test bleibt bis Saison 5 stabil.

## Noch offen vor echtem Onlinebetrieb

- echtes Backend und DB
- Authentifizierung
- Repository-Adapter auf Serverpersistenz
- vollstaendig DOM-freier Game Core
- breitere Command-Abdeckung
- Einladungen/Gleichberechtigungs-Abstimmungen
- Ready-/Deadline-Engine
- individuelle und weltweite Inaktivitaetsregeln
- Warnungen/Loeschjobs
- Netzwerk-Synchronisation
