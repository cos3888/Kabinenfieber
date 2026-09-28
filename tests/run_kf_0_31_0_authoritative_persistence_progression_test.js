'use strict';

const fs=require('fs/promises');
const path=require('path');
const os=require('os');
const { LocalObjectStore }=require('../server/persistence/local-object-store');
const { FileMetadataRepository }=require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService }=require('../server/persistence/world-persistence-service');
const { WorldRuntimeManager }=require('../server/services/world-runtime-manager');
const { WorldSessionService }=require('../server/services/world-session-service');

const report={version:'0.31.0',passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}

function makeWorldRecord(worldId,userId){
  const players={byId:{},order:[]};
  for(let i=0;i<500;i++){
    const id='p'+i;
    players.order.push(id);
    players.byId[id]={id,clubId:i<250?'club-a':'club-b',fitness:8,form:8,morale:8,contract:{salaryBase:1,validUntilSeason:3}};
  }
  return {
    id:worldId,
    schemaVersion:'kf-world-record-0.27.2',
    gameVersion:'0.31.0',
    createdAt:new Date().toISOString(),
    createdByUserId:userId,
    creationRules:{startVariant:'classic',leagueConfiguration:'default',clubSelection:'manual'},
    runtimeSettings:{roundDurationHours:null},
    progression:{status:'waiting',deadlineAt:null,readyTrainerIds:[],lastHumanActivityAt:new Date().toISOString()},
    memberships:{byTrainerId:{'trainer-1':{
      trainerId:'trainer-1',userProfileId:userId,clubId:null,status:'active',
      joinedAt:new Date().toISOString(),lastActivityAt:new Date().toISOString(),trainerDisplayName:'Tester',role:'WORLD_ADMIN'
    }},order:['trainer-1']},
    gameState:{
      meta:{id:worldId,seasonNumber:1,schemaVersion:'kf-core-0.27.2'},
      clubs:{byId:{'club-a':{id:'club-a',name:'Club A'},'club-b':{id:'club-b',name:'Club B'}},order:['club-a','club-b']},
      players,
      squads:{'club-a':{playerIds:players.order.slice(0,250)},'club-b':{playerIds:players.order.slice(250)}},
      calendar:{currentSlotKey:'w0',fixtures:[{id:'f1',slotKey:'w1',status:'scheduled',homeClubId:'club-a',awayClubId:'club-b'}],slots:[]},
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},
      clubFinances:{byClub:{}}
    }
  };
}

