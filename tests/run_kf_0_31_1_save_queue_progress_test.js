'use strict';

const fs=require('fs/promises');
const path=require('path');
const os=require('os');
const { LocalObjectStore }=require('../server/persistence/local-object-store');
const { FileMetadataRepository }=require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService }=require('../server/persistence/world-persistence-service');
const { WorldRuntimeManager }=require('../server/services/world-runtime-manager');
const { WorldSessionService }=require('../server/services/world-session-service');

const report={version:'0.31.1',passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
function delta(worldId,ops){return{schemaVersion:'kf-world-delta-0.31.0',worldId,ops};}
function makeWorldRecord(worldId,userId){
  const players={byId:{},order:[]};
  for(let i=0;i<500;i++){
    const id='p'+i;
    players.order.push(id);
    players.byId[id]={id,clubId:i<250?'club-a':'club-b',fitness:8,form:8,morale:8,contract:{salaryBase:1,validUntilSeason:3}};
  }
  return{
    id:worldId,schemaVersion:'kf-world-record-0.27.2',gameVersion:'0.31.1',
    createdAt:new Date().toISOString(),createdByUserId:userId,
    creationRules:{startVariant:'classic',leagueConfiguration:'default',clubSelection:'manual'},
    runtimeSettings:{roundTimeModel:'COUNTDOWN',roundDurationSeconds:600,timezone:'Europe/Berlin'},
    progression:{status:'waiting',deadlineAt:null,readyTrainerIds:[],lastHumanActivityAt:new Date().toISOString()},
    memberships:{byTrainerId:{'trainer-1':{trainerId:'trainer-1',userProfileId:userId,clubId:null,status:'active',joinedAt:new Date().toISOString(),lastActivityAt:new Date().toISOString(),trainerDisplayName:'Tester',role:'WORLD_ADMIN'}},order:['trainer-1']},
    gameState:{
      meta:{id:worldId,seasonNumber:1,schemaVersion:'kf-core-0.27.2'},
      clubs:{byId:{'club-a':{id:'club-a',name:'Club A'},'club-b':{id:'club-b',name:'Club B'}},order:['club-a','club-b']},
      players,
      squads:{
        'club-a':{playerIds:players.order.slice(0,250),lineup:players.order.slice(0,11),bench:[],reserve:[],tactics:{pressing:'balanced'},lineupMaskState:{formationKey:'4-4-2',playerPlacementById:{}}},
        'club-b':{playerIds:players.order.slice(250),lineup:players.order.slice(250,261),bench:[],reserve:[],tactics:{pressing:'balanced'},lineupMaskState:{formationKey:'4-4-2',playerPlacementById:{}}}
      },
      calendar:{currentSlotKey:'w0',fixtures:[{id:'f1',slotKey:'w1',status:'scheduled',homeClubId:'club-a',awayClubId:'club-b'}],slots:[]},
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},
      clubFinances:{byClub:{}}
    }
  };
}

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf0311-'));
  const metadata=new FileMetadataRepository({filePath:path.join(root,'metadata.json')});
  const worlds=new WorldPersistenceService({objectStore:new LocalObjectStore({rootDir:path.join(root,'objects')}),deltaCompactionThreshold:100000});
  const runtime=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:60000});
  const sessions=new WorldSessionService({metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtime});
  try{
    const userId='u1',worldId='world-save-queue';
    const record=makeWorldRecord(worldId,userId);
    const created=await sessions.createWorld({userId,worldRecord:record,worldName:'Save Queue',visibility:'PRIVATE',joinPolicy:'INVITE_ONLY'});
    const takeover=await sessions.assignClub({userId,worldId,clubId:'club-a',expectedRevision:created.revision});
    const before=await worlds.getManifest(worldId);
    const openedBefore=await sessions.openWorld({userId,worldId});
    const fullBytes=Buffer.byteLength(JSON.stringify(openedBefore.worldRecord));

    const lineupDelta=delta(worldId,[
      {path:['gameState','squads','club-a','lineupMaskState','formationKey'],value:'4-3-3'},
      {path:['gameState','squads','club-a','tactics','pressing'],value:'high'},
      {path:['gameState','squads','club-a','lineup','0'],value:'p10'}
    ]);
    const lineupBytes=Buffer.byteLength(JSON.stringify(lineupDelta));
    const saveA=await sessions.saveManagementDelta({userId,worldId,worldDelta:lineupDelta,expectedRevision:takeover.revision});
    const afterA=await worlds.getManifest(worldId);
    check('Management save appends only a world delta and keeps the base snapshot',
      before.worldRecordPath===afterA.worldRecordPath&&afterA.worldDeltaPaths.length===(before.worldDeltaPaths||[]).length+1,
      {beforePath:before.worldRecordPath,afterPath:afterA.worldRecordPath,deltaCount:afterA.worldDeltaPaths.length});
    check('Coalesced lineup/tactic payload is small compared with the WorldRecord',
      lineupBytes<fullBytes*.05,{fullBytes,lineupBytes,ratio:lineupBytes/fullBytes});

    const contractDelta=delta(worldId,[
      {path:['gameState','players','byId','p1','contract','salaryBase'],value:2.75},
      {path:['gameState','players','byId','p1','contract','validUntilSeason'],value:5}
    ]);
    const saveB=await sessions.saveManagementDelta({userId,worldId,worldDelta:contractDelta,expectedRevision:saveA.revision});
    check('Save B is accepted only on the confirmed revision from Save A',
      Number(saveB.revision)===Number(saveA.revision)+1,{saveA:saveA.revision,saveB:saveB.revision});

    await runtime.unloadWorld(worldId);
    const afterManagement=await sessions.openWorld({userId,worldId});
    check('Reload preserves coalesced lineup/tactic changes and immediate contract changes',
      afterManagement.worldRecord.gameState.squads['club-a'].lineupMaskState.formationKey==='4-3-3'&&
      afterManagement.worldRecord.gameState.squads['club-a'].tactics.pressing==='high'&&
      afterManagement.worldRecord.gameState.players.byId.p1.contract.salaryBase===2.75&&
      afterManagement.worldRecord.gameState.players.byId.p1.contract.validUntilSeason===5,
      {revision:afterManagement.revision});

    const concurrentRevision=Number(afterManagement.revision);
    const concurrentOne=delta(worldId,[{path:['gameState','squads','club-a','tactics','width'],value:'wide'}]);
    const concurrentTwo=delta(worldId,[{path:['gameState','squads','club-a','tactics','tempo'],value:'fast'}]);
    const concurrent=await Promise.allSettled([
      sessions.saveManagementDelta({userId,worldId,worldDelta:concurrentOne,expectedRevision:concurrentRevision}),
      sessions.saveManagementDelta({userId,worldId,worldDelta:concurrentTwo,expectedRevision:concurrentRevision})
    ]);
    const fulfilled=concurrent.filter(row=>row.status==='fulfilled');
    const rejected=concurrent.filter(row=>row.status==='rejected');
    check('Same-world server mutations are serialized and stale concurrent save is rejected',
      fulfilled.length===1&&rejected.length===1&&/revision mismatch/i.test(String(rejected[0].reason&&rejected[0].reason.message||'')),
      {statuses:concurrent.map(row=>row.status),error:rejected[0]&&rejected[0].reason&&rejected[0].reason.message});

    const currentAfterConcurrent=await sessions.openWorld({userId,worldId});
    const slotDelta=delta(worldId,[
      {path:['gameState','calendar','currentSlotKey'],value:'w1'},
      {path:['gameState','calendar','fixtures','0','status'],value:'played'},
      {path:['gameState','calendar','fixtures','0','playedMatchId'],value:'m1'},
      {path:['gameState','history','matches','0'],value:{id:'m1',season:1,slotKey:'w1',status:'played',homeClubId:'club-a',awayClubId:'club-b',homeGoals:1,awayGoals:0,storageKind:'current-season-summary'}}
    ]);
    const slotSaved=await sessions.saveSlot({
      userId,worldId,worldDelta:slotDelta,expectedRevision:currentAfterConcurrent.revision,season:1,slotKey:'w1',
      matches:[{id:'m1',season:1,slotKey:'w1',homeClubId:'club-a',awayClubId:'club-b',homeGoals:1,awayGoals:0,events:[],playerStats:[]}],
      financeEvents:[]
    });
    const postCheckpointLineup=delta(worldId,[{path:['gameState','squads','club-a','lineupMaskState','formationKey'],value:'3-4-3'}]);
    const postCheckpointSaved=await sessions.saveManagementDelta({userId,worldId,worldDelta:postCheckpointLineup,expectedRevision:slotSaved.revision});
    await runtime.unloadWorld(worldId);
    const afterCheckpoint=await sessions.openWorld({userId,worldId});
    check('Slot checkpoint followed by new-slot management save reloads both states',
      afterCheckpoint.worldRecord.gameState.calendar.currentSlotKey==='w1'&&
      afterCheckpoint.worldRecord.gameState.squads['club-a'].lineupMaskState.formationKey==='3-4-3'&&
      Number(afterCheckpoint.revision)===Number(postCheckpointSaved.revision),
      {slot:afterCheckpoint.worldRecord.gameState.calendar.currentSlotKey,formation:afterCheckpoint.worldRecord.gameState.squads['club-a'].lineupMaskState.formationKey});

    const mpWorld='world-multiplayer-delta';
    const mpRecord=makeWorldRecord(mpWorld,'uA');
    const mpCreated=await sessions.createWorld({userId:'uA',worldRecord:mpRecord,worldName:'MP Delta',visibility:'PUBLIC',joinPolicy:'OPEN'});
    const mpAAssigned=await sessions.assignClub({userId:'uA',worldId:mpWorld,clubId:'club-a',expectedRevision:mpCreated.revision});
    const mpJoined=await sessions.joinWorld({userId:'uB',displayName:'Trainer B',worldId:mpWorld});
    const mpBAssigned=await sessions.assignClub({userId:'uB',worldId:mpWorld,clubId:'club-b',expectedRevision:mpJoined.revision});
    const mpBase=await worlds.getManifest(mpWorld);
    const mpOpen=await sessions.openWorld({userId:'uA',worldId:mpWorld});

    const mpA=delta(mpWorld,[{path:['gameState','squads','club-a','tactics','pressing'],value:'high'}]);
    const mpASaved=await sessions.saveManagementDelta({
      userId:'uA',worldId:mpWorld,worldDelta:mpA,expectedRevision:mpBase.revision,
      roundGeneration:mpOpen.roundGeneration,expectedScopeRevisions:{'SQUAD:club-a':0}
    });
    check('Management delta in a multiplayer world uses a scoped overlay without consuming world revision',
      Number(mpASaved.revision)===Number(mpBase.revision)&&mpASaved.scopeRevisions['SQUAD:club-a']===1,
      {before:mpBase.revision,after:mpASaved.revision,scopeRevisions:mpASaved.scopeRevisions});

    let progressionPathError=null;
    try{
      await sessions.saveManagementDelta({
        userId:'uA',worldId:mpWorld,expectedRevision:mpBase.revision,roundGeneration:mpOpen.roundGeneration,
        expectedScopeRevisions:mpASaved.scopeRevisions,
        worldDelta:delta(mpWorld,[{path:['gameState','calendar','currentSlotKey'],value:'illegal-management-slot'}])
      });
    }catch(error){progressionPathError=error;}
    check('Management endpoint rejects progression-owned calendar/history paths',
      !!progressionPathError&&/progression-owned/i.test(String(progressionPathError.message||'')),
      {error:progressionPathError&&progressionPathError.message});

    const mpB=delta(mpWorld,[{path:['gameState','squads','club-b','tactics','tempo'],value:'slow'}]);
    const mpBSaved=await sessions.saveManagementDelta({
      userId:'uB',worldId:mpWorld,worldDelta:mpB,expectedRevision:mpBase.revision,
      roundGeneration:mpOpen.roundGeneration,expectedScopeRevisions:{'SQUAD:club-b':0}
    });
    check('Disjoint trainer scopes save against the same base world revision without conflict',
      Number(mpBSaved.revision)===Number(mpBase.revision)&&mpBSaved.scopeRevisions['SQUAD:club-b']===1,
      {revision:mpBSaved.revision,scopeRevisions:mpBSaved.scopeRevisions});

    await runtime.unloadWorld(mpWorld);
    const mpReload=await sessions.openWorld({userId:'uA',worldId:mpWorld});
    check('Disjoint trainer changes materialize together while the authoritative base revision stays stable',
      mpReload.worldRecord.gameState.squads['club-a'].tactics.pressing==='high'&&
      mpReload.worldRecord.gameState.squads['club-b'].tactics.tempo==='slow'&&
      Number(mpReload.revision)===Number(mpBase.revision),
      {revision:mpReload.revision,scopeRevisions:mpReload.scopeRevisions});

    const perfWorld='world-delta-chain';
    const perfRecord=makeWorldRecord(perfWorld,'perf');
    const perfCreated=await sessions.createWorld({userId:'perf',worldRecord:perfRecord,worldName:'Delta Chain',visibility:'PRIVATE',joinPolicy:'INVITE_ONLY'});
    let perfRevision=perfCreated.revision;
    const perfBase=await worlds.getManifest(perfWorld);
    const perfMilestones=[50,100,250,500];
    const perfColdLoadMs={};
    let chainWriteMs=0;
    let perfManifest=perfBase;
    let perfCold=null;
    for(let i=1;i<=perfMilestones[perfMilestones.length-1];i++){
      const d=delta(perfWorld,[{path:['gameState','squads','club-a','tactics','managementSequence'],value:i}]);
      const writeStart=Date.now();
      const saved=await sessions.saveManagementDelta({userId:'perf',worldId:perfWorld,worldDelta:d,expectedRevision:perfRevision});
      chainWriteMs+=Date.now()-writeStart;
      perfRevision=saved.revision;
      if(perfMilestones.includes(i)){
        perfManifest=await worlds.getManifest(perfWorld);
        await runtime.unloadWorld(perfWorld);
        const coldStart=Date.now();
        perfCold=await sessions.openWorld({userId:'perf',worldId:perfWorld});
        perfColdLoadMs[String(i)]=Date.now()-coldStart;
        check('Delta chain '+i+' reconstructs latest value without rewriting base snapshot',
          perfCold.worldRecord.gameState.squads['club-a'].tactics.managementSequence===i&&
          perfManifest.worldRecordPath===perfBase.worldRecordPath&&
          perfManifest.worldDeltaPaths.length===i,
          {deltaCount:i,coldLoadMs:perfColdLoadMs[String(i)]});
      }
    }
    check('500-delta chain keeps the base WorldRecord and reconstructs the authoritative final value',
      perfCold&&perfCold.worldRecord.gameState.squads['club-a'].tactics.managementSequence===500&&
      perfManifest.worldRecordPath===perfBase.worldRecordPath&&
      perfManifest.worldDeltaPaths.length===500,
      {deltaCount:perfManifest.worldDeltaPaths.length,coldLoadMs:perfColdLoadMs['500'],chainWriteMs});

    const app=await fs.readFile(path.resolve(__dirname,'..','src','app.bundle.js'),'utf8');
    const css=await fs.readFile(path.resolve(__dirname,'..','src','styles','app.css'),'utf8');
    let parseError=null;try{new Function(app);}catch(error){parseError=error;}
    check('Production browser bundle parses after Save Queue integration',!parseError,{error:parseError&&parseError.message});
    const queueStart=app.indexOf('function kf031QueueManagementSave(');
    const flushStart=app.indexOf('async function kf031FlushManagementSave(',queueStart);
    const queueSource=app.slice(queueStart,flushStart);
    check('Management save computes the delta inside the serialized queue and ACKs only the sent delta',
      queueSource.indexOf("KF029Remote.saveChain.catch(function(){}).then(async function(){")>=0&&
      queueSource.indexOf('var worldDelta=kf031BuildWorldDelta(record);')>queueSource.indexOf('.then(async function(){')&&
      queueSource.includes('kf031ApplyCommittedWorldDelta(worldDelta)')&&
      !queueSource.includes('KF029Remote.committedGameState=kf031CloneJson(record.gameState)'),
      {});
    const progressStart=app.indexOf('function kf029SaveProgressCheckpoint(');
    const snapshotStart=app.indexOf('function kf029SaveRemoteWorld(',progressStart);
    const progressSource=app.slice(progressStart,snapshotStart);
    check('Slot checkpoint also calculates its delta at queue execution and preserves post-request changes',
      progressSource.indexOf('var worldDelta=kf031BuildWorldDelta(record);')>progressSource.indexOf('.then(async function(){')&&
      progressSource.includes("kf031QueueManagementSave('post-checkpoint')")&&
      progressSource.includes('kf031ApplyCommittedWorldDelta(worldDelta)'),
      {});
    const readyStart=app.indexOf('async function kf031RequestReadyAndMaybeAdvance(');
    const readyEnd=app.indexOf('async function kf031EnsureMatchDetail(',readyStart);
    const readySource=app.slice(readyStart,readyEnd);
    check('Ready flushes the latest management state before sending the ready revision',
      readySource.indexOf("await kf031FlushManagementSave('ready')")>=0&&
      readySource.indexOf("'/ready'")>readySource.indexOf("await kf031FlushManagementSave('ready')"),
      {});
    check('Lineup drag/drop is dirty-tracked and final contract/transfer decisions are immediate Save Queue actions',
      app.includes("kf031MarkManagementDirty('lineup-drag',false)")&&
      app.includes("'player-contract-apply-offer':1")&&
      app.includes("'club-transfer-submit-offer':1")&&
      app.includes('KF031_IMMEDIATE_MANAGEMENT_ACTIONS'),
      {});
    check('Save failure keeps changes dirty and exposes explicit retry while Weiter has indeterminate pending styling',
      queueSource.includes('KF029Remote.managementFailed=true;')&&
      queueSource.includes('KF029Remote.managementDirty=true;')&&
      app.includes("action === 'kf-retry-management-save'")&&
      app.includes('is-save-pending')&&(css.includes('@keyframes kf031-save-sweep')||css.includes('.office-advance-btn.save-phase-saving::before')),
      {});
    check('Management autosave uses the delta endpoint and normal management path has no full-world snapshot call',
      queueSource.includes("'/management-delta'")&&!queueSource.includes("'/snapshot'"),
      {});
    check('Queued management save defers while a slot checkpoint is pending or failed',
      queueSource.includes('KF029Remote.checkpointPending || KF029Remote.checkpointFailed')&&
      queueSource.includes('return {deferred:true};'),
      {});
    check('Mail read state is tracked and modal/menu exits flush pending management changes',
      app.includes("'open-mail-center':1,'select-mail':1,'delete-mail':1,'delete-all-mail':1,'toggle-mail-read':1")&&
      app.includes("kf031FlushManagementSave('close-modal')")&&
      app.includes("var KF031_MANAGEMENT_VIEWS={office:1,squad:1,lineup:1,contracts:1,'squad-planning':1,finance:1,sponsoring:1};"),
      {});
    const claimedStart=app.indexOf('async function kf032AdvanceClaimedRound(');
    const claimedEnd=app.indexOf('function kf032ScheduleProgressPoll(',claimedStart);
    const claimedSource=app.slice(claimedStart,claimedEnd);
    check('Ready path is status-only in KF_0.32.0 and no longer mutates calendar state in the browser',
      claimedSource.includes('Der Browser ist nur Anzeige')&&
      !claimedSource.includes("kf029BaseHandleAction('office-advance'")&&
      !readySource.includes('kf032AdvanceClaimedRound(state,actionEl)'),
      {});

    report.metrics={
      fullBytes,
      lineupDeltaBytes:lineupBytes,
      lineupRatio:lineupBytes/fullBytes,
      contractDeltaBytes:Buffer.byteLength(JSON.stringify(contractDelta)),
      slotDeltaBytes:Buffer.byteLength(JSON.stringify(slotDelta)),
      deltaChainCount:perfManifest.worldDeltaPaths.length,
      deltaChainWriteMs:chainWriteMs,
      deltaChainColdLoadMs:perfColdLoadMs['500'],
      deltaChainColdLoadMsByCount:perfColdLoadMs
    };
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
