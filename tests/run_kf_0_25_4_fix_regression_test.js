const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');
const report={version:'0.25.4',passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
class E{constructor(){this.innerHTML='';this.style={};this.dataset={};this.value='';this.classList={add(){},remove(){},contains(){return false}}}addEventListener(){}removeEventListener(){}setAttribute(k,v){this[k]=v}getAttribute(k){return this[k]||null}querySelector(){return null}querySelectorAll(){return[]}closest(){return null}getBoundingClientRect(){return{width:1760,height:990}}}
const els={'app-root':new E(),'modal-root':new E(),'app-shell':new E(),'sim-progress-text':new E()};
const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new E(),getElementById:id=>els[id]||null,addEventListener(t,cb){if(t==='DOMContentLoaded')this.cb=cb},removeEventListener(){},createElement(){return new E()},querySelector(){return null},querySelectorAll(){return[]}};
let realTimeout=setTimeout, realClearTimeout=clearTimeout;
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame:cb=>cb(),cancelAnimationFrame(){},console,setTimeout:realTimeout,clearTimeout:realClearTimeout,document,Element:E,navigator:{userAgent:'node-test'},performance:{now:()=>Date.now()},localStorage:{getItem(){return null},setItem(){}}};
const seededMath=Object.create(Math);let seed=230024;seededMath.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const context=vm.createContext({window:windowObj,document,console,setTimeout:realTimeout,clearTimeout:realClearTimeout,Element:E,navigator:windowObj.navigator,performance:windowObj.performance,Math:seededMath,Map,WeakMap,Set});
for(const f of ['src/static-data.js','src/db1-db2-data.js'])vm.runInContext(read(f),context,{filename:f});
let code=read('src/app.bundle.js');
code=code.replace(/\n  if \(document\.readyState === 'loading'\) \{/,`\n  window.KFTest={AppState,startNewCareer,nextCalendarSlot,fixturesForSlot,advanceCareerRound,runCalendarSimulationUntil,prepareCareerSlotLifecycle,financeEventSum,financeEventsForSeason,CurrentSeasonFinanceRepository,financePlacementBonus,recordLicenceDecisionForSeasonEnd,scheduleFutureMovement,targetSlotForSimulation};\n  if (document.readyState === 'loading') {`);
vm.runInContext(code,context,{filename:'src/app.bundle.js'});if(document.cb)document.cb();
const T=windowObj.KFTest;
check('Runtime enthaelt den KF_0.25.4-Fix unter KF_0.29.2',read('src/app.bundle.js').includes("var KF_VERSION = '0.29.2';")&&read('index.html').includes('KF_0.29.2')&&JSON.parse(read('package.json')).version==='0.29.2',{});
check('Normaler und schneller Kalenderpfad nutzen denselben Slot-Lifecycle',/function advanceCareerRound[\s\S]*?prepareCareerSlotLifecycle\(world, nextSlot\)/.test(code)&&/function startPendingSlot\(slot\)[\s\S]*?prepareCareerSlotLifecycle\(world, slot\)/.test(code),{});
check('Slot-Lifecycle verarbeitet Bewertung, Slotstatus und Finanz-/Vertragsaktionen zentral',/function prepareCareerSlotLifecycle[\s\S]*?runMidseasonMarketValuationIfDue\(world, slot\)[\s\S]*?world\.calendar\.currentSlotKey = slot\.key[\s\S]*?applySlotSalaryExpenses\(world, slot\)/.test(code),{});
check('Abbruch verwirft keinen bereits gestarteten Slot mehr',!code.includes("if (AppState.ui.simulationAbort) {\n      pendingSlot = null;")&&!code.includes('if (AppState.ui.simulationAbort) break;'),{});

T.startNewCareer();
let cloneSeq=0;function cloneWorldWithFinance(source,label){const copy=JSON.parse(JSON.stringify(source)),seasonId=Number(source.meta.seasonNumber||1);copy.meta.id=String(source.meta.id)+'_'+label+'_'+(++cloneSeq);for(const cid of source.clubs.order){T.CurrentSeasonFinanceRepository.replaceClubEvents(copy,cid,seasonId,T.financeEventsForSeason(source,cid,seasonId).map(ev=>JSON.parse(JSON.stringify(ev))));}return copy;}
const base=cloneWorldWithFinance(T.AppState.world,'base');
// Falls der allererste Folgeslot keine Spiele hat, normal bis direkt vor den ersten Spielslot fortsetzen.
T.AppState.world=base;
let guard=0;
while(guard++<12){const n=T.nextCalendarSlot(base);if(!n)break;if((T.fixturesForSlot(base,n.key)||[]).length)break;T.advanceCareerRound(base);}
const next=T.nextCalendarSlot(base), nextFixtures=next?T.fixturesForSlot(base,next.key):[];
check('Vergleichsslot enthaelt echte Fixtures',!!next&&nextFixtures.length>0,{slot:next&&next.key,fixtures:nextFixtures.length});

const normal=cloneWorldWithFinance(base,'normal'), fast=cloneWorldWithFinance(base,'fast');
const season=Number(base.meta.seasonNumber||1);
// Eine faellige Bewegung erzwingt, dass der gemeinsame Slot-Start nicht nur Gehalt bucht.
const fromClubId=base.clubs.order[0], toClubId=base.clubs.order.find(id=>id!==fromClubId);
const playerId=(base.squads[fromClubId].playerIds||[]).find(id=>{const p=base.players.byId[id];return p&&p.clubId===fromClubId&&!p.loan;});
for(const w of [normal,fast]){
  T.scheduleFutureMovement(w,{type:'permanent',playerId,fromClubId,toClubId,fee:0,executionSeason:season,executionSlotKey:next.key,contractOffer:null});
}

T.AppState.world=normal;T.AppState.session.activeClubId=null;
const normalStep=T.advanceCareerRound(normal);
check('Normaler Referenzpfad schliesst Vergleichsslot ab',normalStep&&normalStep.advanced&&normal.calendar.currentSlotKey===next.key,{type:normalStep&&normalStep.type,slot:normal.calendar.currentSlotKey});

// Asynchronen Browser-Scheduler deterministisch als Queue ausfuehren.
let queue=[],clock=0;
function queuedTimeout(cb){queue.push(cb);return queue.length;}
function queuedClear(){}
context.setTimeout=queuedTimeout;context.clearTimeout=queuedClear;windowObj.setTimeout=queuedTimeout;windowObj.clearTimeout=queuedClear;
context.performance={now:()=>{clock+=7;return clock;}};windowObj.performance=context.performance;
T.AppState.world=fast;T.AppState.session.activeClubId=null;T.AppState.ui=T.AppState.ui||{};
const slots=fast.calendar.slots||[];const currentIdx=slots.findIndex(s=>s.key===fast.calendar.currentSlotKey);
const requestSlot=slots[Math.min(slots.length-1,currentIdx+Math.max(3,Math.min(8,slots.length-currentIdx-1)))];
T.runCalendarSimulationUntil(requestSlot.key);
check('Schnellsimulation plant Arbeit asynchron ein',queue.length>0,{queued:queue.length,requestSlot:requestSlot.key});
// Erster Tick startet den naechsten Slot und damit den fachlichen Lifecycle.
(queue.shift())();
check('Schnellsimulation startet denselben naechsten Slot',fast.calendar.currentSlotKey===next.key,{expected:next.key,actual:fast.calendar.currentSlotKey});
T.AppState.ui.simulationAbort=true;
let qguard=0;while(queue.length&&qguard++<20000){const cb=queue.shift();cb();}
check('Abbruch beendet am sicheren Slot-Rand',qguard<20000&&!T.AppState.ui.simulationRunning&&fast.calendar.currentSlotKey===next.key,{callbacks:qguard,slot:fast.calendar.currentSlotKey});

function salaryState(w){return w.clubs.order.map(id=>({id,amount:T.financeEventSum(w,id,season,ev=>ev.type==='salaryExpense'),slots:T.financeEventsForSeason(w,id,season).filter(ev=>ev.type==='salaryExpense').reduce((n,ev)=>n+Number(ev.slotsApplied||0),0)}));}
const nSalary=salaryState(normal), fSalary=salaryState(fast);
check('Schnellsimulation bucht Gehaelter identisch zum normalen Weiter',JSON.stringify(nSalary)===JSON.stringify(fSalary)&&nSalary.every(x=>x.slots>=1),{sampleNormal:nSalary.slice(0,3),sampleFast:fSalary.slice(0,3)});
check('Faellige Future-Move wird vor dem Match in beiden Pfaden identisch ausgefuehrt',normal.players.byId[playerId].clubId===toClubId&&fast.players.byId[playerId].clubId===toClubId,{normal:normal.players.byId[playerId].clubId,fast:fast.players.byId[playerId].clubId,target:toClubId});
const nMatches=(normal.history.matches||[]).filter(m=>m.slotKey===next.key),fMatches=(fast.history.matches||[]).filter(m=>m.slotKey===next.key);
const sig=a=>a.map(m=>[m.fixtureId||m.id,m.homeGoals,m.awayGoals,Number(m.homeXg||m.xgHome||0),Number(m.awayXg||m.xgAway||0)]);
check('Abgebrochene Schnellsimulation speichert den gestarteten Slot vollstaendig statt halb',fMatches.length===nextFixtures.length&&nMatches.length===nextFixtures.length,{expected:nextFixtures.length,normal:nMatches.length,fast:fMatches.length});
check('Matchresultate des Slots bleiben zwischen Normal- und Schnellpfad identisch',JSON.stringify(sig(nMatches))===JSON.stringify(sig(fMatches)),{normal:sig(nMatches).slice(0,3),fast:sig(fMatches).slice(0,3)});

// Saison 1 startet mit Initialkapital, aber ohne vorab gebuchten Platzierungsbonus.
const fresh=cloneWorldWithFinance(base,'fresh'), sampleClub=fresh.clubs.byId[fresh.clubs.order[0]], sampleFinance=fresh.clubFinances.byClub[sampleClub.id];
const initialPlacement=T.financeEventSum(fresh,sampleClub.id,season,ev=>ev.type==='placementBonus');
check('Saison 1 nutzt Startkapital ohne vorab gebuchten Platzierungsbonus',Number(sampleFinance.seasonStartCash||0)>0&&initialPlacement===0,{seasonStartCash:sampleFinance.seasonStartCash,placementBooked:initialPlacement});

// Endgueltige Auszahlung: finaler Tabellenplatz, genau einmal.
for(const pos of [1,5,12,18]){
  const w=cloneWorldWithFinance(base,'placement_'+pos), cid=w.clubs.order[0], club=w.clubs.byId[cid], oldOrder=w.clubs.order.slice();w.clubs.order=[cid];
  const standings={};standings[club.leagueKey]=[{clubId:cid,position:pos}];const levels={[cid]:club.leagueLevel},keys={[cid]:club.leagueKey};
  T.recordLicenceDecisionForSeasonEnd(w,standings,levels,keys);T.recordLicenceDecisionForSeasonEnd(w,standings,levels,keys);
  const booked=T.financeEventSum(w,cid,season,ev=>ev.type==='placementBonus'),expected=T.financePlacementBonus(club,pos);
  const count=T.financeEventsForSeason(w,cid,season).filter(ev=>ev.type==='placementBonus').length;
  check('Finaler Platzierungsbonus Platz '+pos+' ist exakt und einmalig',Math.abs(booked-expected)<0.01&&count===1,{position:pos,booked,expected,count});w.clubs.order=oldOrder;
}

report.metrics={checks:report.checks.length,comparisonSlot:next&&next.key,fixtures:nextFixtures.length,queueCallbacks:qguard,clubs:base.clubs.order.length};
const out=path.join(root,'reports','kf_0.25.4_fix_regression_test.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:out},null,2));process.exit(report.passed?0:1);
