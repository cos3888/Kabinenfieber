'use strict';

const fs=require('fs/promises');
const path=require('path');
const os=require('os');
const { LocalObjectStore }=require('../server/persistence/local-object-store');
const { FileMetadataRepository }=require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService }=require('../server/persistence/world-persistence-service');
const { WorldRuntimeManager }=require('../server/services/world-runtime-manager');
const { WorldSessionService }=require('../server/services/world-session-service');
const { voteSummary }=require('../server/domain/round-settings');

const report={version:'0.32.0',passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}

function world(worldId,userId,runtimeSettings){
  const now=new Date().toISOString();
  return {
    id:worldId,
    schemaVersion:'kf-world-record-0.27.2',
    gameVersion:'0.32.0',
    createdAt:now,
    createdByUserId:userId,
    creationRules:{startVariant:'classic',leagueConfiguration:'default',clubSelection:'manual'},
    runtimeSettings:runtimeSettings==null?{roundDurationHours:null}:runtimeSettings,
    memberships:{byTrainerId:{'trainer-a':{
      trainerId:'trainer-a',userProfileId:userId,clubId:'club-a',status:'active',
      joinedAt:now,lastActivityAt:now,trainerDisplayName:'Admin',role:'WORLD_ADMIN'
    }},order:['trainer-a']},
    gameState:{
      meta:{id:worldId,seasonNumber:1,schemaVersion:'kf-core-0.27.2',createdAt:now},
      clubs:{
        byId:{
          'club-a':{id:'club-a',name:'Club A',leagueKey:'test'},
          'club-b':{id:'club-b',name:'Club B',leagueKey:'test'}
        },
        order:['club-a','club-b']
      },
      players:{byId:{},order:[]},
      squads:{'club-a':{playerIds:[],tactics:{}},'club-b':{playerIds:[],tactics:{}}},
      calendar:{
        currentSlotKey:'s0',
        slots:[
          {key:'s0',week:1,phase:'Anfang',label:'Slot 1',competition:null},
          {key:'s1',week:1,phase:'Mitte',label:'Slot 2',competition:null},
          {key:'s2',week:1,phase:'Ende',label:'Slot 3',competition:null},
          {key:'s3',week:2,phase:'Anfang',label:'Slot 4',competition:null},
          {key:'s4',week:2,phase:'Mitte',label:'Slot 5',competition:null}
        ],
        fixtures:[],
        nationalCupDraws:{byKey:{},byId:{},order:[]},
        fieberCupDraws:{byKey:{},byId:{},order:[]}
      },
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},
      clubFinances:{byClub:{'club-a':{cash:0},'club-b':{cash:0}}},
      clubMailboxes:{byClub:{}},
      transfers:{},scouting:{},negotiations:{}
    }
  };
}

function engine(counter){
  return {
    run(payload){
      counter.calls+=1;
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
}

async function createHarness(root){
  const metadata=new FileMetadataRepository({filePath:path.join(root,'metadata.json')});
  const worlds=new WorldPersistenceService({objectStore:new LocalObjectStore({rootDir:path.join(root,'objects')})});
  const runtime=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:60000});
  const counter={calls:0};
  const sessions=new WorldSessionService({
    metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtime,progressionEngine:engine(counter)
  });
  return {metadata,worlds,runtime,sessions,counter};
}

