'use strict';

const fs=require('fs');
const fsp=require('fs/promises');
const os=require('os');
const path=require('path');
const vm=require('vm');
const { FileMetadataRepository }=require('../server/persistence/file-metadata-repository');
const { LocalObjectStore }=require('../server/persistence/local-object-store');
const { WorldPersistenceService }=require('../server/persistence/world-persistence-service');
const { WorldRuntimeManager }=require('../server/services/world-runtime-manager');
const { WorldSessionService }=require('../server/services/world-session-service');

const root=path.resolve(__dirname,'..');
const report={version:'0.31.2',passed:true,checks:[]};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}

function makeRecord(id,userId){
  const trainerId='trainer-'+id;
  return {
    id,
    schemaVersion:'kf-world-record-0.27.2',
    gameVersion:'0.31.2',
    createdAt:new Date().toISOString(),
    createdByUserId:userId,
    creationRules:{startVariant:'classic',leagueConfiguration:'default',clubSelection:'manual'},
    progression:{status:'waiting',deadlineAt:null,readyTrainerIds:[],lastHumanActivityAt:new Date().toISOString()},
    memberships:{
      byTrainerId:{
        [trainerId]:{
          trainerId,
          userProfileId:userId,
          clubId:'club-a',
          status:'active',
          joinedAt:new Date().toISOString(),
          lastActivityAt:new Date().toISOString(),
          trainerDisplayName:'Tester',
          role:'WORLD_ADMIN'
        }
      },
      order:[trainerId]
    },
    gameState:{
      meta:{id,seasonNumber:1},
      clubs:{byId:{'club-a':{id:'club-a',name:'Club A'},'club-b':{id:'club-b',name:'Club B'}},order:['club-a','club-b']},
      squads:{'club-a':{playerIds:[]},'club-b':{playerIds:[]}},
      players:{byId:{},order:[]},
      calendar:{currentSlotKey:null,slots:[],fixtures:[]},
      history:{matches:[]}
    }
  };
}

class FakeElement{
  constructor(id=''){
    this.id=id;this.nodeType=1;this.innerHTML='';this.style={};this.dataset={};this.children=[];this.parentNode=null;
    this.tBodies=[];this.tagName='DIV';this.textContent='';this.value='';this.checked=false;
    this.classList={add(){},remove(){},contains(){return false;}};
  }
  addEventListener(){} removeEventListener(){} setAttribute(k,v){this[k]=v;} getAttribute(k){return this[k]||null;}
  removeAttribute(k){delete this[k];} closest(){return null;} querySelectorAll(){return [];} querySelector(){return null;}
  getBoundingClientRect(){return{width:1760,height:990};} appendChild(c){this.children.push(c);c.parentNode=this;return c;}
}

function loadBrowserTestHarness(){
  const elements={'app-root':new FakeElement('app-root'),'modal-root':new FakeElement('modal-root'),'app-shell':new FakeElement('app-shell'),'sim-progress-text':new FakeElement('sim-progress-text')};
  const document={
    readyState:'loading',
    documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},
    body:new FakeElement('body'),
    getElementById(id){return elements[id]||null;},
    addEventListener(type,cb){if(type==='DOMContentLoaded')this._domReady=cb;},
    removeEventListener(){},
    createElement(tag){const el=new FakeElement();el.tagName=String(tag||'div').toUpperCase();return el;},
    querySelectorAll(){return[];},querySelector(){return null;}
  };
  const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame(cb){return cb();},cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:FakeElement,navigator:{userAgent:'node-test'},localStorage:{getItem(){return null;},setItem(){},removeItem(){}}};
  const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:FakeElement,navigator:windowObj.navigator});
  function runFile(file){vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});}
  runFile('src/static-data.js');
  try{runFile('src/db1-db2-data.js');}catch(_){}
  let appCode=fs.readFileSync(path.join(root,'src/app.bundle.js'),'utf8');
  const injection="\n  window.KF0312Test={AppState:AppState,startNewCareer:startNewCareer,buildSimulatedLineup:buildSimulatedLineup,ensureLineupMaskState:ensureLineupMaskState,ensureSquadTactics:ensureSquadTactics,handleAction:handleAction};\n";
  appCode=appCode.replace(/\n  function boot\(\)\{/,injection+'\n  function boot(){');
  vm.runInContext(appCode,context,{filename:'src/app.bundle.js'});
  if(document._domReady)document._domReady();
  return windowObj.KF0312Test;
}

