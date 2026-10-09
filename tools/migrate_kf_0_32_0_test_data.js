#!/usr/bin/env node
'use strict';

/**
 * Copy production-backed KF 0.31.4 test data to a separate KF 0.32.0 test namespace.
 *
 * --plan:    READ ONLY; inventory source and reject occupied destination.
 * --execute: WRITE ONLY TO NEW TEST NAMESPACE; clone, verify, write ready marker.
 * --verify:  READ ONLY; verify ready marker and independent test snapshot.
 *
 * Intentionally NOT copied: auth_sessions (users log in again), system probes.
 * This script never writes to kf_dev_* or the source GCS bucket.
 * Do not use while either backend can receive world-changing user actions.
 */
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { execFileSync } = require('node:child_process');
// Load cloud SDKs only for real cloud operations; the safety self-test is offline.

const PROJECT = 'kabinenfieber-dev';
const SOURCE_BUCKET = 'kabinenfieber-dev-saves-4821';
const DEST_BUCKET = 'kabinenfieber-dev-test-saves-458781449503';
const SOURCE_PREFIX = 'kf_dev';
const DEST_PREFIX = 'kf_test';
const MARKER_ID = 'kf0320-copy-from-kf-dev';
const SUFFIXES = Object.freeze([
  'user_accounts',
  'user_profiles',
  'world_slots',
  'worlds',
  'world_participation_index',
  'invitations',
  'applications',
  'world_progression',
  'world_management_scopes'
]);
const MAX_GCS_OBJECTS = 200000;
const MAX_FIRESTORE_DOCS = 200000;
const VERIFY_CHUNK = 25;

