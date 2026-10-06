'use strict';

const fs=require('fs/promises');
const os=require('os');
const path=require('path');
const { LocalObjectStore }=require('../server/persistence/local-object-store');
const { FileMetadataRepository }=require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService }=require('../server/persistence/world-persistence-service');
const { WorldRuntimeManager }=require('../server/services/world-runtime-manager');
const { WorldSessionService }=require('../server/services/world-session-service');

const report={version:'0.31.3',passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
function delta(worldId,ops){return{schemaVersion:'kf-world-delta-0.31.0',worldId,ops};}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

function makeWorldRecord(worldId,userId,playerCount=5000,gameVersion='0.31.2'){
  const players={byId:{},order:[]};
  const clubs={
    'club-a':{id:'club-a',name:'Club A'},
    'club-b':{id:'club-b',name:'Club B'}
  };
  for(let i=0;i<playerCount;i++){
    const id='p'+i;
    const clubId=i<Math.ceil(playerCount/2)?'club-a':'club-b';
    players.order.push(id);
    players.byId[id]={
      id,clubId,firstName:'Spieler',lastName:String(i),age:18+(i%20),position:['GK','CB','CM','ST'][i%4],
      strength:35+(i%61),potential:40+(i%61),fitness:6+(i%5),form:5+(i%6),morale:5+(i%6),
      contract:{salaryBase:1+(i%9)*.25,validUntilSeason:2+(i%5),bonusGoal:.1,bonusAppearance:.05},
      stats:{appearances:i%30,goals:i%17,assists:i%13,yellowCards:i%6,redCards:i%2},
      scouting:{known:true,note:'repräsentativer Persistenzdatensatz '+String(i).padStart(5,'0')+' '+('x'.repeat(96))}
    };
  }
  const split=Math.ceil(playerCount/2);
  return{
    id:worldId,schemaVersion:'kf-world-record-0.27.2',gameVersion,
    createdAt:new Date().toISOString(),createdByUserId:userId,
    creationRules:{startVariant:'classic',leagueConfiguration:'default',clubSelection:'manual'},
    runtimeSettings:{roundTimeModel:'COUNTDOWN',roundDurationSeconds:600,timezone:'Europe/Berlin'},
    progression:{status:'waiting',deadlineAt:null,readyTrainerIds:[],lastHumanActivityAt:new Date().toISOString()},
    memberships:{byTrainerId:{'trainer-1':{
      trainerId:'trainer-1',userProfileId:userId,clubId:'club-a',status:'active',
      joinedAt:new Date().toISOString(),lastActivityAt:new Date().toISOString(),
      trainerDisplayName:'Tester',role:'WORLD_ADMIN'
    }},order:['trainer-1']},
    gameState:{
      meta:{id:worldId,seasonNumber:1,schemaVersion:'kf-core-0.27.2'},
      clubs:{byId:clubs,order:['club-a','club-b']},
      players,
      squads:{
        'club-a':{playerIds:players.order.slice(0,split),lineup:players.order.slice(0,11),bench:[],reserve:[],tactics:{pressing:'balanced',managementSequence:0},lineupMaskState:{formationKey:'4-4-2',playerPlacementById:{}}},
        'club-b':{playerIds:players.order.slice(split),lineup:players.order.slice(split,split+11),bench:[],reserve:[],tactics:{pressing:'balanced'},lineupMaskState:{formationKey:'4-4-2',playerPlacementById:{}}}
      },
      calendar:{currentSlotKey:'w0',fixtures:[],slots:[]},
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},
      clubFinances:{byClub:{}}
    }
  };
}

class DelayedStore{
  constructor(base,{delayMs=12}={}){this.base=base;this.delayMs=delayMs;this.active=0;this.maxActive=0;this.bodyReads=0;this.bodyBytes=0;}
  reset(){this.active=0;this.maxActive=0;this.bodyReads=0;this.bodyBytes=0;}
  async read(key){return this.base.read(key);}
  async readBody(key){
    this.active+=1;this.maxActive=Math.max(this.maxActive,this.active);this.bodyReads+=1;
    try{await sleep(this.delayMs);const body=await this.base.readBody(key);this.bodyBytes+=body.length;return body;}
    finally{this.active-=1;}
  }
  async exists(key){return this.base.exists(key);}
  async write(key,body,options){return this.base.write(key,body,options);}
  async delete(key){return this.base.delete(key);}
  async deletePrefix(prefix){return this.base.deletePrefix(prefix);}
}

