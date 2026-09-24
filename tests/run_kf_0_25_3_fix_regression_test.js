const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');
const report={version:'0.25.3',passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
class E{constructor(){this.innerHTML='';this.style={};this.dataset={};this.value='';this.classList={add(){},remove(){},contains(){return false}}}addEventListener(){}removeEventListener(){}setAttribute(k,v){this[k]=v}getAttribute(k){return this[k]||null}querySelector(){return null}querySelectorAll(){return[]}closest(){return null}getBoundingClientRect(){return{width:1760,height:990}}}
const els={'app-root':new E(),'modal-root':new E(),'app-shell':new E(),'sim-progress-text':new E()};
const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new E(),getElementById:id=>els[id]||null,addEventListener(t,cb){if(t==='DOMContentLoaded')this.cb=cb},removeEventListener(){},createElement(){return new E()},querySelector(){return null},querySelectorAll(){return[]}};
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame:cb=>cb(),cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:E,navigator:{userAgent:'node-test'},performance:{now:()=>Date.now()},localStorage:{getItem(){return null},setItem(){}}};
const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:E,navigator:windowObj.navigator,performance:windowObj.performance,Math:Object.create(Math),Map,WeakMap,Set});
for(const f of ['src/static-data.js','src/db1-db2-data.js'])vm.runInContext(read(f),context,{filename:f});
let code=read('src/app.bundle.js');
code=code.replace(/\n  function boot\(\)\{/,`\n  window.KFTest={AppState,startNewCareer,buildSimulatedLineup,ensureLineupMaskState,currentSquadFormationKey,optimizeSquadAssignmentsForClub};\n  function boot(){`);
vm.runInContext(code,context,{filename:'src/app.bundle.js'});if(document.cb)document.cb();
const T=windowObj.KFTest, StaticData=windowObj.KFStaticData;

check('KF_0.25.3-Aufstellungsfix ist im aktuellen Runtimepfad enthalten',code.includes("(!squad.lineupMaskState || !squad.lineupMaskState.playerPlacementById)) ensureLineupMaskState"),{});
check('Simulationspfad initialisiert auch vorhandene Masken mit null-Placement',code.includes("(!squad.lineupMaskState || !squad.lineupMaskState.playerPlacementById)) ensureLineupMaskState"),{});

T.startNewCareer();
const w=T.AppState.world;
const ensureStarted=Date.now();
let valid=0, bad=[];
for(const clubId of w.clubs.order){
  const club=w.clubs.byId[clubId], squad=w.squads[clubId];
  T.ensureLineupMaskState(club,squad,w);
  const state=squad.lineupMaskState||{}, placement=state.playerPlacementById||{};
  const field=Object.keys(placement).filter(id=>placement[id]&&placement[id].location==='field');
  const gkIds=field.filter(id=>placement[id].slot==='goal_basic_z');
  const gk=gkIds.length===1?w.players.byId[gkIds[0]]:null;
  const outSlots=field.filter(id=>placement[id].slot!=='goal_basic_z').map(id=>placement[id].slot);
  const coach=StaticData.coachTypes[club.coachTypeKey]||{};
  const allowed=[coach.favoriteFormation1,coach.favoriteFormation2,coach.favoriteFormation3,coach.toleratedFormation1,coach.toleratedFormation2].filter(Boolean);
  const ok=field.length===11&&gk&&gk.mainPosition==='TW'&&new Set(outSlots).size===10&&allowed.includes(state.formationKey);
  if(ok) valid++; else bad.push({clubId,field:field.length,gk:gk&&gk.mainPosition,formation:state.formationKey,coach:club.coachTypeKey,allowed});
}
const ensureAllMs=Date.now()-ensureStarted;
check('Alle 432 Vereine erhalten eine gueltige Elf mit echtem TW',valid===w.clubs.order.length,{valid,total:w.clubs.order.length,bad:bad.slice(0,5)});
check('KI-Formationen bleiben im vorhandenen Korridor ihres Trainertyps',bad.length===0,{bad:bad.slice(0,5)});
check('Initialisierung aller Aufstellungen bleibt leichtgewichtig',ensureAllMs<1500,{ensureAllMs});

const club=w.clubs.byId['ger1_fc_auenring'];
const squad=w.squads[club.id];
const fixture=w.calendar.fixtures.find(f=>f.competition==='league'&&(f.homeClubId===club.id||f.awayClubId===club.id));
const opponentId=fixture.homeClubId===club.id?fixture.awayClubId:fixture.homeClubId;
// Fuer den eigentlichen Regressionsfall wird Auenrings Placement nochmals auf den Weltstartzustand null gesetzt.
squad.lineupMaskState={formationKey:club.preferredFormationKey||club.defaultFormationKey,playerPlacementById:null,sort:{key:'usage',dir:'asc'}};
const aiCtx=T.buildSimulatedLineup(w,club.id,'league',opponentId,fixture);
const aiGoalId=aiCtx.lineupIds.find(id=>(aiCtx.slotByPlayerId||{})[id]==='goal_basic_z');
const aiGoal=w.players.byId[aiGoalId];
check('Auenring als KI faellt nicht mehr auf den ersten Kaderspieler als Torwart zurueck',aiCtx.lineupIds.length===11&&aiGoal&&aiGoal.mainPosition==='TW',{formation:aiCtx.formationKey,strength:aiCtx.strength,goalkeeper:aiGoal&&aiGoal.fullName});

const trainerId=T.AppState.session.activeTrainerId;
const membership=T.AppState.worldRecord.memberships.byTrainerId[trainerId];
membership.clubId=club.id; T.AppState.session.activeClubId=club.id;
const beforeHuman=JSON.stringify(squad.lineupMaskState);
const humanCtx=T.buildSimulatedLineup(w,club.id,'league',opponentId,fixture);
const afterHuman=JSON.stringify(squad.lineupMaskState);
check('Vereinsuebernahme erzeugt keinen Aufstellungs-/Staerkevorteil mehr',beforeHuman===afterHuman&&humanCtx.strength===aiCtx.strength&&JSON.stringify(humanCtx.lineupIds)===JSON.stringify(aiCtx.lineupIds),{aiStrength:aiCtx.strength,humanStrength:humanCtx.strength,formation:humanCtx.formationKey});

const cloned=JSON.parse(JSON.stringify(w));
const cloneClub=cloned.clubs.byId[club.id], cloneSquad=cloned.squads[club.id];
cloneSquad.lineupMaskState={formationKey:'formation_5_3_2',playerPlacementById:null,sort:{key:'usage',dir:'asc'}};
const cloneState=T.ensureLineupMaskState(cloneClub,cloneSquad,cloned);
check('Aufstellungsinitialisierung verwendet das uebergebene world statt AppState.world',cloneState&&cloneState.formationKey==='formation_5_3_2'&&!!cloneState.playerPlacementById,{formation:cloneState&&cloneState.formationKey});

report.metrics={checks:report.checks.length,clubs:w.clubs.order.length,validLineups:valid,ensureAllMs,auenringAiStrength:aiCtx.strength,auenringHumanStrength:humanCtx.strength};
const out=path.join(root,'reports','kf_0.25.3_fix_regression_test.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:out},null,2));process.exit(report.passed?0:1);
