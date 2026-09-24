'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { LocalObjectStore } = require('../server/persistence/local-object-store');
const { FileMetadataRepository, MAX_ACTIVE_WORLDS_PER_USER, MAX_WORLD_SLOTS } = require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService } = require('../server/persistence/world-persistence-service');
const { WorldAdministrationService } = require('../server/services/world-administration-service');
const {
  ROLE_PLAYER,
  ROLE_WORLD_ADMIN,
  ensureWorldMembershipRoles,
  setWorldMembershipRole,
  canManageWorld
} = require('../server/domain/world-memberships');

const report = { version: '0.28.0', passed: true, checks: [] };
function check(name, ok, details = {}) {
  report.checks.push({ name, ok: Boolean(ok), details });
  if (!ok) report.passed = false;
}
async function expectCode(fn, code) {
  try { await fn(); return false; } catch (error) { return error && error.code === code; }
}
function expectCodeSync(fn, code) {
  try { fn(); return false; } catch (error) { return error && error.code === code; }
}
function makeWorldRecord() {
  return {
    id: 'persist-world',
    schemaVersion: 'kf-world-record-0.27.2',
    gameVersion: '0.27.3',
    createdByUserId: 'user-a',
    memberships: {
      byTrainerId: {
        'trainer-a': { trainerId: 'trainer-a', userProfileId: 'user-a', clubId: 'club-a', status: 'active' },
        'trainer-b': { trainerId: 'trainer-b', userProfileId: 'user-b', clubId: 'club-b', status: 'active' }
      },
      order: ['trainer-a', 'trainer-b']
    },
    gameState: { meta: { seasonNumber: 1 }, players: { byId: {} } }
  };
}

