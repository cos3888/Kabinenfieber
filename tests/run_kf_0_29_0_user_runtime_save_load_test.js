'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const http = require('http');

const { LocalObjectStore } = require('../server/persistence/local-object-store');
const { FileMetadataRepository } = require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService } = require('../server/persistence/world-persistence-service');
const { FileAuthRepository } = require('../server/auth/file-auth-repository');
const { AuthService } = require('../server/services/auth-service');
const { WorldRuntimeManager } = require('../server/services/world-runtime-manager');
const { WorldSessionService } = require('../server/services/world-session-service');

const report = { version: '0.29.0', passed: true, checks: [] };
function check(name, ok, details = {}) {
  report.checks.push({ name, ok: Boolean(ok), details });
  if (!ok) report.passed = false;
}
async function expectCode(fn, code) {
  try { await fn(); return false; } catch (error) { return error && error.code === code; }
}

function makeWorldRecord(id, userId, trainerId, clubId = 'club-a') {
  return {
    id,
    schemaVersion: 'kf-world-record-0.27.2',
    gameVersion: '0.29.0',
    createdAt: new Date().toISOString(),
    createdByUserId: userId,
    creationRules: { startVariant: 'classic', leagueConfiguration: 'default', clubSelection: 'manual' },
    runtimeSettings: { roundDurationHours: null },
    progression: { status: 'waiting', deadlineAt: null, readyTrainerIds: [], lastHumanActivityAt: new Date().toISOString() },
    memberships: {
      byTrainerId: {
        [trainerId]: {
          trainerId,
          userProfileId: userId,
          clubId,
          status: 'active',
          joinedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          trainerDisplayName: 'Trainer'
        }
      },
      order: [trainerId]
    },
    gameState: {
      meta: { id, seasonNumber: 1, currentSlotKey: 'w1-middle' },
      clubs: { byId: { 'club-a': { id: 'club-a', name: 'Club A' } }, order: ['club-a'] },
      players: { byId: {}, order: [] },
      squads: {},
      calendar: { currentSlotKey: 'w1-middle', fixtures: [] },
      history: { matches: [], seasonResults: {}, playerSeasons: {}, seasonStandings: {}, playerMarketValues: {} },
      clubFinances: { byClub: {} }
    }
  };
}

