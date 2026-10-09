#!/usr/bin/env bash
# KF_0.32.1: isolated TEST Cloud Run rollout (not production; no migration).
set -euo pipefail

PROJECT="kabinenfieber-dev"
REGION="us-central1"
SERVICE="kabinenfieber-backend-test"
BRANCH="feature/kf-0.32.0-multiplayer-round-progression"
TAG="kf0321verify"

die() { printf 'ABBRUCH: %s\n' "$*" >&2; exit 1; }
for tool in gcloud git node python3 curl; do
  command -v "$tool" >/dev/null 2>&1 || die "Fehlendes Werkzeug: $tool"
done
[[ "$(git branch --show-current)" == "$BRANCH" ]] || die "Falscher Branch"
case "$(git remote get-url origin 2>/dev/null || true)" in
  "https://github.com/cos3888/Kabinenfieber.git"|"https://github.com/cos3888/Kabinenfieber"|"git@github.com:cos3888/Kabinenfieber.git") ;;
  *) die "Falsches GitHub-Repository" ;;
esac
[[ -z "$(git status --porcelain)" ]] || die "Uncommittete Aenderungen"
ACTUAL_SHA="$(git rev-parse HEAD)"
[[ -n "${KF_APPROVED_SHA:-}" && "$KF_APPROVED_SHA" == "$ACTUAL_SHA" ]] ||
  die "KF_APPROVED_SHA muss der explizit freigegebene und getestete HEAD sein"
grep -q "const SERVICE_VERSION = '0.32.1';" server/index.js || die "Falsche Backend-Version"
[[ -f src/app.bundle.js && -f Dockerfile ]] || die "Unvollstaendiger Simulations-Dockerkontext"
! grep -qx 'src' .dockerignore || die "src fehlt im Docker-Image"

# The initial migration snapshot is not immutable after ordinary test saves.
# Verify the original marker and isolated storage exist, without comparing the
# current active test world against the stale source-copy digest.
# This code is READ ONLY and never invokes --execute or the source bucket.
node <<'NODE'
'use strict';
const {Firestore}=require('@google-cloud/firestore');
const {Storage}=require('@google-cloud/storage');
(async()=>{
  const projectId='kabinenfieber-dev';
  const testBucket='kabinenfieber-dev-test-saves-458781449503';
  const db=new Firestore({projectId});
  const storage=new Storage({projectId});
  const marker=await db.collection('kf_test_system').doc('kf0320-copy-from-kf-dev').get();
  const m=marker.exists ? marker.data() : null;
  if(!m||m.ready!==true||
      m.sourceBucket!=='kabinenfieber-dev-saves-4821'||
      m.destinationBucket!==testBucket||
      m.sourcePrefix!=='kf_dev'||m.destinationPrefix!=='kf_test'||
      m.authSessionsTransferred!==false){
    throw new Error('Isolierte Testkopie besitzt keinen verifizierten Migrationsmarker');
  }
  const [exists]=await storage.bucket(testBucket).exists();
  if(!exists)throw new Error('Isolierter Testbucket fehlt');
  const worldDocs=await db.collection('kf_test_worlds').limit(1).get();
  if(worldDocs.empty)throw new Error('Testnamespace enthaelt keine Spielwelten');
  console.log('Testdaten-Isolation anhand Marker, Bucket und kf_test-Welten bestaetigt.');
})().catch(error=>{console.error('ABBRUCH:',error.message);process.exitCode=1;});
NODE

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$tmp/before.json"
gcloud run services describe kabinenfieber-backend --project="$PROJECT" --region="$REGION" --format=json > "$tmp/prod-readonly.json"

python3 - "$tmp/before.json" "$tmp/prod-readonly.json" <<'PY'
import json,sys
test,prod=[json.load(open(p,encoding='utf-8')) for p in sys.argv[1:]]
def template(s):
    v=s.get('spec',{}).get('template',{}).get('spec',{})
    return v if v.get('containers') else s.get('template',{})
def env(s):
    c=template(s).get('containers',[])
    if not c: raise SystemExit('ABBRUCH: Containerkonfiguration unlesbar')
    return {e['name']:e.get('value') for e in c[0].get('env',[])}
te,pe=env(test),env(prod)
if te.get('KF_GCS_BUCKET')!='kabinenfieber-dev-test-saves-458781449503' or te.get('KF_FIRESTORE_PREFIX')!='kf_test':
    raise SystemExit('ABBRUCH: Testbackend ist NICHT vollstaendig auf Testdaten isoliert')
