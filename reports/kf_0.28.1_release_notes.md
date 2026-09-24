# KF_0.28.1 – Cloud Persistence Verification

## Ziel
Nach dem erfolgreichen Cloud-Run-Deployment von KF_0.28.0 wird nicht nur geprüft, ob GCS/Firestore konfiguriert sind, sondern ob das Backend mit seiner Service Identity tatsächlich schreiben, lesen und löschen kann.

## Änderungen
- technischer Start-Selbsttest für Object Store und Metadata Store
- reservierte, sofort wieder gelöschte Probeobjekte/-dokumente
- Diagnose im Persistence-Status
- Berechtigungs- und Cleanup-Fehler werden unterscheidbar
- GCS-Content-Type-Option korrigiert

## Datenquellen
Keine Änderung an fachlichen Wahrheiten. Der Test nutzt ausschließlich technische Probe-Daten außerhalb von Welten und Spielständen.

## Doppelte Datenhaltung
Nein. Probe-Daten sind nicht fachlich und werden im selben Prüfablauf gelöscht.

## Tests
- erfolgreicher lokaler Object-/Metadata-Roundtrip
- Cleanup ohne Probe-Reste
- GCS-Adapter übergibt `metadata.contentType`
- Firestore-Probe nutzt reservierte System-Collection und wird gelöscht
- simulierte Storage- und Firestore-Berechtigungsfehler
- Payload-Mismatch und Cleanup-Fehler
