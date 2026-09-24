# Sicherheitsbeschreibung für spätere Arbeit

Diese DB3-Datei ist die aktuell festgezogene Vereinsdatenbank.

Wichtige Regeln:
1. DB3 enthält die Vereinswerte selbst, nicht die Excel-Hilfsspalten.
2. Spalten AM:BC aus der Excel dürfen nicht versehentlich in DB3 übernommen werden.
3. Formeln werden zentral über `DB3_FIELD_RULES` dokumentiert, nicht pro Verein dupliziert.
4. Werte wie `fanbase`, `prestige`, `financialPower`, `seasonTarget` und `successScore` sind Spielwerte und dürfen später durch Logik neu berechnet werden.
5. Werte wie `transferBudget` und `salaryBudget` sind in dieser Version Startwerte; spätere Änderungen erfolgen über Ereignisse.
6. Wenn Spieler später erzeugt oder zugeordnet werden, müssen mindestens diese Felder neu fortgeschrieben werden:
   - `squadStrength`
   - `squadCount`
   - `squadMarketValue`
   - `clubWealth`
   - `financialPower`
   - `prestigeRaw`
   - `prestige`
   - `ambition`
   - `seasonTarget`

Wenn DB3 erneut aus Excel exportiert wird, muss die gleiche Feldgrenze gelten:
- rein in DB3: B:AL
- nicht in DB3: AM:BC
