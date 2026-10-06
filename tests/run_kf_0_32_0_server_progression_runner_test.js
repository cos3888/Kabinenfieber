'use strict';

const fs=require('fs/promises');
const path=require('path');
const os=require('os');
const { LocalObjectStore }=require('../server/persistence/local-object-store');
const { FileMetadataRepository }=require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService }=require('../server/persistence/world-persistence-service');
const { WorldRuntimeManager }=require('../server/services/world-runtime-manager');
const { WorldSessionService }=require('../server/services/world-session-service');
const { HeadlessProgressionEngine }=require('../server/services/headless-progression-engine');

const report={version:'0.32.0',passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}

function minimalWorld(worldId,userId,runtimeSettings){
  return {
    id:worldId,
    schemaVersion:'kf-world-record-0.27.2',
    gameVersion:'0.32.0',
    createdAt:new Date().toISOString(),
    createdByUserId:userId,
    creationRules:{startVariant:'classic',leagueConfiguration:'default',clubSelection:'manual'},
    runtimeSettings:runtimeSettings||{roundTimeModel:'COUNTDOWN',roundDurationSeconds:600,timezone:'Europe/Berlin'},
    memberships:{byTrainerId:{'trainer-a':{
      trainerId:'trainer-a',userProfileId:userId,clubId:null,status:'active',
      joinedAt:new Date().toISOString(),lastActivityAt:new Date().toISOString(),
      trainerDisplayName:'A',role:'WORLD_ADMIN'
    }},order:['trainer-a']},
    gameState:{
      meta:{id:worldId,seasonNumber:1,schemaVersion:'kf-core-0.27.2',createdAt:new Date().toISOString()},
      clubs:{byId:{'club-a':{id:'club-a',name:'Club A',leagueKey:'test'}},order:['club-a']},
      players:{byId:{},order:[]},
      squads:{'club-a':{playerIds:[],tactics:{}}},
      calendar:{
        currentSlotKey:'s0',
        slots:[
          {key:'s0',week:1,phase:'Anfang',label:'W1 Anfang',competition:null},
          {key:'s1',week:1,phase:'Mitte',label:'W1 Mitte',competition:null},
          {key:'s2',week:1,phase:'Ende',label:'W1 Ende',competition:null}
        ],
        fixtures:[],
        nationalCupDraws:{byKey:{},byId:{},order:[]},
        fieberCupDraws:{byKey:{},byId:{},order:[]}
      },
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},
      clubFinances:{byClub:{'club-a':{cash:0}}},
      clubMailboxes:{byClub:{}},
      transfers:{},
      scouting:{},
      negotiations:{}
    }
  };
}

