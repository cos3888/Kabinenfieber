# KF_0.29.2 – Save Integrity & World Navigation

## Anlass

Im Browser-Praxistest wurde nach absolviertem Spieltag beim erneuten Laden wieder die Vereinsauswahl angezeigt. Zusätzlich führte „Zur Weltliste“ bei fehlgeschlagenem Save-Flush zu keiner sichtbaren Reaktion.

## Änderungen

- Vereinsübernahme wird zum bestätigten Servercheckpoint.
- Bei Takeover-Savefehler wird die lokale Clubzuordnung zurückgesetzt.
- Normaler Kalenderfortschritt verwendet einen Hard Checkpoint nach vollständiger Slotverarbeitung.
- Während eines Hard Checkpoints werden weitere Aktionen blockiert.
- Checkpointfehler zeigen Retry und bewusstes Verwerfen unbestätigter lokaler Änderungen.
- Weltlisten-Navigation verschluckt Save-Fehler nicht mehr.
- Browser/Backend-Version wird über `/healthz` abgeglichen.
- Create-/Snapshot-Requests senden `clientVersion`; Server verlangt exakt `0.29.2`.
- `index.html` verwendet Cache-Busting für Bundle und CSS.
- neuer Regressionstest deckt Vereinsübernahme + Spieltag + Reload ab.

## Datenquellen

Keine neue persistierte Wahrheit:
- aktuelle Welt: committed `WorldRecord`
- laufende Vollmatches: `CurrentSeasonMatchRepository`
- laufende FinanceEvents: `CurrentSeasonFinanceRepository`
- Vereinszuordnung/Mitgliedschaft/Rollen: `WorldRecord.memberships`
- Weltname/Zugangsmodell: World Registry / Firestore

## Deployment

Frontend und Cloud-Run-Backend müssen gemeinsam auf KF_0.29.2 deployt werden. Bei gemischten Versionen blockiert der Client absichtlich weitere Remote-Aktionen.
