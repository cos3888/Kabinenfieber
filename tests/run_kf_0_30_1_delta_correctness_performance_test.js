'use strict';

const fs=require('fs/promises');
const path=require('path');
const os=require('os');
const vm=require('vm');
const { LocalObjectStore }=require('../server/persistence/local-object-store');
const { FileMetadataRepository }=require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService }=require('../server/persistence/world-persistence-service');
const { WorldRuntimeManager }=require('../server/services/world-runtime-manager');
const { WorldSessionService }=require('../server/services/world-session-service');

const report={version:'0.30.1',passed:true,checks:[]};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}

function makeWorldRecord(worldId,userId){
  return {
    id:worldId,
    schemaVersion:'kf-world-record-0.27.2',
    gameVersion:'0.30.1',
    createdAt:new Date().toISOString(),
    createdByUserId:userId,
    creationRules:{startVariant:'classic',leagueConfiguration:'default',clubSelection:'manual'},
    runtimeSettings:{roundTimeModel:'COUNTDOWN',roundDurationSeconds:600,timezone:'Europe/Berlin'},
    progression:{status:'waiting',deadlineAt:null,readyTrainerIds:[],lastHumanActivityAt:new Date().toISOString()},
    memberships:{byTrainerId:{'trainer-1':{
      trainerId:'trainer-1',userProfileId:userId,clubId:'club-a',status:'active',
      joinedAt:new Date().toISOString(),lastActivityAt:new Date().toISOString(),trainerDisplayName:'Tester'
    }},order:['trainer-1']},
    gameState:{
      meta:{id:worldId,seasonNumber:1,schemaVersion:'kf-core-0.27.2'},
      clubs:{byId:{
        'club-a':{id:'club-a',name:'Club A'},
        'club-b':{id:'club-b',name:'Club B'}
      },order:['club-a','club-b']},
      players:{byId:{},order:[]},
      squads:{},
      calendar:{currentSlotKey:'w0',fixtures:[],slots:[]},
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},
      clubFinances:{byClub:{}}
    }
  };
}

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf0301-'));
  const metadata=new FileMetadataRepository({filePath:path.join(root,'metadata.json')});
  const worlds=new WorldPersistenceService({objectStore:new LocalObjectStore({rootDir:path.join(root,'objects')})});
  const runtime=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:60000});
  const sessions=new WorldSessionService({metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtime});
  const userId='user-0301', worldId='world-0301';

  const created=await sessions.createWorld({
    userId,worldRecord:makeWorldRecord(worldId,userId),worldName:'Delta Correctness',
    visibility:'PRIVATE',joinPolicy:'INVITE_ONLY'
  });

  const base=(await sessions.openWorld({userId,worldId})).worldRecord;
  const slot1=JSON.parse(JSON.stringify(base));
  slot1.gameState.calendar.currentSlotKey='w1';
  const match1={id:'m1',season:1,slotKey:'w1',events:[{type:'goal'}]};
  const financeA1={id:'shared-id',clubId:'club-a',seasonId:1,slotKey:'season_total',type:'salaryExpense',amount:-5,slotsApplied:1};
  const financeB1={id:'shared-id',clubId:'club-b',seasonId:1,slotKey:'season_total',type:'salaryExpense',amount:-7,slotsApplied:1};

  const saved1=await sessions.saveSlot({
    userId,worldId,worldRecord:slot1,expectedRevision:created.revision,season:1,slotKey:'w1',
    matches:[match1],financeEvents:[financeA1,financeB1]
  });

  const warm1=await sessions.openWorld({userId,worldId});
  const warmShared=warm1.financeEvents.filter(row=>row.id==='shared-id');
  check('Warm runtime keeps same finance event id for different clubs',
    warmShared.length===2&&warmShared.some(row=>row.clubId==='club-a')&&warmShared.some(row=>row.clubId==='club-b'),
    {financeEvents:warmShared});

  const slot2=JSON.parse(JSON.stringify(warm1.worldRecord));
  slot2.gameState.calendar.currentSlotKey='w2';
  const financeA2={...financeA1,amount:-11,slotsApplied:2,lastSlotKey:'w2'};
  const saved2=await sessions.saveSlot({
    userId,worldId,worldRecord:slot2,expectedRevision:saved1.revision,season:1,slotKey:'w2',
    matches:[],financeEvents:[financeA2]
  });

  const warm2=await sessions.openWorld({userId,worldId});
  const warmA=warm2.financeEvents.filter(row=>row.id==='shared-id'&&row.clubId==='club-a');
  const warmB=warm2.financeEvents.filter(row=>row.id==='shared-id'&&row.clubId==='club-b');
  check('Warm runtime replaces updated same-club finance event instead of duplicating it',
    saved2.revision===saved1.revision+1&&warmA.length===1&&warmA[0].amount===-11&&warmA[0].slotsApplied===2&&warmB.length===1&&warmB[0].amount===-7,
    {warmA,warmB});

  await runtime.unloadWorld(worldId);
  const cold=await sessions.openWorld({userId,worldId});
  const coldA=cold.financeEvents.filter(row=>row.id==='shared-id'&&row.clubId==='club-a');
  const coldB=cold.financeEvents.filter(row=>row.id==='shared-id'&&row.clubId==='club-b');
  check('Cold runtime canonicalizes finance segments to the same latest state as warm runtime',
    coldA.length===1&&coldA[0].amount===-11&&coldA[0].slotsApplied===2&&coldB.length===1&&coldB[0].amount===-7,
    {coldA,coldB});

  check('Cold and warm finance state are identical by canonical identity',
    JSON.stringify(warm2.financeEvents.slice().sort((a,b)=>(a.clubId+a.id).localeCompare(b.clubId+b.id)))===
    JSON.stringify(cold.financeEvents.slice().sort((a,b)=>(a.clubId+a.id).localeCompare(b.clubId+b.id))));

  const app=await fs.readFile(path.join(__dirname,'..','src','app.bundle.js'),'utf8');
  const runtimeCode=await fs.readFile(path.join(__dirname,'..','server','services','world-runtime-manager.js'),'utf8');

  function extractFunction(source,name){
    const start=source.indexOf('function '+name+'(');
    if(start<0)throw new Error('Missing function '+name);
    const bodyStart=source.indexOf('{',start);
    let depth=0;
    for(let i=bodyStart;i<source.length;i++){
      if(source[i]==='{')depth+=1;
      else if(source[i]==='}'){
        depth-=1;
        if(depth===0)return source.slice(start,i+1);
      }
    }
    throw new Error('Unclosed function '+name);
  }

  const ids=Array.from({length:1300},(_,i)=>'match-'+String(i+1));
  let loadCount=0;
  const matchContext={
    AppState:{world:{meta:{seasonNumber:1}}},
    KF029Remote:{committedMatchIds:{}},
    CurrentSeasonMatchRepository:{
      listIds:()=>ids.slice(),
      load:(world,id,season)=>{loadCount+=1;return {id,season};}
    }
  };
  vm.createContext(matchContext);
  vm.runInContext(extractFunction(app,'kf029PendingMatches'),matchContext);
  ids.forEach(id=>{matchContext.KF029Remote.committedMatchIds[id]=1;});
  const none=matchContext.kf029PendingMatches();
  check('1300 committed matches require zero full-match loads',none.length===0&&loadCount===0,{pending:none.length,loadCount});

  loadCount=0;
  ids.slice(1084).forEach(id=>{delete matchContext.KF029Remote.committedMatchIds[id];});
  const pending216=matchContext.kf029PendingMatches();
  check('216 uncommitted matches require exactly 216 full-match loads',pending216.length===216&&loadCount===216,{pending:pending216.length,loadCount});

  check('Finance committed state uses season club id identity plus content signature',
    app.includes('function kf0301FinanceCommitKey(row)')&&
    app.includes('function kf0301FinanceCommitSignature(row)')&&
    app.includes("return [Number(row.seasonId || 1), String(row.clubId), String(row.id)].join('|');")&&
    app.includes('KF029Remote.committedFinanceIds[key] !== kf0301FinanceCommitSignature(row)'));

  check('Timeout recovery verifies exact finance state instead of event id only',
    app.includes("financeStates[key] = kf0301FinanceCommitSignature(row)")&&
    app.includes("financeStates[key] === kf0301FinanceCommitSignature(row)"));

  check('Server uses separate match and finance merge semantics',
    runtimeCode.includes('function mergeMatchesById(current, delta)')&&
    runtimeCode.includes('function mergeFinanceEvents(current, delta)')&&
    runtimeCode.includes('financeEventIdentity(row)')&&
    runtimeCode.includes('runtime.financeEvents = mergeFinanceEvents(runtime.financeEvents, financeEvents)'));

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
