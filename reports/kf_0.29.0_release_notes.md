# KF_0.29.0 – User Identity, World Runtime & Save/Load

## Ziel

KF_0.29.0 verbindet den bestehenden Browser-Client erstmals mit der in KF_0.28.x vorbereiteten Cloud-Persistenz. Der Block schafft die User-Identitaet und die Weltlaufzeit, die vor einer echten Multiplayer-Lobby benoetigt werden.

## Umgesetzt

### Benutzer / Authentifizierung

- Registrierung und Login mit Benutzername + Passwort, bewusst noch ohne E-Mail.
- stabile interne `userId`; Loginname und sichtbarer Anzeigename sind getrennte Konzepte.
- Loginname wird NFKC-normalisiert und case-insensitive eindeutig behandelt; internationale Buchstaben sind erlaubt.
- Passwoerter werden mit zufaelligem Salt und Node-`scrypt` gehasht.
- zufaellige Bearer-Sessiontokens; persistent liegt ausschliesslich deren SHA-256-Hash.
- getrennte File- und Firestore-Adapter fuer Account, Profil und Session.

### World Runtime

- `WorldRuntimeManager` mit `Map<worldId, runtime>`.
- eigene Queue je Welt statt globaler Mutation-Queue.
- mehrere Welten koennen gleichzeitig geladen sein.
- Revisionspruefung verhindert veraltete Snapshot-Commits.
- Inaktivitaets-Unload nach standardmaessig 15 Minuten; die persistierte Welt wird dabei niemals geloescht.
- Reload nach Unload bzw. neuem Serverprozess nutzt die committed Manifest-Revision.

### Save / Load

- GitHub Pages spricht nur mit Cloud Run.
- eigene Weltliste pro User ueber den rebuildbaren Participation Index.
- neue Welt serverseitig anlegen und revisionsgesichert laden/speichern.
- Current-Season-Vollmatches und FinanceEvents werden beim Remote-Snapshot zusammen mit der aktuellen WorldRecord-Revision wiederherstellbar persistiert.
- grosse JSON-Payloads koennen vom Browser gzip-komprimiert an den Server gesendet werden; grosse JSON-Antworten koennen gzip-komprimiert zurueckkommen.
- World-Create-Rollback entfernt sowohl fachliche Registrierung als auch bereits angelegte Object-Store-Daten.

### Browser

- Login-/Registrierungsmaske auf der Startseite.
- Sitzung wird aus einem lokalen opaque Token wiederhergestellt.
- „Meine Welten“ mit Server-Weltliste.
- Remote Create / Open / Save.
- Spielstandoption im Buero zum manuellen Speichern und zum sicheren Rueckweg in die Weltliste.
- Autosave-Bruecke nach Vereinsuebernahme und normalem Office-Advance.

## Zentrale Datenquellen

- Useridentitaet: Auth Account / stabile `userId`
- Benutzerprofil: UserProfile
- menschlicher Club + Weltrolle: **ausschliesslich `WorldRecord.memberships`**
- aktuelle Spielwelt: committed WorldRecord-Revision im Object Store
- Current-Season-Vollmatches: Match-Detailsegmente
- Current-Season-Finanzledger: Finance-Detailsegmente
- Weltliste und 5-Welten-Regel: rebuildbarer Firestore Participation Index
- Runtime im RAM: temporaere Arbeitskopie, keine persistente Parallelwahrheit

## Bewusste Grenze

Der komplette Browser-Snapshot ist nur fuer Welten mit exakt einem menschlichen Teilnehmer erlaubt. Sobald mehrere Menschen in derselben Welt aktiv sind, lehnt der Server einen freien Vollsnapshot ab.

Das ist absichtlich so: Gemeinsamer Multiplayerzustand darf spaeter nur ueber serverautoritative Commands veraendert werden. Damit wird die Save/Load-Bruecke nicht zur dauerhaften Multiplayer-Sicherheitsluecke.

## Nicht Bestandteil

Noch offen fuer den folgenden Multiplayerblock:

- Lobby und Einladungs-UI
- Join/Leave-Orchestrierung
- serverautoritative Gameplay-Commands
- Ready/Deadline/Countdown
- Live-Ticker-/Match-Teilnahmeorchestrierung
- horizontale Cloud-Run-Skalierung mit verteilten Locks/Leases
- E-Mail und Passwort-Recovery

Cloud Run bleibt deshalb weiterhin auf maximal einer Instanz.

## Spielerperspektive

Der neue Block aendert keine Matchsimulation und keine Fussballlogik. Sein Spielerwert ist infrastrukturell sichtbar: Ein Benutzer kann erstmals einen eigenen Account verwenden, eine servergespeicherte Welt wiederfinden und denselben committed Spielstand nach einem Reload erneut laden. Das ist die notwendige Grundlage, bevor ein zweiter Mensch glaubwuerdig dieselbe Welt betreten darf.