function slotDelta(worldId){
  return {
    schemaVersion:'kf-world-delta-0.31.0',
    worldId,
    ops:[
      {path:['gameState','calendar','currentSlotKey'],value:'w1'},
      {path:['gameState','calendar','fixtures','0','status'],value:'played'},
      {path:['gameState','calendar','fixtures','0','playedMatchId'],value:'m1'},
      {path:['gameState','players','byId','p1','fitness'],value:7.2},
      {path:['gameState','history','matches','0'],value:{id:'m1',season:1,slotKey:'w1',status:'played',homeClubId:'club-a',awayClubId:'club-b',homeGoals:2,awayGoals:1,storageKind:'current-season-summary'}}
    ]
  };
}

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf0310-'));
  const metadata=new FileMetadataRepository({filePath:path.join(root,'metadata.json')});
  const worlds=new WorldPersistenceService({objectStore:new LocalObjectStore({rootDir:path.join(root,'objects')})});
  const runtime=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:60000});
  const sessions=new WorldSessionService({metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtime});

  try{
    const userId='u1', worldId='world-delta';
    const record=makeWorldRecord(worldId,userId);
    const created=await sessions.createWorld({userId,worldRecord:record,worldName:'Delta Welt',visibility:'PRIVATE',joinPolicy:'INVITE_ONLY'});
    const takeover=await sessions.assignClub({userId,worldId,clubId:'club-a',expectedRevision:created.revision});
    const beforeManifest=await worlds.getManifest(worldId);
    const delta=slotDelta(worldId);
    const match={id:'m1',season:1,slotKey:'w1',homeClubId:'club-a',awayClubId:'club-b',homeGoals:2,awayGoals:1,events:[{type:'goal',minute:12}],playerStats:[]};
    const finance={id:'salaryExpenseSeason',clubId:'club-a',seasonId:1,slotKey:'season_total',amount:-1,slotsApplied:1};

    const fullBytes=Buffer.byteLength(JSON.stringify((await sessions.openWorld({userId,worldId})).worldRecord));
    const deltaBytes=Buffer.byteLength(JSON.stringify(delta));
    const saved=await sessions.saveSlot({
      userId,worldId,worldDelta:delta,expectedRevision:takeover.revision,season:1,slotKey:'w1',
      matches:[match],financeEvents:[finance]
    });
    const afterManifest=await worlds.getManifest(worldId);

    check('Normal slot commit keeps the base world object and appends a world delta',
      beforeManifest.worldRecordPath===afterManifest.worldRecordPath&&
      Array.isArray(afterManifest.worldDeltaPaths)&&afterManifest.worldDeltaPaths.length===1,
      {before:beforeManifest.worldRecordPath,after:afterManifest.worldRecordPath,deltas:afterManifest.worldDeltaPaths});
    check('Delta payload is materially smaller than the full WorldRecord',
      deltaBytes<fullBytes*.1,{fullBytes,deltaBytes,ratio:deltaBytes/fullBytes});

    await runtime.unloadWorld(worldId);
    const cold=await sessions.openWorld({userId,worldId});
    check('Cold load reconstructs game state from base snapshot plus delta',
      cold.worldRecord.gameState.calendar.currentSlotKey==='w1'&&
      cold.worldRecord.gameState.calendar.fixtures[0].status==='played'&&
      cold.worldRecord.gameState.players.byId.p1.fitness===7.2&&
      cold.worldRecord.gameState.history.matches[0].id==='m1',
      {slot:cold.worldRecord.gameState.calendar.currentSlotKey});
    check('Opening a world no longer returns full current-season matches',
      Array.isArray(cold.matches)&&cold.matches.length===0,{matches:cold.matches.length});
    const loadedMatch=await sessions.loadMatchDetail({userId,worldId,matchId:'m1'});
    check('Full match is available lazily by match id',
      loadedMatch&&loadedMatch.id==='m1'&&Array.isArray(loadedMatch.events)&&loadedMatch.events.length===1);

    const originalLoad=worlds.loadWorldRecord.bind(worlds);
    worlds.loadWorldRecord=async()=>{throw new Error('Lobby must not load WorldRecord');};
    const lobby=await sessions.listWorlds(userId);
    worlds.loadWorldRecord=originalLoad;
    const lobbyRow=lobby.find(row=>row.worldId===worldId);
    check('Lobby is served from metadata projection without loading WorldRecord',
      lobbyRow&&lobbyRow.clubName==='Club A'&&lobbyRow.maxPlayers===2&&lobbyRow.isMember,
      {lobbyRow});

    const mpWorld='world-ready';
    const mpRecord=makeWorldRecord(mpWorld,'uA');
    const mpCreated=await sessions.createWorld({userId:'uA',worldRecord:mpRecord,worldName:'Ready Welt',visibility:'PUBLIC',joinPolicy:'OPEN'});
    await sessions.joinWorld({userId:'uB',displayName:'B',worldId:mpWorld});
    const mpManifest=await worlds.getManifest(mpWorld);
    const readyResults=await Promise.all([
      sessions.markReady({userId:'uA',worldId:mpWorld,expectedRevision:mpManifest.revision}),
      sessions.markReady({userId:'uB',worldId:mpWorld,expectedRevision:mpManifest.revision})
    ]);
    const winners=readyResults.filter(row=>row.shouldAdvance);
    check('Concurrent ready requests grant exactly one progress lease',
      winners.length===1&&winners[0].status==='PROCESSING'&&!!winners[0].leaseId,
      {readyResults});

    const winner=winners[0];
    const winningUser=readyResults[0].shouldAdvance?'uA':'uB';
    const mpDelta={schemaVersion:'kf-world-delta-0.31.0',worldId:mpWorld,ops:[{path:['gameState','calendar','currentSlotKey'],value:'w1'}]};
    const mpSaved=await sessions.saveSlot({
      userId:winningUser,worldId:mpWorld,worldDelta:mpDelta,expectedRevision:mpManifest.revision,season:1,slotKey:'w1',
      matches:[],financeEvents:[],progressLeaseId:winner.leaseId
    });
    const progression=await sessions.getProgression({userId:'uA',worldId:mpWorld});
    check('Successful leased slot commit advances revision and resets ready state',
      Number(progression.revision)===Number(mpSaved.revision)&&progression.status==='WAITING'&&(progression.readyUserIds||[]).length===0,
      {progression,mpSaved});

    report.metrics={fullBytes,deltaBytes,deltaRatio:deltaBytes/fullBytes,revision:saved.revision};
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
