'use strict';

const cp=require('child_process');
const fs=require('fs/promises');
const os=require('os');
const path=require('path');
const { LocalObjectStore }=require('../server/persistence/local-object-store');
const { WorldPersistenceService }=require('../server/persistence/world-persistence-service');

const DELTA_SCHEMA='kf-world-delta-0.31.0';
const DELTA_COUNT=48;
const PAYLOAD_BYTES=2*1024*1024;
const CHILD_HEAP_MB=72;

function makeWorldRecord(worldId){
  return{
    id:worldId,
    createdAt:new Date(0).toISOString(),
    createdByUserId:'u1',
    memberships:{byTrainerId:{}},
    gameState:{
      meta:{id:worldId,seasonNumber:1,version:'0.31.4'},
      players:{byId:{}},
      clubs:{byId:{}},
      squads:{'club-a':{tactics:{memoryPayload:'base'}}},
      calendar:{currentSlotKey:'w0',fixtures:[],slots:[]},
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},
      clubFinances:{byClub:{}}
    }
  };
}

function makeDelta(worldId,index){
  return{
    schemaVersion:DELTA_SCHEMA,
    worldId,
    ops:[{
      path:['gameState','squads','club-a','tactics','memoryPayload'],
      value:String(index).padStart(3,'0')+':'+('x'.repeat(PAYLOAD_BYTES))
    }]
  };
}

async function childMain(root,worldId){
  const store=new LocalObjectStore({rootDir:path.join(root,'objects')});
  const worlds=new WorldPersistenceService({
    objectStore:store,
    readConcurrency:8,
    deltaCompactionThreshold:100000
  });
  const started=Date.now();
  const loaded=await worlds.loadWorldRecord(worldId);
  const loadMs=Date.now()-started;
  const value=loaded.gameState.squads['club-a'].tactics.memoryPayload;
  if(!value.startsWith('047:')||value.length!==PAYLOAD_BYTES+4){
    throw new Error('delta_order_or_reconstruction_mismatch');
  }
  const integrityStarted=Date.now();
  const integrity=await worlds.inspectWorldIntegrity(worldId);
  const integrityMs=Date.now()-integrityStarted;
  if(!integrity.healthy||!integrity.worldRecordReconstructable||integrity.worldDeltaCount!==DELTA_COUNT){
    throw new Error('large_world_integrity_failed');
  }
  process.stdout.write(JSON.stringify({
    ok:true,
    deltaCount:DELTA_COUNT,
    payloadBytesPerDelta:PAYLOAD_BYTES,
    loadMs,
    integrityMs,
    heapUsed:process.memoryUsage().heapUsed,
    rss:process.memoryUsage().rss
  }));
}

async function parentMain(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf0314-memory-'));
  const worldId='world-large-memory';
  try{
    const store=new LocalObjectStore({rootDir:path.join(root,'objects')});
    const worlds=new WorldPersistenceService({
      objectStore:store,
      readConcurrency:8,
      deltaCompactionThreshold:100000
    });
    let manifest=await worlds.initializeWorld({worldRecord:makeWorldRecord(worldId)});
    for(let i=0;i<DELTA_COUNT;i++){
      manifest=await worlds.commitWorldDelta({
        worldId,
        expectedRevision:manifest.revision,
        worldDelta:makeDelta(worldId,i)
      });
    }
    if(manifest.worldDeltaPaths.length!==DELTA_COUNT){
      throw new Error('fixture_delta_chain_length_mismatch');
    }

    const child=cp.spawnSync(
      process.execPath,
      ['--max-old-space-size='+CHILD_HEAP_MB,__filename,'--child',root,worldId],
      {encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024}
    );
    if(child.status!==0||child.error){
      console.error(JSON.stringify({
        passed:false,
        childStatus:child.status,
        childError:child.error?String(child.error):null,
        stderr:(child.stderr||'').slice(-8000),
        stdout:(child.stdout||'').slice(-2000),
        heapLimitMb:CHILD_HEAP_MB,
        deltaCount:DELTA_COUNT,
        payloadBytesPerDelta:PAYLOAD_BYTES
      },null,2));
      process.exit(1);
    }
    const metrics=JSON.parse(child.stdout||'{}');
    console.log(JSON.stringify({
      suite:'KF_0.31.4 Large World Memory Reconstruction',
      passed:true,
      heapLimitMb:CHILD_HEAP_MB,
      ...metrics
    },null,2));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(process.argv[2]==='--child'){
  childMain(process.argv[3],process.argv[4]).catch(error=>{console.error(error);process.exit(1);});
}else{
  parentMain().catch(error=>{console.error(error);process.exit(1);});
}