class FailingManifestStore{
  constructor(base){this.base=base;this.failManifestKey=null;this.armed=false;}
  async read(key){return this.base.read(key);} async readBody(key){return this.base.readBody(key);}
  async exists(key){return this.base.exists(key);} async delete(key){return this.base.delete(key);}
  async deletePrefix(prefix){return this.base.deletePrefix(prefix);}
  async write(key,body,options){
    if(this.armed&&key===this.failManifestKey&&options&&options.ifGenerationMatch!==undefined){
      this.armed=false;throw new Error('injected_compaction_manifest_failure');
    }
    return this.base.write(key,body,options);
  }
}

class RacingManifestStore{
  constructor(base){this.base=base;this.target=null;this.beforeManifestWrite=null;this.armed=false;}
  async read(key){return this.base.read(key);} async readBody(key){return this.base.readBody(key);}
  async exists(key){return this.base.exists(key);} async delete(key){return this.base.delete(key);}
  async deletePrefix(prefix){return this.base.deletePrefix(prefix);}
  async write(key,body,options){
    if(this.armed&&key===this.target&&options&&options.ifGenerationMatch!==undefined){
      this.armed=false;
      if(this.beforeManifestWrite) await this.beforeManifestWrite();
    }
    return this.base.write(key,body,options);
  }
}

