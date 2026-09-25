'use strict';

const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { LocalObjectStore } = require('../server/persistence/local-object-store');
const { FileMetadataRepository } = require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService } = require('../server/persistence/world-persistence-service');
const { FileAuthRepository } = require('../server/auth/file-auth-repository');
const { AuthService, normalizeLoginName } = require('../server/services/auth-service');
const { WorldRuntimeManager } = require('../server/services/world-runtime-manager');
const { WorldSessionService } = require('../server/services/world-session-service');
const { ensureWorldMembershipRoles, ROLE_WORLD_ADMIN } = require('../server/domain/world-memberships');

const report = { version:'0.29.0', passed:true, checks:[] };
function check(name, ok, details={}) {
  report.checks.push({ name, ok:Boolean(ok), details });
  if (!ok) report.passed=false;
}
async function expectCode(fn, code) {
  try { await fn(); return false; } catch (error) { return error && error.code===code; }
}
async function expectMessage(fn, pattern) {
  try { await fn(); return false; } catch (error) { return pattern.test(String(error && error.message || '')); }
}
function makeWorldRecord({ worldId, userId, trainerId='trainer-a', clubId=null }) {
  const record={
    id:worldId,
    schemaVersion:'kf-world-record-0.27.2',
    gameVersion:'0.29.0',
    createdAt:new Date().toISOString(),
    createdByUserId:userId,
    progression:{status:'waiting',readyTrainerIds:[],lastHumanActivityAt:new Date().toISOString()},
    memberships:{
      byTrainerId:{
        [trainerId]:{ trainerId,userProfileId:userId,clubId,status:'active',joinedAt:new Date().toISOString(),trainerDisplayName:'Tester' }
      },
      order:[trainerId]
    },
    gameState:{
      meta:{id:worldId,seasonNumber:1,schemaVersion:'kf-core-0.27.2'},
      clubs:{byId:{'club-a':{id:'club-a',name:'Club A'}},order:['club-a']},
      players:{byId:{},order:[]},
      squads:{},
      calendar:{fixtures:[],slots:[],currentSlotKey:'w1-middle'},
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},
      clubFinances:{byClub:{}}
    }
  };
  return record;
}

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf029-'));
  const authFile=path.join(root,'auth.json');
  const metadataFile=path.join(root,'metadata.json');
  const objectsRoot=path.join(root,'objects');

  const authRepository=new FileAuthRepository({filePath:authFile});
  const auth=new AuthService({repository:authRepository});
  const metadata=new FileMetadataRepository({filePath:metadataFile});
  const objectStore=new LocalObjectStore({rootDir:objectsRoot});
  const worlds=new WorldPersistenceService({objectStore});
  let now=Date.now();
  const runtime=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:1000,now:()=>now});
  const sessions=new WorldSessionService({metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtime});

  check('Login names are normalized case-insensitively', normalizeLoginName('  Tester_01 ')==='tester_01');

  const registered=await auth.register({loginName:'Tester_01',password:'starkes-passwort',displayName:'Test Trainer'});
  check('Registration creates opaque stable user identity and bearer token',
    Boolean(registered.user.userId) && registered.user.displayName==='Test Trainer' && typeof registered.token==='string' && registered.token.length>30);

  const authDisk=JSON.parse(await fs.readFile(authFile,'utf8'));
  const account=authDisk.accounts['tester_01'];
  check('Password is stored only as a salted scrypt hash',
    account && /^scrypt\$/.test(account.passwordHash) && !JSON.stringify(authDisk).includes('starkes-passwort'));
  check('Auth storage contains no clubId or WORLD_ADMIN truth',
    !JSON.stringify(authDisk).includes('clubId') && !JSON.stringify(authDisk).includes('WORLD_ADMIN'));

  const login=await auth.login({loginName:'TESTER_01',password:'starkes-passwort'});
  const authenticated=await auth.authenticate(login.token);
  check('Login is case-insensitive and session resolves the same userId',
    authenticated.user.userId===registered.user.userId);
  check('Wrong password is rejected', await expectMessage(
    ()=>auth.login({loginName:'tester_01',password:'falsch-falsch'}), /Invalid login name or password/
  ));

  const worldId='world-one';
  const initial=makeWorldRecord({worldId,userId:registered.user.userId});
  const created=await sessions.createWorld({userId:registered.user.userId,worldRecord:initial,worldName:'Testwelt',visibility:'PRIVATE',joinPolicy:'INVITE_ONLY'});
  check('World creation assigns slot and creator WORLD_ADMIN from WorldRecord.memberships',
    created.registration.slotId===1 && created.membership.role===ROLE_WORLD_ADMIN);

  const metadataDisk=JSON.parse(await fs.readFile(metadataFile,'utf8'));
  check('Metadata participation index stays rebuildable and stores no club/role truth',
    !JSON.stringify(metadataDisk).includes('clubId') && !JSON.stringify(metadataDisk).includes('WORLD_ADMIN'));

  const listed=await sessions.listWorlds(registered.user.userId);
  check('Authenticated user world list resolves through participation index', listed.length===1 && listed[0].worldId===worldId);

  const saveRecord=JSON.parse(JSON.stringify(created.worldRecord));
  saveRecord.gameState.meta.testMarker='saved';
  saveRecord.memberships.byTrainerId['trainer-a'].clubId='club-a';
  const saved=await sessions.saveWorld({
    userId:registered.user.userId,
    worldId,
    worldRecord:saveRecord,
    expectedRevision:created.revision,
    matches:[{id:'match-1',season:1,homeClubId:'club-a',awayClubId:'club-b',events:[{type:'goal'}]}],
    financeEvents:[{id:'finance-1',clubId:'club-a',seasonId:1,type:'test',amount:5}]
  });
  check('Single-user snapshot advances revision', saved.revision===created.revision+1);

  await runtime.unloadWorld(worldId);
  const reloaded=await sessions.openWorld({userId:registered.user.userId,worldId});
  check('WorldRecord plus current-season match/finance details round-trip after unload',
    reloaded.worldRecord.gameState.meta.testMarker==='saved' &&
    reloaded.membership.clubId==='club-a' &&
    reloaded.matches.length===1 && reloaded.matches[0].id==='match-1' &&
    reloaded.financeEvents.length===1 && reloaded.financeEvents[0].id==='finance-1');

  check('Stale revision cannot overwrite newer truth', await expectCode(
    ()=>sessions.saveWorld({
      userId:registered.user.userId,worldId,worldRecord:reloaded.worldRecord,
      expectedRevision:created.revision,matches:reloaded.matches,financeEvents:reloaded.financeEvents
    }), 'PERSISTENCE_CONFLICT'
  ));

  const tampered=JSON.parse(JSON.stringify(reloaded.worldRecord));
  tampered.memberships.byTrainerId['trainer-a'].userProfileId='other-user';
  check('Snapshot cannot replace membership identity', await expectMessage(
    ()=>sessions.saveWorld({
      userId:registered.user.userId,worldId,worldRecord:tampered,
      expectedRevision:reloaded.revision,matches:reloaded.matches,financeEvents:reloaded.financeEvents
    }), /membership identity/i
  ));

  const secondWorld=makeWorldRecord({worldId:'world-two',userId:registered.user.userId,trainerId:'trainer-two'});
  await sessions.createWorld({userId:registered.user.userId,worldRecord:secondWorld,worldName:'Zweite Testwelt',visibility:'PUBLIC',joinPolicy:'APPLICATION'});
  check('Multiple worlds can be loaded simultaneously', runtime.status().loadedWorldCount===2);

  const firstRuntime=runtime.runtimes.get(worldId);
  const secondRuntime=runtime.runtimes.get('world-two');
  firstRuntime.worldRecord.gameState.meta.runtimeIsolation='first-only';
  check('Runtime state is isolated per world',
    !secondRuntime.worldRecord.gameState.meta.runtimeIsolation);

  now+=2000;
  const unloaded=runtime.unloadInactive();
  check('Inactive worlds unload from RAM without deleting persistent saves',
    unloaded.includes(worldId) && unloaded.includes('world-two') && runtime.status().loadedWorldCount===0);
  const afterIdleReload=await sessions.openWorld({userId:registered.user.userId,worldId});
  check('Unloaded world reloads from persistent committed truth',
    afterIdleReload.worldRecord.gameState.meta.testMarker==='saved' &&
    !afterIdleReload.worldRecord.gameState.meta.runtimeIsolation);

  const runtimeAfterRestart=new WorldRuntimeManager({
    worldPersistence:new WorldPersistenceService({objectStore:new LocalObjectStore({rootDir:objectsRoot})}),
    metadataRepository:new FileMetadataRepository({filePath:metadataFile})
  });
  const afterRestart=await runtimeAfterRestart.openWorld({userId:registered.user.userId,worldId});
  check('Fresh runtime manager restores world after simulated server restart',
    afterRestart.worldRecord.gameState.meta.testMarker==='saved' && afterRestart.matches.length===1);

  const multiplayerRecord=JSON.parse(JSON.stringify(afterRestart.worldRecord));
  multiplayerRecord.memberships.byTrainerId['trainer-b']={
    trainerId:'trainer-b',userProfileId:'user-b',clubId:null,status:'active',joinedAt:new Date().toISOString(),trainerDisplayName:'B'
  };
  multiplayerRecord.memberships.order.push('trainer-b');
  ensureWorldMembershipRoles(multiplayerRecord);
  const multiplayerManifest=await worlds.commitWorldRecord({worldRecord:multiplayerRecord,expectedRevision:afterRestart.revision});
  await runtime.unloadWorld(worldId);
  const multiLoaded=await sessions.openWorld({userId:registered.user.userId,worldId});
  check('Runtime observes externally committed multiplayer membership after reload',
    multiLoaded.revision===multiplayerManifest.revision && multiLoaded.worldRecord.memberships.order.length===2);
  check('Full browser-style snapshot save is blocked once a world has multiple humans',
    await expectMessage(()=>sessions.saveWorld({
      userId:registered.user.userId,worldId,worldRecord:multiLoaded.worldRecord,
      expectedRevision:multiLoaded.revision,matches:multiLoaded.matches,financeEvents:multiLoaded.financeEvents
    }), /disabled for multiplayer worlds/i));

  await auth.logout(login.token);
  check('Logout invalidates bearer session', await expectMessage(()=>auth.authenticate(login.token), /Invalid session/));

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{ console.error(error); process.exit(1); });
