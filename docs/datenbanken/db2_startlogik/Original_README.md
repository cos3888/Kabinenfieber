# DB2 Startlogik v3 – Karrierestart

DB2 ist die operative Startlogik von **Kabinenfieber**.

Diese Version ist auf den vollständigen Karrierestart für die browserbasierte GitHub-Spielversion ausgelegt.

## Zielablauf
Hauptgebäude → Neue Karriere → Startlogik läuft vollständig → Vereinsauswahl → Vereinsprofil → Verein wählen → Büro → Kader → Aufstellung

## Öffentliche Funktionen
- `createNewCareer({ db1, db3, db4, db5, options })`
- `getClubSelectionPreview({ gameState, clubId })`
- `selectCareerClub({ gameState, clubId })`
- `rebuildManagerClubViews({ gameState, db5 })`

## Wichtige Architekturregel
DB2 erzeugt nur den **Start-Spielstand**.
Danach lesen spätere Menüs und Logiken aus dem zentralen `gameState`.
DB2 übernimmt keine laufende Saison-, Transfer- oder Entwicklungslogik.
