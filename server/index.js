'use strict';

const http = require('http');
const zlib = require('zlib');
const { promisify } = require('util');
const { loadConfig } = require('./config');
const { createPersistence } = require('./persistence/factory');
const { runPersistenceVerification, normalizeVerificationError } = require('./services/persistence-verification-service');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const config = loadConfig();
const persistence = createPersistence(config);
const SERVICE_VERSION = '0.29.5';
const API_VERSION = '0.29.5';

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

function requestOrigin(req) {
  return String(req.headers.origin || '');
}

function applyCors(req, headers) {
  const origin = requestOrigin(req);
  if (origin && config.allowedOrigins.includes(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = headers.vary ? `${headers.vary}, Origin` : 'Origin';
  }
  headers['access-control-allow-methods'] = 'GET,POST,PUT,OPTIONS';
  headers['access-control-allow-headers'] = 'Authorization,Content-Type,Content-Encoding';
  headers['access-control-max-age'] = '600';
  return headers;
}

async function sendJson(req, res, statusCode, value, extraHeaders = {}) {
  const json = Buffer.from(JSON.stringify(value), 'utf8');
  const headers = applyCors(req, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders
  });
  const acceptsGzip = /(?:^|,)\s*gzip\s*(?:,|$)/i.test(String(req.headers['accept-encoding'] || ''));
  if (acceptsGzip && json.length > 256 * 1024) {
    const compressed = await gzip(json, { level: 6 });
    headers['content-encoding'] = 'gzip';
    headers.vary = headers.vary ? `${headers.vary}, Accept-Encoding` : 'Accept-Encoding';
    headers['content-length'] = String(compressed.length);
    res.writeHead(statusCode, headers);
    res.end(compressed);
    return;
  }
  headers['content-length'] = String(json.length);
  res.writeHead(statusCode, headers);
  res.end(json);
}

