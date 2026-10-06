'use strict';

const fs=require('fs');
const fsp=require('fs/promises');
const os=require('os');
const path=require('path');
const vm=require('vm');
const { LocalObjectStore }=require('../server/persistence/local-object-store');
const { FileMetadataRepository }=require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService }=require('../server/persistence/world-persistence-service');
const { WorldRuntimeManager }=require('../server/services/world-runtime-manager');
const { WorldSessionService }=require('../server/services/world-session-service');

const root=path.resolve(__dirname,'..');
const report={version:'0.31.4-draw-progression',passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
function delta(worldId,ops){return{schemaVersion:'kf-world-delta-0.31.0',worldId,ops};}

class FakeElement{
  constructor(){this.innerHTML='';this.style={};this.dataset={};this.value='';this.checked=false;this.classList={add(){},remove(){},contains(){return false;}};}
  addEventListener(){} removeEventListener(){} setAttribute(k,v){this[k]=v;} getAttribute(k){return this[k]||null;} removeAttribute(k){delete this[k];}
  querySelector(){return null;} querySelectorAll(){return [];} closest(){return null;} getBoundingClientRect(){return{width:1760,height:990};}
}
function loadBrowserHarness(){
  const elements={'app-root':new FakeElement(),'modal-root':new FakeElement(),'app-shell':new FakeElement(),'sim-progress-text':new FakeElement()};
  const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new FakeElement(),
    getElementById(id){return elements[id]||null;},addEventListener(t,cb){if(t==='DOMContentLoaded')this._domReady=cb;},removeEventListener(){},
    createElement(){return new FakeElement();},querySelector(){return null;},querySelectorAll(){return[];}};
  const localStorage={getItem(){return null;},setItem(){},removeItem(){}};
  const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame(cb){return cb();},cancelAnimationFrame(){},
    console,setTimeout,clearTimeout,document,Element:FakeElement,navigator:{userAgent:'node-test'},localStorage};
  const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:FakeElement,navigator:windowObj.navigator,localStorage});
  function runFile(file){vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});}
  runFile('src/static-data.js'); runFile('src/db1-db2-data.js');
  let appCode=fs.readFileSync(path.join(root,'src/app.bundle.js'),'utf8');
  const injection="\n  window.KF0314DrawTest={AppState:AppState,startNewCareer:startNewCareer,advanceCareerRound:advanceCareerRound,nationalCupSlotForRound:nationalCupSlotForRound,slotIndexForKey:slotIndexForKey,buildCalendar:buildCalendar,ensureDueFieberCupDraws:ensureDueFieberCupDraws,markCupDrawPresented:markCupDrawPresented,cupDrawPresentedForClub:cupDrawPresentedForClub,queueCupDrawPresentations:queueCupDrawPresentations,presentNextQueuedCupDraw:presentNextQueuedCupDraw,cupDrawById:cupDrawById};\n";
  appCode=appCode.replace(/\n  function boot\(\)\{/,injection+'\n  function boot(){');
  vm.runInContext(appCode,context,{filename:'src/app.bundle.js'});
  if(document._domReady)document._domReady();
  return {T:windowObj.KF0314DrawTest,appCode};
}
function level(w,id){return Number((w.clubs.byId[id]||{}).leagueLevel||0);}
function country(w,id){return (w.clubs.byId[id]||{}).countryName;}
function makeServerWorld(worldId,userId){
  return{
    id:worldId,schemaVersion:'kf-world-record-0.27.2',gameVersion:'0.31.4',createdAt:new Date().toISOString(),createdByUserId:userId,
    creationRules:{startVariant:'classic',leagueConfiguration:'default',clubSelection:'manual'},runtimeSettings:{roundDurationHours:null},
    progression:{status:'waiting',deadlineAt:null,readyTrainerIds:[],lastHumanActivityAt:new Date().toISOString()},
    memberships:{byTrainerId:{'trainer-a':{trainerId:'trainer-a',userProfileId:userId,clubId:'club-a',status:'active',joinedAt:new Date().toISOString(),lastActivityAt:new Date().toISOString(),trainerDisplayName:'A',role:'WORLD_ADMIN'}},order:['trainer-a']},
    gameState:{
      meta:{id:worldId,seasonNumber:1,schemaVersion:'kf-core-0.27.2'},
      clubs:{byId:{'club-a':{id:'club-a',name:'Club A'},'club-b':{id:'club-b',name:'Club B'}},order:['club-a','club-b']},
      players:{byId:{},order:[]},squads:{'club-a':{playerIds:[],lineup:[],bench:[],reserve:[]},'club-b':{playerIds:[],lineup:[],bench:[],reserve:[]}},
      calendar:{currentSlotKey:'end-8',slots:[{key:'end-8',label:'Ende 8'},{key:'slot-9',label:'Slot 9'}],fixtures:[],nationalCupDraws:{byKey:{},byId:{},order:[]}},
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},clubFinances:{byClub:{}}
    }
  };
}

