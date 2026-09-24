const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(root,r),'utf8');
const report={version:'0.27.1',passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
class E{constructor(){this.innerHTML='';this.style={};this.dataset={};this.value='';this.classList={add(){},remove(){},contains(){return false}}}addEventListener(){}removeEventListener(){}setAttribute(k,v){this[k]=v}getAttribute(k){return this[k]||null}querySelector(){return null}querySelectorAll(){return[]}closest(){return null}getBoundingClientRect(){return{width:1760,height:990}}}
const els={'app-root':new E(),'modal-root':new E(),'app-shell':new E()};
const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new E(),getElementById:id=>els[id]||null,addEventListener(t,cb){if(t==='DOMContentLoaded')this.cb=cb},removeEventListener(){},createElement(){return new E()},querySelector(){return null},querySelectorAll(){return[]}};
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame:cb=>cb(),cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:E,navigator:{userAgent:'node-test'},performance:{now:()=>Date.now()},localStorage:{getItem(){return null},setItem(){}}};
const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:E,navigator:windowObj.navigator,performance:windowObj.performance,Map,WeakMap,Set});
for(const f of ['src/static-data.js','src/db1-db2-data.js'])vm.runInContext(read(f),context,{filename:f});
let code=read('src/app.bundle.js');
code=code.replace(/\n\n  if \(document\.readyState === 'loading'\) \{/,`\nwindow.KFTest={AppState,createEmptyWorld,createWorldRecord,registerWorldRecord,WorldRepository,CurrentSeasonFinanceRepository,ensureClubFinance,addFinanceEvent,financeEventsForSeason,financeCurrentCash,financeEventSum,kf0261BonusKeySeen,kf0261RegisterBonusKey,kf0271ArchiveExistingFinanceEvents,migrateWorldDataTruthToCurrent};\n\n  if (document.readyState === 'loading') {`);
vm.runInContext(code,context,{filename:'src/app.bundle.js'});if(document.cb)document.cb();const T=windowObj.KFTest;
check('Runtime meldet KF_0.27.2',code.includes("var KF_VERSION = '0.27.2';"));
function world(id){const w=T.createEmptyWorld({seasonNumber:1});w.meta.id=id;w.meta.initialized=true;w.clubs.byId.c1={id:'c1',name:'Testclub',leagueKey:'Test 1',leagueLevel:1,countryName:'Deutschland'};w.clubs.order=['c1'];return w;}
const w=world('world-fin-0271'),record=T.createWorldRecord({id:w.meta.id,gameState:w});T.registerWorldRecord(record);T.AppState.worldRecord=record;T.AppState.world=w;
w.clubFinances={byClub:{c1:{clubId:'c1',seasonId:1,seasonStartCash:10,financeEvents:[
{id:'e1',clubId:'c1',seasonId:1,type:'income',amount:5,eventKey:'k1'},
{id:'e2',clubId:'c1',seasonId:1,type:'expense',amount:-2}
],licenceWarnings:[],sanctionStatus:null}}};
const mig=T.migrateWorldDataTruthToCurrent(w),entry=w.clubFinances.byClub.c1;
check('Migration verschiebt Legacy-FinanceEvents vollständig aus dem WorldRecord',mig.financeStoreMigration.eventsMoved===2&&!Object.prototype.hasOwnProperty.call(entry,'financeEvents')&&T.CurrentSeasonFinanceRepository.count(w,1)===2,{migration:mig.financeStoreMigration,entry});
check('Kompakter Finanzzustand behält den korrekten Kontostand',T.financeCurrentCash(w,w.clubs.byId.c1)===13&&entry.currentCash===13&&entry.financeEventCount===2,{currentCash:entry.currentCash});
check('Finance-Ledger ist weiterhin vollständig abrufbar',T.financeEventsForSeason(w,'c1',1).length===2&&T.financeEventSum(w,'c1',1)===3,{});
check('eventKey-Idempotenz wird aus ausgelagertem Ledger rekonstruiert',T.kf0261BonusKeySeen(w,'k1')===true,{});
const before=T.financeCurrentCash(w,w.clubs.byId.c1);T.addFinanceEvent(w,'c1',{id:'e3',seasonId:1,type:'bonus',amount:4,eventKey:'k3'});const after=T.financeCurrentCash(w,w.clubs.byId.c1);T.addFinanceEvent(w,'c1',{id:'e3',seasonId:1,type:'bonus',amount:4,eventKey:'k3'});
check('Neue Buchung aktualisiert Zustand und Ledger genau einmal',before===13&&after===17&&T.financeCurrentCash(w,w.clubs.byId.c1)===17&&T.CurrentSeasonFinanceRepository.count(w,1)===3&&entry.financeEventCount===3,{before,after,count:T.CurrentSeasonFinanceRepository.count(w,1)});
check('Neue eventKeys sind sofort idempotent',T.kf0261BonusKeySeen(w,'k3')===true,{});
T.WorldRepository.save(record);const payload=JSON.stringify(record),loaded=T.WorldRepository.load(record.id),loadedEntry=loaded.gameState.clubFinances.byClub.c1;
check('WorldRepository Save/Load enthält keine FinanceEvent-Liste',!payload.includes('"financeEvents"')&&!Object.prototype.hasOwnProperty.call(loadedEntry,'financeEvents')&&T.CurrentSeasonFinanceRepository.count(loaded.gameState,1)===3,{worldBytes:payload.length,financeStoreBytes:T.CurrentSeasonFinanceRepository.serializedBytes(w,1)});
check('Finanzwerte bleiben nach Reload verfügbar',T.financeCurrentCash(loaded.gameState,loaded.gameState.clubs.byId.c1)===17&&T.financeEventsForSeason(loaded.gameState,'c1',1).length===3,{});
report.metrics={worldBytes:payload.length,financeStoreBytes:T.CurrentSeasonFinanceRepository.serializedBytes(w,1),eventCount:T.CurrentSeasonFinanceRepository.count(w,1)};
const out=path.join(root,'reports','kf_0.27.1_current_season_finance_store_test.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:out},null,2));process.exit(report.passed?0:1);
