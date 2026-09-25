const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');
const report={version:'0.25.2',passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
class E{constructor(){this.innerHTML='';this.style={};this.dataset={};this.value='';this.classList={add(){},remove(){},contains(){return false}}}addEventListener(){}removeEventListener(){}setAttribute(k,v){this[k]=v}getAttribute(k){return this[k]||null}querySelector(){return null}querySelectorAll(){return[]}closest(){return null}getBoundingClientRect(){return{width:1760,height:990}}}
const els={'app-root':new E(),'modal-root':new E(),'app-shell':new E(),'sim-progress-text':new E()};
const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new E(),getElementById:id=>els[id]||null,addEventListener(t,cb){if(t==='DOMContentLoaded')this.cb=cb},removeEventListener(){},createElement(){return new E()},querySelector(){return null},querySelectorAll(){return[]}};
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame:cb=>cb(),cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:E,navigator:{userAgent:'node-test'},performance:{now:()=>Date.now()},localStorage:{getItem(){return null},setItem(){}}};
const mathObj=Object.create(Math);
const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:E,navigator:windowObj.navigator,performance:windowObj.performance,Math:mathObj,Map,WeakMap,Set});
for(const f of ['src/static-data.js','src/db1-db2-data.js'])vm.runInContext(read(f),context,{filename:f});
let code=read('src/app.bundle.js');
code=code.replace(/\n  function boot\(\)\{/,`\n  window.KFTest={AppState,startNewCareer,simulateLeagueFixture,recordPlayedMatch,kf0251RuntimeCache,recentMatchesForClub,kf021ProcessMatchContractBonuses,kf021PaySeasonPlayerBonus,KF0252_SIM_TICK_BUDGET_MS,KF0252_PROGRESS_PAINT_INTERVAL_MS};\n  function boot(){`);
code=code.replace(/\n\n  if \(document\.readyState === 'loading'\) \{/,`\n  window.KFCurrentBonusTest={kf021PaySeasonPlayerBonus,kf0261BonusKeySeen,financeEventsForSeason};\n\n  if (document.readyState === 'loading') {`);
vm.runInContext(code,context,{filename:'src/app.bundle.js'});if(document.cb)document.cb();const T=windowObj.KFTest;
function seeded(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}

check('Runtime enthaelt weiterhin den KF_0.25.2-Fix',JSON.parse(read('package.json')).version==='0.29.3'&&read('src/app.bundle.js').includes('KF0252_SIM_TICK_BUDGET_MS'),{runtimeVersion:JSON.parse(read('package.json')).version});
check('Persistiertes Weltschema ist fuer KF_0.26.2 migriert',read('src/app.bundle.js').includes("kf-core-0.26.2"),{});
check('Scheduler hat ein kleines Zeitbudget statt starrem 8er-Batch',Number(T.KF0252_SIM_TICK_BUDGET_MS)>0&&Number(T.KF0252_SIM_TICK_BUDGET_MS)<=16&&!code.includes('pendingSlot.fixtureIndex + 8'),{tickBudgetMs:T.KF0252_SIM_TICK_BUDGET_MS});
check('Fortschritts-DOM wird gedrosselt',Number(T.KF0252_PROGRESS_PAINT_INTERVAL_MS)>=80&&Number(T.KF0252_PROGRESS_PAINT_INTERVAL_MS)<=250,{paintIntervalMs:T.KF0252_PROGRESS_PAINT_INTERVAL_MS});

T.startNewCareer();const w=T.AppState.world;
const runtimeCache=T.kf0251RuntimeCache(w);
const clubIndexRef=runtimeCache.matchesByClub;
const bonusSetRef=runtimeCache.bonusKeys;
let recorded=[];
for(let i=0;i<30;i++){
  const f=w.calendar.fixtures.find(x=>x.competition==='league'&&x.status!=='played');
  if(!f)break;
  context.Math.random=seeded(25200+i);
  const m=T.simulateLeagueFixture(w,f);
  T.recordPlayedMatch(w,f,m);
  recorded.push(m);
  const c=T.kf0251RuntimeCache(w);
  if(c!==runtimeCache||c.matchesByClub!==clubIndexRef||c.matchLength!==w.history.matches.length)break;
}
const cacheAfter=T.kf0251RuntimeCache(w);
check('Matchcache bleibt ueber fortlaufende Append-Schreibvorgaenge dasselbe Runtime-Objekt',recorded.length===30&&cacheAfter===runtimeCache&&cacheAfter.matchesByClub===clubIndexRef&&cacheAfter.matchLength===w.history.matches.length,{recorded:recorded.length,historyLength:w.history.matches.length,cacheLength:cacheAfter.matchLength});

const watchedClub=recorded[0]&&recorded[0].homeClubId;
const canonicalClubMatches=(w.history.matches||[]).filter(m=>m&&m.status==='played'&&(m.homeClubId===watchedClub||m.awayClubId===watchedClub));
const indexedClubMatches=T.recentMatchesForClub(w,watchedClub,9999);
check('Vereins-Matchcache enthaelt jedes kanonische Match genau einmal',!!watchedClub&&indexedClubMatches.length===canonicalClubMatches.length&&indexedClubMatches.every((m,i)=>m===canonicalClubMatches[i]),{clubId:watchedClub,canonical:canonicalClubMatches.length,indexed:indexedClubMatches.length});

const bonusPlayerId=Object.keys(w.players.byId).find(id=>w.players.byId[id]&&w.players.byId[id].clubId);
let bonusOk=false,bonusDetails={};
if(bonusPlayerId){
  const p=w.players.byId[bonusPlayerId],B=windowObj.KFCurrentBonusTest;
  const beforeBonus=(w.history.bonusEvents||[]).length,beforeFinance=B.financeEventsForSeason(w,p.clubId,Number(w.meta.seasonNumber||1)).length;
  const season=Number(w.meta.seasonNumber||1),key=['seasonbonus',season,p.clubId,p.id,'promotion'].join('|');
  const paid=B.kf021PaySeasonPlayerBonus(w,p,p.clubId,'promotion',0.01,season);
  const paidAgain=B.kf021PaySeasonPlayerBonus(w,p,p.clubId,'promotion',0.01,season);
  const afterBonus=(w.history.bonusEvents||[]).length,afterFinance=B.financeEventsForSeason(w,p.clubId,season).length;
  bonusOk=paid&&!paidAgain&&afterBonus===beforeBonus&&afterFinance===beforeFinance+1&&B.kf0261BonusKeySeen(w,key);
  bonusDetails={beforeBonus,afterBonus,beforeFinance,afterFinance,paid,paidAgain,keySeen:B.kf0261BonusKeySeen(w,key)};
}
check('Bonus-Deduplizierung bleibt schnell, nutzt aber ab KF_0.26.2 CurrentSeasonFinanceRepository statt Bonus-Historie',bonusOk,bonusDetails);

const source=read('src/app.bundle.js');
check('Slot bleibt staged und wird erst im Abschluss in die Historie geschrieben',source.includes('pendingSlot.stagedResults.push(simulateLeagueFixture(world, fixture))')&&source.includes('scheduledFixtures.forEach(function(fixture, index){\n      recordPlayedMatch(world, fixture, results[index]);'),{});

report.metrics={checks:report.checks.length,recordedMatches:recorded.length,tickBudgetMs:T.KF0252_SIM_TICK_BUDGET_MS,progressPaintIntervalMs:T.KF0252_PROGRESS_PAINT_INTERVAL_MS};
const out=path.join(root,'reports','kf_0.25.2_fix_regression_test.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:out},null,2));process.exit(report.passed?0:1);
