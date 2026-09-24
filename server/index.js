'use strict';

const http = require('http');
const { loadConfig } = require('./config');
const { createPersistence } = require('./persistence/factory');

const config = loadConfig();
const persistence = createPersistence(config);

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'kabinenfieber-backend', version: '0.28.0' }));
      return;
    }
    if (req.method === 'GET' && req.url === '/api/v1/persistence/status') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        objectStore: config.objectStoreDriver,
        metadataStore: config.metadataDriver,
        projectConfigured: Boolean(config.googleProjectId),
        bucketConfigured: Boolean(config.gcsBucket)
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
  server.listen(config.port, () => console.log(`Kabinenfieber backend listening on :${config.port}`));
}

module.exports = { server, config, persistence };
