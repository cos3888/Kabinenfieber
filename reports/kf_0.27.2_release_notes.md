# KF_0.27.2 - Repository-/Asset-Bereinigung

## Ziel
Bereinigung des neuen GitHub-Ausgangsstands ohne Gameplay- oder Simulationsaenderung.

## Geaendert
- Alte club-spezifische 1x1-Trikot-PNGs und die dazugehoerigen `homeKitAsset`/`awayKitAsset`-Felder entfernt.
- Trikotdesigner als einzige Trikot-Wahrheit dokumentiert und im Architekturvertrag verankert.
- Bestaetigt tote/doppelte Assets entfernt; alle dynamisch benoetigten Bases und Masken bleiben erhalten.
- Redundanten DB3-JS-Export und alte Source-Archive entfernt.
- Reproduzierbare Test-JSON-Ausgaben aus der Versionierung genommen.
- Buildlabel, Schema und Finance-Architekturmetadaten auf KF_0.27.2 korrigiert.
- Legacy-Spielstand-Migration fuer KF_0.26.0-FinanceEvents abgesichert: eventKeys werden noch vor der externen Ledger-Auslagerung korrekt nachgetragen.

## Nicht Teil dieses Releases
- keine Gameplayaenderung
- kein Sponsorenumbau
- kein Servermodus
- keine Bereinigung der allgemeinen StaticData↔World-Vereinsstammdaten-Doppelung
- keine neue Wappenserie; fehlende Wappen bleiben Fallbackfaelle