(async()=>{
  // Smoke-test the real shared simulation source in the Node VM.
  let headlessResult=null,headlessError=null;
  try{
    const headless=new HeadlessProgressionEngine();
    headlessResult=headless.run({
      worldRecord:minimalWorld('world-headless-smoke','smoke-user'),
      matches:[],financeEvents:[],progressionRunId:'smoke-run-1'
    });
  }catch(error){headlessError=error;}
  check('Headless server engine executes the shared calendar core without a browser',
    !headlessError&&headlessResult&&headlessResult.advanceResult&&headlessResult.advanceResult.advanced===true&&
    headlessResult.worldRecord.gameState.calendar.currentSlotKey==='s1',
    {error:headlessError&&headlessError.stack,advanceResult:headlessResult&&headlessResult.advanceResult});

  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf0320-server-runner-'));
  try{
    const metadata=new FileMetadataRepository({filePath:path.join(root,'metadata.json')});
    const worlds=new WorldPersistenceService({objectStore:new LocalObjectStore({rootDir:path.join(root,'objects')})});
    const runtime=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:60000});
    let engineCalls=0;
    const stubEngine={
      run(payload){
        engineCalls+=1;
        const record=JSON.parse(JSON.stringify(payload.worldRecord));
        const slots=record.gameState.calendar.slots||[];
        const index=slots.findIndex(row=>row.key===record.gameState.calendar.currentSlotKey);
        const next=slots[index+1];
        if(!next)return {worldRecord:record,matches:payload.matches||[],financeEvents:payload.financeEvents||[],advanceResult:{advanced:false,reason:'season-end'}};
        record.gameState.calendar.currentSlotKey=next.key;
        return {
          worldRecord:record,
          matches:payload.matches||[],
          financeEvents:payload.financeEvents||[],
          advanceResult:{advanced:true,type:'slot-only',currentSlot:next,simulatedMatches:[]}
        };
      }
    };
    const sessions=new WorldSessionService({
      metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtime,progressionEngine:stubEngine
    });

    const worldId='world-server-authority';
    const created=await sessions.createWorld({
      userId:'uA',worldRecord:minimalWorld(worldId,'uA'),worldName:'Server Authority',
      visibility:'PUBLIC',joinPolicy:'OPEN'
    });
    const assigned=await sessions.assignClub({userId:'uA',worldId,clubId:'club-a',expectedRevision:created.revision});
    const ready=await sessions.markReady({
      userId:'uA',worldId,expectedRevision:assigned.revision,roundGeneration:1,matchIntent:'QUICK'
    });
    const afterReadyManifest=await worlds.getManifest(worldId);
    const afterReady=await sessions.openWorld({userId:'uA',worldId});
    check('Last Ready performs exactly one authoritative server progression commit',
      engineCalls===1&&Number(afterReadyManifest.revision)===Number(assigned.revision)+1&&
      afterReady.worldRecord.gameState.calendar.currentSlotKey==='s1'&&
      afterReady.roundState.status==='OPEN'&&afterReady.roundGeneration===2,
      {engineCalls,ready,revision:afterReadyManifest.revision,roundState:afterReady.roundState});

    await Promise.all([
      sessions.runDueProgression({worldId}),
      sessions.runDueProgression({worldId}),
      sessions.runDueProgression({worldId})
    ]);
    check('Duplicate wakes after completion cannot replay the completed run',
      engineCalls===1&&((await worlds.getManifest(worldId)).revision===afterReadyManifest.revision),
      {engineCalls});

    // Crash after the world commit but before metadata finalization.
    const recoveryWorld='world-server-recovery';
    const recoveryCreated=await sessions.createWorld({
      userId:'uR',worldRecord:minimalWorld(recoveryWorld,'uR'),worldName:'Server Recovery',
      visibility:'PUBLIC',joinPolicy:'OPEN'
    });
    const recoveryAssigned=await sessions.assignClub({userId:'uR',worldId:recoveryWorld,clubId:'club-a',expectedRevision:recoveryCreated.revision});
    const originalComplete=metadata.completeWorldProgress.bind(metadata);
    let failOnce=true;
    metadata.completeWorldProgress=async function(args){
      if(failOnce){failOnce=false;throw new Error('injected-post-world-commit-crash');}
      return originalComplete(args);
    };
    const callsBeforeRecovery=engineCalls;
    let injectedError=null;
    try{
      await sessions.markReady({
        userId:'uR',worldId:recoveryWorld,expectedRevision:recoveryAssigned.revision,roundGeneration:1,matchIntent:'QUICK'
      });
    }catch(error){injectedError=error;}
    const committedManifest=await worlds.getManifest(recoveryWorld);
    const stuck=await metadata.getWorldProgression(recoveryWorld);
    check('Crash after world commit leaves a recoverable FINALIZING state',
      !!injectedError&&/injected-post-world-commit-crash/.test(String(injectedError.message||''))&&
      Number(committedManifest.revision)===Number(recoveryAssigned.revision)+1&&
      stuck.status==='FINALIZING',
      {error:injectedError&&injectedError.message,stuck,revision:committedManifest.revision});

    metadata.completeWorldProgress=originalComplete;
    const recovered=await sessions.runDueProgression({worldId:recoveryWorld});
    const recoveredOpen=await sessions.openWorld({userId:'uR',worldId:recoveryWorld});
    check('Recovery repairs metadata without replaying matches, finance or calendar progression',
      engineCalls===callsBeforeRecovery+1&&
      recovered.status==='OPEN'&&recovered.roundGeneration===2&&
      recoveredOpen.worldRecord.gameState.calendar.currentSlotKey==='s1',
      {engineCalls,callsBeforeRecovery,recovered});

    // A due countdown can be woken with no browser and parallel wake calls still have one effect.
    const offlineWorld='world-server-offline';
    const offlineCreated=await sessions.createWorld({
      userId:'uO',worldRecord:minimalWorld(offlineWorld,'uO'),worldName:'Server Offline',
      visibility:'PUBLIC',joinPolicy:'OPEN'
    });
    const offlineAssigned=await sessions.assignClub({userId:'uO',worldId:offlineWorld,clubId:'club-a',expectedRevision:offlineCreated.revision});
    await metadata._mutate(data=>{
      const state=data.progression[offlineWorld];
      state.deadlineAt=new Date(Date.now()-1000).toISOString();
      state.timeModel='COUNTDOWN';
      return state;
    });
    const beforeParallel=engineCalls;
    await Promise.all(Array.from({length:8},()=>sessions.runDueProgression({worldId:offlineWorld})));
    const offlineManifest=await worlds.getManifest(offlineWorld);
    const offlineOpen=await sessions.openWorld({userId:'uO',worldId:offlineWorld});
    check('Eight parallel server wakes produce one fachliche round effect',
      engineCalls===beforeParallel+1&&Number(offlineManifest.revision)===Number(offlineAssigned.revision)+1&&
      offlineOpen.worldRecord.gameState.calendar.currentSlotKey==='s1'&&offlineOpen.roundGeneration===2,
      {engineCalls,beforeParallel,revision:offlineManifest.revision});

    report.metrics={engineCalls,headlessAdvanced:!!(headlessResult&&headlessResult.advanceResult&&headlessResult.advanceResult.advanced)};
  }finally{
    await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
