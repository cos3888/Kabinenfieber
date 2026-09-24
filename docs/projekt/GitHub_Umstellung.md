# GitHub-Umstellung – Ausgangsbasis KF_0.27.1

Stand: 2026-09-24

## Ziel

KF_0.27.1 wird als saubere neue Repository-Basis verwendet. Der bestehende Spielkern und die relative Dateistruktur bleiben zunächst unverändert, damit lokale ZIP-Tests und GitHub Pages weiterhin denselben Frontendstand verwenden können.

## Bewusste Entscheidungen

- Kein Gameplay-Umbau im Rahmen der Repository-Migration.
- Keine Integration der neuen Sponsorenbasis; sie folgt später als eigener Entwicklungsblock.
- Vereinswappen werden einmalig über den Vereinsnamen aus der Assetquelle aufgelöst und anschließend ausschließlich unter der stabilen `clubId` gespeichert.
- Lokale Spielstände, Server-Runtimedaten und `.env`-Dateien werden nicht versioniert.
- Die spätere Server-API wird neben dem weiterhin lokal testbaren Spielkern entwickelt.

## Repository-Struktur

Die vorhandene KF_0.27.1-Struktur bleibt vorerst erhalten. Ergänzt wurden lediglich Repository-/Asset-Werkzeuge und Dokumentation. Ein größerer Source-Build-Umbau soll erst erfolgen, wenn er für den Servermodus tatsächlich notwendig ist.

## Asset-Prüfung

`npm run assets:check`

liefert eine vollständige Liste fehlender Vereinswappen und Trikots. Damit werden Assetlücken beim GitHub-Neustart sichtbar, ohne sie stillschweigend mit falschen Dateien zu füllen.
