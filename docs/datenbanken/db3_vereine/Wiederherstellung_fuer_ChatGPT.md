# Wiederherstellung DB3 für ChatGPT

## Zweck
DB3 ist die Vereinsdatenbank. Sie beschreibt die feste fiktive Vereinswelt mit Identität, Farben, Städten, Budgets und Vergleichswerten.

## Quellen und Dateien
- `db3_vereine_final.json`
- `db3_vereine_final.js`
- `db3_field_rules.json`
- `Vereine_v3_budgetlogik.xlsx`

## Metadaten
- Vereine: 432
- Länder: 8
- Ligen: 24
- Version: 2026-04-08

## Beispieldatensatz
| clubId | clubName | leagueKey | transferBudget | salaryBudget | prestige | financialPower | seasonTarget | crestAsset |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ger1_fc_elbtor | FC Elbtor | Deutschland 1 | 22.41 | 33.06 | 8 | 7 | 4 | assets/clubs/ger1_fc_elbtor/crest.png |

## Feldliste laut `db3_field_rules.json`
| Feld | Modus | Quelle | Formel/Regel |
| --- | --- | --- | --- |
| leagueKey | derivedStored | Excel-Vorgabe |  |
| countryName | derivedDynamic | Ableitung-DB1 |  |
| leagueLevel | derivedDynamic | Ableitung-DB1 |  |
| clubId | fixed | DB-Vorgabe |  |
| clubName | fixed | Excel-Vorgabe |  |
| clubTrait1 | fixed | Excel-Vorgabe |  |
| clubTrait2 | fixed | Excel-Vorgabe |  |
| clubTrait3 | fixed | Excel-Vorgabe |  |
| clubDescription | fixed | Excel-Vorgabe |  |
| clubColor1 | fixed | Excel-Vorgabe |  |
| clubColor2 | fixed | Excel-Vorgabe |  |
| clubColor3 | fixed | Excel-Vorgabe |  |
| city | fixed | Excel-Vorgabe |  |
| population | fixed | Excel-Recherche |  |
| populationScore | fixed | Excel-Formel | 1: > 0<br>2: > 50.000<br>3: > 100.000<br>4: > 250.000<br>5: > 500.000<br>6: > 1.000.000<br>7: > 2.000.000<br>8: > 5.000.000<br>9: > 7.500.000<br>10: > 10.000.000 |
| latitude | fixed | Excel-Recherche |  |
| longitude | fixed | Excel-Recherche |  |
| catchmentArea | fixed | Excel-Formel | relative Bewertung 1-10 (inverse, linear)<br>Bezug: competitionRaw300<br>Regel: Summe MAX(0;1-Distanz/300) für Vereine im selben Land |
| sponsoringPower | fixed | Excel-Formel + Hilfswerte | gerundeter Mischwert 1-10<br>0,55*cityEconomyScore + 0,20*countryEconomyScore + 0,25*catchmentArea |
| crestAsset | fixed | DB-Assetpfad |  |
| homeKitAsset | fixed | DB-Assetpfad |  |
| awayKitAsset | fixed | DB-Assetpfad |  |
| transferBudget | derivedStored | DB1-Ligareferenz + Sponsoring-Staffel | averagePlayerMarketValue * 2,1 * transferFactorStart<br>transferFactorStart nach sponsoringPower-Staffel |
| salaryBudget | derivedStored | DB1-Ligareferenz + Sponsoring-Staffel | standardSalarySeason * 25 * salaryFactorStart<br>salaryFactorStart nach sponsoringPower-Staffel |
| fanbase | derivedStored | DB-Formel | populationScore * 0.25 + catchmentArea * 0.40 + leaguePrestige * 0.15 + successScore * 0.20 |
| prestigeRaw | derivedDynamic | DB-Formel | successScore * 0.35 + leaguePrestige * 0.25 + financialPower * 0.22 + fanbase * 0.18 |
| prestige | derivedStored | aus prestigeRaw relativ | relative Bewertung 1-10<br>Bezug: prestigeRaw<br>Filter: ohne |
| clubWealth | derivedDynamic | Formel | squadMarketValue * 0.50 + transferBudget * 0.25 + salaryBudget * 0.25 |
| financialPower | derivedStored | aus clubWealth relativ | relative Bewertung 1-10<br>Bezug: clubWealth<br>Filter: ohne |
| ambition | derivedDynamic | Formel | squadStrength * 0.40 + financialPower * 0.30 + successScore * 0.20 + leaguePrestige * 0.10 |
| seasonTarget | derivedStored | aus ambition + Kontext | relative Bewertung 1-5<br>Bezug: clubWealth<br>Filter: Liga<br>Ergebnis in Kontext:<br>1-Klassenerhalt<br>2-unteren Mittelfeld<br>3-oberes Mittelfeld<br>4-Top 5<br>5-Meister |
| successScoreRaw | derivedDynamic | aus Statistik (Ewige Tabelle) | Summe: Punkte ewige Tabelle |
| successScore | derivedStored | aus successScoreRaw relativ | relative Bewertung 1-10<br>Bezug: successScoreRaw<br>Filter: ohne |
| squadStrength | derivedDynamic | aus Kader | Summe: aktuelle Gesamtstärken aller Spieler im Kader |
| squadCount | derivedDynamic | aus Spielerzuordnung | Zählen der akutellen Spieler im Team (max. 30) |
| leaguePosition | derivedDynamic | aus Tabelle (aktuelle Saisontabelle Liga) |  |
| squadMarketValue | derivedDynamic | aus Spieler-Marktwerten | Summe: Marktwerte aller aktuellen Spieler im Kader |

## Führende Formeln
- `transferBudget = averagePlayerMarketValue * 2.1 * transferFactorStart`
- `salaryBudget = standardSalarySeason * 25 * salaryFactorStart`
- `fanbase = populationScore*0.25 + catchmentArea*0.40 + leaguePrestige*0.15 + successScore*0.20`
- `prestigeRaw = successScore*0.35 + leaguePrestige*0.25 + financialPower*0.22 + fanbase*0.18`
- `clubWealth = squadMarketValue*0.50 + transferBudget*0.25 + salaryBudget*0.25`
- `ambition = squadStrength*0.40 + financialPower*0.30 + successScore*0.20 + leaguePrestige*0.10`
- `seasonTarget` wird ligaintern relativ 1–5 gerankt

## Wiederherstellungsreihenfolge
1. Excel-Rohdaten übernehmen
2. `leagueKey` prüfen
3. `countryName`, `leagueLevel` ableiten
4. `clubId` deterministisch erzeugen
5. Asset-Pfade setzen
6. Budgets und Vergleichswerte berechnen
7. Startwerte ohne Historie auf 0 setzen
8. relative Werte neu ranken
