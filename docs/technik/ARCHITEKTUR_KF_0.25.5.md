# Architektur KF_0.25.5

KF_0.25.5 aendert keine persistierte Domainstruktur und keinen Matchkern. Der Fix ergaenzt den fehlenden KI-Sponsor-Lifecycle und ist bewusst auf Server-/Ressourcentauglichkeit ausgelegt.

## Fachlicher Ablauf

- Bei der menschlichen Vereinszuordnung werden nur die verbleibenden KI-Clubs kommerziell auf ihre realen Sponsorenslots aufgefuellt.
- Beim Saisonwechsel laeuft der Sponsor-Autofill direkt nach `resetFinanceForNewSeason()` und vor der abschliessenden neuen Saisonplanung.
- Menschlich kontrollierte Clubs werden nicht automatisch veraendert.
- Gueltige bestehende Sponsorvertraege bleiben bestehen; nur fehlende Slots werden ergaenzt.

## Datenwahrheit

- Sponsoren: `world.sponsors.byId`
- Sponsorvertraege: `world.sponsorContracts.byId` / `.order`
- Sponsorbeziehungen: `world.sponsorRelations.byClubSponsor`
- Finanzbuchungen: `world.clubFinances.byClub`

Der neue aktive-Vertraege-Index in `kf0255AutoFillAiSponsorSlots()` lebt nur fuer genau diesen Aufruf und wird danach verworfen.

## Ressourcenschutz

Die Autofill-Routine scannt die Sponsorvertragshistorie einmal fuer die Zielsaison und gruppiert aktive Vertraege lokal nach Club. Neue Kandidaten werden aus bereits vorhandenen Sponsorindizes (`world.sponsors.bySize`) gesucht. Es gibt keine pro Club wiederholten Vollscans der kompletten Vertragshistorie.

## Integritaet

- maximal 1 Hauptsponsor
- maximal 2 grosse Sponsoren
- maximal 3 mittlere Sponsoren
- maximal 4 kleine Sponsoren
- kein Sponsor doppelt im selben Club
- Hauptsponsor pro Land/Sponsor exklusiv
- Standardvertrag zwei Saisons
- Wiederholungsaufruf in derselben Saison idempotent

## Version / Schema

App-Version: `0.25.5`.
Persistierte Schemas bleiben `kf-core-0.25.1` und `kf-world-record-0.25.1`.
