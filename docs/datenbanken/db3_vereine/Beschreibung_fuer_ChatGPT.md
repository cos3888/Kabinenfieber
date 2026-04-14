# DB3 – Beschreibung für ChatGPT

## Rolle
DB3 enthält die Vereinsdatenbank. Sie definiert die feste Spielwelt der Vereine mit Identität, Vergleichswerten, Budgets und abgeleiteten Vereinswerten.

## Enthält
- Club-ID und Vereinsname
- Stadt / Region / Land
- Liga-Zuordnung
- Vereinsfarben
- Wappen- und Trikotpfade
- Fanbase, Prestige, Finanzkraft, Ambition
- Transferbudget und Gehaltsbudget
- Saisonziel
- Vereinsbeschreibung und Vereinstraits
- abgeleitete Vergleichswerte und Feldregeln

## Fachregel
Die Vereinswelt ist relativ stabil. Kader und Startstände können variieren, die Vereinsidentität bleibt bestehen.

## Wiederherstellung / Neuerstellung
1. Vereine mit fester `clubId` anlegen
2. Liga-, Stadt- und Identitätsdaten pflegen
3. Roh- und Vergleichswerte gemäß Feldregeln ableiten
4. Assetpfade konsistent halten
5. Budgets und Vergleichswerte validieren

## Nutzung im Projekt
DB2 lädt Vereine aus DB3, baut daraus die Liga für den Karrierestart und schreibt Kader- sowie Budgetzustände in den Spielstand.
