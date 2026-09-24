# Vereinswappen – Importstatus

Stand: 2026-09-24

Die zentrale Vereinsquelle enthält 432 Vereine. Alle Vereine besitzen bereits einen stabilen `crestAsset`-Pfad nach dem Schema:

`assets/clubs/<clubId>/crest.png`

Die Google-Drive-Quelle enthält ebenfalls 432 PNG-Dateien. KF_0.27.3 hat 424 Wappen in die stabilen `clubId`-Pfade integriert. Google Drive bleibt die Master-/Importquelle; die Runtime-Dateien sind auf maximal 512×512 Pixel optimiert.

Weiterhin nicht passend vorhanden sind die Wappen für:
- FC Kapıdağ
- SC Marmara Adası
- FC Artvin Yayla
- SC Rize Çay
- FC Harran Ovası
- SC Mardin Taş
- FC Tunceli Munzur
- SC Erzincan Yayla

Im Ordner `Türkei_3` liegen stattdessen acht Dateien mit anderen Vereinsnamen. Sie werden bewusst nicht automatisch nach Reihenfolge zugeordnet.

## Import

Nach dem Herunterladen/Entpacken des Wappen-Quellordners:

`npm run assets:crests:import -- <pfad-zum-wappenordner>`

Nur prüfen, ohne Dateien zu kopieren:

`npm run assets:crests:import -- <pfad-zum-wappenordner> --dry-run`

Vollständigkeit des aktuellen Repository-Assetstands (Wappen plus gemeinsame Trikotdesigner-Assets):

`npm run assets:check`


## Runtime-Stand KF_0.27.3

- 432 Vereine insgesamt
- 424 echte Wappen im Repository
- 8 kontrollierte Fallback-Faelle in Tuerkei 3
- Zielpfad immer `assets/clubs/<clubId>/crest.png`
- Runtime-Wappen maximal 512×512 PNG
- hochaufgeloeste Masterdateien bleiben ausserhalb des Repositories in Google Drive