async function readJsonBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > config.maxRequestBytes) {
      const error = new Error('request_too_large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  let body = Buffer.concat(chunks);
  const encoding = String(req.headers['content-encoding'] || '').toLowerCase();
  if (encoding && encoding !== 'identity') {
    if (encoding !== 'gzip') {
      const error = new Error('unsupported_content_encoding');
      error.statusCode = 415;
      throw error;
    }
    body = await gunzip(body);
    if (body.length > 256 * 1024 * 1024) {
      const error = new Error('decompressed_request_too_large');
      error.statusCode = 413;
      throw error;
    }
  }
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch (_) {
    const error = new Error('invalid_json');
    error.statusCode = 400;
    throw error;
  }
}

function bearerToken(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function requireAuth(req) {
  const token = bearerToken(req);
  if (!token) {
    const error = new Error('authentication_required');
    error.statusCode = 401;
    throw error;
  }
  try {
    const auth = await persistence.auth.authenticate(token);
    return { ...auth, token };
  } catch (error) {
    error.statusCode = 401;
    throw error;
  }
}

function errorStatus(error) {
  if (error && error.statusCode) return Number(error.statusCode);
  if (error && error.code === 'PERSISTENCE_NOT_FOUND') return 404;
  if (error && error.code === 'PERSISTENCE_CONFLICT') return 409;
  if (error && error.code === 'DOMAIN_RULE_VIOLATION') {
    if (/not a member|world admin|authentication|invalid session|session expired/i.test(String(error.message || ''))) return 403;
    return 400;
  }
  return 500;
}

function publicError(error, statusCode) {
  if (statusCode >= 500) return 'internal_error';
  if (error && error.code === 'PERSISTENCE_CONFLICT') return 'conflict';
  if (error && error.code === 'PERSISTENCE_NOT_FOUND') return 'not_found';
  return String(error && error.message || 'request_failed');
}

function requireClientVersion(body) {
  const clientVersion=String(body && body.clientVersion || '');
  if (clientVersion !== API_VERSION) {
    const error=new Error('client_version_mismatch');
    error.statusCode=409;
    throw error;
  }
}

function worldIdFromPath(pathname, suffix = '') {
  const prefix = '/api/v1/worlds/';
  if (!pathname.startsWith(prefix)) return null;
  let rest = pathname.slice(prefix.length);
  if (suffix) {
    if (!rest.endsWith(suffix)) return null;
    rest = rest.slice(0, -suffix.length);
  } else if (rest.includes('/')) {
    return null;
  }
  if (!rest || rest.includes('/')) return null;
  return decodeURIComponent(rest);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    if (req.method === 'OPTIONS') {
      const origin = requestOrigin(req);
      if (origin && !config.allowedOrigins.includes(origin)) {
        await sendJson(req, res, 403, { ok: false, error: 'origin_not_allowed' });
        return;
      }
      res.writeHead(204, applyCors(req, {}));
      res.end();
      return;
    }

    if (req.method === 'GET' && pathname === '/healthz') {
      await sendJson(req, res, 200, { ok: true, service: 'kabinenfieber-backend', version: SERVICE_VERSION, apiVersion: API_VERSION });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/v1/persistence/status') {
      const verification = getPersistenceVerificationState();
      await sendJson(req, res, 200, {
        ok: verification.status === 'ok',
        version: SERVICE_VERSION,
        apiVersion: API_VERSION,
        objectStore: config.objectStoreDriver,
        metadataStore: config.metadataDriver,
        projectConfigured: Boolean(config.googleProjectId),
        bucketConfigured: Boolean(config.gcsBucket),
        verification
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/v1/auth/register') {
      const body = await readJsonBody(req);
      const result = await persistence.auth.register(body);
      await sendJson(req, res, 201, { ok: true, ...result });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/v1/auth/login') {
      const body = await readJsonBody(req);
      const result = await persistence.auth.login(body);
      await sendJson(req, res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/v1/auth/me') {
      const auth = await requireAuth(req);
      await sendJson(req, res, 200, { ok: true, user: auth.user });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/v1/auth/logout') {
      const auth = await requireAuth(req);
      await persistence.auth.logout(auth.token);
      await sendJson(req, res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/v1/worlds') {
      const auth = await requireAuth(req);
      const worlds = await persistence.worldSessions.listWorlds(auth.user.userId);
      await sendJson(req, res, 200, { ok: true, worlds });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/v1/worlds') {
      const auth = await requireAuth(req);
      const body = await readJsonBody(req);
      requireClientVersion(body);
      const result = await persistence.worldSessions.createWorld({
        userId: auth.user.userId,
        worldRecord: body.worldRecord,
        worldName: body.worldName,
        visibility: body.visibility,
        joinPolicy: body.joinPolicy,
        matches: body.matches || [],
        financeEvents: body.financeEvents || []
      });
      await sendJson(req, res, 201, {
        ok: true,
        registration: result.registration,
        revision: result.revision,
        currentSeason: result.currentSeason,
        membership: result.membership
      });
      return;
    }

    const clubWorldId = worldIdFromPath(pathname, '/club');
    if (req.method === 'POST' && clubWorldId) {
      const auth = await requireAuth(req);
      const body = await readJsonBody(req);
      requireClientVersion(body);
      const result = await persistence.worldSessions.assignClub({
        userId: auth.user.userId,
        worldId: clubWorldId,
        clubId: String(body.clubId || ''),
        expectedRevision: body.expectedRevision,
        requestId: body.requestId || null
      });
      await sendJson(req, res, 200, { ok: true, ...result });
      return;
    }

    const progressWorldId = worldIdFromPath(pathname, '/progress');
    if (req.method === 'PUT' && progressWorldId) {
      const auth = await requireAuth(req);
      const body = await readJsonBody(req);
      requireClientVersion(body);
      const result = await persistence.worldSessions.saveProgress({
        userId: auth.user.userId,
        worldId: progressWorldId,
        worldRecord: body.worldRecord,
        expectedRevision: body.expectedRevision,
        requestId: body.requestId || null,
        matchesDelta: Array.isArray(body.matchesDelta) ? body.matchesDelta : [],
        financeEventsDelta: Array.isArray(body.financeEventsDelta) ? body.financeEventsDelta : []
      });
      await sendJson(req, res, 200, { ok: true, ...result });
      return;
    }

    const snapshotWorldId = worldIdFromPath(pathname, '/snapshot');
    if (req.method === 'PUT' && snapshotWorldId) {
      const auth = await requireAuth(req);
      const body = await readJsonBody(req);
      requireClientVersion(body);
      const result = await persistence.worldSessions.saveWorld({
        userId: auth.user.userId,
        worldId: snapshotWorldId,
        worldRecord: body.worldRecord,
        expectedRevision: body.expectedRevision,
        matches: body.matches || [],
        financeEvents: body.financeEvents || []
      });
      await sendJson(req, res, 200, { ok: true, ...result });
      return;
    }

    const openWorldId = worldIdFromPath(pathname);
    if (req.method === 'GET' && openWorldId) {
      const auth = await requireAuth(req);
      const result = await persistence.worldSessions.openWorld({
        userId: auth.user.userId,
        worldId: openWorldId
      });
      await sendJson(req, res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/v1/runtime/status') {
      await requireAuth(req);
      await sendJson(req, res, 200, { ok: true, ...persistence.runtime.status() });
      return;
    }

    await sendJson(req, res, 404, { ok: false, error: 'not_found' });
  } catch (error) {
    const statusCode = errorStatus(error);
    if (statusCode >= 500) console.error(error);
    await sendJson(req, res, statusCode, { ok: false, error: publicError(error, statusCode) });
  }
});

const idleSweep = setInterval(() => {
  try {
    persistence.runtime.unloadInactive();
  } catch (error) {
    console.error('World runtime idle sweep failed', error);
  }
}, Math.min(60 * 1000, Math.max(10 * 1000, Math.floor(config.runtimeIdleMs / 3))));
if (idleSweep.unref) idleSweep.unref();

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
  getPersistenceVerificationState,
  readJsonBody,
  bearerToken
};
