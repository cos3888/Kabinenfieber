# Architektur KF_0.25.2

KF_0.25.2 aendert keine persistierte Domainstruktur. Der Fix betrifft ausschliesslich abgeleitete Runtime-Caches und die zeitliche Verteilung der Browser-Schnellsimulation.

## Runtime-Historiencache

Kanonische Daten bleiben `world.history.matches` und `world.history.bonusEvents`.

Der world-spezifische Cache merkt sich neben der bereits indexierten Laenge die Referenz des kanonischen Arrays und den letzten bereits gesehenen Eintrag. Wenn dasselbe Array append-only waechst und der bekannte Prefix noch passt, werden nur neue Elemente indexiert. Bei Arraywechsel, Schrumpfen oder nicht passendem Prefix wird vollstaendig neu aufgebaut.

Damit ist der Cache rekonstruierbar und keine zweite persistente Wahrheit.

## Kalender-Scheduler

`runCalendarSimulationUntil()` berechnet weiterhin vollstaendige Matches. Die Arbeit wird jedoch nicht mehr nach einer festen Matchzahl gebuendelt, sondern nach einem 12-ms-Zeitbudget. Nach Ablauf wird ueber `setTimeout(..., 0)` an den Browser zurueckgegeben.

Die Matchresultate bleiben bis zum Slotabschluss in `pendingSlot.stagedResults`. Persistiert wird der Slot erst in `finalizePendingSlot()`.

## Schema

App-Version: 0.25.2.
Persistierte Schemas bleiben auf 0.25.1, weil keine gespeicherte Struktur geaendert wurde.
