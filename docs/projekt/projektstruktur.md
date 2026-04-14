# Projektstruktur

```text
Kabinenfieber/
├── index.html
├── README.md
├── docs/
│   ├── projekt/
│   └── datenbanken/
├── data/
│   ├── source_archives/
│   ├── db1_allgemein/
│   ├── db2_startlogik/
│   ├── db3_vereine/
│   ├── db4_spieler/
│   └── db5_taktik/
├── src/
│   └── core/
├── masks/
│   ├── start/
│   ├── office/
│   ├── squad/
│   ├── lineup/
│   └── profiles/
├── tools/
└── assets/
    ├── common/
    ├── icons/
    ├── tiles/
    ├── ui/
    ├── nations/
    └── clubs/
```

## Leselogik
- `index.html` ist nur der einfache Einstieg.
- Die eigentlichen HTML-Masken liegen unter `masks/`.
- `src/core/app.js` verbindet Masken und Daten.
- `data/` enthält sowohl die Original-ZIP-Dateien als auch die entpackten Datenbankstände.
