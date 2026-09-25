# KF_0.29.3 – Backend Compatibility

## Anlass

Nach dem 0.29.2-Frontenddeploy meldete der Login sofort „Backend nicht erreichbar“, obwohl derselbe Cloud-Run-Dienst zuvor funktionierte. Die neue vorgeschaltete `/healthz`-Prüfung war selbst zur zusätzlichen Fehlerquelle geworden.

## Änderungen

- `/healthz` wird nicht mehr vor Login, Session-Restore oder Weltladen ausgeführt.
- Spiel-/Browserbuild und Remote-Vertrag sind getrennt:
  - `KF_VERSION = 0.29.3`
  - `KF029_REMOTE_CONTRACT_VERSION = 0.29.2`
- Create-/Snapshot-Requests senden weiterhin `clientVersion`, nun aber als Remote-Vertragsversion.
- Servercode trennt `SERVICE_VERSION = 0.29.3` und `API_VERSION = 0.29.2`.
- kompatible 0.29.1-Backends bleiben nutzbar; 0.29.2-Backends akzeptieren weiterhin den Vertrag 0.29.2.
- Save-Integrity-, Hard-Checkpoint- und Weltlisten-Recovery aus KF_0.29.2 bleiben unverändert.

## Datenquellen

Keine neue persistierte Wahrheit. Es gelten weiter committed `WorldRecord`, `WorldRecord.memberships`, CurrentSeasonMatchRepository, CurrentSeasonFinanceRepository und World Registry / Firestore.

## Tests

- `npm run test:0290`
- `npm run test:0291`
- `npm run test:0292`
- `npm run test:0293`
- `npm test -- --full`
- Syntaxchecks Server + Browserbundle
