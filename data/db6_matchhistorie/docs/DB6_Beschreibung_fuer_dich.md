# DB6 – Beschreibung für Menschen

DB6 ist die Matchhistorie von Kabinenfieber.

Hier werden nur Spiele gespeichert, die wirklich schon gespielt wurden.
DB6 ist damit das historische Gedächtnis eines Spielstands.

## Was DB6 speichert
Pro Spiel wird gespeichert:
- welcher Wettbewerb betroffen ist
- in welcher Saison und an welchem Spieltag gespielt wurde
- Heimteam und Auswärtsteam
- Endergebnis
- Formation beider Teams
- welche Spieler im Match gespeichert wurden
- wann diese Spieler begonnen und aufgehört haben
- welche Ereignisse im Match passiert sind
- welche Note die Spieler aus diesem Spiel erhalten haben

## Was DB6 bewusst nicht speichert
- zukünftige Spiele
- kompletten Spielplan als Primärhistorie
- fertige Tabellen als Primärdaten
- doppelte Vereinshistorie als eigene Wahrheit
- doppelte Spielerhistorie als eigene Wahrheit

## Warum das so gebaut ist
Die Matchhistorie ist die eine Wahrheit.
Aus ihr lassen sich später ableiten:
- Tabellen
- Spielerstatistiken
- Vereinsstatistiken
- Formkurven
- Torjägerlisten
- Einsatzlisten

## Eigentor-Regel
Eigentore werden als eigenes Ereignis gespeichert.
Dadurch bleibt sichtbar:
- welcher Spieler das Eigentor verursacht hat
- welchem Verein das Tor gutgeschrieben wird

## Erste Notenlogik
Die erste Notenlogik ist bewusst einfach und später austauschbar.
Basis ist 6.0.
Danach wirken Spielzeit, Tore, Vorlagen, Karten, Eigentore und Sieg/Niederlage auf die Note.
Die Note wird im Matchdatensatz gespeichert.

## Technische Folge
DB6 kann früh eingebaut werden, auch bevor die vollständige Matchsimulation fertig ist.
Wichtig ist nur, dass ein abgeschlossenes Spiel als sauberer Matchdatensatz geschrieben werden kann.
