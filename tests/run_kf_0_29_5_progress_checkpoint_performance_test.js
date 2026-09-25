'use strict';

const fs=require('fs/promises');
const path=require('path');
const os=require('os');
const { LocalObjectStore }=require('../server/persistence/local-object-store');
const { FileMetadataRepository }=require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService }=require('../server/persistence/world-persistence-service');
const { WorldRuntimeManager }=require('../server/services/world-runtime-manager');
const { WorldSessionService }=require('../server/services/world-session-service');

const report={version:'0.29.5',passed:true,checks:[]};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}

function makeWorldRecord(worldId,userId){
  return {
    id:worldId,
    schemaVersion:'kf-world-record-0.27.2',
    gameVersion:'0.29.5',
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
      calendar:{currentSlotKey:'w0',fixtures:[
        {id:'f1',slotKey:'w1',status:'scheduled',homeClubId:'club-a',awayClubId:'club-b'},
        {id:'f2',slotKey:'w2',status:'scheduled',homeClubId:'club-b',awayClubId:'club-a'}
      ],slots:[]},
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},
      clubFinances:{byClub:{}}
    }
  };
}

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf0295-'));
  const metadata=new FileMetadataRepository({filePath:path.join(root,'metadata.json')});
  const worlds=new WorldPersistenceService({objectStore:new LocalObjectStore({rootDir:path.join(root,'objects')})});
  const runtime=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:60000});
  const sessions=new WorldSessionService({metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtime});
  const userId='user-0295', worldId='world-0295';

  const created=await sessions.createWorld({
    userId,worldRecord:makeWorldRecord(worldId,userId),worldName:'Progress Checkpoint',
    visibility:'PRIVATE',joinPolicy:'INVITE_ONLY'
  });

  const takeover=await sessions.assignClub({userId,worldId,clubId:'club-a',expectedRevision:created.revision});
  check('Club takeover uses a dedicated revision commit',
    takeover.revision===created.revision+1&&takeover.membership.clubId==='club-a',
    {createdRevision:created.revision,takeoverRevision:takeover.revision});

  const afterTakeover=await sessions.openWorld({userId,worldId});
  const slot1=JSON.parse(JSON.stringify(afterTakeover.worldRecord));
  slot1.gameState.calendar.currentSlotKey='w1';
  slot1.gameState.calendar.fixtures[0].status='played';
  slot1.gameState.history.matches.push({id:'m1-compact',season:1,slotKey:'w1',status:'played'});
  const m1={id:'m1',season:1,slotKey:'w1',homeClubId:'club-a',awayClubId:'club-b',events:[{type:'goal'}]};
  const e1={id:'e1',clubId:'club-a',seasonId:1,slotKey:'w1',type:'salaryExpense',amount:-5};
  const saved1=await sessions.saveSlot({
    userId,worldId,worldRecord:slot1,expectedRevision:takeover.revision,season:1,slotKey:'w1',matches:[m1],financeEvents:[e1]
  });

  const after1=await sessions.openWorld({userId,worldId});
  check('First slot commit persists only its detail segment and current world state',
    saved1.revision===takeover.revision+1&&
    after1.worldRecord.gameState.calendar.currentSlotKey==='w1'&&
    after1.matches.length===1&&after1.matches[0].id==='m1'&&
    after1.financeEvents.length===1&&after1.financeEvents[0].id==='e1');

  const slot2=JSON.parse(JSON.stringify(after1.worldRecord));
  slot2.gameState.calendar.currentSlotKey='w2';
  slot2.gameState.calendar.fixtures[1].status='played';
  slot2.gameState.history.matches.push({id:'m2-compact',season:1,slotKey:'w2',status:'played'});
  const m2={id:'m2',season:1,slotKey:'w2',homeClubId:'club-b',awayClubId:'club-a',events:[{type:'save'}]};
  const e2={id:'e2',clubId:'club-a',seasonId:1,slotKey:'w2',type:'salaryExpense',amount:-6};
  const saved2=await sessions.saveSlot({
    userId,worldId,worldRecord:slot2,expectedRevision:saved1.revision,season:1,slotKey:'w2',matches:[m2],financeEvents:[e2]
  });

  await runtime.unloadWorld(worldId);
  const reloaded=await sessions.openWorld({userId,worldId});
  check('Second slot sends only new details while reload reconstructs both committed slots',
    saved2.revision===saved1.revision+1&&
    reloaded.worldRecord.gameState.calendar.currentSlotKey==='w2'&&
    reloaded.matches.map(x=>x.id).sort().join(',')==='m1,m2'&&
    reloaded.financeEvents.map(x=>x.id).sort().join(',')==='e1,e2');

  const app=await fs.readFile(path.join(__dirname,'..','src','app.bundle.js'),'utf8');
  const server=await fs.readFile(path.join(__dirname,'..','server','index.js'),'utf8');

  check('Browser uses dedicated club and slot endpoints',
    app.includes("'/club'")&&app.includes("'/slot'")&&
    server.includes("worldIdFromPath(pathname, '/club')")&&server.includes("worldIdFromPath(pathname, '/slot')"));

  check('Decision autosaves are no longer wired into normal management actions',
    !app.includes("if (KF029Remote.user && AppState.worldRecord && KF029_AUTOSAVE_ACTIONS[action])")&&
    !app.includes("kf029ScheduleAutosave('form-change', false)")&&
    !app.includes("kf029ScheduleAutosave('lineup-drop', false)"));

  check('Matchday navigation is not globally blocked by save state',
    app.includes("var progressAction = action === 'office-advance' || action === 'calendar-sim-until-confirm'")&&
    !app.includes("(KF029Remote.checkpointPending || KF029Remote.checkpointFailed) && action !== 'kf-retry-checkpoint'"));

  check('Progress detail payload is delta-based and save requests have a timeout',
    app.includes('function kf029PendingMatches()')&&
    app.includes('function kf029PendingFinanceEvents()')&&
    app.includes("options.timeoutMs || 90000")&&
    app.includes('kf029RecoverCommittedProgress'));

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