(async()=>{
  const {T,appCode}=loadBrowserHarness();
  T.startNewCareer();
  const w=T.AppState.world;
  const activeClubId=w.clubs.order.find(id=>level(w,id)===3&&country(w,id)==='Deutschland');
  check('Test setup finds a German third-tier cup participant',!!activeClubId,{activeClubId});
  T.AppState.session.activeClubId=activeClubId;
  if(T.AppState.session.localController)T.AppState.session.localController.clubId=activeClubId;

  const target=T.nationalCupSlotForRound(w,1);
  const targetIndex=T.slotIndexForKey(w,target.key);
  const dueIndex=Math.max(0,targetIndex-4);
  const dueSlot=w.calendar.slots[dueIndex];
  const previous=dueIndex>0?w.calendar.slots[dueIndex-1]:null;
  w.calendar.currentSlotKey=previous?previous.key:null;
  const beforeSlotKey=w.calendar.currentSlotKey;

  const first=T.advanceCareerRound(w);
  const firstVisible=(first&&first.cupDraws)||((first&&first.cupDraw)?[first.cupDraw]:[]);
  const firstDraw=firstVisible[0]||null;
  const cupFixtures=(w.calendar.fixtures||[]).filter(row=>row&&row.competition==='cup'&&row.countryName==='Deutschland'&&Number(row.roundNumber||0)===1);
  check('Due national draw is generated while currentSlot stays unchanged',
    !!first&&first.type==='cup-draw'&&!!firstDraw&&w.calendar.currentSlotKey===beforeSlotKey&&cupFixtures.length>0,
    {beforeSlotKey,afterSlotKey:w.calendar.currentSlotKey,drawId:firstDraw&&firstDraw.id,fixtures:cupFixtures.length});

  const drawCountAfterFirst=Object.keys(((w.calendar.nationalCupDraws||{}).byId)||{}).length;
  const fixtureIdsAfterFirst=cupFixtures.map(row=>row.id).sort();
  const second=T.advanceCareerRound(w);
  const secondDraw=second&&second.cupDraw;
  const drawCountAfterSecond=Object.keys(((w.calendar.nationalCupDraws||{}).byId)||{}).length;
  const fixtureIdsAfterSecond=(w.calendar.fixtures||[]).filter(row=>row&&row.competition==='cup'&&row.countryName==='Deutschland'&&Number(row.roundNumber||0)===1).map(row=>row.id).sort();
  check('Repeated due check reuses the authoritative draw instead of regenerating it',
    !!secondDraw&&secondDraw.id===firstDraw.id&&drawCountAfterSecond===drawCountAfterFirst&&JSON.stringify(fixtureIdsAfterSecond)===JSON.stringify(fixtureIdsAfterFirst),
    {firstDraw:firstDraw&&firstDraw.id,secondDraw:secondDraw&&secondDraw.id,drawCountAfterFirst,drawCountAfterSecond});

  const worldBeforePresentation=JSON.stringify(w);
  firstVisible.forEach(draw=>T.markCupDrawPresented(w,draw.id,activeClubId));
  const worldAfterPresentation=JSON.stringify(w);
  check('Completing draw presentation is UI-only and does not mutate world.calendar',
    worldBeforePresentation===worldAfterPresentation&&T.cupDrawPresentedForClub(firstDraw,activeClubId),
    {worldChanged:worldBeforePresentation!==worldAfterPresentation});

  const third=T.advanceCareerRound(w);
  check('After presentation the same draw no longer blocks the actual next slot',
    !!third&&third.type!=='cup-draw'&&w.calendar.currentSlotKey===dueSlot.key,
    {type:third&&third.type,currentSlotKey:w.calendar.currentSlotKey,dueSlotKey:dueSlot.key});

  // Season 2 Fiebercup: provide the previous-season table truth and played qualification finals,
  // then use the normal due-draw path to create the authoritative 32-club group draw.
  const fw=JSON.parse(JSON.stringify(w));
  fw.meta.seasonNumber=2;
  fw.calendar=T.buildCalendar(2);
  fw.history.seasonStandings=fw.history.seasonStandings||{};
  fw.history.seasonStandings['1']=fw.history.seasonStandings['1']||{};
  const countries=[];
  fw.clubs.order.forEach(id=>{const club=fw.clubs.byId[id];if(club&&club.countryName&&countries.indexOf(club.countryName)===-1)countries.push(club.countryName);});
  let fieberSetupOk=countries.length===8;
  let fieberActiveClubId=null;
  countries.forEach((countryName,countryIndex)=>{
    const top=fw.clubs.order.map(id=>fw.clubs.byId[id]).filter(club=>club&&club.countryName===countryName&&Number(club.leagueLevel||0)===1);
    if(top.length<7){fieberSetupOk=false;return;}
    const leagueKey=top[0].leagueKey;
    fw.history.seasonStandings['1'][leagueKey]=top.slice(0,7).map((club,index)=>({clubId:club.id,position:index+1}));
    if(!fieberActiveClubId)fieberActiveClubId=top[0].id;
    fw.history.matches.push({
      id:'kf0314-fieber-qfinal-'+countryIndex,season:2,competition:'fiebercup',stage:'qualification',
      roundType:'qualification_final',countryName,pairIndex:0,homeClubId:top[3].id,awayClubId:top[4].id,
      homeGoals:1,awayGoals:0
    });
  });
  const fieberGroupSlot=fw.calendar.slots.find(slot=>slot&&slot.label==='Fieber-Cup LP1')||null;
  check('Fiebercup test setup has eight countries, previous-season standings and group slot',
    fieberSetupOk&&!!fieberActiveClubId&&!!fieberGroupSlot,
    {countries:countries.length,activeClubId:fieberActiveClubId,groupSlot:fieberGroupSlot&&fieberGroupSlot.key});
  const fieberFirst=T.ensureDueFieberCupDraws(fw,fieberGroupSlot,{activeClubId:fieberActiveClubId});
  const fieberDraw=fieberFirst.visibleDraw||(fieberFirst.visibleDraws||[])[0]||(fieberFirst.draws||[])[0]||null;
  const fieberGroupFixtures=(fw.calendar.fixtures||[]).filter(row=>row&&row.competition==='fiebercup'&&row.stage==='group');
  const fieberFixtureIds=fieberGroupFixtures.map(row=>row.id).sort();
  check('Fiebercup group draw is created through the normal due-draw path with 32 authoritative participants',
    !!fieberDraw&&fieberDraw.competition==='fiebercup'&&fieberDraw.roundLabel==='Gruppenauslosung'&&
    (fieberDraw.potClubIds||[]).length===32&&fieberGroupFixtures.length>0,
    {drawId:fieberDraw&&fieberDraw.id,participants:fieberDraw&&(fieberDraw.potClubIds||[]).length,fixtures:fieberGroupFixtures.length});
  const fieberSecond=T.ensureDueFieberCupDraws(fw,fieberGroupSlot,{activeClubId:fieberActiveClubId});
  const fieberSecondDraw=fieberSecond.visibleDraw||(fieberSecond.visibleDraws||[])[0]||(fieberSecond.draws||[])[0]||null;
  const fieberFixtureIdsAgain=(fw.calendar.fixtures||[]).filter(row=>row&&row.competition==='fiebercup'&&row.stage==='group').map(row=>row.id).sort();
  check('Repeated Fiebercup due check reuses the stored draw and does not duplicate group fixtures',
    !!fieberSecondDraw&&fieberSecondDraw.id===fieberDraw.id&&JSON.stringify(fieberFixtureIdsAgain)===JSON.stringify(fieberFixtureIds),
    {firstDraw:fieberDraw&&fieberDraw.id,secondDraw:fieberSecondDraw&&fieberSecondDraw.id,fixtures:fieberFixtureIdsAgain.length});

  const store=w.calendar.nationalCupDraws;
  const queueClone=JSON.parse(JSON.stringify(firstDraw));
  queueClone.id=String(firstDraw.id)+'__queue';
  queueClone.presentedClubIds=[];
  delete queueClone.backgroundProcessed;
  queueClone.presentationStatus='pending';
  store.byId[queueClone.id]=queueClone;
  store.order.push(queueClone.id);
  T.AppState.ui.cupDrawPresentationSeen={};
  T.AppState.ui.cupDrawPresentationQueue=[];
  T.AppState.ui.cupDrawId=null;
  T.queueCupDrawPresentations([firstDraw,queueClone]);
  const shownFirst=T.presentNextQueuedCupDraw();
  const firstQueuedId=T.AppState.ui.cupDrawId;
  T.markCupDrawPresented(w,firstQueuedId,activeClubId);
  T.AppState.ui.cupDrawId=null;
  const shownSecond=T.presentNextQueuedCupDraw();
  const secondQueuedId=T.AppState.ui.cupDrawId;
  T.markCupDrawPresented(w,secondQueuedId,activeClubId);
  T.AppState.ui.cupDrawId=null;
  const shownThird=T.presentNextQueuedCupDraw();
  check('Presentation queue shows multiple already-generated draws in deterministic order',
    shownFirst&&shownSecond&&!shownThird&&firstQueuedId===firstDraw.id&&secondQueuedId===queueClone.id,
    {firstQueuedId,secondQueuedId,remaining:T.AppState.ui.cupDrawPresentationQueue});

  const advanceStart=appCode.indexOf('function advanceCareerRound(');
  const advanceEnd=appCode.indexOf('function advanceCareerUntilSlot(',advanceStart);
  const advanceSource=appCode.slice(advanceStart,advanceEnd);
  const readyStart=appCode.indexOf('async function kf031RequestReadyAndMaybeAdvance(');
  const readyEnd=appCode.indexOf('async function kf031EnsureMatchDetail(',readyStart);
  const readySource=appCode.slice(readyStart,readyEnd);
  const claimedStart=appCode.indexOf('async function kf032AdvanceClaimedRound(');
  const claimedEnd=appCode.indexOf('function kf032ScheduleProgressPoll(',claimedStart);
  const claimedSource=appCode.slice(claimedStart,claimedEnd);
  const markStart=appCode.indexOf('function markCupDrawPresented(');
  const markEnd=appCode.indexOf('function cupDrawPresentationQueue(',markStart);
  const markSource=appCode.slice(markStart,markEnd);
  check('National and Fiebercup draws are both generated before presentation selection',
    advanceSource.indexOf('ensureDueNationalCupDraws')>=0&&advanceSource.indexOf('ensureDueFieberCupDraws')>=0&&
    advanceSource.indexOf('ensureDueFieberCupDraws')<advanceSource.indexOf('if (dueVisibleDraws.length)')&&advanceSource.includes('cupDraws: dueVisibleDraws'),
    {});
  check('Queued draw presentation is no longer coupled to browser-owned round progression',
    claimedSource.includes('Der Browser ist nur Anzeige')&&
    !claimedSource.includes("kf029CommitHardCheckpoint('calendar-slot')")&&
    !claimedSource.includes('kf029BaseHandleAction')&&
    !readySource.includes('kf032AdvanceClaimedRound(state,actionEl)'),
    {});
  check('Presentation status no longer writes presentedClubIds into authoritative calendar state',
    !markSource.includes('presentedClubIds.push')&&!markSource.includes('draw.presentedClubIds ='),
    {});

  const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'kf0314-draw-'));
  try{
    const metadata=new FileMetadataRepository({filePath:path.join(temp,'metadata.json')});
    const worlds=new WorldPersistenceService({objectStore:new LocalObjectStore({rootDir:path.join(temp,'objects')}),deltaCompactionThreshold:100000});
    const runtime=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:60000});
    const sessions=new WorldSessionService({metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtime});
    const worldId='world-end-8-draw';
    await sessions.createWorld({userId:'uA',worldRecord:makeServerWorld(worldId,'uA'),worldName:'Ende 8 Draw',visibility:'PUBLIC',joinPolicy:'OPEN'});
    const joinedB=await sessions.joinWorld({userId:'uB',displayName:'B',worldId});
    await sessions.assignClub({userId:'uB',worldId,clubId:'club-b',expectedRevision:joinedB.revision});
    const manifest=await worlds.getManifest(worldId);
    const ready=await Promise.all([
      sessions.markReady({userId:'uA',worldId,expectedRevision:manifest.revision}),
      sessions.markReady({userId:'uB',worldId,expectedRevision:manifest.revision})
    ]);
    const winner=ready.find(row=>row.shouldAdvance);
    const winningUser=ready[0].shouldAdvance?'uA':'uB';
    check('Multiplayer draw checkpoint test obtains exactly one progression lease',
      ready.filter(row=>row.shouldAdvance).length===1&&!!winner&&!!winner.leaseId,
      {ready});

    const draw={id:'draw-end-8',competition:'cup',countryName:'Deutschland',roundNumber:1,roundLabel:'1. Runde',drawSlotKey:'slot-9',targetSlotKey:'slot-12',potClubIds:['club-a','club-b'],steps:[],fixtures:['cup-fixture-1']};
    const fixture={id:'cup-fixture-1',competition:'cup',countryName:'Deutschland',roundNumber:1,slotKey:'slot-12',status:'scheduled',homeClubId:'club-a',awayClubId:'club-b'};
    const drawStore={byKey:{'s1|Deutschland|r1':draw.id},byId:{[draw.id]:draw},order:[draw.id]};
    const drawDelta=delta(worldId,[
      {path:['gameState','calendar','nationalCupDraws'],value:drawStore},
      {path:['gameState','calendar','fixtures'],value:[fixture]}
    ]);
    const saved=await sessions.saveSlot({
      userId:winningUser,worldId,worldDelta:drawDelta,expectedRevision:manifest.revision,season:1,slotKey:'end-8',
      matches:[],financeEvents:[],progressLeaseId:winner.leaseId
    });
    await runtime.unloadWorld(worldId);
    const reloaded=await sessions.openWorld({userId:'uA',worldId});
    const progression=await sessions.getProgression({userId:'uB',worldId});
    const reloadedDraw=reloaded.worldRecord.gameState.calendar.nationalCupDraws.byId[draw.id];
    const reloadedFixture=reloaded.worldRecord.gameState.calendar.fixtures.find(row=>row.id===fixture.id);
    check('Progression endpoint accepts and reloads an authoritative draw while slotKey remains Ende 8',
      Number(saved.revision)===Number(manifest.revision)+1&&
      reloaded.worldRecord.gameState.calendar.currentSlotKey==='end-8'&&
      JSON.stringify(reloadedDraw)===JSON.stringify(draw)&&JSON.stringify(reloadedFixture)===JSON.stringify(fixture)&&
      progression.status==='OPEN'&&Number(progression.roundGeneration)===2&&Number(progression.revision)===Number(saved.revision),
      {
        revision:saved.revision,
        manifestRevision:manifest.revision,
        revisionAdvanced:Number(saved.revision)===Number(manifest.revision)+1,
        currentSlotKey:reloaded.worldRecord.gameState.calendar.currentSlotKey,
        drawEqual:JSON.stringify(reloadedDraw)===JSON.stringify(draw),
        fixtureEqual:JSON.stringify(reloadedFixture)===JSON.stringify(fixture),
        reloadedDraw,
        expectedDraw:draw,
        reloadedFixture,
        expectedFixture:fixture,
        progression
      });

    let managementError=null;
    try{
      await sessions.saveManagementDelta({
        userId:'uA',worldId,expectedRevision:saved.revision,
        worldDelta:delta(worldId,[{path:['gameState','calendar','nationalCupDraws','byId',draw.id,'presentationStatus'],value:'seen'}])
      });
    }catch(error){managementError=error;}
    check('Management endpoint remains strict and still rejects calendar-owned draw mutations',
      !!managementError&&/progression-owned/i.test(String(managementError.message||'')),
      {error:managementError&&managementError.message});

    report.metrics={drawCountAfterFirst,drawCountAfterSecond,cupFixtureCount:fixtureIdsAfterFirst.length,fieberGroupFixtureCount:fieberFixtureIds.length,serverRevision:saved.revision};
  }finally{
    await fsp.rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
