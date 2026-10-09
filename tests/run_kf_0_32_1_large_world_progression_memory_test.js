'use strict';

// Synthetic allocation-pressure regression. It does not replace testing real GCS saves.
const cp=require('child_process');
const { HeadlessProgressionEngine }=require('../server/services/headless-progression-engine');

if (process.argv[2] === '--child') {
  const worldId='world-memory-pressure';
  const players={};
  for(let i=0;i<12000;i++){
    const id='p-'+i;
    players[id]={id,name:'Testplayer '+i,age:20+(i%18),position:'CM',overall:58+(i%40),
      attributes:{pace:50,stamina:60,strength:45,passing:63,shooting:40,defending:45},
      fitness:85,morale:70};
  }
  const record={
    id:worldId,schemaVersion:'kf-world-record-0.27.2',gameVersion:'0.32.1',
    createdAt:new Date(0).toISOString(),createdByUserId:'u1',
    runtimeSettings:{roundTimeModel:'COUNTDOWN',roundDurationSeconds:600,timezone:'Europe/Berlin'},
    memberships:{byTrainerId:{a:{trainerId:'a',userProfileId:'u1',clubId:'club-a',status:'active',role:'WORLD_ADMIN'}},order:['a']},
    gameState:{
      meta:{id:worldId,seasonNumber:1,schemaVersion:'kf-core-0.27.2',createdAt:new Date(0).toISOString()},
      clubs:{byId:{'club-a':{id:'club-a',name:'Club A',leagueKey:'test'},
                   'club-b':{id:'club-b',name:'Club B',leagueKey:'test'}},order:['club-a','club-b']},
      players:{byId:players,order:Object.keys(players)},
      squads:{'club-a':{playerIds:[],tactics:{}},'club-b':{playerIds:[],tactics:{}}},
      calendar:{currentSlotKey:'s0',slots:[
        {key:'s0',week:1,phase:'Anfang',label:'Slot 1',competition:null},
        {key:'s1',week:1,phase:'Mitte',label:'Slot 2',competition:null}
      ],fixtures:[],nationalCupDraws:{byKey:{},byId:{},order:[]},fieberCupDraws:{byKey:{},byId:{},order:[]}},
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{},
        memoryPressureArchive:'x'.repeat(32*1024*1024)},
      clubFinances:{byClub:{'club-a':{cash:0},'club-b':{cash:0}}},
      clubMailboxes:{byClub:{}},transfers:{},scouting:{},negotiations:{}
    }
  };
  const heapBefore=process.memoryUsage().heapUsed;
  const started=Date.now();
  const result=new HeadlessProgressionEngine().run({
    worldRecord:record,matches:[],financeEvents:[],progressionRunId:'test-memory-1'
  });
  const usage=process.memoryUsage();
  const maxRss=process.resourceUsage().maxRSS * 1024;
  if (!result||!result.advanceResult||!result.advanceResult.advanced||
      result.worldRecord.gameState.calendar.currentSlotKey!=='s1'||
      result.worldRecord.gameState.history.memoryPressureArchive.length!==32*1024*1024){
    throw new Error('memory_pressure_progression_failed');
  }
  process.stdout.write(JSON.stringify({
    ok:true,playerCount:12000,archiveMiB:32,
    elapsedMs:Date.now()-started,heapBeforeMiB:Math.round(heapBefore/1048576),
    heapAfterMiB:Math.round(usage.heapUsed/1048576),
    maxRssMiB:Math.round(maxRss/1048576),heapLimitMiB:640
  })+'\n');
} else {
  const p=cp.spawnSync(process.execPath,['--max-old-space-size=640',__filename,'--child'],{
    encoding:'utf8',timeout:120000,maxBuffer:1024*1024
  });
  if(p.status!==0||p.error){
    process.stderr.write((p.stderr||'').slice(-5000)+'\n');
    throw new Error('headless_memory_pressure_regression_failed: '+String(p.error||p.status));
  }
  process.stdout.write(p.stdout);
}
