# KF_0.25.0 Validation Summary

## Ergebnis

Alle 17 aktuellen JSON-Testreports des Abschlusslaufs stehen auf `passed=true`.

## Architektur/Servergrundlage

- Benutzerprofil mit genau 5 aktiven Trainerplaetzen geprueft.
- sechster Trainer wird abgewiesen.
- derselbe Benutzer kann nicht zweimal in derselben Welt aktiv sein.
- WorldRecord trennt Membership/Progression von `gameState`.
- keine `world.control`-/`singleplayer`-/Sessionfelder in neuen Fussballwelten.
- Ersteller besitzt kein Owner-Sonderrecht.
- Repository Save/Load liefert isolierte serialisierbare WorldRecords.
- Runtime-Caches sind world-scoped.
- 432 aktive menschliche Trainer werden akzeptiert; Nummer 433 wird abgewiesen.
- letzter Trainer entfernt -> Trainerplatz/Historie korrekt, leere Welt aus Repository geloescht.
- 0.24-Legacy-Steuerungsmetadaten migrieren in Memberships.

## Saison/Daten

Saisonwechseltest ueber alle 432 Clubs:

- `squadCount`: 0 Abweichungen
- `averageAge`: 0 Abweichungen
- `salaryCommitted`: 0 Abweichungen
- `salaryBudgetRemaining`: 0 Abweichungen
- Club-/Kaderzuordnung: 0 Abweichungen
- fehlende kanonische Vertraege: 0
- Legacy-Vertragsfelder: 0
- Formationswahrheit: 0 Abweichungen

Mehrsaison-Test Saison 1 bis 5:

- Uebergangszeiten: 3.119 s / 3.703 s / 3.244 s / 3.922 s
- keine unbesetzten Clubs unter 22 Spielern
- menschlicher Testclub wird nicht automatisch gerettet
- aktive Spielerpopulation bleibt stabil (ca. 10.5k)
- Marktwerthistorie maximal zwei Punkte je Spieler/Saison

## Finanzen/Lizenz

- 21/21 aktuelle Finanz-/Lizenzchecks gruen
- 432 Clubs geprueft
- Zukunftsszenarien/Leihen/Zukunftstransfers/Lizenzgrenzen weiterhin konsistent

## Match/Report

Matchfeel (20 Spiele):

- Ø Tore: 3.75
- Ø xG: 3.55
- Ø Abschluesse: 18.1
- 0 Textprobleme
- 0 extreme Low-xG/High-Goal-Ausreisser im Test

Berichtskonsistenz (18 Spiele):

- 0 fehlende Kickoff/Halbzeit/Abpfiff-Bloecke
- 0 verpasste Tore
- 0 Statistik-Ueberbehauptungen
- 0 Textprobleme

## Weitere gruene Bereiche

- Quellintegritaet
- Architecture Guard
- Multi-World-Readiness
- Datenwahrheiten
- Marktwerthistorie
- Fixture-ID-Integritaet
- Nationalpokal
- Sperrenmodell 7/7
- Verhandlungen
- Eigentum/Leihen/UI
- Daten-/Mailintegritaet

## Hinweis zum Runner

Die Einzeltests wurden frisch ausgefuehrt. Der zentrale Sammelrunner kann in begrenzten Toolumgebungen durch mehrere Vollwelt-Tests das Gesamtzeitlimit ueberschreiten; deshalb wurden die Reports einzeln validiert.