async function appendDeltas(worlds,worldId,startRevision,count,startValue=1){
  let revision=Number(startRevision);
  for(let i=0;i<count;i++){
    const value=startValue+i;
    const saved=await worlds.commitWorldDelta({
      worldId,
      expectedRevision:revision,
      worldDelta:delta(worldId,[{path:['gameState','squads','club-a','tactics','managementSequence'],value}])
    });
    revision=Number(saved.revision);
  }
  return revision;
}

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf0313-'));
  const objectRoot=path.join(root,'objects');
  const baseStore=new LocalObjectStore({rootDir:objectRoot});
  const delayedStore=new DelayedStore(baseStore,{delayMs:12});
  const metadata=new FileMetadataRepository({filePath:path.join(root,'metadata.json')});
  const highWorlds=new WorldPersistenceService({objectStore:delayedStore,readConcurrency:8,deltaCompactionThreshold:100000});
  const highRuntime=new WorldRuntimeManager({worldPersistence:highWorlds,metadataRepository:metadata,idleMs:60000});
  const highSessions=new WorldSessionService({metadataRepository:metadata,worldPersistence:highWorlds,runtimeManager:highRuntime});

  try{
    const userId='u1';
    const worldId='world-large-legacy';
    const record=makeWorldRecord(worldId,userId,5000,'0.31.2');
    const fullBytes=Buffer.byteLength(JSON.stringify(record));
    check('Representative WorldRecord is materially larger than the old 68 kB regression fixture',fullBytes>1500000,{fullBytes});

    const created=await highSessions.createWorld({userId,worldRecord:record,worldName:'Legacy Large',visibility:'PRIVATE',joinPolicy:'INVITE_ONLY'});
    let revision=await appendDeltas(highWorlds,worldId,created.revision,96,1);
    const longManifest=await highWorlds.getManifest(worldId);
    const deltaSizes=await Promise.all(longManifest.worldDeltaPaths.map(async p=>(await baseStore.readBody(p)).length));
    const totalDeltaBytes=deltaSizes.reduce((a,b)=>a+b,0);
    check('Legacy manifest contains a long un-compacted delta chain',longManifest.worldDeltaPaths.length===96,{deltaCount:longManifest.worldDeltaPaths.length});

    delayedStore.reset();
    const coldStart=Date.now();
    const coldRecord=await highWorlds.loadWorldRecord(worldId);
    const coldLoadMs=Date.now()-coldStart;
    check('Cold load reconstructs the final authoritative value',coldRecord.gameState.squads['club-a'].tactics.managementSequence===96,{value:coldRecord.gameState.squads['club-a'].tactics.managementSequence});
    check('Cold load applies world deltas serially to bound reconstruction memory',
      delayedStore.maxActive===1&&delayedStore.bodyReads===97,
      {maxConcurrentReads:delayedStore.maxActive,bodyReads:delayedStore.bodyReads});
    check('Serial cold load stays within bounded artificial-latency overhead',
      coldLoadMs<(96*12)+1000,
      {coldLoadMs,serialLatencyFloorMs:96*12,allowedOverheadMs:1000});

    const beforeCompactionJson=JSON.stringify(coldRecord);
    const beforeCompactionRevision=Number(longManifest.revision);
    const compactor=new WorldPersistenceService({objectStore:delayedStore,readConcurrency:8,deltaCompactionThreshold:32});
    delayedStore.reset();
    const compactStart=Date.now();
    const compacted=await compactor.compactWorld({worldId,expectedRevision:beforeCompactionRevision});
    const compactionMs=Date.now()-compactStart;
    const compactManifest=await compactor.getManifest(worldId);
    const afterCompact=await compactor.loadWorldRecord(worldId);
    check('Compaction switches to a new base and clears worldDeltaPaths',compacted.compacted&&compactManifest.worldDeltaPaths.length===0&&compactManifest.worldRecordPath!==longManifest.worldRecordPath,{before:longManifest.worldRecordPath,after:compactManifest.worldRecordPath});
    check('Compaction does not consume a world revision',Number(compactManifest.revision)===beforeCompactionRevision,{before:beforeCompactionRevision,after:compactManifest.revision});
    check('Compaction preserves the exact authoritative WorldRecord',JSON.stringify(afterCompact)===beforeCompactionJson,{});
    check('Old base and delta objects are removed only after successful manifest switch',
      !(await baseStore.exists(longManifest.worldRecordPath))&&
      (await Promise.all(longManifest.worldDeltaPaths.map(p=>baseStore.exists(p)))).every(v=>!v),{});

    // Existing 0.31.2 structure remains loadable without migration, then cold-runtime management save.
    revision=await appendDeltas(highWorlds,worldId,compactManifest.revision,40,1000);
    await highRuntime.unloadWorld(worldId);
    const saveWorlds=new WorldPersistenceService({objectStore:delayedStore,readConcurrency:8,deltaCompactionThreshold:16});
    const saveRuntime=new WorldRuntimeManager({worldPersistence:saveWorlds,metadataRepository:metadata,idleMs:60000});
    const saveSessions=new WorldSessionService({metadataRepository:metadata,worldPersistence:saveWorlds,runtimeManager:saveRuntime});
    const coldMgmtBefore=await saveWorlds.getManifest(worldId);
    delayedStore.reset();
    const mgmtStart=Date.now();
    const mgmtSaved=await saveSessions.saveManagementDelta({
      userId,worldId,expectedRevision:coldMgmtBefore.revision,
      worldDelta:delta(worldId,[{path:['gameState','squads','club-a','tactics','pressing'],value:'high'}])
    });
    const coldManagementSaveMs=Date.now()-mgmtStart;
    const afterMgmtManifest=await saveWorlds.getManifest(worldId);
    await saveRuntime.unloadWorld(worldId);
    const mgmtReload=await saveSessions.openWorld({userId,worldId});
    check('Cold runtime -> management save reconstructs, compacts, saves and advances exactly one revision',
      Number(mgmtSaved.revision)===Number(coldMgmtBefore.revision)+1&&
      mgmtReload.worldRecord.gameState.squads['club-a'].tactics.pressing==='high'&&
      mgmtReload.worldRecord.gameState.squads['club-a'].tactics.managementSequence===1039,
      {before:coldMgmtBefore.revision,after:mgmtSaved.revision,deltaCountAfter:afterMgmtManifest.worldDeltaPaths.length});
    check('Cold management save leaves a short post-compaction chain',afterMgmtManifest.worldDeltaPaths.length<=1,{deltaCount:afterMgmtManifest.worldDeltaPaths.length});

    // Rebuild a longer chain outside RAM, then reproduce the slot-save path.
    await saveRuntime.unloadWorld(worldId);
    revision=Number((await highWorlds.getManifest(worldId)).revision);
    revision=await appendDeltas(highWorlds,worldId,revision,36,2000);
    const coldSlotBefore=await saveWorlds.getManifest(worldId);
    const nextHistoryIndex=(mgmtReload.worldRecord.gameState.history.matches||[]).length;
    const slotDelta=delta(worldId,[
      {path:['gameState','calendar','currentSlotKey'],value:'w9-end'},
      {path:['gameState','history','matches',String(nextHistoryIndex)],value:{id:'m-slot-cold',season:1,slotKey:'w9-end',homeClubId:'club-a',awayClubId:'club-b',homeGoals:2,awayGoals:1,status:'played'}}
    ]);
    delayedStore.reset();
    const slotStart=Date.now();
    const slotSaved=await saveSessions.saveSlot({
      userId,worldId,expectedRevision:coldSlotBefore.revision,worldDelta:slotDelta,season:1,slotKey:'w9-end',
      matches:[{id:'m-slot-cold',season:1,slotKey:'w9-end',homeClubId:'club-a',awayClubId:'club-b',homeGoals:2,awayGoals:1,events:[],playerStats:[]}],
      financeEvents:[]
    });
    const coldSlotSaveMs=Date.now()-slotStart;
    await saveRuntime.unloadWorld(worldId);
    const slotReload=await saveSessions.openWorld({userId,worldId});
    check('Cold runtime -> slot save reproduces the matchday-9 style path without save failure',
      Number(slotSaved.revision)===Number(coldSlotBefore.revision)+1&&
      slotReload.worldRecord.gameState.calendar.currentSlotKey==='w9-end'&&
      (slotReload.worldRecord.gameState.history.matches||[]).some(row=>row&&row.id==='m-slot-cold'),
      {before:coldSlotBefore.revision,after:slotSaved.revision});

    // Failed compaction must leave the old manifest and objects authoritative.
    const failureWorld='world-compaction-failure';
    const failureRecord=makeWorldRecord(failureWorld,userId,250,'0.31.2');
    const failureCreated=await highSessions.createWorld({userId,worldRecord:failureRecord,worldName:'Failure',visibility:'PRIVATE',joinPolicy:'INVITE_ONLY'});
    const failureRevision=await appendDeltas(highWorlds,failureWorld,failureCreated.revision,8,1);
    const failureBefore=await highWorlds.getManifest(failureWorld);
    const failureBeforeRecord=JSON.stringify(await highWorlds.loadWorldRecord(failureWorld));
    const failingStore=new FailingManifestStore(baseStore);
    const failingWorlds=new WorldPersistenceService({objectStore:failingStore,readConcurrency:4,deltaCompactionThreshold:4});
    failingStore.failManifestKey=failingWorlds.manifestKey(failureWorld);failingStore.armed=true;
    let injectedError=null;
    try{await failingWorlds.compactWorld({worldId:failureWorld,expectedRevision:failureRevision});}catch(error){injectedError=error;}
    const failureAfter=await highWorlds.getManifest(failureWorld);
    const failureAfterRecord=JSON.stringify(await highWorlds.loadWorldRecord(failureWorld));
    check('Failed compaction leaves the previous manifest and authoritative world intact',
      !!injectedError&&JSON.stringify(failureAfter)===JSON.stringify(failureBefore)&&failureAfterRecord===failureBeforeRecord,
      {error:injectedError&&injectedError.message});
    check('Failed compaction does not delete the still-referenced base/deltas',
      (await baseStore.exists(failureBefore.worldRecordPath))&&
      (await Promise.all(failureBefore.worldDeltaPaths.map(p=>baseStore.exists(p)))).every(Boolean),{});

    // Simulate another process committing between compaction read and manifest CAS.
    const raceWorld='world-compaction-race';
    const raceRecord=makeWorldRecord(raceWorld,userId,250,'0.31.2');
    const raceCreated=await highSessions.createWorld({userId,worldRecord:raceRecord,worldName:'Race',visibility:'PRIVATE',joinPolicy:'INVITE_ONLY'});
    const raceRevision=await appendDeltas(highWorlds,raceWorld,raceCreated.revision,6,1);
    const raceBefore=await highWorlds.getManifest(raceWorld);
    const racingStore=new RacingManifestStore(baseStore);
    const racingWorlds=new WorldPersistenceService({objectStore:racingStore,readConcurrency:4,deltaCompactionThreshold:4});
    const competingWorlds=new WorldPersistenceService({objectStore:baseStore,readConcurrency:4,deltaCompactionThreshold:100000});
    racingStore.target=racingWorlds.manifestKey(raceWorld);
    racingStore.beforeManifestWrite=async()=>{
      await competingWorlds.commitWorldDelta({
        worldId:raceWorld,expectedRevision:raceRevision,
        worldDelta:delta(raceWorld,[{path:['gameState','squads','club-a','tactics','raceWinner'],value:'competing-save'}])
      });
    };
    racingStore.armed=true;
    let raceError=null;
    try{await racingWorlds.compactWorld({worldId:raceWorld,expectedRevision:raceRevision});}catch(error){raceError=error;}
    const raceAfter=await competingWorlds.getManifest(raceWorld);
    const raceAfterRecord=await competingWorlds.loadWorldRecord(raceWorld);
    check('Concurrent save wins via manifest CAS; stale compaction cannot last-write-win',
      raceError&&raceError.code==='PERSISTENCE_CONFLICT'&&
      Number(raceAfter.revision)===Number(raceBefore.revision)+1&&
      raceAfterRecord.gameState.squads['club-a'].tactics.raceWinner==='competing-save',
      {error:raceError&&raceError.code,before:raceBefore.revision,after:raceAfter.revision});
    check('Stale compaction does not delete objects still required by the winning manifest',
      (await baseStore.exists(raceAfter.worldRecordPath))&&
      (await Promise.all(raceAfter.worldDeltaPaths.map(p=>baseStore.exists(p)))).every(Boolean),{deltaCount:raceAfter.worldDeltaPaths.length});

    // 12-slot progression with a deliberately low threshold proves repeated automatic maintenance.
    const progWorld='world-12-matchdays';
    const progRecord=makeWorldRecord(progWorld,userId,300,'0.31.3');
    const progWorlds=new WorldPersistenceService({objectStore:baseStore,readConcurrency:4,deltaCompactionThreshold:4});
    const progRuntime=new WorldRuntimeManager({worldPersistence:progWorlds,metadataRepository:metadata,idleMs:60000});
    const progSessions=new WorldSessionService({metadataRepository:metadata,worldPersistence:progWorlds,runtimeManager:progRuntime});
    const progCreated=await progSessions.createWorld({userId,worldRecord:progRecord,worldName:'12 Matchdays',visibility:'PRIVATE',joinPolicy:'INVITE_ONLY'});
    let progRevision=Number(progCreated.revision);
    for(let day=1;day<=12;day++){
      const d=delta(progWorld,[
        {path:['gameState','calendar','currentSlotKey'],value:'md'+day},
        {path:['gameState','history','matches',String(day-1)],value:{id:'pm'+day,season:1,slotKey:'md'+day,homeClubId:'club-a',awayClubId:'club-b',homeGoals:day%4,awayGoals:(day+1)%3,status:'played'}}
      ]);
      const saved=await progSessions.saveSlot({
        userId,worldId:progWorld,expectedRevision:progRevision,worldDelta:d,season:1,slotKey:'md'+day,
        matches:[{id:'pm'+day,season:1,slotKey:'md'+day,homeClubId:'club-a',awayClubId:'club-b',homeGoals:day%4,awayGoals:(day+1)%3,events:[],playerStats:[]}],
        financeEvents:[]
      });
      progRevision=Number(saved.revision);
      if(day%3===0) await progRuntime.unloadWorld(progWorld);
    }
    await progRuntime.unloadWorld(progWorld);
    const progReload=await progSessions.openWorld({userId,worldId:progWorld});
    const progManifest=await progWorlds.getManifest(progWorld);
    check('12+ matchday progression remains authoritative across repeated cold runtimes/compactions',
      progReload.worldRecord.gameState.calendar.currentSlotKey==='md12'&&
      (progReload.worldRecord.gameState.history.matches||[]).length===12&&
      Number(progReload.revision)===progRevision&&
      progManifest.worldDeltaPaths.length<4,
      {revision:progReload.revision,deltaCount:progManifest.worldDeltaPaths.length,historyCount:(progReload.worldRecord.gameState.history.matches||[]).length});

    const app=await fs.readFile(path.resolve(__dirname,'..','src','app.bundle.js'),'utf8');
    const css=await fs.readFile(path.resolve(__dirname,'..','src','styles','app.css'),'utf8');
    let parseError=null;try{new Function(app);}catch(error){parseError=error;}
    check('Production browser bundle parses with KF_0.31.3 save phases',!parseError,{error:parseError&&parseError.message});
    check('Weiter button exposes real phase states instead of a time-based percentage',
      app.includes("'waiting'")&&app.includes("'saving'")&&app.includes("'confirming'")&&app.includes("'confirmed'")&&
      app.includes('Änderung erkannt · wartet')&&app.includes('Server bestätigt …')&&app.includes('Gespeichert')&&
      !app.includes('savePercent')&&!app.includes('savePercentage'),{});
    check('In-button phase fill and retry failure state coexist',
      css.includes('.office-advance-btn.save-phase-waiting::before{width:24%}')&&
      css.includes('.office-advance-btn.save-phase-saving::before{width:58%}')&&
      css.includes('.office-advance-btn.save-phase-confirming::before{width:82%}')&&
      css.includes('.office-advance-btn.save-phase-confirmed::before{width:100%;')&&
      app.includes("data-action=\"kf-retry-management-save\""),{});

    report.metrics={
      representativeWorldRecordBytes:fullBytes,
      initialDeltaCount:96,
      initialDeltaCompressedBytes:totalDeltaBytes,
      artificialReadLatencyMs:12,
      maxConcurrentObjectReads:delayedStore.maxActive,
      coldLoadMs,
      compactionMs,
      coldManagementSaveMs,
      coldSlotSaveMs
    };
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
