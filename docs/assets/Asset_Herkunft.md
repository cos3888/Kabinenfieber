# Asset-Herkunft

Stand: 2026-09-24

## Grundsatz

Die Vereine und Sponsoren in Kabinenfieber sind fiktiv. Die im Projekt verwendeten Vereinsgrafiken wurden nach Nutzerangabe mit ChatGPT und vereinzelt mit Gemini erstellt.

## Vereinswappen

Quellordner (Google Drive):
`https://drive.google.com/drive/folders/1quyqOf1M3byrR5z2v_YLrXhqP3AlZmdU`

Technische Zuordnung erfolgt **nicht dauerhaft über den Dateinamen**, sondern über die bestehende `clubId` aus `data/db3_vereine/db3_vereine_final.json`.

Importprinzip:
1. Quelldatei wird einmalig anhand des normalisierten Vereinsnamens gefunden.
2. Ziel ist immer `assets/clubs/<clubId>/crest.png`.
3. Im Spiel bleibt `crestAsset` aus StaticData die technische Referenz.
4. Fehlt eine Datei, nutzt die UI den bestehenden `assets/ui/placeholders/crest_placeholder.png`-Fallback.

Bekannter Stand der Quelle: 24 Ligaordner mit je 18 Dateien (= 432 Dateien). Acht Dateien in `Türkei_3` gehören nicht zu den aktuell in StaticData geführten Vereinsnamen; diese acht aktuellen Vereine erhalten bis zur Nachlieferung den Fallback.

## Sponsoren

Die neue Sponsorenliste und die dazu erstellten Sponsorengrafiken werden **noch nicht** in diesen Repository-Neustart integriert. Sie gelten als vorbereitete Quelle für einen späteren eigenständigen Entwicklungsblock. Die derzeitige Sponsoren-Zwischenlösung von KF_0.27.1 bleibt unverändert.
