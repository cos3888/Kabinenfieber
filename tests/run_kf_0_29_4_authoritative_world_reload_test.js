'use strict';

const fs=require('fs/promises');
const path=require('path');
const os=require('os');
const { LocalObjectStore }=require('../server/persistence/local-object-store');
const { FileMetadataRepository }=require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService }=require('../server/persistence/world-persistence-service');
const { WorldRuntimeManager }=require('../server/services/world-runtime-manager');
const { WorldSessionService }=require('../server/services/world-session-service');

const report={version:'0.29.4',passed:true,checks:[]};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}

function makeWorldRecord(worldId,userId){
  return {
    id:worldId,
    schemaVersion:'kf-world-record-0.27.2',
    gameVersion:'0.29.4',
    createdAt:new Date().toISOString(),
    createdByUserId:userId,
    creationRules:{startVariant:'classic',leagueConfiguration:'default',clubSelection:'manual'},
    runtimeSettings:{roundDurationHours:null},
    progression:{status:'waiting',deadlineAt:null,readyTrainerIds:[],lastHumanActivityAt:new Date().toISOString()},
    memberships:{byTrainerId:{'trainer-1':{
      trainerId:'trainer-1',userProfileId:userId,clubId:null,status:'active',
      joinedAt:new Date().toISOString(),lastActivityAt:new Date().toISOString(),trainerDisplayName:'Tester'
    }},order:['trainer-1']},
    gameState:{
      meta:{id:worldId,seasonNumber:1,schemaVersion:'kf-core-0.27.2'},
      clubs:{byId:{'club-a':{id:'club-a',name:'Club A'},'club-b':{id:'club-b',name:'Club B'}},order:['club-a','club-b']},
      players:{byId:{},order:[]},
      squads:{},
      calendar:{currentSlotKey:'w1-middle',fixtures:[{id:'fixture-1',slotKey:'w1-middle',status:'scheduled',homeClubId:'club-a',awayClubId:'club-b'}],slots:[]},
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},
      clubFinances:{byClub:{}}
    }
  };
}

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf0294-'));
  const metadata=new FileMetadataRepository({filePath:path.join(root,'metadata.json')});
  const worlds=new WorldPersistenceService({objectStore:new LocalObjectStore({rootDir:path.join(root,'objects')})});
  const runtimeA=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:60000});
  const runtimeB=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:60000});
  const sessionsA=new WorldSessionService({metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtimeA});
  const sessionsB=new WorldSessionService({metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtimeB});
  const userId='user-0294';
  const worldId='world-0294';

  const created=await sessionsA.createWorld({
    userId,worldRecord:makeWorldRecord(worldId,userId),worldName:'Authoritative Reload',
    visibility:'PRIVATE',joinPolicy:'INVITE_ONLY'
  });
  const cachedOnB=await sessionsB.openWorld({userId,worldId});
  check('Second runtime initially caches the creation revision',
    cachedOnB.revision===created.revision&&cachedOnB.membership.clubId===null,
    {createdRevision:created.revision,cachedRevision:cachedOnB.revision});

  const takeover=JSON.parse(JSON.stringify(created.worldRecord));
  takeover.memberships.byTrainerId['trainer-1'].clubId='club-a';
  const takeoverSaved=await sessionsA.saveWorld({
    userId,worldId,worldRecord:takeover,expectedRevision:created.revision,matches:[],financeEvents:[]
  });
  const staleBeforeTakeoverReload=runtimeB.status().worlds.find(entry=>entry.worldId===worldId);
  const takeoverReloadedOnB=await sessionsB.openWorld({userId,worldId});
  check('Cached runtime reloads a newer committed club takeover without explicit unload',
    staleBeforeTakeoverReload&&staleBeforeTakeoverReload.revision===created.revision&&
    takeoverReloadedOnB.revision===takeoverSaved.revision&&
    takeoverReloadedOnB.membership.clubId==='club-a'&&
    takeoverReloadedOnB.worldRecord.memberships.byTrainerId['trainer-1'].clubId==='club-a',
    {before:staleBeforeTakeoverReload,afterRevision:takeoverReloadedOnB.revision,membership:takeoverReloadedOnB.membership});

  const afterMatchday=JSON.parse(JSON.stringify(takeoverReloadedOnB.worldRecord));
  afterMatchday.gameState.calendar.currentSlotKey='w2-end';
  afterMatchday.gameState.calendar.fixtures[0].status='played';
  afterMatchday.gameState.history.matches.push({
    id:'m1-compact',season:1,slotKey:'w1-middle',homeClubId:'club-a',awayClubId:'club-b',status:'played',homeGoals:2,awayGoals:1
  });
  const fullMatch={id:'matchday-1',season:1,slotKey:'w1-middle',homeClubId:'club-a',awayClubId:'club-b',homeGoals:2,awayGoals:1,events:[{type:'goal'}]};
  const financeEvent={id:'finance-matchday-1',clubId:'club-a',seasonId:1,type:'salaryExpense',amount:-5};

  const matchdaySaved=await sessionsA.saveWorld({
    userId,worldId,worldRecord:afterMatchday,expectedRevision:takeoverSaved.revision,
    matches:[fullMatch],financeEvents:[financeEvent]
  });
  const staleBeforeMatchdayReload=runtimeB.status().worlds.find(entry=>entry.worldId===worldId);
  const matchdayReloadedOnB=await sessionsB.openWorld({userId,worldId});

  check('Second runtime advances from stale revision to the latest manifest revision',
    staleBeforeMatchdayReload&&staleBeforeMatchdayReload.revision===takeoverSaved.revision&&
    matchdayReloadedOnB.revision===matchdaySaved.revision,
    {before:staleBeforeMatchdayReload,afterRevision:matchdayReloadedOnB.revision,expectedRevision:matchdaySaved.revision});

  check('Played matchday reload is revision-coherent across WorldRecord, membership, matches and finances',
    matchdayReloadedOnB.membership.clubId==='club-a'&&
    matchdayReloadedOnB.worldRecord.gameState.calendar.currentSlotKey==='w2-end'&&
    matchdayReloadedOnB.worldRecord.gameState.calendar.fixtures[0].status==='played'&&
    matchdayReloadedOnB.worldRecord.gameState.history.matches.length===1&&
    matchdayReloadedOnB.matches.length===1&&matchdayReloadedOnB.matches[0].id===fullMatch.id&&
    matchdayReloadedOnB.financeEvents.length===1&&matchdayReloadedOnB.financeEvents[0].id===financeEvent.id);

  const manifest=await worlds.getManifest(worldId);
  const directSnapshot=await worlds.loadRuntimeSnapshot(worldId,manifest);
  check('Direct runtime snapshot uses one committed manifest for all current truths',
    directSnapshot.manifest.revision===matchdaySaved.revision&&
    directSnapshot.worldRecord.gameState.calendar.currentSlotKey==='w2-end'&&
    directSnapshot.matches.length===1&&directSnapshot.financeEvents.length===1,
    {revision:directSnapshot.manifest.revision,currentSeason:directSnapshot.currentSeason});

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
