# KF_0.25.5 Release Notes

KF_0.25.5 behebt den fehlenden Sponsor-Lifecycle der KI-Vereine.

## Ursache

Die initialen Sponsorvertraege liefen standardmaessig ueber Saison 1 und 2. Danach wurden frei gewordene KI-Sponsorenslots nicht erneut besetzt. Dadurch fiel ab Saison 3 ein grosser Einnahmenblock weg und der Finanz-/Lizenz-Langlauf wurde verzerrt.

## Aenderung

- KI-Clubs besetzen nach menschlicher Vereinswahl alle 10 realen Sponsorenslots.
- Humanclubs bleiben unangetastet und behalten freie Slots als Managemententscheidung.
- Am Saisonwechsel werden fehlende KI-Slots automatisch mit vorhandener Sponsor-/Vertragslogik aufgefuellt.
- Bestehende Vertraege bleiben erhalten; nur fehlende Slots werden ergaenzt.
- Hauptsponsor-Exklusivitaet und Sponsor-Deduplizierung bleiben erhalten.
- Die Auswahl ist deterministisch und verteilt passende Sponsoren, statt immer das hoechste Angebot zu nehmen.
- Lokaler aktiver-Vertragsindex vermeidet wiederholte Vollscans und ist nicht persistent.

## Nicht geaendert

- Matchsimulation
- Taktik-/Aufstellungslogik
- Liga-/Laender-Einkommenskalibrierung
- persistierte Schemas
