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
      calendar:{currentSlotKey:'w1-middle',fixtures:[
        {id:'fixture-1',slotKey:'w1-middle',status:'scheduled',homeClubId:'club-a',awayClubId:'club-b'},
        {id:'fixture-2',slotKey:'w2-end',status:'scheduled',homeClubId:'club-b',awayClubId:'club-a'}
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
  const userId='user-0295',worldId='world-0295';

  const created=await sessions.createWorld({
    userId,worldRecord:makeWorldRecord(worldId,userId),worldName:'Progress Welt',
    visibility:'PRIVATE',joinPolicy:'INVITE_ONLY'
  });

  const takeoverRequestId='club-request-1';
  const takeover=await sessions.assignClub({
    userId,worldId,clubId:'club-a',expectedRevision:created.revision,requestId:takeoverRequestId
  });
  check('Club takeover uses a small authoritative command and advances exactly one revision',
    takeover.revision===created.revision+1&&takeover.membership.clubId==='club-a',
    {createdRevision:created.revision,takeoverRevision:takeover.revision});

  const takeoverRetry=await sessions.assignClub({
    userId,worldId,clubId:'club-a',expectedRevision:created.revision,requestId:takeoverRequestId
  });
  check('Lost takeover response can be retried idempotently without a second revision',
    takeoverRetry.revision===takeover.revision&&takeoverRetry.deduplicated===true&&takeoverRetry.membership.clubId==='club-a',
    {revision:takeoverRetry.revision,deduplicated:takeoverRetry.deduplicated});

  const opened=await sessions.openWorld({userId,worldId});
  const first=JSON.parse(JSON.stringify(opened.worldRecord));
  first.gameState.calendar.currentSlotKey='w1-middle';
  first.gameState.calendar.fixtures[0].status='played';
  first.gameState.history.matches.push({id:'m1-summary',season:1,slotKey:'w1-middle',status:'played'});
  const match1={id:'m1-full',season:1,slotKey:'w1-middle',homeClubId:'club-a',awayClubId:'club-b',events:[{type:'goal'}]};
  const finance1={id:'f1',clubId:'club-a',seasonId:1,slotKey:'w1-middle',type:'salaryExpense',amount:-5};
  const progressRequest1='progress-request-1';

  const saved1=await sessions.saveProgress({
    userId,worldId,worldRecord:first,expectedRevision:opened.revision,requestId:progressRequest1,
    matchesDelta:[match1],financeEventsDelta:[finance1]
  });
  const manifest1=await worlds.getManifest(worldId);
  check('First progress checkpoint appends only one new match and finance segment',
    saved1.revision===opened.revision+1&&
    Object.keys(manifest1.matchSegments||{}).length===1&&
    Object.keys(manifest1.financeSegments||{}).length===1,
    {revision:saved1.revision,matchSegments:Object.keys(manifest1.matchSegments||{}),financeSegments:Object.keys(manifest1.financeSegments||{})});

  const retry1=await sessions.saveProgress({
    userId,worldId,worldRecord:first,expectedRevision:opened.revision,requestId:progressRequest1,
    matchesDelta:[match1],financeEventsDelta:[finance1]
  });
  const manifestAfterRetry=await worlds.getManifest(worldId);
  check('Retry of the same progress request returns the committed revision without duplicate detail segments',
    retry1.revision===saved1.revision&&retry1.deduplicated===true&&
    Object.keys(manifestAfterRetry.matchSegments||{}).length===1&&
    Object.keys(manifestAfterRetry.financeSegments||{}).length===1,
    {revision:retry1.revision,deduplicated:retry1.deduplicated});

  const current=await sessions.openWorld({userId,worldId});
  const second=JSON.parse(JSON.stringify(current.worldRecord));
  second.gameState.calendar.currentSlotKey='w2-end';
  second.gameState.calendar.fixtures[1].status='played';
  second.gameState.history.matches.push({id:'m2-summary',season:1,slotKey:'w2-end',status:'played'});
  const match2={id:'m2-full',season:1,slotKey:'w2-end',homeClubId:'club-b',awayClubId:'club-a',events:[{type:'save'}]};
  const finance2={id:'f2',clubId:'club-a',seasonId:1,slotKey:'w2-end',type:'matchIncome',amount:7};

  const saved2=await sessions.saveProgress({
    userId,worldId,worldRecord:second,expectedRevision:current.revision,requestId:'progress-request-2',
    matchesDelta:[match2],financeEventsDelta:[finance2]
  });
  const manifest2=await worlds.getManifest(worldId);
  const reloaded=await sessions.openWorld({userId,worldId});
  check('Second checkpoint sends only its new details while reload reconstructs the complete current season',
    saved2.revision===saved1.revision+1&&
    Object.keys(manifest2.matchSegments||{}).length===2&&
    Object.keys(manifest2.financeSegments||{}).length===2&&
    reloaded.matches.map(m=>m.id).sort().join(',')==='m1-full,m2-full'&&
    reloaded.financeEvents.map(e=>e.id).sort().join(',')==='f1,f2'&&
    reloaded.worldRecord.gameState.calendar.currentSlotKey==='w2-end',
    {revision:saved2.revision,matches:reloaded.matches.map(m=>m.id),finance:reloaded.financeEvents.map(e=>e.id)});

  const app=await fs.readFile(path.join(__dirname,'..','src','app.bundle.js'),'utf8');
  const runtimeSource=await fs.readFile(path.join(__dirname,'..','server','services','world-runtime-manager.js'),'utf8');
  const sessionsSource=await fs.readFile(path.join(__dirname,'..','server','services','world-session-service.js'),'utf8');
  const persistenceSource=await fs.readFile(path.join(__dirname,'..','server','persistence','world-persistence-service.js'),'utf8');
  const gcsSource=await fs.readFile(path.join(__dirname,'..','server','persistence','google-cloud-object-store.js'),'utf8');

  check('Browser no longer saves after ordinary management decisions',
    !app.includes('KF029_AUTOSAVE_ACTIONS')&&!app.includes('kf029ScheduleAutosave')&&!app.includes('KF029_AUTOSAVE_DEBOUNCE_MS'));

  check('Browser progress payload contains only uncommitted current-season detail deltas',
    app.includes('matchesDelta:delta.matchesDelta')&&
    app.includes('financeEventsDelta:delta.financeEventsDelta')&&
    app.includes('committedMatchIds')&&app.includes('committedFinanceKeys'));

  check('Retry reuses the exact prepared request and request id',
    app.includes('if(KF029Remote.checkpointPreparedRequest)return KF029Remote.checkpointPreparedRequest')&&
    app.includes('encodedBody:prepared.encodedBody')&&
    app.includes('lastCommitRequestId'));

  check('Save failures block only further world progression, not matchday navigation',
    app.includes('kf029ActionAdvancesWorld(action,actionEl)')&&
    app.includes("if (action === 'matchday-next')")&&
    app.includes("action==='office-advance'||action==='calendar-sim-until-confirm'"));

  check('Server snapshot path no longer deep-clones the whole world before saving',
    sessionsSource.includes('return this.runtime.saveSnapshot')&&!sessionsSource.includes('const canonical = await this.runtime.openWorld')&&
    runtimeSource.includes('const next = incoming;'));

  check('Hot WorldRecord persistence favors speed and avoids unused GCS metadata reads',
    persistenceSource.includes("encodeJsonGzip(worldRecord, { level: 1 })")&&
    gcsSource.includes('if (!readGeneration) return { generation: null };'));

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
