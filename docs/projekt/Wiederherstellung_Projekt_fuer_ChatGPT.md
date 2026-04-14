# Wiederherstellung Projekt für ChatGPT

## Zweck
Diese Datei ist die technische Notfallsicherung für das Gesamtprojekt **Kabinenfieber**. Sie beschreibt die führende Struktur, die wichtigsten Regeln, die Datenbankrollen und die Wiederherstellungsreihenfolge.

## Führende Projektidee
Kabinenfieber ist ein browserbasiertes Fußballmanager-Spiel. Die aktuelle Priorität ist ein stabiler Grundkreislauf:
1. Spielstart mit Vereinswahl
2. Startlogik erzeugt echten Spielstand
3. Vereinsauswahl und Vereinsprofil
4. Vereinsübernahme
5. Büro
6. Kaderliste und Aufstellung

## Grundsätze
- **Ein Datensatz, viele Ansichten**
- **Startlogik und Spiellogik trennen**
- **DB1–DB5 bleiben die fachlichen Gruppen**
- **Maskentreue vor Neudesign**

## GitHub-Struktur
```text
Kabinenfieber/
├── index.html
├── README.md
├── docs/
│   ├── projekt/
│   └── datenbanken/
├── data/
│   ├── db1_allgemein/
│   ├── db2_startlogik/
│   ├── db3_vereine/
│   ├── db4_spieler/
│   └── db5_taktik/
├── src/
│   ├── core/
│   ├── start/
│   ├── office/
│   ├── profiles/
│   ├── lineup/
│   └── shared/
├── masks/
│   ├── start/
│   ├── office/
│   ├── squad/
│   ├── lineup/
│   ├── profiles/
│   └── shared/
└── assets/
    ├── ui/
    │   ├── icons/
    │   ├── tiles/
    │   ├── lineup/
    │   │   └── field_background.png
    │   └── placeholders/
    ├── nations/
    │   └── flags/
    └── clubs/
        └── <clubId>/
            ├── crest.png
            ├── home.png
            ├── away.png
            └── README.md
```

## Führende Dateien
- `index.html`: Einstiegspunkt
- `src/core/app.js`: zentrale Integrationslogik
- `masks/`: HTML-Masken
- `data/`: fachliche DB1–DB5
- `docs/`: Wiederherstellung und Projektwissen

## Datenfluss beim Karrierestart
1. `index.html` öffnet das Startmenü.
2. `Karriere starten` ruft DB2 auf.
3. DB2 liest DB1, DB3, DB4, DB5.
4. DB2 erzeugt einen initialen GameState im Zustand `club_selection`.
5. UI zeigt die Vereinsauswahl.
6. Nach Vereinsübernahme wird `career.status = office_ready`.

## Projektseitig festgezogene Zusatzregeln
### Asset-Pfade
- Vereinsassets unter `assets/clubs/<clubId>/`
- Pflichtdateien: `crest.png`, `home.png`, `away.png`
- kein Pflicht-`tile.png`

### Spielfeld
- Hintergrundbild unter `assets/ui/lineup/field_background.png`
- Bild = Rasenstruktur aus Luftbildperspektive
- Linien werden als Overlay gezeichnet

### Trikotnummernlogik
- Torhüter: `1 → 12 → 21 → 23 → 30+`
- Innenverteidiger: `4 → 5 → 13 → 15 → 24`
- Außenverteidiger: `2/3 → 14/16 → 17/18`
- Defensives/Zentrales Mittelfeld: `6/8 → 19/20 → 22`
- Offensives Mittelfeld: `10 → 17 → 20 → 24`
- Flügel: `7/11 → 17/18 → 21/22`
- Stürmer: `9 → 19 → 20 → 24/25`
- Vergabe nach Hauptposition

### Startformation muss besetzbar sein
- Pflichtslots müssen durch Hauptposition oder passende Nebenposition abgedeckt sein.
- Keine positionsfremden Notlösungen für Startslots.

## Wiederherstellungsreihenfolge
1. Projektstruktur anlegen
2. DB1–DB5 unter `data/` einspielen
3. `assets/` mit festen Pfaden anlegen
4. HTML-Masken unter `masks/` einspielen
5. `src/core/app.js` anbinden
6. Start → Neue Karriere → Vereinsauswahl → Vereinsprofil → Verein wählen → Büro testen

## Validierungscheckliste
- Karrierebeginn erzeugt echten Spielstand
- Vereinsauswahl startet bei Land
- Vereinsprofile öffnen und schließen sauber
- `Verein wählen` führt ins Büro
- Kaderliste zeigt echte Spieler
- Aufstellung nutzt DB5-Raster und Formationen
- Wappen laden online korrekt