function fail(message) { throw new Error(message); }
function insist(value, message) { if (!value) fail(message); }
function stamp(t) { return t ? `${t.seconds}:${t.nanoseconds}` : ''; }
function summarizeSize(n) { return `${(n / 1048576).toFixed(1)} MiB`; }
function sum(values) { return values.reduce((acc, n) => acc + Number(n || 0), 0); }
function collectionName(prefix, suffix) { return `${prefix}_${suffix}`; }
function idList(map) { return [...map.keys()].sort(); }
function fileInfo(file) {
  return {
    name: String(file.name),
    generation: String(file.metadata && file.metadata.generation || ''),
    size: String(file.metadata && file.metadata.size || '0'),
    crc32c: String(file.metadata && file.metadata.crc32c || '')
  };
}
function compareInventory(before, after, withGeneration) {
  insist(before.size === after.size, `GCS-Dateizahl abweichend: ${before.size} / ${after.size}`);
  for (const [name, item] of before) {
    const other = after.get(name);
    insist(other, `Fehlende GCS-Datei: ${name}`);
    insist(item.size === other.size && item.crc32c === other.crc32c,
      `Groesse/Pruefsumme abweichend: ${name}`);
    if (withGeneration) insist(item.generation === other.generation,
      `Quelldatei waehrend Kopie geaendert: ${name}`);
  }
}
function compareDocs(before, after, withTime) {
  insist(before.size === after.size, `Firestore-Dokumentenzahl abweichend: ${before.size} / ${after.size}`);
  for (const [id, item] of before) {
    const other = after.get(id);
    insist(other, `Fehlendes Firestore-Dokument: ${id}`);
    insist(isDeepStrictEqual(item.data, other.data), `Firestore-Inhalt abweichend in Dokument: ${id}`);
    if (withTime) insist(item.time === other.time, `Quell-Dokument geaendert: ${id}`);
  }
}
function assertMigrationNames() {
  insist(PROJECT === 'kabinenfieber-dev', 'Falsches Google-Cloud-Projekt');
  insist(SOURCE_BUCKET !== DEST_BUCKET, 'Quell- und Ziel-Bucket muessen verschieden sein');
  insist(SOURCE_PREFIX !== DEST_PREFIX, 'Quell- und Ziel-Praefix muessen verschieden sein');
  insist(DEST_BUCKET.includes('test') && DEST_PREFIX === 'kf_test', 'Unsicheres Testziel');
  insist(SOURCE_PREFIX === 'kf_dev' && SOURCE_BUCKET === 'kabinenfieber-dev-saves-4821',
    'Unbekannter Quellspeicher');
  insist(!SUFFIXES.includes('auth_sessions') && !SUFFIXES.includes('system'),
    'Sitzungen/Probes duerfen nicht uebernommen werden');
}
function testGuards() {
  assertMigrationNames();
  const a = new Map([['worlds/demo/manifest.json', {size:'5',crc32c:'AB==',generation:'3'}]]);
  const b = new Map([['worlds/demo/manifest.json', {size:'5',crc32c:'AB==',generation:'42'}]]);
  compareInventory(a, b, false);
  try { compareInventory(a, b, true); fail('Quellgenerationstest nicht erkannt'); }
  catch (err) { insist(err.message.includes('Quelldatei waehrend Kopie'), 'Generationspruefung defekt'); }
  const d = new Map([['user', {data:{n:1},time:'1:0'}]]);
  const e = new Map([['user', {data:{n:1},time:'2:0'}]]);
  compareDocs(d, e, false);
  try { compareDocs(d, e, true); fail('Quell-Dokumententest nicht erkannt'); }
  catch (err) { insist(err.message.includes('Quell-Dokument'), 'Zeitpruefung defekt'); }
  console.log('Migrations-Selbsttest: OK; Quellschutz und Vollstaendigkeitspruefungen aktiv.');
}
async function inspectCollection(db, name) {
  const out = new Map();
  for await (const doc of db.collection(name).stream()) {
    insist(!out.has(doc.id), `Doppeltes Dokument: ${name}`);
    out.set(doc.id, { id:doc.id, data:doc.data(), time:stamp(doc.updateTime) });
    insist(out.size <= MAX_FIRESTORE_DOCS, 'Zu viele Firestore-Dokumente; erst getrennt planen');
  }
  return out;
}
async function inspectDocuments(db, prefix) {
  const out = new Map();
  for (const suffix of SUFFIXES) {
    const name = collectionName(prefix, suffix);
    const map = await inspectCollection(db, name);
    out.set(suffix, map);
    console.log(`  ${name}: ${map.size} Dokumente`);
  }
  return out;
}
async function inspectFiles(bucket) {
  const out = new Map();
  const readable = bucket.getFilesStream({ prefix:'worlds/' });
  for await (const file of readable) {
    const info = fileInfo(file);
    insist(info.name.startsWith('worlds/'), 'GCS-Objekt ausserhalb des Weltpfades');
    insist(info.generation && info.crc32c, `GCS-Metadaten unvollstaendig: ${info.name}`);
    insist(!out.has(info.name), `Doppelte GCS-Datei: ${info.name}`);
    out.set(info.name, info);
    insist(out.size <= MAX_GCS_OBJECTS, 'Zu viele Objekte; erst getrennt planen');
  }
  return out;
}
function validateWorldReferences(files, collections) {
  const accounts = collections.get('user_accounts');
  const profiles = collections.get('user_profiles');
  const worlds = collections.get('worlds');
  const memberships = collections.get('world_participation_index');
  insist(accounts.size > 0 && profiles.size > 0 && worlds.size > 0, 'Quelle ohne Konten/Profile/Welten');
  insist(files.size > 0, 'Quelle ohne Weltdateien');
  const profileUserIds = new Set([...profiles.values()].map(row => String(row.data.userId || row.id)));
  const worldIds = new Set([...worlds.values()].map(row => String(row.data.worldId || row.id)));
  for (const item of accounts.values()) {
    insist(profileUserIds.has(String(item.data.userId)), 'Konto ohne passendes Nutzerprofil');
  }
  for (const item of memberships.values()) {
    insist(worldIds.has(String(item.data.worldId)), 'Vereinszuordnung ohne Welt');
    insist(profileUserIds.has(String(item.data.userId)), 'Vereinszuordnung ohne Nutzerprofil');
  }
  for (const item of worlds.values()) {
    if (item.data.status !== 'ACTIVE') continue;
    const worldId = String(item.data.worldId || item.id);
    insist(/^[A-Za-z0-9._:-]+$/.test(worldId), 'Ungueltige World-ID');
    insist(files.has(`worlds/${worldId}/manifest.json`),
      'Aktive Welt besitzt kein GCS-Manifest');
  }
}
function migrationCounts(docs) {
  return Object.fromEntries([...docs].map(([suffix, map]) => [suffix, map.size]));
}
function fileDigest(files) {
  const keys=idList(files);
  const hash=crypto.createHash('sha256');
  for(const key of keys) {
    const v=files.get(key);
    hash.update(JSON.stringify([key,v.size,v.crc32c])+'\n');
  }
  return hash.digest('hex');
}
async function validateManifests(bucket, files, docs) {
  const worlds = docs.get('worlds');
  let count=0;
  for (const row of worlds.values()) {
    if (row.data.status !== 'ACTIVE') continue;
    const id = String(row.data.worldId || row.id);
    const manifestKey = `worlds/${id}/manifest.json`;
    const [body] = await bucket.file(manifestKey).download();
    const manifest = JSON.parse(body.toString('utf8'));
    insist(String(manifest.worldId) === id, 'Manifest/Weltzuordnung abweichend');
    const refs = [
      manifest.worldRecordPath,
      ...(manifest.worldDeltaPaths || []),
      ...Object.values(manifest.matchSegments || {}),
      ...Object.values(manifest.financeSegments || {}),
      ...Object.values(manifest.matchIndex || {})
    ].filter(Boolean);
    insist(refs.length > 0, 'Aktive Welt ohne WorldRecord-Datei');
    for (const key of refs) {
      insist(String(key).startsWith(`worlds/${id}/`),
        'Weltmanifest verweist auf externen Weltpfad');
      insist(files.has(key), 'Manifest verweist auf fehlendes GCS-Objekt');
    }
    count++;
  }
  return count;
}
function assertTargetClean(destinationExists, targetDocs) {
  insist(!destinationExists, `Ziel-Bucket existiert bereits: ${DEST_BUCKET}; keine Daten ueberschreiben`);
  for (const [name, docs] of targetDocs) insist(docs.size === 0,
    `Ziel-Sammlung ${collectionName(DEST_PREFIX,name)} nicht leer; keine Daten ueberschreiben`);
}
async function copyFiles(storage, sourceFiles) {
  const src=storage.bucket(SOURCE_BUCKET), dest=storage.bucket(DEST_BUCKET);
  const entries=[...sourceFiles.values()];
  for (let pos=0; pos<entries.length; pos+=8) {
    const group=entries.slice(pos,pos+8);
    await Promise.all(group.map(async info => {
      await src.file(info.name, { generation:info.generation })
        .copy(dest.file(info.name), { preconditionOpts:{ ifGenerationMatch:0 } });
    }));
    if ((pos + group.length) % 128 < 8) console.log(`  GCS kopiert: ${pos+group.length}/${entries.length}`);
  }
  console.log(`  GCS kopiert: ${entries.length} Dateien`);
}
async function copyDocs(db, sourceDocs) {
  for (const [suffix, docs] of sourceDocs) {
    const collection=db.collection(collectionName(DEST_PREFIX,suffix));
    const entries=[...docs.values()];
    for (let pos=0; pos<entries.length; pos+=VERIFY_CHUNK) {
      await Promise.all(entries.slice(pos,pos+VERIFY_CHUNK)
        .map(doc=>collection.doc(doc.id).create(doc.data)));
    }
    console.log(`  Firestore ${suffix}: ${entries.length} erstellt`);
  }
}
async function verifySnapshot(db,storage,record) {
  const destinationDocs=await inspectDocuments(db,DEST_PREFIX);
  const destinationFiles=await inspectFiles(storage.bucket(DEST_BUCKET));
  insist(destinationFiles.size===record.objectCount, 'Ziel-Dateianzahl abweichend vom Migrationsprotokoll');
  insist(fileDigest(destinationFiles)===record.objectDigest, 'Ziel-Dateipruefsumme abweichend');
  for (const [name,count] of Object.entries(record.documentCounts)) {
    insist(destinationDocs.get(name) && destinationDocs.get(name).size===count,
      'Ziel-Firestore-Sammlung weicht vom Migrationsprotokoll ab');
  }
  validateWorldReferences(destinationFiles,destinationDocs);
  const active=await validateManifests(storage.bucket(DEST_BUCKET), destinationFiles, destinationDocs);
  insist(active===record.activeWorlds, 'Zahl aktiver Welten abweichend');
  console.log(`  Geprueft: ${destinationFiles.size} GCS-Objekte, ${active} aktive Welten.`);
  return {docs:destinationDocs,files:destinationFiles};
}
async function main() {
  const arg=process.argv[2];
  if (arg==='--self-test') { testGuards(); return; }
  insist(['--plan','--execute','--verify'].includes(arg) && process.argv.length===3,
    'Aufruf: --plan | --execute | --verify | --self-test');
  assertMigrationNames();
  const { Firestore } = require('@google-cloud/firestore');
  const { Storage } = require('@google-cloud/storage');
  const db=new Firestore({projectId:PROJECT}), storage=new Storage({projectId:PROJECT});
  const marker=db.collection(collectionName(DEST_PREFIX,'system')).doc(MARKER_ID);
  if (arg==='--verify') {
    const snapshot=await marker.get();
    insist(snapshot.exists && snapshot.data().ready===true,
      'KEINE FREIGABE: verifizierter Migrationsmarker fehlt');
    const record=snapshot.data();
    insist(record.sourceBucket===SOURCE_BUCKET && record.destinationBucket===DEST_BUCKET
      && record.sourcePrefix===SOURCE_PREFIX && record.destinationPrefix===DEST_PREFIX,
      'Migrationsmarker gehoert nicht zur freigegebenen Quell/Ziel-Kombination');
    console.log('Pruefe bereits uebernommene, getrennte TESTDATEN ...');
    await verifySnapshot(db,storage,record);
    console.log('DATENKOPIE VERIFIZIERT. Testbackend-Canary kann vorbereitet werden.');
    return;
  }
  console.log('Lese Quell-Speicher ausschliesslich lesend ...');
  const [sourceExists]=await storage.bucket(SOURCE_BUCKET).exists();
  insist(sourceExists, 'Original-Bucket nicht gefunden');
  const [sourceBucketMeta]=await storage.bucket(SOURCE_BUCKET).getMetadata();
  const [destExists]=await storage.bucket(DEST_BUCKET).exists();
  const sourceDocs=await inspectDocuments(db,SOURCE_PREFIX);
  const targetDocs=await inspectDocuments(db,DEST_PREFIX);
  const sourceFiles=await inspectFiles(storage.bucket(SOURCE_BUCKET));
  assertTargetClean(destExists,targetDocs);
  validateWorldReferences(sourceFiles,sourceDocs);
  const objectCount=sourceFiles.size;
  const activeWorlds=[...sourceDocs.get('worlds').values()].filter(x=>x.data.status==='ACTIVE').length;
  const bytes=sum([...sourceFiles.values()].map(x=>x.size));
  console.log(`Quelle: ${objectCount} GCS-Objekte / ${summarizeSize(bytes)}, ${activeWorlds} aktive Welten.`);
  console.log(`Ziel: gs://${DEST_BUCKET}, Firestore ${DEST_PREFIX}_*, Standort: ${sourceBucketMeta.location}.`);
  if(arg==='--plan') {
    console.log('PLAN BESTANDEN. Noch kein Bucket angelegt, keine Daten geschrieben.');
    return;
  }
  insist(process.env.KF_MIGRATION_CONFIRM === 'COPY_TO_ISOLATED_TEST_ONLY',
    'Fuer --execute muss KF_MIGRATION_CONFIRM=COPY_TO_ISOLATED_TEST_ONLY gesetzt sein');
  const location=String(sourceBucketMeta.location||'').toLowerCase();
  insist(/^[a-z0-9-]+$/.test(location), 'Unbekannter Speicherstandort');
  const args=['storage','buckets','create',`gs://${DEST_BUCKET}`,
    `--project=${PROJECT}`,`--location=${location}`,
    '--uniform-bucket-level-access','--public-access-prevention','--soft-delete-duration=7d'];
  console.log('Erstelle ausschliesslich neuen privaten TEST-Bucket ...');
  execFileSync('gcloud',args,{stdio:'inherit'});
  console.log('Kopiere unveraenderliche Original-GCS-Objektgenerationen ...');
  await copyFiles(storage,sourceFiles);
  console.log('Kopiere Firestore-Konten, Profile und Welten ohne Anmeldesitzungen ...');
  await copyDocs(db,sourceDocs);
  console.log('Pruefe Kopie gegen die Originaldaten ...');
  const clonedDocs=await inspectDocuments(db,DEST_PREFIX);
  for(const [name,items] of sourceDocs) compareDocs(items,clonedDocs.get(name),false);
  const clonedFiles=await inspectFiles(storage.bucket(DEST_BUCKET));
  compareInventory(sourceFiles,clonedFiles,false);
  const latestDocs=await inspectDocuments(db,SOURCE_PREFIX);
  for(const [name,items] of sourceDocs) compareDocs(items,latestDocs.get(name),true);
  const latestFiles=await inspectFiles(storage.bucket(SOURCE_BUCKET));
  compareInventory(sourceFiles,latestFiles,true);
  await validateManifests(storage.bucket(DEST_BUCKET), clonedFiles, clonedDocs);
  const record={
    ready:true,sourceProject:PROJECT,sourceBucket:SOURCE_BUCKET,destinationBucket:DEST_BUCKET,
    sourcePrefix:SOURCE_PREFIX,destinationPrefix:DEST_PREFIX,
    createdAt:new Date().toISOString(),objectCount,activeWorlds,
    documentCounts:migrationCounts(sourceDocs),objectDigest:fileDigest(sourceFiles),
    authSessionsTransferred:false,sourceUnchangedDuringCopy:true
  };
  await marker.create(record);
  console.log('TESTDATEN VOLLSTAENDIG UEBERNOMMEN UND VERIFIZIERT.');
  console.log('Produktivdaten unveraendert. Alte Anmeldesitzungen wurden nicht kopiert.');
}
main().catch(err=>{console.error('ABBRUCH; KEIN TESTBACKEND-TRAFFIC-WECHSEL:',err.message);process.exitCode=1;});