(async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'kf028-'));
  const metadataFile = path.join(root, 'metadata.json');
  const objectsRoot = path.join(root, 'objects');
  const metadata = new FileMetadataRepository({ filePath: metadataFile });

  const registration = await metadata.createWorldRegistration({ slotId: 1, worldId: 'world-1', createdByUserId: 'user-a' });
  check('World registry occupies one of exactly 1000 slots', registration.slotId === 1 && (await metadata.getSlot(1)).worldId === 'world-1');
  check('Slot range is fixed to 1..1000', await expectCode(() => metadata.createWorldRegistration({ slotId: MAX_WORLD_SLOTS + 1, worldId: 'invalid', createdByUserId: 'x' }), 'DOMAIN_RULE_VIOLATION'));
  check('Firestore/file metadata keeps only a rebuildable participation index, not club or role truth',
    (await metadata.listActiveWorldIdsForUser('user-a')).includes('world-1') && !JSON.stringify(JSON.parse(await fsp.readFile(metadataFile, 'utf8'))).includes('clubId') && !JSON.stringify(JSON.parse(await fsp.readFile(metadataFile, 'utf8'))).includes('WORLD_ADMIN'));

  const roleWorld = makeWorldRecord();
  const migrated = ensureWorldMembershipRoles(roleWorld);
  check('WorldRecord.memberships remains the authoritative role/club source and creator becomes initial WORLD_ADMIN',
    migrated.changed && roleWorld.memberships.byTrainerId['trainer-a'].role === ROLE_WORLD_ADMIN && roleWorld.memberships.byTrainerId['trainer-b'].role === ROLE_PLAYER);
  setWorldMembershipRole(roleWorld, { actorUserId: 'user-a', targetUserId: 'user-b', role: ROLE_WORLD_ADMIN });
  setWorldMembershipRole(roleWorld, { actorUserId: 'user-b', targetUserId: 'user-a', role: ROLE_PLAYER });
  check('WORLD_ADMIN can be granted later and is not permanently tied to the creator',
    roleWorld.memberships.byTrainerId['trainer-b'].role === ROLE_WORLD_ADMIN && roleWorld.memberships.byTrainerId['trainer-a'].role === ROLE_PLAYER && canManageWorld(roleWorld, 'user-b'));
  check('Last WORLD_ADMIN cannot be demoted', expectCodeSync(
    () => setWorldMembershipRole(roleWorld, { actorUserId: 'user-b', targetUserId: 'user-b', role: ROLE_PLAYER }),
    'DOMAIN_RULE_VIOLATION'
  ));

  const userFive = 'user-five';
  for (let i = 0; i < MAX_ACTIVE_WORLDS_PER_USER; i++) {
    const worldId = `five-${i}`;
    await metadata.createWorldRegistration({ slotId: 10 + i, worldId, createdByUserId: `creator-${i}` });
    await metadata.addParticipationIndex({ worldId, userId: userFive });
  }
  await metadata.createWorldRegistration({ slotId: 20, worldId: 'sixth-target', createdByUserId: 'creator-sixth' });
  check('A user may participate in at most five active worlds', await expectCode(
    () => metadata.addParticipationIndex({ worldId: 'sixth-target', userId: userFive }),
    'DOMAIN_RULE_VIOLATION'
  ));

  const store = new LocalObjectStore({ rootDir: objectsRoot });
  const worlds = new WorldPersistenceService({ objectStore: store });
  await metadata.createWorldRegistration({ slotId: 2, worldId: 'persist-world', createdByUserId: 'user-a' });
  const initialWorld = makeWorldRecord();
  ensureWorldMembershipRoles(initialWorld);
  const manifest1 = await worlds.initializeWorld({ worldRecord: initialWorld });
  check('World persistence starts at revision 1 with compressed WorldRecord', manifest1.revision === 1 && manifest1.worldRecordPath.endsWith('world.json.gz'));

  const administration = new WorldAdministrationService({ metadataRepository: metadata, worldPersistence: worlds });
  const invite = await administration.createInvitation({ worldId: 'persist-world', actorUserId: 'user-a', invitedUserId: 'user-z', inviteId: 'invite-1' }).catch(error => ({ error }));
  check('World admin authorization is read from WorldRecord before an invitation is stored', invite && !invite.error && invite.invitedByUserId === 'user-a');
  const deniedInvite = await expectCode(() => administration.createInvitation({ worldId: 'persist-world', actorUserId: 'user-b', inviteId: 'invite-denied' }), 'DOMAIN_RULE_VIOLATION');
  check('Non-admin invitation is rejected by the administration service', deniedInvite);

  const matchPayload = Array.from({ length: 50 }, (_, i) => ({ id: `m-${i}`, home: 'a', away: 'b', events: Array(20).fill({ type: 'pass', minute: i }) }));
  const financePayload = Array.from({ length: 200 }, (_, i) => ({ id: `f-${i}`, clubId: `c-${i % 4}`, amount: i, type: 'TEST' }));
  const worldAfterSlot = JSON.parse(JSON.stringify(initialWorld));
  worldAfterSlot.gameState.meta.lastSlot = 'S1-L1';
  const manifest2 = await worlds.commitSlot({ worldRecord: worldAfterSlot, season: 1, slotKey: 'S1-L1', matches: matchPayload, financeEvents: financePayload, expectedRevision: 1 });
  check('Slot commit advances one revision and stores match/finance data as slot segments',
    manifest2.revision === 2 && Boolean(manifest2.matchSegments['S1-L1']) && Boolean(manifest2.financeSegments['S1-L1']));
  const [loadedWorld, loadedMatches, loadedFinance] = await Promise.all([
    worlds.loadWorldRecord('persist-world'),
    worlds.loadMatchSegment('persist-world', 'S1-L1'),
    worlds.loadFinanceSegment('persist-world', 'S1-L1')
  ]);
  check('Persisted football truth round-trips without a second WorldRecord', loadedWorld.gameState.meta.lastSlot === 'S1-L1' && loadedMatches.matches.length === 50 && loadedFinance.events.length === 200);
  check('Stale revision cannot overwrite a newer world', await expectCode(
    () => worlds.commitSlot({ worldRecord: worldAfterSlot, season: 1, slotKey: 'S1-L2', expectedRevision: 1 }),
    'PERSISTENCE_CONFLICT'
  ));

  const worldsAfterRestart = new WorldPersistenceService({ objectStore: new LocalObjectStore({ rootDir: objectsRoot }) });
  const reloadedAfterRestart = await worldsAfterRestart.loadWorldRecord('persist-world');
  check('A server restart can reload the committed world from persistent storage', reloadedAfterRestart.gameState.meta.lastSlot === 'S1-L1');

  const revisionOneWorldStillExists = await store.exists(manifest1.worldRecordPath);
  check('Old WorldRecord snapshot is removed after a newer revision commits', !revisionOneWorldStillExists);

  const season2World = JSON.parse(JSON.stringify(worldAfterSlot));
  season2World.gameState.meta.seasonNumber = 2;
  delete season2World.gameState.meta.lastSlot;
  const manifest3 = await worlds.commitSeasonTransition({ worldRecord: season2World, newSeason: 2, expectedRevision: 2 });
  check('Season transition commits a new world revision and resets current-season segment pointers',
    manifest3.revision === 3 && manifest3.currentSeason === 2 && Object.keys(manifest3.matchSegments).length === 0 && Object.keys(manifest3.financeSegments).length === 0);
  check('Completed-season detail segments are physically cleaned after successful season transition',
    !(await store.exists(manifest2.matchSegments['S1-L1'])) && !(await store.exists(manifest2.financeSegments['S1-L1'])));
  check('Completed-season detail segments are no longer exposed as current truth',
    (await worlds.loadMatchSegment('persist-world', 'S1-L1')) === null && (await worlds.loadFinanceSegment('persist-world', 'S1-L1')) === null);

  const objectFiles = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p); else objectFiles.push(p);
    }
  }
  walk(objectsRoot);
  const gzipFiles = objectFiles.filter(p => p.endsWith('.gz'));
  const totalGzipBytes = gzipFiles.reduce((sum, p) => sum + fs.statSync(p).size, 0);
  check('Storage retention keeps only the current WorldRecord snapshot after season transition', gzipFiles.length === 1, { gzipFiles: gzipFiles.length, totalGzipBytes });

  const metadataReloaded = new FileMetadataRepository({ filePath: metadataFile });
  check('Derived participation index survives repository recreation/restart', (await metadataReloaded.listActiveWorldIdsForUser('user-a')).includes('world-1'));

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.passed ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
