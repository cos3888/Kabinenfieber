# KF_0.26.2 Release Notes

## Spielerlebenszyklus / Ruhestaendler / Staerkehistorie

### Geaendert
- Zwei Staerke-Historienpunkte pro Saison auf derselben Zeitachse wie die vorhandenen Marktwertpunkte.
- Gespeichert wird `averageStrength`, der Durchschnitt der tatsaechlich angezeigten Gesamtstaerke seit dem vorherigen Stichtag.
- Der Marktwert verwendet am Stichtag die aktuelle angezeigte Gesamtstaerke aus `calculatePlayerCurrentOverallAdvanced(...)`; die bestehende Marktwertformel und ihre weiteren Faktoren bleiben erhalten.
- Laufende Staerkesamples werden kompakt in `world.meta.playerStrengthAccumulator` gesammelt und pro Kalenderslot dedupliziert.
- Ruhestaendler werden aus `world.players.byId`, `players.order` und allen Kaderstrukturen entfernt und kompakt in `world.history.retiredPlayers.byId` archiviert.
- Historische Profile von Ruhestaendlern bleiben fuer Basisdaten, Saisonstatistik, Transfers, Marktwert- und Staerkeverlauf aufloesbar; aktive Aktionen werden nicht angeboten.
- 0.26.1-Spielstaende migrieren bestehende bereits pensionierte Spieler; alte Staerkewerte werden nicht rekonstruiert.

### Datenhaltung
Es entsteht keine zweite Karrierehistorie: Saisonstatistik bleibt in `playerSeasons`, Transfers bleiben in `transfers`, Marktwert und Staerke teilen sich `playerMarketValues`, retiredPlayers enthaelt nur kompakte Identitaet/Karriereende.

### Performance
Die zentrale sichtbare Staerkeformel bleibt unveraendert. Fuer das weltweite Slot-Sampling werden nur statische Teilratings runtime-seitig gecacht; Form/Fitness/Moral werden weiterhin aktuell angewendet.
