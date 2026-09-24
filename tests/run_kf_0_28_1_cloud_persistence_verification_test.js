'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { LocalObjectStore } = require('../server/persistence/local-object-store');
const { GoogleCloudObjectStore } = require('../server/persistence/google-cloud-object-store');
const { FileMetadataRepository } = require('../server/persistence/file-metadata-repository');
const { FirestoreMetadataRepository } = require('../server/persistence/firestore-metadata-repository');
const { runPersistenceVerification, normalizeVerificationError } = require('../server/services/persistence-verification-service');

const report = { version: '0.28.1', passed: true, checks: [] };
function check(name, ok, details = {}) {
  report.checks.push({ name, ok: Boolean(ok), details });
  if (!ok) report.passed = false;
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, out); else out.push(p);
  }
  return out;
}

(async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'kf0281-'));
  const objectsRoot = path.join(root, 'objects');
  const metadataFile = path.join(root, 'metadata.json');
  const localStore = new LocalObjectStore({ rootDir: objectsRoot });
  const localMetadata = new FileMetadataRepository({ filePath: metadataFile });

  const localResult = await runPersistenceVerification({
    objectStore: localStore,
    metadata: localMetadata,
    objectStoreDriver: 'local',
    metadataDriver: 'file',
    probeId: 'local-probe'
  });
  check('Local write/read/delete verification succeeds for object and metadata stores',
    localResult.status === 'ok' && localResult.objectStore.status === 'ok' && localResult.metadataStore.status === 'ok');

  const remainingFiles = walkFiles(root);
  check('Successful verification leaves no technical probe files behind',
    remainingFiles.length === 0,
    { remainingFiles: remainingFiles.map(p => path.relative(root, p)) });

  let capturedSaveOptions = null;
  let fakeGcsBody = null;
  const fakeStorageClient = {
    bucket() {
      return {
        file() {
          return {
            async save(body, options) { fakeGcsBody = Buffer.from(body); capturedSaveOptions = options; },
            async getMetadata() { return [{ generation: '1' }]; },
            async download() { return [fakeGcsBody]; },
            async exists() { return [Boolean(fakeGcsBody)]; },
            async delete() { fakeGcsBody = null; }
          };
        },
        async deleteFiles() {}
      };
    }
  };
  const gcsStore = new GoogleCloudObjectStore({ bucketName: 'test-bucket', projectId: 'test-project', storageClient: fakeStorageClient });
  await gcsStore.write('_system/test.json', Buffer.from('{}'), { contentType: 'application/json' });
  check('GCS adapter passes content type through the correct metadata option',
    capturedSaveOptions && capturedSaveOptions.metadata && capturedSaveOptions.metadata.contentType === 'application/json');

  const firestoreDocs = new Map();
  let usedSystemCollection = null;
  const fakeFirestore = {
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`;
          return {
            async create(data) {
              if (firestoreDocs.has(key)) {
                const error = new Error('already exists');
                error.code = 6;
                throw error;
              }
              firestoreDocs.set(key, JSON.parse(JSON.stringify(data)));
            },
            async get() {
              return {
                exists: firestoreDocs.has(key),
                data: () => firestoreDocs.get(key)
              };
            },
            async delete() {
              firestoreDocs.delete(key);
            }
          };
        }
      };
    }
  };
  const fireMetadata = new FirestoreMetadataRepository({ firestore: fakeFirestore, collectionPrefix: 'kf_test' });
  usedSystemCollection = fireMetadata.names.system;
  await fireMetadata.verifyRoundTrip({ probeId: 'fire-probe', payload: 'payload' });
  check('Firestore verification uses a reserved technical collection and deletes its probe',
    usedSystemCollection === 'kf_test_system' && firestoreDocs.size === 0,
    { collection: usedSystemCollection, remainingDocs: firestoreDocs.size });

  const permissionError = Object.assign(new Error('Permission denied'), { code: 403 });
  const deniedObjectStore = {
    async write() { throw permissionError; },
    async read() { throw new Error('should not read'); },
    async delete() { return false; }
  };
  const okMetadata = { async verifyRoundTrip() { return true; } };
  const deniedObjectResult = await runPersistenceVerification({
    objectStore: deniedObjectStore,
    metadata: okMetadata,
    objectStoreDriver: 'gcs',
    metadataDriver: 'firestore',
    probeId: 'deny-object'
  });
  check('Missing object-store permission is surfaced without crashing the verification',
    deniedObjectResult.status === 'failed' &&
    deniedObjectResult.objectStore.error === 'permission_denied' &&
    deniedObjectResult.metadataStore.status === 'ok');

  const memoryStore = (() => {
    const data = new Map();
    return {
      async write(key, body) { data.set(key, Buffer.from(body)); },
      async read(key) { return { body: data.get(key) }; },
      async delete(key) { data.delete(key); return true; }
    };
  })();
  const deniedMetadata = {
    async verifyRoundTrip() {
      const error = new Error('PERMISSION_DENIED');
      error.code = 7;
      throw error;
    }
  };
  const deniedMetadataResult = await runPersistenceVerification({
    objectStore: memoryStore,
    metadata: deniedMetadata,
    objectStoreDriver: 'gcs',
    metadataDriver: 'firestore',
    probeId: 'deny-metadata'
  });
  check('Missing Firestore permission is normalized to permission_denied',
    deniedMetadataResult.status === 'failed' &&
    deniedMetadataResult.objectStore.status === 'ok' &&
    deniedMetadataResult.metadataStore.error === 'permission_denied');

  let mismatchDeleted = false;
  const mismatchStore = {
    async write() {},
    async read() { return { body: Buffer.from('wrong') }; },
    async delete() { mismatchDeleted = true; return true; }
  };
  const mismatchResult = await runPersistenceVerification({
    objectStore: mismatchStore,
    metadata: okMetadata,
    objectStoreDriver: 'gcs',
    metadataDriver: 'firestore',
    probeId: 'mismatch'
  });
  check('Payload mismatch fails verification but still executes cleanup',
    mismatchResult.objectStore.error === 'payload_mismatch' && mismatchDeleted);

  const cleanupStore = {
    body: null,
    async write(key, body) { this.body = Buffer.from(body); },
    async read() { return { body: this.body }; },
    async delete() { throw new Error('delete blocked'); }
  };
  const cleanupResult = await runPersistenceVerification({
    objectStore: cleanupStore,
    metadata: okMetadata,
    objectStoreDriver: 'gcs',
    metadataDriver: 'firestore',
    probeId: 'cleanup'
  });
  check('Cleanup failure is explicitly reported', cleanupResult.objectStore.error === 'cleanup_failed');

  check('gRPC permission code 7 is normalized for Firestore diagnostics',
    normalizeVerificationError(Object.assign(new Error('x'), { code: 7 })) === 'permission_denied');

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.passed ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
