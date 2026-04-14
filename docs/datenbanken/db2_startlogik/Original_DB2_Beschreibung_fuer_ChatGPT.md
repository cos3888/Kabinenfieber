# DB2 – Beschreibung für ChatGPT

## Fachliche Rolle
DB2 ist die Startlogik zwischen Referenzdaten (DB1), Vereinsbasis (DB3), Spielerlogik (DB4) und Taktikdaten (DB5).

## Operative Rolle
DB2 erzeugt einen vollständigen neuen Spielstand für den ersten spielbaren Browser-Flow.

## Architekturregeln
1. DB2 erzeugt nur den initialen Spielstand.
2. DB2 übernimmt keine spätere Saison-, Transfer- oder Entwicklungslogik.
3. Alle Menüs lesen später aus dem zentralen `gameState`.
4. DB2 darf keine HTML-Dummydaten benötigen.
5. DB2 verwendet DB4 operativ: Spielerstruktur, Positionsgewichte und Overall-Logik werden beim Generieren tatsächlich benutzt.

## Wichtige Ausgabe
DB2 muss nach `createNewCareer()` einen `gameState` liefern, der mindestens diese Nutzungen erlaubt:
- Vereinsauswahl
- Vereinsprofilvorschau
- Vereinsübernahme als Managerverein
- Büro
- Kaderliste
- Aufstellungsmenü

## Sicherungsregel
Diese DB2-Version ist kein Platzhalter- oder Dummy-Stand. Sie ist als direkt nutzbare Grundlage für die GitHub-Spielversion gedacht.
