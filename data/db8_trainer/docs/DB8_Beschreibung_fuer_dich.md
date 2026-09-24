# DB8 – Beschreibung für Menschen

DB8 führt zunächst Trainertypen, keine einzelnen Trainerpersonen.

## Ziel
Trainertypen geben Vereinen eine Grundidee für:
- bevorzugte Standardformationen
- tolerierte Standardformationen
- bevorzugte Taktikbereiche
- Risiko
- Anpassungsbereitschaft
- Reaktionsverhalten

## Typen in KF_0.15.1
- Pragmatiker
- Offensivdenker
- Defensivstratege
- Pressingtrainer
- Ballbesitztrainer
- Umschalttrainer
- Flügelfokus
- Zentrumskontrolleur
- Ergebnisverwalter
- Risikotrainer

## Logik
Die Taktikbereiche sind bewusst Bereiche und keine festen Taktikwerte. Ein Trainer bevorzugt damit bestimmte Spielweisen, kann aber je nach Gegner, Kaderzustand, Heim/Auswärts, Fitness und Spielstand davon abweichen.

## Verknüpfung
- DB8 referenziert Standardformationen aus DB5.
- Vereine speichern den Verweis über `coachTypeKey`.
- Im Vereinsprofil werden `Trainertyp` und `Grundformation` unter Kerninfos angezeigt.
