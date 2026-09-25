'use strict';

const fs=require('fs/promises');
const path=require('path');
const os=require('os');
const { LocalObjectStore }=require('../server/persistence/local-object-store');
const { FileMetadataRepository }=require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService }=require('../server/persistence/world-persistence-service');
const { WorldRuntimeManager }=require('../server/services/world-runtime-manager');
const { WorldSessionService }=require('../server/services/world-session-service');

const report={version:'0.29.2',passed:true,checks:[]};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}

function makeWorldRecord(worldId,userId){
  return {
    id:worldId,
    schemaVersion:'kf-world-record-0.27.2',
    gameVersion:'0.29.2',
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
      calendar:{currentSlotKey:'w1-middle',fixtures:[],slots:[]},
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},
      clubFinances:{byClub:{}}
    }
  };
}

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf0292-'));
  const metadata=new FileMetadataRepository({filePath:path.join(root,'metadata.json')});
  const worlds=new WorldPersistenceService({objectStore:new LocalObjectStore({rootDir:path.join(root,'objects')})});
  const runtime=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:60000});
  const sessions=new WorldSessionService({metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtime});
  const userId='user-0292';

  const created=await sessions.createWorld({
    userId,worldRecord:makeWorldRecord('world-0292',userId),worldName:'Checkpoint Welt',
    visibility:'PRIVATE',joinPolicy:'INVITE_ONLY'
  });
  check('New world starts before club takeover',created.membership.clubId===null,{membership:created.membership});

  const takeover=JSON.parse(JSON.stringify(created.worldRecord));
  takeover.memberships.byTrainerId['trainer-1'].clubId='club-a';
  const takeoverSaved=await sessions.saveWorld({
    userId,worldId:'world-0292',worldRecord:takeover,expectedRevision:created.revision,matches:[],financeEvents:[]
  });
  await runtime.unloadWorld('world-0292');
  const afterTakeover=await sessions.openWorld({userId,worldId:'world-0292'});
  check('Committed club takeover reloads as the same human club',
    takeoverSaved.revision===created.revision+1&&afterTakeover.membership.clubId==='club-a'&&
    afterTakeover.worldRecord.memberships.byTrainerId['trainer-1'].clubId==='club-a');

  const afterMatchdayRecord=JSON.parse(JSON.stringify(afterTakeover.worldRecord));
  afterMatchdayRecord.gameState.calendar.currentSlotKey='w2-end';
  afterMatchdayRecord.gameState.history.matches.push({id:'m1-compact',season:1,slotKey:'w2-end',homeClubId:'club-a',awayClubId:'club-b',status:'played'});
  const matchdaySaved=await sessions.saveWorld({
    userId,worldId:'world-0292',worldRecord:afterMatchdayRecord,expectedRevision:afterTakeover.revision,
    matches:[{id:'matchday-1',season:1,slotKey:'w2-end',homeClubId:'club-a',awayClubId:'club-b',events:[{type:'goal'}]}],
    financeEvents:[{id:'finance-matchday-1',clubId:'club-a',seasonId:1,type:'salaryExpense',amount:-5}]
  });
  await runtime.unloadWorld('world-0292');
  const reloaded=await sessions.openWorld({userId,worldId:'world-0292'});
  check('Played matchday reload preserves club, exact slot, match and finance truth',
    matchdaySaved.revision===takeoverSaved.revision+1&&reloaded.membership.clubId==='club-a'&&
    reloaded.worldRecord.gameState.calendar.currentSlotKey==='w2-end'&&
    reloaded.matches.length===1&&reloaded.matches[0].id==='matchday-1'&&
    reloaded.financeEvents.length===1&&reloaded.financeEvents[0].id==='finance-matchday-1');

  const app=await fs.readFile(path.join(__dirname,'..','src','app.bundle.js'),'utf8');
  const index=await fs.readFile(path.join(__dirname,'..','index.html'),'utf8');
  const server=await fs.readFile(path.join(__dirname,'..','server','index.js'),'utf8');

  check('Club takeover is a confirmed small server command before office entry',
    app.includes('kf029AssignClubRemote(selectedId).then(function(data)')&&
    app.includes("'/club'")&&
    app.includes("KF029Remote.message='Vereinsübernahme gespeichert.'"));

  check('Calendar advance keeps a hard checkpoint while ordinary navigation stays available',
    app.includes("kf029CommitHardCheckpoint('calendar-slot')")&&
    app.includes("kf029CommitHardCheckpoint('calendar-simulation-checkpoint')")&&
    app.includes('kf029ActionAdvancesWorld(action,actionEl)')&&
    !app.includes('kf029ScheduleAutosave'));

  check('World-list exit exposes retry/discard recovery instead of swallowing save errors',
    app.includes('function kf029ExitWorldToList(forceDiscard)')&&
    app.includes('data-action="kf-retry-checkpoint"')&&
    app.includes('data-action="kf-exit-world-discard"'));

  check('Remote contract diagnostic tracks the dedicated 0.29.5 progress API',
    app.includes('async function kf029EnsureBackendCompatible()')&&
    app.includes("var KF029_REMOTE_CONTRACT_VERSION = '0.29.5';")&&
    app.includes("mismatch.code='BACKEND_VERSION_MISMATCH'")&&
    server.includes("const API_VERSION = '0.29.5';")&&server.includes('function requireClientVersion(body)'));

  check('Production entry cache-busts the current browser bundle',
    index.includes('app.bundle.js?v=0.29.5')&&index.includes('app.css?v=0.29.5'));

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
