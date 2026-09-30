'use strict';

const fs=require('fs/promises');
const path=require('path');
const os=require('os');
const { LocalObjectStore }=require('../server/persistence/local-object-store');
const { FileMetadataRepository }=require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService }=require('../server/persistence/world-persistence-service');
const { WorldRuntimeManager }=require('../server/services/world-runtime-manager');
const { WorldSessionService }=require('../server/services/world-session-service');

const report={version:'0.32.0',passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
function delta(worldId,ops){return {schemaVersion:'kf-world-delta-0.31.0',worldId,ops};}

function makeWorldRecord(worldId,userId){
  return {
    id:worldId,
    schemaVersion:'kf-world-record-0.27.2',
    gameVersion:'0.32.0',
    createdAt:new Date().toISOString(),
    createdByUserId:userId,
    creationRules:{startVariant:'classic',leagueConfiguration:'default',clubSelection:'manual'},
    runtimeSettings:{roundDurationHours:null},
    memberships:{byTrainerId:{'trainer-a':{
      trainerId:'trainer-a',userProfileId:userId,clubId:null,status:'active',
      joinedAt:new Date().toISOString(),lastActivityAt:new Date().toISOString(),
      trainerDisplayName:'A',role:'WORLD_ADMIN'
    }},order:['trainer-a']},
    gameState:{
      meta:{id:worldId,seasonNumber:1,schemaVersion:'kf-core-0.27.2'},
      clubs:{byId:{
        'club-a':{id:'club-a',name:'Club A'},
        'club-b':{id:'club-b',name:'Club B'}
      },order:['club-a','club-b']},
      players:{byId:{
        'pa':{id:'pa',clubId:'club-a',contract:{salaryBase:1,validUntilSeason:3}},
        'pb':{id:'pb',clubId:'club-b',contract:{salaryBase:1,validUntilSeason:3}}
      },order:['pa','pb']},
      squads:{
        'club-a':{playerIds:['pa'],tactics:{pressing:'normal'}},
        'club-b':{playerIds:['pb'],tactics:{pressing:'normal'}}
      },
      calendar:{currentSlotKey:'w0',fixtures:[],slots:[]},
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},
      clubFinances:{byClub:{'club-a':{},'club-b':{}}}
    }
  };
}

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf0320-round-'));
  const metadata=new FileMetadataRepository({filePath:path.join(root,'metadata.json')});
  const worlds=new WorldPersistenceService({objectStore:new LocalObjectStore({rootDir:path.join(root,'objects')})});
  const runtime=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:60000});
  const sessions=new WorldSessionService({metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtime});

  try{
    const worldId='world-round-scopes';
    const created=await sessions.createWorld({
      userId:'uA',worldRecord:makeWorldRecord(worldId,'uA'),worldName:'Round Scopes',
      visibility:'PUBLIC',joinPolicy:'OPEN'
    });
    const aAssigned=await sessions.assignClub({userId:'uA',worldId,clubId:'club-a',expectedRevision:created.revision});
    const joined=await sessions.joinWorld({userId:'uB',displayName:'B',worldId});
    const bAssigned=await sessions.assignClub({userId:'uB',worldId,clubId:'club-b',expectedRevision:joined.revision});
    const baseRevision=bAssigned.revision;

    const openedA=await sessions.openWorld({userId:'uA',worldId});
    const openedB=await sessions.openWorld({userId:'uB',worldId});
    check('New multiplayer round opens with generation 1 and OPEN state',
      openedA.roundGeneration===1&&openedA.roundState.status==='OPEN'&&openedB.roundGeneration===1,
      {roundA:openedA.roundState,roundB:openedB.roundState});

    const [saveA,saveB]=await Promise.all([
      sessions.saveManagementDelta({
        userId:'uA',worldId,expectedRevision:baseRevision,roundGeneration:1,
        expectedScopeRevisions:{'SQUAD:club-a':0},
        worldDelta:delta(worldId,[{path:['gameState','squads','club-a','tactics','pressing'],value:'high'}])
      }),
      sessions.saveManagementDelta({
        userId:'uB',worldId,expectedRevision:baseRevision,roundGeneration:1,
        expectedScopeRevisions:{'SQUAD:club-b':0},
        worldDelta:delta(worldId,[{path:['gameState','squads','club-b','tactics','pressing'],value:'low'}])
      })
    ]);
    const afterParallelManifest=await worlds.getManifest(worldId);
    check('Disjoint club management saves do not advance or conflict on the global world revision',
      saveA.revision===baseRevision&&saveB.revision===baseRevision&&afterParallelManifest.revision===baseRevision,
      {baseRevision,saveA:saveA.revision,saveB:saveB.revision,manifest:afterParallelManifest.revision});

    await runtime.unloadWorld(worldId);
    const overlaid=await sessions.openWorld({userId:'uA',worldId});
    check('Open world materializes all current round overlays without changing central storage truth',
      overlaid.worldRecord.gameState.squads['club-a'].tactics.pressing==='high'&&
      overlaid.worldRecord.gameState.squads['club-b'].tactics.pressing==='low'&&
      overlaid.scopeRevisions['SQUAD:club-a']===1&&overlaid.scopeRevisions['SQUAD:club-b']===1,
      {scopeRevisions:overlaid.scopeRevisions});

    let ownershipError=null;
    try{
      await sessions.saveManagementDelta({
        userId:'uA',worldId,expectedRevision:baseRevision,roundGeneration:1,
        expectedScopeRevisions:{'SQUAD:club-b':1},
        worldDelta:delta(worldId,[{path:['gameState','squads','club-b','tactics','tempo'],value:'fast'}])
      });
    }catch(error){ownershipError=error;}
    check('Server ownership blocks a trainer from mutating another club',
      !!ownershipError&&/owned by the assigned club/i.test(String(ownershipError.message||'')),
      {error:ownershipError&&ownershipError.message});

    const sameScopeOne=delta(worldId,[{path:['gameState','squads','club-a','tactics','width'],value:'wide'}]);
    const sameScopeTwo=delta(worldId,[{path:['gameState','squads','club-a','tactics','tempo'],value:'fast'}]);
    const sameScope=await Promise.allSettled([
      sessions.saveManagementDelta({
        userId:'uA',worldId,worldDelta:sameScopeOne,expectedRevision:baseRevision,roundGeneration:1,
        expectedScopeRevisions:{'SQUAD:club-a':1}
      }),
      sessions.saveManagementDelta({
        userId:'uA',worldId,worldDelta:sameScopeTwo,expectedRevision:baseRevision,roundGeneration:1,
        expectedScopeRevisions:{'SQUAD:club-a':1}
      })
    ]);
    const scopeOk=sameScope.filter(row=>row.status==='fulfilled');
    const scopeConflict=sameScope.filter(row=>row.status==='rejected');
    check('Concurrent writes to the same resource scope allow exactly one revision winner',
      scopeOk.length===1&&scopeConflict.length===1&&scopeConflict[0].reason&&scopeConflict[0].reason.code==='PERSISTENCE_CONFLICT',
      {statuses:sameScope.map(row=>row.status),error:scopeConflict[0]&&scopeConflict[0].reason&&scopeConflict[0].reason.message});

    const afterScope=await sessions.openWorld({userId:'uA',worldId});
    const squadRev=afterScope.scopeRevisions['SQUAD:club-a'];
    const multi=await sessions.saveManagementDelta({
      userId:'uA',worldId,expectedRevision:baseRevision,roundGeneration:1,
      expectedScopeRevisions:{'SQUAD:club-a':squadRev,'PLAYER:pa':0},
      worldDelta:delta(worldId,[
        {path:['gameState','squads','club-a','tactics','lineHeight'],value:'high'},
        {path:['gameState','players','byId','pa','contract','salaryBase'],value:2.5}
      ])
    });
    check('One management action atomically commits all touched resource scopes',
      multi.scopeRevisions['SQUAD:club-a']===squadRev+1&&multi.scopeRevisions['PLAYER:pa']===1,
      {scopeRevisions:multi.scopeRevisions});

    const beforeAtomicConflict=await metadata.getManagementScopes({worldId,roundGeneration:1});
    let atomicConflict=null;
    try{
      await sessions.saveManagementDelta({
        userId:'uA',worldId,expectedRevision:baseRevision,roundGeneration:1,
        expectedScopeRevisions:{'SQUAD:club-a':squadRev,'PLAYER:pa':1},
        worldDelta:delta(worldId,[
          {path:['gameState','squads','club-a','tactics','lineHeight'],value:'low'},
          {path:['gameState','players','byId','pa','contract','validUntilSeason'],value:6}
        ])
      });
    }catch(error){atomicConflict=error;}
    const afterAtomicConflict=await metadata.getManagementScopes({worldId,roundGeneration:1});
    check('A stale resource in a multi-resource action rejects the whole transaction',
      !!atomicConflict&&atomicConflict.code==='PERSISTENCE_CONFLICT'&&
      JSON.stringify(beforeAtomicConflict)===JSON.stringify(afterAtomicConflict),
      {error:atomicConflict&&atomicConflict.message});

    const readyA=await sessions.markReady({userId:'uA',worldId,expectedRevision:baseRevision,roundGeneration:1});
    check('First Ready starts COUNTDOWN but keeps the round open for other trainers',
      readyA.status==='OPEN'&&readyA.readyTrainerCount===1&&!!readyA.deadlineAt&&!readyA.shouldAdvance,
      {readyA});

    let lockedWriterError=null;
    try{
      await sessions.saveManagementDelta({
        userId:'uA',worldId,expectedRevision:baseRevision,roundGeneration:1,
        expectedScopeRevisions:multi.scopeRevisions,
        worldDelta:delta(worldId,[{path:['gameState','squads','club-a','tactics','pressing'],value:'normal'}])
      });
    }catch(error){lockedWriterError=error;}
    check('Ready locks only that trainer from further world mutations',
      !!lockedWriterError&&/already ready/i.test(String(lockedWriterError.message||'')),
      {error:lockedWriterError&&lockedWriterError.message});

    const bBeforeReady=await sessions.openWorld({userId:'uB',worldId});
    const bSave=await sessions.saveManagementDelta({
      userId:'uB',worldId,expectedRevision:baseRevision,roundGeneration:1,
      expectedScopeRevisions:{'SQUAD:club-b':bBeforeReady.scopeRevisions['SQUAD:club-b']},
      worldDelta:delta(worldId,[{path:['gameState','squads','club-b','tactics','tempo'],value:'slow'}])
    });
    check('A not-yet-ready trainer may still work while another trainer is read-only',
      bSave.scopeRevisions['SQUAD:club-b']===bBeforeReady.scopeRevisions['SQUAD:club-b']+1,
      {scopeRevisions:bSave.scopeRevisions});

    const readyB=await sessions.markReady({userId:'uB',worldId,expectedRevision:baseRevision,roundGeneration:1});
    check('All Ready creates one MATCHDAY lease with a stable progressionRunId',
      readyB.status==='MATCHDAY'&&readyB.shouldAdvance&&!!readyB.leaseId&&!!readyB.progressionRunId,
      {readyB});

    const duplicateReady=await sessions.markReady({userId:'uA',worldId,expectedRevision:baseRevision,roundGeneration:1});
    check('Further Ready calls cannot create a second progression lease',
      duplicateReady.status==='MATCHDAY'&&!duplicateReady.shouldAdvance&&
      duplicateReady.progressionRunId===readyB.progressionRunId,
      {duplicateReady});

    let matchdayWriteError=null;
    try{
      await sessions.saveManagementDelta({
        userId:'uB',worldId,expectedRevision:baseRevision,roundGeneration:1,
        expectedScopeRevisions:bSave.scopeRevisions,
        worldDelta:delta(worldId,[{path:['gameState','squads','club-b','tactics','width'],value:'narrow'}])
      });
    }catch(error){matchdayWriteError=error;}
    check('MATCHDAY rejects all management writes from the completed round',
      !!matchdayWriteError&&/locked/i.test(String(matchdayWriteError.message||'')),
      {error:matchdayWriteError&&matchdayWriteError.message});

    const effectiveForProgress=await sessions.openWorld({userId:'uB',worldId});
    const progressDelta=delta(worldId,[
      {path:['gameState','squads','club-a'],value:effectiveForProgress.worldRecord.gameState.squads['club-a']},
      {path:['gameState','squads','club-b'],value:effectiveForProgress.worldRecord.gameState.squads['club-b']},
      {path:['gameState','players','byId','pa'],value:effectiveForProgress.worldRecord.gameState.players.byId.pa},
      {path:['gameState','calendar','currentSlotKey'],value:'w1'}
    ]);
    const progressed=await sessions.saveSlot({
      userId:'uB',worldId,worldDelta:progressDelta,expectedRevision:baseRevision,
      season:1,slotKey:'w1',matches:[],financeEvents:[],progressLeaseId:readyB.leaseId
    });
    const nextRound=await sessions.getProgression({userId:'uA',worldId});
    check('Successful progression opens exactly the next generation and clears old overlays',
      progressed.revision===baseRevision+1&&nextRound.status==='OPEN'&&nextRound.roundGeneration===2&&
      Object.keys(nextRound.scopeRevisions||{}).length===0&&
      nextRound.lastCompletedProgressionRunId===readyB.progressionRunId,
      {progressed,nextRound});

    await runtime.unloadWorld(worldId);
    const finalWorld=await sessions.openWorld({userId:'uA',worldId});
    check('Authoritative slot commit preserves the locked management state after overlay cleanup',
      finalWorld.worldRecord.gameState.squads['club-a'].tactics.pressing==='high'&&
      finalWorld.worldRecord.gameState.squads['club-b'].tactics.tempo==='slow'&&
      finalWorld.worldRecord.gameState.players.byId.pa.contract.salaryBase===2.5&&
      finalWorld.worldRecord.gameState.calendar.currentSlotKey==='w1',
      {roundGeneration:finalWorld.roundGeneration});

    let lateSaveError=null;
    try{
      await sessions.saveManagementDelta({
        userId:'uA',worldId,expectedRevision:progressed.revision,roundGeneration:1,
        expectedScopeRevisions:{'SQUAD:club-a':0},
        worldDelta:delta(worldId,[{path:['gameState','squads','club-a','tactics','tempo'],value:'late'}])
      });
    }catch(error){lateSaveError=error;}
    check('Late saves from the previous roundGeneration can never enter the new slot',
      !!lateSaveError&&lateSaveError.code==='PERSISTENCE_CONFLICT',
      {error:lateSaveError&&lateSaveError.message});

    report.metrics={
      baseRevision,
      progressedRevision:progressed.revision,
      roundGeneration:nextRound.roundGeneration,
      scopeCountBeforeProgress:(beforeAtomicConflict||[]).length
    };
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