(async()=>{
  const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'kf-0312-'));
  const metadataPath=path.join(temp,'metadata.json');
  const metadata=new FileMetadataRepository({filePath:metadataPath});
  const store=new LocalObjectStore({rootDir:path.join(temp,'objects')});
  const worlds=new WorldPersistenceService({objectStore:store});
  const runtime=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:60000});
  const sessions=new WorldSessionService({metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtime});

  try{
    const record=makeRecord('world-lobby-repair','user-a');
    await sessions.createWorld({userId:'user-a',worldRecord:record,worldName:'Lobby Repair',visibility:'PRIVATE',joinPolicy:'INVITE_ONLY'});

    await metadata._mutate(data=>{
      const row=Object.values(data.participationIndex).find(entry=>entry&&entry.worldId==='world-lobby-repair'&&entry.userId==='user-a');
      row.clubId=null;
      delete row.projectionUpdatedAt;
      const world=data.worlds['world-lobby-repair'];
      delete world.projectionUpdatedAt;
      delete world.clubNamesById;
      delete world.currentSeason;
      delete world.maxPlayers;
      return true;
    });

    const listed=await sessions.listWorlds('user-a');
    const lobby=listed.find(row=>row.worldId==='world-lobby-repair');
    const repaired=await metadata.getParticipation({worldId:'world-lobby-repair',userId:'user-a'});
    check('Legacy lobby projection repairs club assignment from WorldRecord.memberships',
      lobby&&lobby.membership&&lobby.membership.clubId==='club-a'&&lobby.clubName==='Club A'&&repaired&&repaired.clubId==='club-a'&&!!repaired.projectionUpdatedAt,
      {lobbyClub:lobby&&lobby.membership&&lobby.membership.clubId,clubName:lobby&&lobby.clubName,repairedClub:repaired&&repaired.clubId});

    await metadata.setParticipationProjection({worldId:'world-lobby-repair',userId:'user-a',trainerId:repaired.trainerId,clubId:null,role:repaired.role,trainerDisplayName:repaired.trainerDisplayName});
    const staleButTimestamped=await metadata.getParticipation({worldId:'world-lobby-repair',userId:'user-a'});
    check('Test setup can represent a timestamped stale projection',staleButTimestamped.clubId===null&&!!staleButTimestamped.projectionUpdatedAt,{clubId:staleButTimestamped.clubId});
    await sessions.openWorld({userId:'user-a',worldId:'world-lobby-repair'});
    const repairedOnOpen=await metadata.getParticipation({worldId:'world-lobby-repair',userId:'user-a'});
    check('Opening a world reconciles timestamped stale lobby membership projection',
      repairedOnOpen&&repairedOnOpen.clubId==='club-a',
      {clubId:repairedOnOpen&&repairedOnOpen.clubId});
  }finally{
    await fsp.rm(temp,{recursive:true,force:true});
  }

  const app=fs.readFileSync(path.join(root,'src/app.bundle.js'),'utf8');
  check('Lineup sort is UI-only and no longer stored in lineupMaskState',
    app.includes("lineupSort: 'usage'")&&
    app.includes("var sortKey = AppState.ui.lineupSort || 'usage';")&&
    app.includes("AppState.ui.lineupSort=keyL")&&
    !app.includes("lineupMaskState.sort =")&&
    !app.includes("playerPlacementById:placement, sort:"),
    {});

  const T=loadBrowserTestHarness();
  T.startNewCareer();
  const world=T.AppState.world;
  const record=T.AppState.worldRecord;
  const clubId=world.clubs.order[0];
  const fixture=(world.calendar.fixtures||[]).find(row=>row&&row.competition==='league'&&(row.homeClubId===clubId||row.awayClubId===clubId));
  const opponentId=fixture ? (fixture.homeClubId===clubId?fixture.awayClubId:fixture.homeClubId) : world.clubs.order[1];
  const membershipId=record.memberships.order[0];
  record.memberships.byTrainerId[membershipId].clubId=clubId;
  T.AppState.session.activeClubId=clubId;
  T.AppState.session.activeTrainerId=membershipId;
  const club=world.clubs.byId[clubId];
  const squad=world.squads[clubId];
  T.ensureLineupMaskState(club,squad,world);
  const beforeSort=JSON.stringify(world);
  T.handleAction('lineup-sort',{getAttribute(name){return name==='data-sort'?'strength':null;}});
  const afterSort=JSON.stringify(world);
  check('Sorting the lineup table does not mutate football world state',
    beforeSort===afterSort&&T.AppState.ui.lineupSort==='strength',
    {uiSort:T.AppState.ui.lineupSort,worldChanged:beforeSort!==afterSort});

  squad.tactics={mentality:2,attackStyle:-1,attackSide:1,pressing:-2,buildUp:1,defensiveLine:-1,transitionAttack:2,transitionDefense:-1,compactness:1,offsideTrap:-1};
  const normalized=JSON.parse(JSON.stringify(T.ensureSquadTactics(squad)));
  const placement=squad.lineupMaskState.playerPlacementById||{};
  const expectedField=Object.keys(placement).filter(id=>placement[id]&&placement[id].location==='field').sort();
  const ctx=T.buildSimulatedLineup(world,clubId,'league',opponentId,fixture||{competition:'league',homeClubId:clubId,awayClubId:opponentId});
  const actualField=(ctx.lineupIds||[]).slice().sort();
  check('Human match context uses the selected lineupMaskState players',
    expectedField.length===11&&JSON.stringify(expectedField)===JSON.stringify(actualField),
    {expected:expectedField,actual:actualField});
  check('Human match context uses current squad tactics instead of AI coach tactics',
    JSON.stringify(ctx.tactics)===JSON.stringify(normalized),
    {expected:normalized,actual:ctx.tactics});

  check('Save progress UX remains present for the public next build',
    app.includes("is-save-pending")&&app.includes("Änderungen werden gespeichert")&&(app.includes("Fortschritt wird bestätigt")||app.includes("Fortschritt wird serverseitig bestätigt")),
    {});

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
