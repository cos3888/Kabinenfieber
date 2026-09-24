DB8 enthält ab KF_0.15.1 zehn Trainertypen als feste Archetypen. Jeder Typ besitzt:
- 3 Lieblingsformationen
- 2 tolerierte Formationen
- Risikobereitschaft, Anpassungsfähigkeit, Stiltreue und Reaktionswerte
- bevorzugte Taktikbereiche für die 5-Stufen-Regler der Taktikoberfläche

Wichtig: Die Taktikbereiche sind keine festen Einstellungen. Die KI-Matchplanlogik startet aus diesen Bereichen und darf abhängig von Gegneranalyse, Kaderzustand, Stärkeverhältnis, Heim/Auswärts und Situation davon abweichen.

Im Spielstand wird der Verein über `coachTypeKey` mit DB8 verbunden. Zusätzlich werden `coachTypeLabel`, `coachStyle`, `preferredFormationKey`, `defaultFormationKey` und `currentFormationKey` am Club mitgeführt.

Trainertypwahl erfolgt traitbasiert aus den Vereinsattributen. Die Formationswahl erfolgt aus dem Trainertyp-Pool mit starker Bevorzugung der 3 Favoriten und kann auf tolerierte Formationen ausweichen.
