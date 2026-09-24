'use strict';

const http = require('http');
const { loadConfig } = require('./config');
const { createPersistence } = require('./persistence/factory');
const { runPersistenceVerification, normalizeVerificationError } = require('./services/persistence-verification-service');

const config = loadConfig();
const persistence = createPersistence(config);

let persistenceVerificationState = {
  status: 'pending',
  startedAt: null,
  completedAt: null,
  objectStore: { driver: config.objectStoreDriver, status: 'pending', error: null },
  metadataStore: { driver: config.metadataDriver, status: 'pending', error: null }
};
let persistenceVerificationPromise = null;

function getPersistenceVerificationState() {
  return JSON.parse(JSON.stringify(persistenceVerificationState));
}

function startPersistenceVerification() {
  if (persistenceVerificationPromise) return persistenceVerificationPromise;
  persistenceVerificationState = {
    ...persistenceVerificationState,
    status: 'running',
    startedAt: new Date().toISOString(),
    objectStore: { driver: config.objectStoreDriver, status: 'running', error: null },
    metadataStore: { driver: config.metadataDriver, status: 'running', error: null }
  };
  persistenceVerificationPromise = runPersistenceVerification({
    objectStore: persistence.objectStore,
    metadata: persistence.metadata,
    objectStoreDriver: config.objectStoreDriver,
    metadataDriver: config.metadataDriver
  }).then(result => {
    persistenceVerificationState = result;
    return result;
  }).catch(error => {
    const normalized = normalizeVerificationError(error);
    persistenceVerificationState = {
      status: 'failed',
      startedAt: persistenceVerificationState.startedAt,
      completedAt: new Date().toISOString(),
      objectStore: { driver: config.objectStoreDriver, status: 'failed', error: normalized },
      metadataStore: { driver: config.metadataDriver, status: 'failed', error: normalized }
    };
    return persistenceVerificationState;
  });
  return persistenceVerificationPromise;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'kabinenfieber-backend', version: '0.28.1' }));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/persistence/status') {
      const verification = getPersistenceVerificationState();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: verification.status === 'ok',
        version: '0.28.1',
        objectStore: config.objectStoreDriver,
        metadataStore: config.metadataDriver,
        projectConfigured: Boolean(config.googleProjectId),
        bucketConfigured: Boolean(config.gcsBucket),
        verification
      }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not_found' }));
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
  }
});

if (require.main === module) {
  server.listen(config.port, () => {
    console.log(`Kabinenfieber backend listening on :${config.port}`);
    startPersistenceVerification().then(result => {
      console.log(`Persistence verification: ${result.status}`);
    });
  });
}

module.exports = {
  server,
  config,
  persistence,
  startPersistenceVerification,
  getPersistenceVerificationState
};
