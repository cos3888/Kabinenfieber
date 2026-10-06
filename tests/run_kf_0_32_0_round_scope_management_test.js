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
      calendar:{
        currentSlotKey:'w0',
        slots:[{key:'w0',week:1,phase:'Mitte'},{key:'w1',week:1,phase:'Ende'}],
        fixtures:[{id:'f1',slotKey:'w1',status:'scheduled',competition:'league',homeClubId:'club-a',awayClubId:'club-b'}]
      },
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},
      clubFinances:{byClub:{'club-a':{},'club-b':{}}},
      clubMailboxes:{byClub:{}}
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
    const staleRevisionBeforeSecondManager=aAssigned.revision;

    const staleMailboxSave=await sessions.saveManagementDelta({
      userId:'uA',worldId,expectedRevision:staleRevisionBeforeSecondManager,roundGeneration:1,
      expectedScopeRevisions:{'CLUB:club-a':0},
      worldDelta:delta(worldId,[{
        path:['gameState','clubMailboxes','byClub','club-a'],
        value:{byId:{welcome:{id:'welcome',subject:'Willkommen',read:false}},order:['welcome'],dismissedIds:{},initialized:true}
      }])
    });
    check('Joining and assigning a second manager does not invalidate a first manager club-scoped save in the same round',
      staleMailboxSave.revision===baseRevision&&staleMailboxSave.scopeRevisions['CLUB:club-a']===1,
      {staleRevisionBeforeSecondManager,baseRevision,saveRevision:staleMailboxSave.revision});

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

    let mailboxOwnershipError=null;
    try{
      await sessions.saveManagementDelta({
        userId:'uA',worldId,expectedRevision:baseRevision,roundGeneration:1,
        expectedScopeRevisions:{'CLUB:club-b':0},
        worldDelta:delta(worldId,[{path:['gameState','clubMailboxes','byClub','club-b','initialized'],value:true}])
      });
    }catch(error){mailboxOwnershipError=error;}
    check('Club mailbox scope cannot be written by another manager',
      !!mailboxOwnershipError&&/owned by the assigned club/i.test(String(mailboxOwnershipError.message||'')),
      {error:mailboxOwnershipError&&mailboxOwnershipError.message});

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

    const readyA=await sessions.markReady({userId:'uA',worldId,expectedRevision:staleRevisionBeforeSecondManager,roundGeneration:1});
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

    const quickFixturePlan=readyB.matchdayPlan&&readyB.matchdayPlan.fixturePlans&&readyB.matchdayPlan.fixturePlans[0];
    check('Current multiplayer client path records full-match Co-Trainer delegation for Schnellberechnung',
      quickFixturePlan&&quickFixturePlan.fixtureId==='f1'&&quickFixturePlan.mode==='QUICK'&&
      quickFixturePlan.delegatedUserIds.slice().sort().join(',')==='uA,uB'&&
      quickFixturePlan.liveUserIds.length===0,
      {matchdayPlan:readyB.matchdayPlan});

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

    const liveWorld='world-live-intent';
    const liveRecord=makeWorldRecord(liveWorld,'lA');
    const liveCreated=await sessions.createWorld({
      userId:'lA',worldRecord:liveRecord,worldName:'Live Intent',
      visibility:'PUBLIC',joinPolicy:'OPEN'
    });
    const liveAAssigned=await sessions.assignClub({userId:'lA',worldId:liveWorld,clubId:'club-a',expectedRevision:liveCreated.revision});
    const liveJoined=await sessions.joinWorld({userId:'lB',displayName:'LB',worldId:liveWorld});
    const liveBAssigned=await sessions.assignClub({userId:'lB',worldId:liveWorld,clubId:'club-b',expectedRevision:liveJoined.revision});
    const liveRevision=liveBAssigned.revision;
    const liveReadyA=await sessions.markReady({
      userId:'lA',worldId:liveWorld,expectedRevision:liveRevision,roundGeneration:1,matchIntent:'QUICK'
    });
    const liveRetryA=await sessions.markReady({
      userId:'lA',worldId:liveWorld,expectedRevision:liveRevision,roundGeneration:1,matchIntent:'LIVE'
    });
    check('A trainer who chose Schnellberechnung cannot later switch back to Live for the same round',
      liveReadyA.matchIntentByUserId.lA==='QUICK'&&liveRetryA.matchIntentByUserId.lA==='QUICK',
      {liveReadyA,liveRetryA});
    const liveReadyB=await sessions.markReady({
      userId:'lB',worldId:liveWorld,expectedRevision:liveRevision,roundGeneration:1,matchIntent:'LIVE'
    });
    const mixedPlan=liveReadyB.matchdayPlan&&liveReadyB.matchdayPlan.fixturePlans&&liveReadyB.matchdayPlan.fixturePlans[0];
    check('In a human-vs-human match one Live request makes the fixture Live while Schnellberechnung remains delegated',
      liveReadyB.status==='MATCHDAY'&&mixedPlan&&mixedPlan.mode==='LIVE'&&
      mixedPlan.liveUserIds.join(',')==='lB'&&mixedPlan.delegatedUserIds.join(',')==='lA',
      {matchdayPlan:liveReadyB.matchdayPlan});

    let liveFinalizeEarlyError=null;
    try{
      await sessions.saveSlot({
        userId:'lB',worldId:liveWorld,
        worldDelta:delta(liveWorld,[{path:['gameState','calendar','currentSlotKey'],value:'w1'}]),
        expectedRevision:liveRevision,season:1,slotKey:'w1',
        matches:[],financeEvents:[],progressLeaseId:liveReadyB.leaseId
      });
    }catch(error){liveFinalizeEarlyError=error;}
    check('Round finalization waits while a planned Live fixture is still running',
      !!liveFinalizeEarlyError&&/live matches are still running/i.test(String(liveFinalizeEarlyError.message||'')),
      {error:liveFinalizeEarlyError&&liveFinalizeEarlyError.message});

    let delegatedCompleteError=null;
    try{
      await sessions.markLiveFixtureCompleted({
        userId:'lA',worldId:liveWorld,roundGeneration:1,
        progressionRunId:liveReadyB.progressionRunId,fixtureId:'f1'
      });
    }catch(error){delegatedCompleteError=error;}
    check('A Schnellberechnung participant delegated to the Co-Trainer cannot falsely finish a Live fixture',
      !!delegatedCompleteError&&/only a live participant/i.test(String(delegatedCompleteError.message||'')),
      {error:delegatedCompleteError&&delegatedCompleteError.message});

    const liveCompleted=await sessions.markLiveFixtureCompleted({
      userId:'lB',worldId:liveWorld,roundGeneration:1,
      progressionRunId:liveReadyB.progressionRunId,fixtureId:'f1'
    });
    check('The live participant can mark the Live fixture completed for finalization',
      (liveCompleted.matchdayPlan.completedLiveFixtureIds||[]).includes('f1'),
      {matchdayPlan:liveCompleted.matchdayPlan});

    const liveFinalized=await sessions.saveSlot({
      userId:'lB',worldId:liveWorld,
      worldDelta:delta(liveWorld,[{path:['gameState','calendar','currentSlotKey'],value:'w1'}]),
      expectedRevision:liveRevision,season:1,slotKey:'w1',
      matches:[],financeEvents:[],progressLeaseId:liveReadyB.leaseId
    });
    const liveNextRound=await sessions.getProgression({userId:'lA',worldId:liveWorld});
    check('Results/table phase can open only after every Live fixture is complete',
      liveFinalized.revision===liveRevision+1&&liveNextRound.status==='OPEN'&&liveNextRound.roundGeneration===2,
      {liveFinalized,liveNextRound});

    const countdownWorld='world-countdown-offline';
    const countdownRecord=makeWorldRecord(countdownWorld,'cA');
    countdownRecord.runtimeSettings={roundTimeModel:'COUNTDOWN',roundDurationSeconds:120};
    const countdownCreated=await sessions.createWorld({
      userId:'cA',worldRecord:countdownRecord,worldName:'Countdown Offline',
      visibility:'PUBLIC',joinPolicy:'OPEN'
    });
    await sessions.assignClub({userId:'cA',worldId:countdownWorld,clubId:'club-a',expectedRevision:countdownCreated.revision});
    const countdownJoined=await sessions.joinWorld({userId:'cB',displayName:'CB',worldId:countdownWorld});
    await sessions.assignClub({userId:'cB',worldId:countdownWorld,clubId:'club-b',expectedRevision:countdownJoined.revision});
    await sessions.joinWorld({userId:'cWaiting',displayName:'Noch ohne Verein',worldId:countdownWorld});
    const countdownManifest=await worlds.getManifest(countdownWorld);
    const countdownReady=await sessions.markReady({
      userId:'cA',worldId:countdownWorld,expectedRevision:countdownManifest.revision,roundGeneration:1
    });
    check('Countdown starts only with the first Ready and stores an absolute deadline',
      countdownReady.status==='OPEN'&&countdownReady.readyTrainerCount===1&&!!countdownReady.deadlineAt,
      {countdownReady});
    await metadata._mutate(data=>{
      data.progression[countdownWorld].deadlineAt=new Date(Date.now()-1000).toISOString();
      return data.progression[countdownWorld];
    });
    const countdownClaims=await Promise.all([
      sessions.runDueProgression({worldId:countdownWorld}),
      sessions.runDueProgression({worldId:countdownWorld})
    ]);
    check('Expired countdown can be claimed after offline time and creates exactly one progression owner',
      countdownClaims.filter(row=>row.shouldAdvance).length===1&&
      countdownClaims.every(row=>['LOCKING','MATCHDAY'].includes(row.status))&&
      countdownClaims.some(row=>row.status==='MATCHDAY')&&
      new Set(countdownClaims.map(row=>row.progressionRunId)).size===1,
      {countdownClaims});
    check('A joined user without a club never counts toward Ready or blocks the round',
      countdownReady.activeTrainerCount===2&&countdownReady.readyTrainerCount===1,
      {activeTrainerCount:countdownReady.activeTrainerCount,readyTrainerCount:countdownReady.readyTrainerCount});

    const fixedWorld='world-fixed-schedule';
    const fixedRecord=makeWorldRecord(fixedWorld,'fA');
    fixedRecord.runtimeSettings={
      roundTimeModel:'FIXED_SCHEDULE',
      fixedScheduleWeekdays:[1,3,5],
      fixedScheduleTime:'20:00',
      timezone:'Europe/Berlin'
    };
    const fixedCreated=await sessions.createWorld({
      userId:'fA',worldRecord:fixedRecord,worldName:'Fixed Schedule',
      visibility:'PUBLIC',joinPolicy:'OPEN'
    });
    await sessions.assignClub({userId:'fA',worldId:fixedWorld,clubId:'club-a',expectedRevision:fixedCreated.revision});
    const fixedJoined=await sessions.joinWorld({userId:'fB',displayName:'FB',worldId:fixedWorld});
    await sessions.assignClub({userId:'fB',worldId:fixedWorld,clubId:'club-b',expectedRevision:fixedJoined.revision});
    const fixedManifest=await worlds.getManifest(fixedWorld);
    const fixedBefore=await sessions.getProgression({userId:'fA',worldId:fixedWorld});
    let fixedReadyAError=null,fixedReadyBError=null;
    try{await sessions.markReady({userId:'fA',worldId:fixedWorld,expectedRevision:fixedManifest.revision,roundGeneration:1});}catch(error){fixedReadyAError=error;}
    try{await sessions.markReady({userId:'fB',worldId:fixedWorld,expectedRevision:fixedManifest.revision,roundGeneration:1});}catch(error){fixedReadyBError=error;}
    const fixedAfterReadyAttempts=await sessions.getProgression({userId:'fA',worldId:fixedWorld});
    check('FIXED_SCHEDULE has no Ready action and cannot advance early',
      !!fixedReadyAError&&!!fixedReadyBError&&/do not use a Ready action/i.test(String(fixedReadyAError.message||''))&&
      fixedAfterReadyAttempts.status==='OPEN'&&fixedAfterReadyAttempts.readyTrainerCount===0&&
      fixedAfterReadyAttempts.deadlineAt===fixedBefore.deadlineAt,
      {fixedReadyAError:fixedReadyAError&&fixedReadyAError.message,fixedReadyBError:fixedReadyBError&&fixedReadyBError.message,fixedBefore,fixedAfterReadyAttempts});
    const expiredFixedAt=new Date(Date.now()-1000).toISOString();
    await metadata._mutate(data=>{
      data.worlds[fixedWorld].nextRoundAt=expiredFixedAt;
      data.progression[fixedWorld].deadlineAt=expiredFixedAt;
      return data.progression[fixedWorld];
    });
    const fixedClaims=await Promise.all([
      sessions.runDueProgression({worldId:fixedWorld}),
      sessions.runDueProgression({worldId:fixedWorld})
    ]);
    check('FIXED_SCHEDULE becomes due only at its authoritative server deadline and is claimed once',
      fixedClaims.filter(row=>row.shouldAdvance).length===1&&
      fixedClaims.every(row=>['LOCKING','MATCHDAY'].includes(row.status))&&
      fixedClaims.some(row=>row.status==='MATCHDAY')&&
      new Set(fixedClaims.map(row=>row.progressionRunId)).size===1,
      {fixedClaims});

    const recoveryWorld='world-finalizing-recovery';
    const recoveryRecord=makeWorldRecord(recoveryWorld,'rA');
    const recoveryCreated=await sessions.createWorld({
      userId:'rA',worldRecord:recoveryRecord,worldName:'Finalizing Recovery',
      visibility:'PUBLIC',joinPolicy:'OPEN'
    });
    const recoveryAAssigned=await sessions.assignClub({
      userId:'rA',worldId:recoveryWorld,clubId:'club-a',expectedRevision:recoveryCreated.revision
    });
    const recoveryJoined=await sessions.joinWorld({userId:'rB',displayName:'RB',worldId:recoveryWorld});
    const recoveryBAssigned=await sessions.assignClub({
      userId:'rB',worldId:recoveryWorld,clubId:'club-b',expectedRevision:recoveryJoined.revision
    });
    const recoveryRevision=recoveryBAssigned.revision;
    await sessions.markReady({
      userId:'rA',worldId:recoveryWorld,expectedRevision:recoveryRevision,roundGeneration:1,matchIntent:'QUICK'
    });
    const recoveryReady=await sessions.markReady({
      userId:'rB',worldId:recoveryWorld,expectedRevision:recoveryRevision,roundGeneration:1,matchIntent:'QUICK'
    });
    const originalComplete=metadata.completeWorldProgress.bind(metadata);
    let failCompleteOnce=true;
    metadata.completeWorldProgress=async function(args){
      if(failCompleteOnce){
        failCompleteOnce=false;
        throw new Error('simulated-finalizing-metadata-failure');
      }
      return originalComplete(args);
    };
    let recoverySaveError=null;
    try{
      await sessions.saveSlot({
        userId:'rB',worldId:recoveryWorld,
        worldDelta:delta(recoveryWorld,[{path:['gameState','calendar','currentSlotKey'],value:'w1'}]),
        expectedRevision:recoveryRevision,season:1,slotKey:'w1',
        matches:[],financeEvents:[],progressLeaseId:recoveryReady.leaseId
      });
    }catch(error){recoverySaveError=error;}
    const stuckManifest=await worlds.getManifest(recoveryWorld);
    const stuckRound=await metadata.getWorldProgression(recoveryWorld);
    check('World commit followed by a metadata failure remains recoverable in FINALIZING',
      !!recoverySaveError&&/simulated-finalizing/i.test(String(recoverySaveError.message||''))&&
      Number(stuckManifest.revision)===Number(recoveryRevision)+1&&
      stuckRound.status==='FINALIZING'&&Number(stuckRound.revision)===Number(recoveryRevision),
      {error:recoverySaveError&&recoverySaveError.message,stuckManifest,stuckRound});
    metadata.completeWorldProgress=originalComplete;
    const recoveredRound=await sessions.getProgression({userId:'rA',worldId:recoveryWorld});
    await runtime.unloadWorld(recoveryWorld);
    const recoveredWorld=await sessions.openWorld({userId:'rA',worldId:recoveryWorld});
    check('Reload/poll repairs FINALIZING after an already committed world revision without replaying the slot',
      recoveredRound.status==='OPEN'&&recoveredRound.roundGeneration===2&&
      Number(recoveredRound.revision)===Number(stuckManifest.revision)&&
      recoveredRound.lastCompletedProgressionRunId===recoveryReady.progressionRunId&&
      recoveredWorld.worldRecord.gameState.calendar.currentSlotKey==='w1',
      {recoveredRound,currentSlotKey:recoveredWorld.worldRecord.gameState.calendar.currentSlotKey});

    const maxWorld='world-max-human-managers';
    const maxRecord=makeWorldRecord(maxWorld,'m0');
    maxRecord.gameState.clubs={byId:{},order:[]};
    maxRecord.gameState.players={byId:{},order:[]};
    maxRecord.gameState.squads={};
    maxRecord.gameState.clubFinances={byClub:{}};
    maxRecord.gameState.calendar.fixtures=[];
    for(let i=0;i<18;i+=1){
      const clubId='max-club-'+String(i).padStart(2,'0');
      const playerId='max-player-'+String(i).padStart(2,'0');
      maxRecord.gameState.clubs.byId[clubId]={id:clubId,name:'Max Club '+i};
      maxRecord.gameState.clubs.order.push(clubId);
      maxRecord.gameState.players.byId[playerId]={id:playerId,clubId,contract:{salaryBase:1,validUntilSeason:3}};
      maxRecord.gameState.players.order.push(playerId);
      maxRecord.gameState.squads[clubId]={playerIds:[playerId],tactics:{pressing:'normal'}};
      maxRecord.gameState.clubFinances.byClub[clubId]={};
    }
    for(let i=0;i<18;i+=2){
      maxRecord.gameState.calendar.fixtures.push({
        id:'max-f'+String(i/2+1),
        slotKey:'w1',
        status:'scheduled',
        competition:'league',
        homeClubId:'max-club-'+String(i).padStart(2,'0'),
        awayClubId:'max-club-'+String(i+1).padStart(2,'0')
      });
    }
    const maxCreated=await sessions.createWorld({
      userId:'m0',worldRecord:maxRecord,worldName:'Max Human Managers',
      visibility:'PUBLIC',joinPolicy:'OPEN'
    });
    let maxRevision=(await sessions.assignClub({
      userId:'m0',worldId:maxWorld,clubId:'max-club-00',expectedRevision:maxCreated.revision
    })).revision;
    for(let i=1;i<18;i+=1){
      const joinedMax=await sessions.joinWorld({userId:'m'+i,displayName:'M'+i,worldId:maxWorld});
      const assignedMax=await sessions.assignClub({
        userId:'m'+i,worldId:maxWorld,clubId:'max-club-'+String(i).padStart(2,'0'),
        expectedRevision:joinedMax.revision
      });
      maxRevision=assignedMax.revision;
    }
    const maxUsers=Array.from({length:18},(_,i)=>'m'+i);
    const maxSaveStarted=Date.now();
    const maxSaves=await Promise.all(maxUsers.map((userId,i)=>sessions.saveManagementDelta({
      userId,worldId:maxWorld,expectedRevision:maxRevision,roundGeneration:1,
      expectedScopeRevisions:{['SQUAD:max-club-'+String(i).padStart(2,'0')]:0},
      worldDelta:delta(maxWorld,[{
        path:['gameState','squads','max-club-'+String(i).padStart(2,'0'),'tactics','pressing'],
        value:'max-'+i
      }])
    })));
    const maxSaveMs=Date.now()-maxSaveStarted;
    const maxManifestAfterSaves=await worlds.getManifest(maxWorld);
    check('Theoretical maximum: all 18 human managers can save disjoint club resources in parallel without losing data',
      maxSaves.length===18&&
      maxSaves.every((row,i)=>row.scopeRevisions['SQUAD:max-club-'+String(i).padStart(2,'0')]===1)&&
      Number(maxManifestAfterSaves.revision)===Number(maxRevision),
      {managerCount:maxSaves.length,saveDurationMs:maxSaveMs,revision:maxManifestAfterSaves.revision});
    await runtime.unloadWorld(maxWorld);
    const maxOverlay=await sessions.openWorld({userId:'m0',worldId:maxWorld});
    check('Theoretical maximum: reopening the world materializes every one of the 18 confirmed club overlays',
      maxUsers.every((_,i)=>maxOverlay.worldRecord.gameState.squads['max-club-'+String(i).padStart(2,'0')].tactics.pressing==='max-'+i),
      {scopeCount:Object.keys(maxOverlay.scopeRevisions||{}).length});

    const maxReadyStarted=Date.now();
    const maxReadyResults=await Promise.all(maxUsers.map(userId=>sessions.markReady({
      userId,worldId:maxWorld,expectedRevision:maxRevision,roundGeneration:1,matchIntent:'QUICK'
    })));
    const maxReadyMs=Date.now()-maxReadyStarted;
    const maxProgress=await sessions.getProgression({userId:'m0',worldId:maxWorld});
    check('Theoretical maximum: 18 simultaneous Ready requests create one shared MATCHDAY progression run',
      maxProgress.status==='MATCHDAY'&&
      maxProgress.readyTrainerCount===18&&
      !!maxProgress.progressionRunId&&
      new Set(maxReadyResults.filter(row=>row&&row.progressionRunId).map(row=>row.progressionRunId)).size===1,
      {
        readyDurationMs:maxReadyMs,
        readyTrainerCount:maxProgress.readyTrainerCount,
        progressionRunId:maxProgress.progressionRunId
      });

    const maxProgressed=await sessions.saveSlot({
      userId:'m0',worldId:maxWorld,
      worldDelta:delta(maxWorld,[{path:['gameState','calendar','currentSlotKey'],value:'w1'}]),
      expectedRevision:maxRevision,season:1,slotKey:'w1',
      matches:[],financeEvents:[],progressLeaseId:maxProgress.leaseId
    });
    await runtime.unloadWorld(maxWorld);
    const maxFinal=await sessions.openWorld({userId:'m0',worldId:maxWorld});
    const maxNextRound=await sessions.getProgression({userId:'m0',worldId:maxWorld});
    check('Theoretical maximum: one authoritative slot commit preserves all 18 locked management states and opens generation 2',
      maxProgressed.revision===maxRevision+1&&
      maxNextRound.roundGeneration===2&&maxNextRound.status==='OPEN'&&
      maxUsers.every((_,i)=>maxFinal.worldRecord.gameState.squads['max-club-'+String(i).padStart(2,'0')].tactics.pressing==='max-'+i),
      {revision:maxProgressed.revision,roundGeneration:maxNextRound.roundGeneration});

    const capacityWorld='world-capacity-18';
    const capacityRecord=makeWorldRecord(capacityWorld,'cap0');
    await sessions.createWorld({
      userId:'cap0',worldRecord:capacityRecord,worldName:'Capacity',
      visibility:'PUBLIC',joinPolicy:'OPEN'
    });
    for(let i=1;i<18;i+=1){
      await sessions.joinWorld({userId:'cap'+i,displayName:'Cap '+i,worldId:capacityWorld});
    }
    let capacityError=null;
    try{
      await sessions.joinWorld({userId:'cap18',displayName:'Cap 18',worldId:capacityWorld});
    }catch(error){capacityError=error;}
    const capacityUsers=await metadata.listActiveUserIdsForWorld(capacityWorld);
    check('A world accepts at most 18 active human managers',
      capacityUsers.length===18&&!!capacityError&&/maximum of 18/i.test(String(capacityError.message||'')),
      {participantCount:capacityUsers.length,error:capacityError&&capacityError.message});

    report.metrics={
      baseRevision,
      progressedRevision:progressed.revision,
      roundGeneration:nextRound.roundGeneration,
      scopeCountBeforeProgress:(beforeAtomicConflict||[]).length,
      maxHumanManagers:18,
      maxParallelSaveMs:maxSaveMs,
      maxParallelReadyMs:maxReadyMs
    };
  }finally{
    await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});