# DB7 – Wiederherstellungsbeschreibung für ChatGPT

## Rolle
DB7 ist die spielstandsbezogene Simulationsschicht für Matches.
DB7 beschreibt, **wie** ein Spiel berechnet wird.
DB6 speichert, **was** am Ende passiert ist.

## Projektgrundsatz
- aktueller GitHub-Stand bleibt Startpunkt
- keine UI-Neubauten
- bestehende Masken respektieren
- kleine saubere Änderungen
- keine doppelte Ergebniswahrheit neben DB6

## Inhalt von DB7
DB7 hält keine dauerhafte Matchhistorie.
DB7 hält:
- Meta-Informationen zur Simulationsgruppe
- Simulationsprofile / Eventtypen
- vorbereitete Matchkontexte
- letzte Simulationsergebnisse für Vorschau / Kontrolle
- Berichtstexte / Zusammenfassungen als Simulationsausgabe

## Dateien
- `db7_simulation_state.js` – leere DB7-Struktur / Eventtypen
- `db7_simulation_helpers.js` – Hilfsfunktionen, RNG, Gewichtungen
- `db7_match_context_builder.js` – baut Matchinput aus vorhandenem Spielstand
- `db7_match_simulator.js` – erzeugt Matchresultat im DB6-kompatiblen Format
- `db7_match_report_texts.js` – einfache Textbausteine für Bericht / Kurzfassung

## Datenfluss
1. Spielstand liefert Vereine, Spieler, Taktik, Formation.
2. DB7 baut daraus einen Matchkontext.
3. DB7 simuliert daraus ein Spiel.
4. Ergebnisobjekt ist direkt für DB6 nutzbar.
5. DB6 schreibt das Match in die Historie.

## Stand v1
Version 1 ist bewusst einfach:
- Teamstärke aus Startelf und Bank
- Heimvorteil als fixer Bonus
- Tore aus Stärkedifferenz + Zufall
- feste Eventtypen werden vorbereitet
- einfache Wechsel-, Karten-, Elfmeter- und Verletzungslogik
- einfache Berichtstexte

## Wichtige Regel
DB7 darf später inhaltlich verfeinert werden, ohne dass sich die Grundschnittstelle ändert.
