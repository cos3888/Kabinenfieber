# Asset-Struktur

## Grundregel

Jeder Verein bekommt einen eigenen Ordner mit seiner festen DB3-ID.

## Struktur

```
assets/
  common/
    logo.png
    startbild.png
  icons/
    icon_lineup.png
    icon_squad.png
  tiles/
    tile_lineup_bg.png
    tile_squad_bg.png
  clubs/
    ger1_fc_elbtor/
      crest.png
      home.png
      away.png
    ger1_sc_weserwerder/
      crest.png
      home.png
      away.png
```

## Dateinamen

- `crest.png` = Wappen
- `home.png` = Heimtrikot
- `away.png` = Auswärtstrikot

## Warum diese Struktur

- passt direkt zu DB3 `crestAsset`, `homeKitAsset`, `awayKitAsset`
- kein Umbenennen in der UI nötig
- manuelle Nachpflege ist klar und sicher
- ein Verein hat genau einen festen Asset-Ort

## Nachpflege

Sobald du ein neues Wappen oder Trikot hast, legst du die Datei einfach in den Vereinsordner mit genau diesem Namen. Danach wird sie automatisch benutzt.