(async()=>{
  const majorityCases=[
    [1,1],[2,2],[3,2],[4,3],[5,4],[6,4],[10,7]
  ];
  majorityCases.forEach(([cast,required])=>{
    const votes={};
    for(let i=0;i<cast;i+=1)votes['u'+i]=i<required?'YES':'NO';
    const summary=voteSummary({votesByUserId:votes});
    check('2/3 majority boundary '+cast+' votes requires '+required+' YES',
      summary.requiredYes===required&&summary.yes===required&&summary.passed,
      summary);
  });
  const nonVoters=voteSummary({votesByUserId:{admin:'YES'}},Array.from({length:18},(_,i)=>i===0?'admin':'u'+i));
  check('Offline and non-voting trainers do not increase the majority denominator',
    nonVoters.cast===1&&nonVoters.requiredYes===1&&nonVoters.passed&&nonVoters.notVoted===17,
    nonVoters);

  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf0320-round-settings-'));
  try{
    const {metadata,worlds,sessions,counter}=await createHarness(root);

    // A legacy world is always playable alone, even without rhythm settings.
    const legacyId='world-legacy-rhythm';
    const legacyCreated=await sessions.createWorld({
      userId:'admin-legacy',
      worldRecord:world(legacyId,'admin-legacy',null),
      worldName:'Legacy Rhythm',
      visibility:'PUBLIC',
      joinPolicy:'OPEN'
    });
    const legacyOpen=await sessions.openWorld({userId:'admin-legacy',worldId:legacyId});
    check('Legacy solo world never requires rhythm setup',
      legacyOpen.roundState.roundSetupRequired===false&&legacyOpen.roundState.coordinationEnabled===false&&legacyOpen.roundState.timeModel===null,
      {roundState:legacyOpen.roundState});
    const soloReady=await sessions.markReady({
      userId:'admin-legacy',worldId:legacyId,expectedRevision:legacyCreated.revision,roundGeneration:1
    });
    const soloAdvanced=await sessions.openWorld({userId:'admin-legacy',worldId:legacyId});
    check('Legacy solo Weiter advances immediately without a time model',
      soloReady.status==='OPEN'&&soloAdvanced.worldRecord.gameState.calendar.currentSlotKey==='s1'&&soloAdvanced.roundGeneration===2,
      {roundState:soloAdvanced.roundState});

    const legacyJoined=await sessions.joinWorld({userId:'legacy-player',displayName:'Player',worldId:legacyId});
    const unassigned=await sessions.openWorld({userId:'admin-legacy',worldId:legacyId});
    check('Joined but unassigned human leaves solo progress available',
      unassigned.roundState.coordinationEnabled===false&&unassigned.roundState.roundSetupPending===true&&
      unassigned.roundState.roundSetupRequired===false,
      {roundState:unassigned.roundState});
    const assignedLegacy=await sessions.assignClub({
      userId:'legacy-player',worldId:legacyId,clubId:'club-b',expectedRevision:legacyJoined.revision
    });
    const multiplayerNeedsSetup=await sessions.openWorld({userId:'admin-legacy',worldId:legacyId});
    check('Second assigned manager activates mandatory initial rhythm setup',
      multiplayerNeedsSetup.roundState.coordinationEnabled===true&&multiplayerNeedsSetup.roundState.roundSetupRequired===true,
      {roundState:multiplayerNeedsSetup.roundState});
    let nonAdminSetupError=null;
    try{
      await sessions.initializeRoundSettings({
        userId:'legacy-player',worldId:legacyId,expectedRevision:assignedLegacy.revision,
        settings:{roundTimeModel:'COUNTDOWN',roundDurationSeconds:86400,timezone:'Europe/Berlin'}
      });
    }catch(error){nonAdminSetupError=error;}
    check('Non-admin cannot perform initial rhythm setup',
      !!nonAdminSetupError&&/world admin/i.test(String(nonAdminSetupError.message||'')),
      {error:nonAdminSetupError&&nonAdminSetupError.message});
    let readyBeforeSetupError=null;
    try{
      await sessions.markReady({
        userId:'admin-legacy',worldId:legacyId,expectedRevision:assignedLegacy.revision,roundGeneration:2
      });
    }catch(error){readyBeforeSetupError=error;}
    check('Coordinated world cannot advance before initial setup',
      !!readyBeforeSetupError&&/initial setup/i.test(String(readyBeforeSetupError.message||'')),
      {error:readyBeforeSetupError&&readyBeforeSetupError.message});
    const initialized=await sessions.initializeRoundSettings({
      userId:'admin-legacy',worldId:legacyId,expectedRevision:assignedLegacy.revision,
      settings:{roundTimeModel:'COUNTDOWN',roundDurationSeconds:86400,timezone:'Europe/Berlin'}
    });
    const legacyAfter=await sessions.openWorld({userId:'admin-legacy',worldId:legacyId});
    check('Admin initial setup writes runtimeSettings directly without creating a vote',
      legacyAfter.worldRecord.runtimeSettings.roundTimeModel==='COUNTDOWN'&&
      legacyAfter.worldRecord.runtimeSettings.roundDurationSeconds===86400&&
      legacyAfter.roundState.roundSetupRequired===false&&
      legacyAfter.roundState.pendingRoundSettingsChange==null,
      {initialized,roundState:legacyAfter.roundState});
    check('Initial COUNTDOWN setup does not start a countdown',
      legacyAfter.roundState.deadlineAt==null&&(legacyAfter.roundState.readyUserIds||[]).length===0,
      {roundState:legacyAfter.roundState});

    // Configured multiplayer world: proposal in slot 1, evaluate on 2 -> 3, apply later in slot 4.
    const worldId='world-rhythm-vote';
    const created=await sessions.createWorld({
      userId:'admin',
      worldRecord:world(worldId,'admin',{roundTimeModel:'COUNTDOWN',roundDurationSeconds:600,timezone:'Europe/Berlin'}),
      worldName:'Rhythm Vote',
      visibility:'PUBLIC',
      joinPolicy:'OPEN'
    });
    const joined=await sessions.joinWorld({userId:'player',displayName:'Player',worldId});
    const assigned=await sessions.assignClub({userId:'player',worldId,clubId:'club-b',expectedRevision:joined.revision});

    let playerProposalError=null;
    try{
      await sessions.proposeRoundSettingsChange({
        userId:'player',worldId,
        settings:{roundTimeModel:'FIXED_SCHEDULE',fixedScheduleWeekdays:[1,3,5],fixedScheduleTime:'20:00',timezone:'Europe/Berlin'}
      });
    }catch(error){playerProposalError=error;}
    check('Only WORLD_ADMIN may propose a later rhythm change',
      !!playerProposalError&&/world admin/i.test(String(playerProposalError.message||'')),
      {error:playerProposalError&&playerProposalError.message});

    let earlyEffectiveError=null;
    try{
      await sessions.proposeRoundSettingsChange({
        userId:'admin',worldId,
        settings:{roundTimeModel:'FIXED_SCHEDULE',fixedScheduleWeekdays:[1,3,5],fixedScheduleTime:'20:00',timezone:'Europe/Berlin'},
        evaluationRoundGeneration:2,effectiveRoundGeneration:2
      });
    }catch(error){earlyEffectiveError=error;}
    check('Effective slot cannot precede the end of the vote',
      !!earlyEffectiveError&&/cannot become effective/i.test(String(earlyEffectiveError.message||'')),
      {error:earlyEffectiveError&&earlyEffectiveError.message});

    const proposed=await sessions.proposeRoundSettingsChange({
      userId:'admin',worldId,
      settings:{roundTimeModel:'FIXED_SCHEDULE',fixedScheduleWeekdays:[1,3,5],fixedScheduleTime:'20:00',timezone:'Europe/Berlin'},
      evaluationRoundGeneration:2,effectiveRoundGeneration:4
    });
    check('Admin proposal starts in VOTING with automatic YES and minimum full-slot delay',
      proposed.pendingRoundSettingsChange&&
      proposed.pendingRoundSettingsChange.status==='VOTING'&&
      proposed.pendingRoundSettingsChange.proposedAtRoundGeneration===1&&
      proposed.pendingRoundSettingsChange.earliestEvaluationRoundGeneration===2&&
      proposed.pendingRoundSettingsChange.voteSummary.yes===1&&
      proposed.pendingRoundSettingsChange.voteSummary.cast===1,
      {proposal:proposed.pendingRoundSettingsChange});

    // Player deliberately does not vote. They still count only as informative "not voted".
    check('Unassigned/offline/non-voters are informative only',
      proposed.pendingRoundSettingsChange.voteSummary.notVoted===1&&
      proposed.pendingRoundSettingsChange.voteSummary.requiredYes===1,
      proposed.pendingRoundSettingsChange.voteSummary);

    // Slot 1 -> 2: vote must still be running.
    let currentRevision=assigned.revision;
    let r=await sessions.markReady({userId:'admin',worldId,expectedRevision:currentRevision,roundGeneration:1});
    r=await sessions.markReady({userId:'player',worldId,expectedRevision:currentRevision,roundGeneration:1});
    let opened=await sessions.openWorld({userId:'admin',worldId});
    currentRevision=opened.revision;
    check('Proposal is not evaluated on the first transition after creation',
      opened.roundGeneration===2&&
      opened.roundState.pendingRoundSettingsChange&&
      opened.roundState.pendingRoundSettingsChange.status==='VOTING'&&
      opened.worldRecord.runtimeSettings.roundTimeModel==='COUNTDOWN',
      {roundGeneration:opened.roundGeneration,pending:opened.roundState.pendingRoundSettingsChange});

    // Slot 2 -> 3: earliest evaluation happens now, but configured later effect keeps old truth.
    await sessions.markReady({userId:'admin',worldId,expectedRevision:currentRevision,roundGeneration:2});
    await sessions.markReady({userId:'player',worldId,expectedRevision:currentRevision,roundGeneration:2});
    opened=await sessions.openWorld({userId:'admin',worldId});
    currentRevision=opened.revision;
    check('Vote evaluates on transition 2 -> 3 and passes from actually cast votes',
      opened.roundGeneration===3&&
      opened.roundState.pendingRoundSettingsChange&&
      opened.roundState.pendingRoundSettingsChange.status==='APPROVED'&&
      opened.roundState.pendingRoundSettingsChange.decisionSummary.cast===1&&
      opened.roundState.pendingRoundSettingsChange.decisionSummary.yes===1,
      {pending:opened.roundState.pendingRoundSettingsChange});
    check('Approved future change does not replace current runtimeSettings early',
      opened.worldRecord.runtimeSettings.roundTimeModel==='COUNTDOWN'&&
      opened.roundState.timeModel==='COUNTDOWN',
      {runtimeSettings:opened.worldRecord.runtimeSettings,roundState:opened.roundState});

    // Slot 3 -> 4: apply atomically with the authoritative progression snapshot.
    await sessions.markReady({userId:'admin',worldId,expectedRevision:currentRevision,roundGeneration:3});
    await sessions.markReady({userId:'player',worldId,expectedRevision:currentRevision,roundGeneration:3});
    opened=await sessions.openWorld({userId:'admin',worldId});
    check('Approved rhythm becomes authoritative exactly at the requested effective slot',
      opened.roundGeneration===4&&
      opened.worldRecord.runtimeSettings.roundTimeModel==='FIXED_SCHEDULE'&&
      opened.worldRecord.runtimeSettings.fixedScheduleTime==='20:00'&&
      opened.roundState.timeModel==='FIXED_SCHEDULE'&&
      opened.roundState.pendingRoundSettingsChange==null&&
      opened.roundState.lastRoundSettingsDecision&&
      opened.roundState.lastRoundSettingsDecision.status==='APPLIED',
      {runtimeSettings:opened.worldRecord.runtimeSettings,roundState:opened.roundState});
    check('Three slot transitions produced exactly three authoritative progression effects',
      counter.calls===3,
      {engineCalls:counter.calls});

    const metadataWorld=await metadata.getWorld(worldId);
    check('Lobby round fields remain projection of WorldRecord.runtimeSettings',
      metadataWorld.roundConfigured===true&&
      metadataWorld.roundTimeModel==='FIXED_SCHEDULE'&&
      metadataWorld.fixedScheduleTime==='20:00',
      metadataWorld);

    const beforeParallel=counter.calls;
    await Promise.all(Array.from({length:8},()=>sessions.runDueProgression({worldId})));
    const afterParallel=await sessions.openWorld({userId:'admin',worldId});
    check('Parallel wakes after applying settings do not replay the effective change',
      counter.calls===beforeParallel&&afterParallel.roundGeneration===4&&
      afterParallel.worldRecord.runtimeSettings.roundTimeModel==='FIXED_SCHEDULE',
      {beforeParallel,afterParallel:counter.calls,roundGeneration:afterParallel.roundGeneration});

    report.metrics={engineCalls:counter.calls,checks:report.checks.length};
  }finally{
    await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
