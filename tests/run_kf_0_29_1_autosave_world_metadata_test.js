'use strict';

const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const { LocalObjectStore } = require('../server/persistence/local-object-store');
const { FileMetadataRepository } = require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService } = require('../server/persistence/world-persistence-service');
const { WorldRuntimeManager } = require('../server/services/world-runtime-manager');
const { WorldSessionService } = require('../server/services/world-session-service');

const report={version:'0.29.1',passed:true,checks:[]};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
async function rejects(fn,pattern){try{await fn();return false;}catch(error){return pattern.test(String(error&&error.message||''));}}

function makeWorldRecord(worldId,userId){
  return {
    id:worldId,
    schemaVersion:'kf-world-record-0.27.2',
    gameVersion:'0.29.1',
    createdAt:new Date().toISOString(),
    createdByUserId:userId,
    creationRules:{startVariant:'classic',leagueConfiguration:'default',clubSelection:'manual'},
    runtimeSettings:{roundDurationHours:null},
    progression:{status:'waiting',deadlineAt:null,readyTrainerIds:[],lastHumanActivityAt:new Date().toISOString()},
    memberships:{
      byTrainerId:{
        'trainer-1':{trainerId:'trainer-1',userProfileId:userId,clubId:'club-a',status:'active',joinedAt:new Date().toISOString(),lastActivityAt:new Date().toISOString(),trainerDisplayName:'Tester'}
      },
      order:['trainer-1']
    },
    gameState:{
      meta:{id:worldId,seasonNumber:1,schemaVersion:'kf-core-0.27.2'},
      clubs:{byId:{'club-a':{id:'club-a',name:'Club A'}},order:['club-a']},
      players:{byId:{},order:[]},
      squads:{},
      calendar:{currentSlotKey:'w1-middle',fixtures:[],slots:[]},
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},
      clubFinances:{byClub:{}}
    }
  };
}

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf0291-'));
  const metadata=new FileMetadataRepository({filePath:path.join(root,'metadata.json')});
  const worlds=new WorldPersistenceService({objectStore:new LocalObjectStore({rootDir:path.join(root,'objects')})});
  const runtime=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:60000});
  const sessions=new WorldSessionService({metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtime});
  const userId='user-0291';

  check('New world without a name is rejected',
    await rejects(()=>sessions.createWorld({userId,worldRecord:makeWorldRecord('unnamed',userId)}),/World name must contain 3-40 characters/));

  check('Unsupported access combination is rejected',
    await rejects(()=>sessions.createWorld({
      userId,worldRecord:makeWorldRecord('bad-access',userId),worldName:'Falsche Welt',visibility:'PRIVATE',joinPolicy:'OPEN'
    }),/Unsupported world visibility/));

  const created=await sessions.createWorld({
    userId,
    worldRecord:makeWorldRecord('world-0291',userId),
    worldName:'  Nordlicht   Karriere  ',
    visibility:'PUBLIC',
    joinPolicy:'APPLICATION'
  });
  const meta=await metadata.getWorld('world-0291');
  check('World registry is the only source for name and access policy',
    meta.worldName==='Nordlicht Karriere'&&meta.visibility==='PUBLIC'&&meta.joinPolicy==='APPLICATION'&&
    !Object.prototype.hasOwnProperty.call(created.worldRecord,'worldName'));

  const listed=await sessions.listWorlds(userId);
  check('World list exposes name and join policy without loading them into WorldRecord',
    listed.length===1&&listed[0].worldName==='Nordlicht Karriere'&&listed[0].visibility==='PUBLIC'&&listed[0].joinPolicy==='APPLICATION');

  const changed=JSON.parse(JSON.stringify(created.worldRecord));
  changed.gameState.calendar.currentSlotKey='w5-end';
  changed.gameState.meta.seasonNumber=2;
  const saved=await sessions.saveWorld({
    userId,
    worldId:'world-0291',
    worldRecord:changed,
    expectedRevision:created.revision,
    matches:[{id:'match-checkpoint',season:2,events:[{type:'goal'}]}],
    financeEvents:[{id:'finance-checkpoint',clubId:'club-a',seasonId:2,type:'salaryExpense',amount:-10}]
  });
  await runtime.unloadWorld('world-0291');
  const reopened=await sessions.openWorld({userId,worldId:'world-0291'});
  check('Committed calendar checkpoint reloads at the exact saved slot and season',
    saved.currentSeason===2&&reopened.worldRecord.gameState.calendar.currentSlotKey==='w5-end'&&
    reopened.worldRecord.gameState.meta.seasonNumber===2&&reopened.matches[0].id==='match-checkpoint'&&
    reopened.financeEvents[0].id==='finance-checkpoint');

  const app=await fs.readFile(path.join(__dirname,'..','src','app.bundle.js'),'utf8');
  check('Browser uses confirmed normal-slot checkpoints plus quick-sim and debounced decision autosave',
    app.includes("kf029CommitHardCheckpoint('calendar-slot')")&&
    app.includes("kf029CommitHardCheckpoint('calendar-simulation-checkpoint')")&&
    app.includes('KF029_AUTOSAVE_DEBOUNCE_MS = 1400'));

  check('Manual save control was removed from the browser UI',
    !app.includes('data-action="kf-save-world"')&&!app.includes("kf029SaveRemoteWorld('manual')"));

  check('Named-world dialog exposes all three planned access modes',
    app.includes('PRIVATE:INVITE_ONLY')&&app.includes('PUBLIC:APPLICATION')&&app.includes('PUBLIC:OPEN'));

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
