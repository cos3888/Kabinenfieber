# DB2 – Beschreibung für dich

## Was DB2 jetzt leistet
DB2 ist jetzt auf den vollständigen Karrierestart ausgelegt.

Das bedeutet:
- Beim Klick auf **Neue Karriere** kann DB2 einen neuen zentralen `gameState` erzeugen.
- Alle aktiven Vereine werden aus DB3 geladen.
- Für alle Vereine werden Startformationen, Kadergrößen, Spieler, Kader und Teamwerte erzeugt.
- Die Spieler werden auf Basis von DB1, DB4 und DB5 generiert.
- Danach kann die UI direkt eine echte Vereinsauswahl aus dem Spielstand lesen.
- Nach der Vereinswahl schreibt DB2 den Managerverein in den Spielstand und setzt Büro, Kader und Aufstellung startklar.

## Wichtig für die GitHub-Version
Die HTML-Menüs sollen keine eigenen Beispielspieler oder statischen Vereinslisten mehr enthalten.
Sie lesen später nur noch aus dem `gameState`, den DB2 erzeugt.

## Wichtige Grundregel
DB2 ist nur für den **Karrierestart** zuständig.
Spätere laufende Spiellogik gehört nicht hier hinein.

## Was im Spiel nach DB2 bereits direkt nutzbar ist
- Vereinsauswahl-Liste
- Vereinsprofil-Vorschau
- Managerverein im Spielstand
- Büro-Grunddaten
- kompletter Kader des Managervereins
- Startelf
- Bank
- Reserve
- Grundformation / Startaufstellung