async function apiRequest({ port, method = 'GET', pathname, token = '', body = null, origin = '' }) {
  const payload = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: {
        ...(payload ? { 'content-type': 'application/json', 'content-length': String(payload.length) } : {}),
        ...(token ? { authorization: 'Bearer ' + token } : {}),
        ...(origin ? { origin } : {})
      }
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'kf0290-'));
  const metadata = new FileMetadataRepository({ filePath: path.join(root, 'metadata.json') });
  const store = new LocalObjectStore({ rootDir: path.join(root, 'objects') });
  const worlds = new WorldPersistenceService({ objectStore: store });
  const authRepo = new FileAuthRepository({ filePath: path.join(root, 'auth.json') });
  const auth = new AuthService({ repository: authRepo, sessionTtlMs: 60 * 60 * 1000 });
  const runtime = new WorldRuntimeManager({ worldPersistence: worlds, metadataRepository: metadata, idleMs: 60 * 1000 });
  const worldSessions = new WorldSessionService({ metadataRepository: metadata, worldPersistence: worlds, runtimeManager: runtime });

  const registered = await auth.register({ loginName: 'Steffen_29', password: 'test-passwort-123', displayName: 'Steffen' });
  check('Registration returns stable user id and opaque session token',
    Boolean(registered.user.userId) && Boolean(registered.token) && !registered.token.includes('Steffen_29'));

  const authFile = JSON.parse(await fsp.readFile(path.join(root, 'auth.json'), 'utf8'));
  const accountRows = Object.values(authFile.accounts || {});
  check('Password is never stored in plaintext',
    accountRows.length === 1 &&
    accountRows[0].passwordHash !== 'test-passwort-123' &&
    String(accountRows[0].passwordHash || '').startsWith('scrypt$') &&
    !JSON.stringify(authFile).includes('test-passwort-123'));

  const login = await auth.login({ loginName: 'steffen_29', password: 'test-passwort-123' });
  const authenticated = await auth.authenticate(login.token);
  check('Login names are case-insensitive and session resolves the same user',
    authenticated.user.userId === registered.user.userId);

  const userId = registered.user.userId;
  const worldA = makeWorldRecord('world-a', userId, 'trainer-a');
  const createdA = await worldSessions.createWorld({ userId, worldRecord: worldA });
  check('Authenticated user can create a server-persisted world and becomes WORLD_ADMIN',
    createdA.revision === 1 &&
    createdA.membership.role === 'WORLD_ADMIN' &&
    createdA.worldRecord.memberships.byTrainerId['trainer-a'].role === 'WORLD_ADMIN');

  const listA = await worldSessions.listWorlds(userId);
  check('World list is derived from participation index and manifest',
    listA.length === 1 && listA[0].worldId === 'world-a' && listA[0].revision === 1);

  const changedA = JSON.parse(JSON.stringify(createdA.worldRecord));
  changedA.gameState.meta.currentSlotKey = 'w2-end';
  changedA.gameState.calendar.currentSlotKey = 'w2-end';
  const fullMatch = { id: 'match-1', season: 1, homeClubId: 'club-a', awayClubId: 'club-b', events: [{ type: 'goal', minute: 12 }] };
  const finance = { id: 'finance-1', clubId: 'club-a', seasonId: 1, amount: -1.25, type: 'salaryExpense' };
  const saveA = await worldSessions.saveWorld({
    userId,
    worldId: 'world-a',
    worldRecord: changedA,
    expectedRevision: 1,
    matches: [fullMatch],
    financeEvents: [finance]
  });
  check('Single-player snapshot save advances revision',
    saveA.revision === 2 && saveA.currentSeason === 1);

  const runtimeAfterSave = await worldSessions.openWorld({ userId, worldId: 'world-a' });
  check('WorldRecord plus current-season match/finance details round-trip through runtime',
    runtimeAfterSave.worldRecord.gameState.meta.currentSlotKey === 'w2-end' &&
    runtimeAfterSave.matches.length === 1 &&
    runtimeAfterSave.matches[0].events[0].type === 'goal' &&
    runtimeAfterSave.financeEvents.length === 1 &&
    runtimeAfterSave.financeEvents[0].id === 'finance-1');

  check('Stale browser revision cannot overwrite the server world',
    await expectCode(() => worldSessions.saveWorld({
      userId,
      worldId: 'world-a',
      worldRecord: changedA,
      expectedRevision: 1,
      matches: [],
      financeEvents: []
    }), 'PERSISTENCE_CONFLICT'));

  const attacker = await auth.register({ loginName: 'AndereUser', password: 'andere-passwort-123', displayName: 'Andere' });
  check('A foreign authenticated user cannot open another users world',
    await expectCode(() => worldSessions.openWorld({ userId: attacker.user.userId, worldId: 'world-a' }), 'DOMAIN_RULE_VIOLATION'));

  const tampered = JSON.parse(JSON.stringify(runtimeAfterSave.worldRecord));
  tampered.memberships.byTrainerId['trainer-a'].userProfileId = attacker.user.userId;
  check('Snapshot cannot rewrite authoritative membership identity',
    await expectCode(() => worldSessions.saveWorld({
      userId,
      worldId: 'world-a',
      worldRecord: tampered,
      expectedRevision: 2,
      matches: runtimeAfterSave.matches,
      financeEvents: runtimeAfterSave.financeEvents
    }), 'DOMAIN_RULE_VIOLATION'));

  const worldB = makeWorldRecord('world-b', userId, 'trainer-b');
  await worldSessions.createWorld({ userId, worldRecord: worldB });
  const [openAParallel, openBParallel] = await Promise.all([
    worldSessions.openWorld({ userId, worldId: 'world-a' }),
    worldSessions.openWorld({ userId, worldId: 'world-b' })
  ]);
  check('Multiple worlds can be active in the runtime at the same time',
    openAParallel.worldRecord.id === 'world-a' &&
    openBParallel.worldRecord.id === 'world-b' &&
    runtime.status().loadedWorldCount === 2);

  await runtime.unloadWorld('world-a');
  const runtimeAfterRestart = new WorldRuntimeManager({
    worldPersistence: new WorldPersistenceService({ objectStore: new LocalObjectStore({ rootDir: path.join(root, 'objects') }) }),
    metadataRepository: new FileMetadataRepository({ filePath: path.join(root, 'metadata.json') }),
    idleMs: 60 * 1000
  });
  const sessionsAfterRestart = new WorldSessionService({
    metadataRepository: new FileMetadataRepository({ filePath: path.join(root, 'metadata.json') }),
    worldPersistence: runtimeAfterRestart.worldPersistence,
    runtimeManager: runtimeAfterRestart
  });
  const reopened = await sessionsAfterRestart.openWorld({ userId, worldId: 'world-a' });
  check('Unload/server restart reloads identical persisted current truth',
    reopened.revision === 2 &&
    reopened.worldRecord.gameState.meta.currentSlotKey === 'w2-end' &&
    reopened.matches.length === 1 &&
    reopened.financeEvents.length === 1);

  const apiRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'kf0290-api-'));
  process.env.KF_DATA_DIR = apiRoot;
  process.env.KF_OBJECT_STORE = 'local';
  process.env.KF_METADATA_STORE = 'file';
  process.env.KF_ALLOWED_ORIGINS = 'https://cos3888.github.io';
  process.env.KF_RUNTIME_IDLE_MS = '60000';
  const serverModule = require('../server/index');
  await new Promise(resolve => serverModule.server.listen(0, '127.0.0.1', resolve));
  const port = serverModule.server.address().port;
  try {
    const registerApi = await apiRequest({
      port,
      method: 'POST',
      pathname: '/api/v1/auth/register',
      origin: 'https://cos3888.github.io',
      body: { loginName: 'ApiUser', password: 'api-passwort-123', displayName: 'API User' }
    });
    check('HTTP registration endpoint and GitHub Pages CORS are active',
      registerApi.status === 201 &&
      registerApi.body.ok === true &&
      registerApi.headers['access-control-allow-origin'] === 'https://cos3888.github.io');

    const meApi = await apiRequest({
      port,
      pathname: '/api/v1/auth/me',
      token: registerApi.body.token,
      origin: 'https://cos3888.github.io'
    });
    check('Bearer session protects authenticated HTTP routes',
      meApi.status === 200 && meApi.body.user.userId === registerApi.body.user.userId);

    const deniedApi = await apiRequest({ port, pathname: '/api/v1/worlds' });
    check('World API rejects unauthenticated requests', deniedApi.status === 401);

    const badOrigin = await apiRequest({
      port,
      method: 'OPTIONS',
      pathname: '/api/v1/worlds',
      origin: 'https://example.invalid'
    });
    check('CORS preflight rejects unapproved browser origins', badOrigin.status === 403);
  } finally {
    await new Promise(resolve => serverModule.server.close(resolve));
  }

  check('No accidental plaintext password appears in runtime data',
    !fs.readFileSync(path.join(root, 'auth.json'), 'utf8').includes('test-passwort-123'));

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.passed ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
