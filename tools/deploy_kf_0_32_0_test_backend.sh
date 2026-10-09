#!/usr/bin/env bash
# KF_0.32.0: controlled TEST Cloud Run rollout from Google Cloud Shell.
# This script never deploys to kabinenfieber-backend (production).
set -euo pipefail

PROJECT="kabinenfieber-dev"
REGION="us-central1"
TEST_SERVICE="kabinenfieber-backend-test"
PROD_SERVICE="kabinenfieber-backend"
BRANCH="feature/kf-0.32.0-multiplayer-round-progression"
VERIFIED_BASE="a68ae9ff71ea8928900549d9fe6b70d93d5912b5"
TAG="kf0320verify"
SERVICE_URL="https://kabinenfieber-backend-test-458781449503.us-central1.run.app"

die() { echo "ABBRUCH: $*" >&2; exit 1; }
for bin in gcloud git python3 curl; do
  command -v "$bin" >/dev/null 2>&1 || die "Fehlendes Werkzeug: $bin"
done
[[ "$(git branch --show-current)" == "$BRANCH" ]] || die "Falscher Git-Branch"
REMOTE="$(git remote get-url origin 2>/dev/null || true)"
case "$REMOTE" in
  "https://github.com/cos3888/Kabinenfieber.git"|"https://github.com/cos3888/Kabinenfieber"|"git@github.com:cos3888/Kabinenfieber.git") ;;
  *) die "Nicht das freigegebene Kabinenfieber-Repository: $REMOTE" ;;
esac
git merge-base --is-ancestor "$VERIFIED_BASE" HEAD || die "Der freigegebene KF_0.32.0-Stand ist kein Vorfahre"
[[ -z "$(git status --porcelain)" ]] || die "Arbeitsverzeichnis enthaelt lokale Aenderungen"
grep -q "const SERVICE_VERSION = '0.32.0';" server/index.js || die "Keine KF_0.32.0-Serverversion"
! grep -qx 'src' .dockerignore || die "Dockerkontext schliesst die Simulationsquelle src aus"
for path in Dockerfile src/static-data.js src/db1-db2-data.js src/app.bundle.js; do
  [[ -f "$path" ]] || die "Fehlende Paketdatei: $path"
done

echo "Bereit fuer Testdeployment: $(git rev-parse HEAD)"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
# Both service configurations are read-only here. Environment values are never printed.
gcloud run services describe "$TEST_SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$tmpdir/test-before.json"
gcloud run services describe "$PROD_SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$tmpdir/prod-before.json"

python3 - "$tmpdir/test-before.json" "$tmpdir/prod-before.json" <<'PY'
import json,sys
test,prod=[json.load(open(p,encoding="utf-8")) for p in sys.argv[1:]]

def spec(d):
    a=d.get("spec",{}).get("template",{}).get("spec",{})
    if a.get("containers"):
        return a
    b=d.get("template",{})
    return b if b.get("containers") else b.get("spec",{})

def env(d):
    containers=spec(d).get("containers") or []
    if not containers:
        raise SystemExit("ABBRUCH: Cloud-Run-Umgebung kann nicht gelesen werden")
    return {e.get("name"):e.get("value") for e in containers[0].get("env",[])}

te,pe=env(test),env(prod)
if te.get("KF_OBJECT_STORE","local")!="gcs" or te.get("KF_METADATA_STORE","file")!="firestore":
    raise SystemExit("ABBRUCH: Testdienst verwendet nicht GCS + Firestore")
if not te.get("KF_GCS_BUCKET"):
    raise SystemExit("ABBRUCH: Test-GCS-Bucket ist nicht als Umgebungsvariable erkennbar")
if pe.get("KF_OBJECT_STORE","local")=="gcs" and te["KF_GCS_BUCKET"]==pe.get("KF_GCS_BUCKET"):
    raise SystemExit("ABBRUCH: Test und Produktivdienst verwenden denselben GCS-Bucket")
if pe.get("KF_METADATA_STORE","file")=="firestore" and te.get("KF_FIRESTORE_PREFIX","kf_dev")==pe.get("KF_FIRESTORE_PREFIX","kf_dev"):
    raise SystemExit("ABBRUCH: Test und Produktivdienst verwenden denselben Firestore-Praefix")