if pe.get('KF_GCS_BUCKET')!='kabinenfieber-dev-saves-4821' or pe.get('KF_FIRESTORE_PREFIX')!='kf_dev':
    raise SystemExit('ABBRUCH: Produktivreferenz weicht ab')
memory=template(test)['containers'][0].get('resources',{}).get('limits',{}).get('memory','')
if memory not in ('1Gi','1024Mi','1073741824'):
    raise SystemExit('ABBRUCH: Testbackend ist nicht 1 GiB: '+str(memory))
active=[r for r in test.get('status',{}).get('traffic',[]) if r.get('percent')==100]
if len(active)!=1 or not active[0].get('revisionName'):
    raise SystemExit('ABBRUCH: Die bisherige aktive Testrevision ist nicht eindeutig')
print('Vorpruefung OK. Bisherige Testrevision:',active[0]['revisionName'])
PY

echo "Erzeuge ausschliesslich auf dem Testdienst eine KF_0.32.1-Canary ohne Traffic."
gcloud run deploy "$SERVICE" \
  --project="$PROJECT" --region="$REGION" --source=. \
  --memory=1Gi --tag="$TAG" --no-traffic --quiet

gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$tmp/staged.json"
tag_url="$(python3 - "$tmp/before.json" "$tmp/staged.json" "$TAG" <<'PY'
import json,sys
before,after=[json.load(open(p,encoding='utf-8')) for p in sys.argv[1:3]]
tag=sys.argv[3]
def template(s):
    v=s.get('spec',{}).get('template',{}).get('spec',{})
    return v if v.get('containers') else s.get('template',{})
def identity(s):
    t=template(s)
    c=t.get('containers',[])
    if not c: raise SystemExit('ABBRUCH: Containerinformationen fehlen')
    return (t.get('serviceAccountName'),t.get('serviceAccount'),
      {e['name']:json.dumps(e,sort_keys=True) for e in c[0].get('env',[])})
if identity(before)!=identity(after):
    raise SystemExit('ABBRUCH: Testdienst-Umgebung oder Dienstkonto wurde veraendert')
memory=template(after)['containers'][0].get('resources',{}).get('limits',{}).get('memory','')
if memory not in ('1Gi','1024Mi','1073741824'):
    raise SystemExit('ABBRUCH: Canary hat nicht 1 GiB RAM')
old=[r['revisionName'] for r in before.get('status',{}).get('traffic',[]) if r.get('percent')==100]
now=[r['revisionName'] for r in after.get('status',{}).get('traffic',[]) if r.get('percent')==100]
if old!=now: raise SystemExit('ABBRUCH: Testtraffic wurde vorzeitig gewechselt')
matches=[r['url'] for r in after.get('status',{}).get('traffic',[]) if r.get('tag')==tag and r.get('url')]
if len(matches)!=1: raise SystemExit('ABBRUCH: Canary-Tag nicht eindeutig')
print(matches[0])
PY
)"

echo "Teste isolierte Canary: $tag_url"
healthy=0
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 25 "$tag_url/api/v1/persistence/status" -o "$tmp/health.json"; then
    if python3 - "$tmp/health.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1],encoding='utf-8'))
assert s.get('version')=='0.32.1'
assert s.get('apiVersion')=='0.30.0'
assert s.get('objectStore')=='gcs' and s.get('metadataStore')=='firestore'
assert s.get('ok') is True and s.get('verification',{}).get('status')=='ok'
PY
    then healthy=1;break;fi
  fi
  sleep 3
done
[[ "$healthy" == 1 ]] || die "Canary fehlgeschlagen; Testtraffic NICHT gewechselt"

echo "Gesunde Canary verifiziert. Ausschliesslich Testtraffic wird umgestellt."
gcloud run services update-traffic "$SERVICE" --project="$PROJECT" --region="$REGION" --to-tags="$TAG=100" --quiet
service_url="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
[[ "$service_url" == https://kabinenfieber-backend-test-* ]] || die "Nicht die erwartete Testdienst-URL"
curl -fsS --max-time 30 "$service_url/api/v1/persistence/status" -o "$tmp/live.json"
python3 - "$tmp/live.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1],encoding='utf-8'))
if s.get('version')!='0.32.1' or s.get('ok') is not True:
    raise SystemExit('ACHTUNG: Testtraffic aktiv, aber Backend nicht gesund; manuell pruefen')
print('TESTBACKEND KF_0.32.1 gesund; API',s.get('apiVersion'))
PY
echo "Produktivservice und Produktivdaten wurden von diesem Skript nicht veraendert."
echo "Nicht auf alte Testrevisionen mit ungesicherten Speicherzielen zurueckrollen."
