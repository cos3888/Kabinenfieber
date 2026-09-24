# KF_0.26.1 Release Notes

## Ziel

Reiner Ressourcen-/Datenwahrheitsfix. Keine neue Gameplay-, Match-, Vertrags-, Transfer- oder Balancinglogik.

## Aenderungen

- App-Version auf `0.26.1` angehoben.
- GameState-Schema auf `kf-core-0.26.1` angehoben.
- WorldRecord-Schema auf `kf-world-record-0.26.1` angehoben.
- `world.history.bonusEvents` als fachliche Historie abgeschafft; Container bleibt nur leer fuer Legacy-Kompatibilitaet.
- Match- und Saisonpraemien deduplizieren ueber `financeEvents[].eventKey`.
- Transferklausel-Ausgabe und -Einnahme tragen denselben `eventKey`.
- Die bestehende Mailcenter-Meldung bei menschlicher Beteiligung an einer Transferklausel bleibt erhalten; wiederholte Idempotenz-Treffer erzeugen keine zweite Mail.
- Neuer world-spezifischer Runtime-Key-Index aus aktuellen FinanceEvents.
- Runtime-Index wird beim Saisonwechsel verworfen und nach Reload aus FinanceEvents rekonstruiert.
- Migration von 0.26.0-Welten: bestehende aktuelle Transferklausel-Keys werden bei eindeutiger Zuordnung auf alte FinanceEvents nachgetragen; anschliessend wird `bonusEvents` geleert.
- 0.25.2-Bonuscache-Regression auf die neue kanonische Quelle angepasst.
- Pflichtdokumentation und Architekturstand aktualisiert.

## Unveraendert

- Praemienhoehen.
- Gehaltsanteile bei Leihen.
- Transferklausel-Trigger und `paid`-Zustaende.
- Finanz- und Lizenzbalance.
- Matchsimulation.
- Historienverdichtung aus KF_0.26.0.
- Multiplayerregeln.

## Reale Stichprobe

180 echte Ligaspiele mit dem normalen Matchkern:

- `world.history.bonusEvents`: 0 Eintraege,
- aktuelle FinanceEvents mit `eventKey`: rund 5.400,
- Match-Historienverdichtung weiterhin ca. 93,8 % im getesteten Payload.

## Naechster vorgesehener Ressourcenblock

Ruhestaendler / Spielerlebenszyklus. Fachlich bereits festgelegt, aber noch nicht umgesetzt: Staerkehistorie zwei Mal pro Saison parallel zu den Marktwert-Stichtagen, jeweils als durchschnittliche Gesamtstaerke seit dem vorherigen Stichtag. Keine historische Mittelung einzelner Faehigkeiten.