t=spec(test)
containers=t.get("containers") or [{}]
mem=containers[0].get("resources",{}).get("limits",{}).get("memory")
if mem not in ("1Gi","1024Mi","1073741824"):
    raise SystemExit("ABBRUCH: Testbackend ist nicht bei 1 GiB RAM (gefunden: %r)" % mem)
print("Vorpruefung bestanden: Test-/Produktivdaten getrennt, Testbackend 1 GiB.")
traffic=test.get("status",{}).get("traffic",[])
active=[x.get("revisionName") for x in traffic if x.get("percent")==100 and x.get("revisionName")]
if len(active)!=1:
    raise SystemExit("ABBRUCH: Alte aktive Revision kann nicht eindeutig gesichert werden")
print("Alte aktive Testrevision:",active[0])
PY

echo "Baue neue TESTREVISION ohne regulären Trafficwechsel ..."
gcloud run deploy "$TEST_SERVICE" \
  --project="$PROJECT" --region="$REGION" --source=. \
  --memory=1Gi --tag="$TAG" --no-traffic --quiet

gcloud run services describe "$TEST_SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$tmpdir/test-staged.json"
tag_url="$(python3 - "$tmpdir/test-before.json" "$tmpdir/test-staged.json" "$TAG" <<'PY'
import json,sys
before,after=[json.load(open(p,encoding="utf-8")) for p in sys.argv[1:3]]
tag=sys.argv[3]
def template(d):
    return d.get("spec",{}).get("template",{}).get("spec",{}) or d.get("template",{})
def env(d):
    containers=template(d).get("containers") or []
    return {e.get("name"): (e.get("value"),e.get("valueFrom"),e.get("valueSource")) for e in (containers[0].get("env",[]) if containers else [])}
if env(before)!=env(after):
    raise SystemExit("ABBRUCH: Umgebungsvariablen haben sich beim Deployment veraendert")
if template(before).get("serviceAccountName") != template(after).get("serviceAccountName"):
    raise SystemExit("ABBRUCH: Dienstkonto wurde veraendert")
matches=[x.get("url") for x in after.get("status",{}).get("traffic",[]) if x.get("tag")==tag and x.get("url")]
if len(matches)!=1:
    raise SystemExit("ABBRUCH: Keine eindeutige Canary-URL; Traffic bleibt unveraendert")
print(matches[0])
PY
)"

echo "Canary pruefen: $tag_url"
ready=0
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 20 "$tag_url/api/v1/persistence/status" -o "$tmpdir/canary.json"; then
    if python3 - "$tmpdir/canary.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1],encoding="utf-8"))
assert s.get("version")=="0.32.0", "Falsche Backend-Version"
assert s.get("apiVersion")=="0.30.0", "Falsche API-Version"
assert s.get("objectStore")=="gcs" and s.get("metadataStore")=="firestore", "Falscher Persistenztreiber"
assert s.get("ok") is True and s.get("verification",{}).get("status")=="ok", "Persistenz-Selbsttest fehlgeschlagen"
PY
    then ready=1; break; fi
  fi
  sleep 3
done
[[ "$ready" == 1 ]] || die "Canary noch nicht verifiziert. Traffic bleibt auf alter Revision."

echo "Canary OK. Wechsle ausschliesslich beim TESTDIENST auf die verifizierte Revision ..."
gcloud run services update-traffic "$TEST_SERVICE" \
  --project="$PROJECT" --region="$REGION" --to-tags="$TAG=100" --quiet

curl -fsS --max-time 30 "$SERVICE_URL/api/v1/persistence/status" -o "$tmpdir/live.json"
python3 - "$tmpdir/live.json" <<'PY'
import json,sys
data=json.load(open(sys.argv[1],encoding="utf-8"))
if data.get("version")!="0.32.0" or data.get("ok") is not True:
    raise SystemExit("ACHTUNG: Traffic umgeschaltet, aber Live-API nicht gesund")
print("TESTBACKEND erfolgreich aktualisiert: Version",data["version"],"API",data["apiVersion"])
PY
echo "Produktivdienst nicht veraendert. Jetzt praktische Altwelt-/Solo-/Countdown-Tests durchfuehren."
