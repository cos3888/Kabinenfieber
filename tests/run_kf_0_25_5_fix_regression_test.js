const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');
const report={version:'0.25.5',passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
class E{constructor(){this.innerHTML='';this.style={};this.dataset={};this.value='';this.classList={add(){},remove(){},contains(){return false}}}addEventListener(){}removeEventListener(){}setAttribute(k,v){this[k]=v}getAttribute(k){return this[k]||null}querySelector(){return null}querySelectorAll(){return[]}closest(){return null}getBoundingClientRect(){return{width:1760,height:990}}}
const els={'app-root':new E(),'modal-root':new E(),'app-shell':new E()};
const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new E(),getElementById:id=>els[id]||null,addEventListener(t,cb){if(t==='DOMContentLoaded')this.cb=cb},removeEventListener(){},createElement(){return new E()},querySelector(){return null},querySelectorAll(){return[]}};
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame:cb=>cb(),cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:E,navigator:{userAgent:'node-test'},performance:{now:()=>Date.now()},localStorage:{getItem(){return null},setItem(){}}};
const seededMath=Object.create(Math);let seed=250025;seededMath.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:E,navigator:windowObj.navigator,performance:windowObj.performance,Math:seededMath,Map,WeakMap,Set});
for(const f of ['src/static-data.js','src/db1-db2-data.js'])vm.runInContext(read(f),context,{filename:f});
let code=read('src/app.bundle.js');
code=code.replace(/\n  if \(document\.readyState === 'loading'\) \{/,`\n  window.KFTest={AppState,startNewCareer,kf0255AutoFillAiSponsorSlots,sponsorContractsForClub,sponsorProfileForClub,startSlotsForSponsorProfile,resetFinanceForNewSeason,financeEventSum,worldRecordForGameState,assignTrainerClub,financeCurrentCash,playerContractSalaryBreakdownForClub,estimateCurrentSeasonCupBonus,kf0214TargetPosition,financePlacementBonus};\n  if (document.readyState === 'loading') {`);
vm.runInContext(code,context,{filename:'src/app.bundle.js'});if(document.cb)document.cb();
const T=windowObj.KFTest;
check('Runtime enthaelt den KF_0.25.5-Fix unter KF_0.29.1',code.includes("var KF_VERSION = '0.29.1';")&&read('index.html').includes('KF_0.29.1')&&JSON.parse(read('package.json')).version==='0.29.1',{});
check('Saisonwechsel ruft KI-Sponsor-Autofill nach Finanzreset auf',/step\('finance_new_season'[\s\S]*?resetFinanceForNewSeason\(world,previousSeason\);world\.meta\.lastAiSponsorAutofill=kf0255AutoFillAiSponsorSlots\(world,world\.meta\.seasonNumber\)/.test(code),{});
check('Autofill ueberspringt menschlich kontrollierte Vereine',/function kf0255AutoFillAiSponsorSlots[\s\S]*?if \(isHumanControlledClub\(world, clubId\)\) return;/.test(code),{});
check('Autofill verwendet bestehende Sponsorregeln und Vertragslogik',/function kf0255AutoFillAiSponsorSlots[\s\S]*?FINANCE_SPONSOR_SLOT_MAX[\s\S]*?preferredSponsorSizesFor\(profile, slotType\)[\s\S]*?createSponsorContract\(world, club, picked, slotType/.test(code),{});

T.startNewCareer();
const w=T.AppState.world;
const humanId=w.clubs.order[0];
// Einen echten menschlichen Vereinsbesitz im bestehenden Membership-Modell setzen.
const record=T.worldRecordForGameState(w);
const assigned=T.assignTrainerClub(record,(T.AppState.session||{}).activeTrainerId,humanId);
check('Testaufbau weist den Humanclub ueber das echte Membership-Modell zu',assigned&&assigned.ok,{humanId});
const maxSlots=10;
const s1HumanContracts=T.sponsorContractsForClub(w,humanId,1).length;
const s1AiCounts=w.clubs.order.filter(id=>id!==humanId).map(id=>T.sponsorContractsForClub(w,id,1).length);
check('Nach Vereinswahl besetzen KI-Clubs alle realen Sponsorenslots in Saison 1',s1AiCounts.every(n=>n===maxSlots),{min:Math.min(...s1AiCounts),max:Math.max(...s1AiCounts),human:s1HumanContracts});
check('Humanclub behaelt seine bestehenden Vertraege und freie Slots fuer eigene Entscheidungen',s1HumanContracts<maxSlots,{humanContracts:s1HumanContracts,maxSlots});
const initialAiSponsorTotal=w.clubs.order.filter(id=>id!==humanId).reduce((sum,id)=>sum+T.sponsorContractsForClub(w,id,1).reduce((s,c)=>s+Number(c.amountPerSeason||0),0),0);
const aiOperating=w.clubs.order.filter(id=>id!==humanId).map(id=>{
  const c=w.clubs.byId[id], fin=w.clubFinances.byClub[id], sal=T.playerContractSalaryBreakdownForClub(w,id,'current').expectedSeasonCost;
  const current=T.financeCurrentCash(w,c), start=Number(fin.seasonStartCash||0), cup=T.estimateCurrentSeasonCupBonus(w,c).forecastRemaining;
  const pos=T.kf0214TargetPosition(w,c,c.leagueKey,c.seasonTarget), placement=T.financePlacementBonus(c,pos);
  return (current-start)-sal+cup+placement;
}).sort((a,b)=>a-b);
const q=p=>aiOperating[Math.max(0,Math.min(aiOperating.length-1,Math.round((aiOperating.length-1)*p)))];
const aiFinanceMetrics={median:q(.5),p25:q(.25),p75:q(.75),negativePct:aiOperating.filter(x=>x<0).length/aiOperating.length*100,within2Pct:aiOperating.filter(x=>Math.abs(x)<=2).length/aiOperating.length*100};
check('KI-Sponsorautofill schafft Entwicklungsspielraum ohne pauschalen sicheren Gewinn',aiFinanceMetrics.median>0&&aiFinanceMetrics.median<2.5&&aiFinanceMetrics.negativePct>5,{...aiFinanceMetrics});
w.meta.seasonNumber=3;
T.resetFinanceForNewSeason(w,2);
const beforeContracts=w.sponsorContracts.order.length;
const beforeS3=w.clubs.order.reduce((n,id)=>n+T.sponsorContractsForClub(w,id,3).length,0);
check('Ausgelaufene Startvertraege liefern vor Autofill keine S3-Vertraege',beforeS3===0,{beforeS3});

const summary=T.kf0255AutoFillAiSponsorSlots(w,3);
let missing=0, wrongSlot=0, duplicateSponsorClubs=0, aiContracts=0, sponsorIncomeMismatch=0;
const mainSeen=new Set();let mainConflicts=0;
for(const clubId of w.clubs.order){
  const club=w.clubs.byId[clubId];
  const contracts=T.sponsorContractsForClub(w,clubId,3);
  if(clubId===humanId){
    if(contracts.length!==0) missing+=100000;
    continue;
  }
  aiContracts+=contracts.length;
  const targets={main:1,large:2,medium:3,small:4};
  const counts={main:0,large:0,medium:0,small:0};
  const ids=new Set();
  for(const c of contracts){
    counts[c.slotType]++;
    if(ids.has(c.sponsorId)) duplicateSponsorClubs++;
    ids.add(c.sponsorId);
    if(c.startSeasonId!==3||c.endSeasonId!==4) wrongSlot++;
    if(c.slotType==='main'){
      const key=club.countryName+'|'+c.sponsorId;
      if(mainSeen.has(key)) mainConflicts++;
      mainSeen.add(key);
    }
  }
  for(const k of Object.keys(targets)) missing+=Math.max(0,targets[k]-counts[k]);
  const booked=T.financeEventSum(w,clubId,3,ev=>ev.type==='sponsorIncome');
  const expected=Math.round(contracts.reduce((s,c)=>s+Number(c.amountPerSeason||0),0)*100)/100;
  if(Math.abs(booked-expected)>0.011) sponsorIncomeMismatch++;
}
check('Alle KI-Clubs besetzen alle verfuegbaren Sponsorplaetze',missing===0,{missing,clubs:summary.clubsChecked,created:summary.contractsCreated});
check('Menschlicher Verein wird nicht automatisch mit Sponsoren belegt',T.sponsorContractsForClub(w,humanId,3).length===0,{humanId});
check('Neue Sponsorvertraege laufen zwei Saisons und starten korrekt in S3',wrongSlot===0,{wrongSlot});
check('Kein KI-Verein bekommt denselben Sponsor doppelt',duplicateSponsorClubs===0,{duplicateSponsorClubs});
check('Hauptsponsor-Exklusivitaet pro Land bleibt gewahrt',mainConflicts===0,{mainConflicts});
check('Sponsorzahlungen werden fuer neue KI-Vertraege sofort korrekt gebucht',sponsorIncomeMismatch===0,{sponsorIncomeMismatch});
const countAfterFirst=w.sponsorContracts.order.length;
const summary2=T.kf0255AutoFillAiSponsorSlots(w,3);
check('Autofill ist innerhalb derselben Saison idempotent',summary2.contractsCreated===0&&w.sponsorContracts.order.length===countAfterFirst,{createdSecond:summary2.contractsCreated,contracts:countAfterFirst});
check('Autofill erzeugt tatsaechlich neue Vertraege nach Ablauf',countAfterFirst>beforeContracts&&aiContracts===summary.contractsCreated,{beforeContracts,countAfterFirst,aiContracts,created:summary.contractsCreated});

const sponsorSeasons=[{season:3,created:summary.contractsCreated}];
for(let testSeason=4;testSeason<=10;testSeason++){
  w.meta.seasonNumber=testSeason;
  const cycle=T.kf0255AutoFillAiSponsorSlots(w,testSeason);
  let cycleMissing=0, cycleContracts=0, cycleTotal=0;
  for(const cid of w.clubs.order){
    if(cid===humanId) continue;
    const club=w.clubs.byId[cid], cs=T.sponsorContractsForClub(w,cid,testSeason), target={main:1,large:2,medium:3,small:4}, count={main:0,large:0,medium:0,small:0};
    cs.forEach(c=>{count[c.slotType]++;cycleTotal+=Number(c.amountPerSeason||0);});
    cycleContracts+=cs.length;
    for(const k of Object.keys(target)) cycleMissing+=Math.max(0,target[k]-count[k]);
  }
  sponsorSeasons.push({season:testSeason,created:cycle.contractsCreated,contracts:cycleContracts,missing:cycleMissing,total:Math.round(cycleTotal*1000)/1000});
}
const lifecycleOk=sponsorSeasons.every(x=>Number(x.missing||0)===0);
const totals=sponsorSeasons.map(x=>Number(x.total||0)).filter(Boolean), minTotal=Math.min(...totals), maxTotal=Math.max(...totals);
check('Sponsor-Lifecycle bleibt ueber 10 Saisons ohne leere KI-Basisslots',lifecycleOk,{seasons:sponsorSeasons});
check('Erneuerte Sponsorbasis erzeugt keine strukturelle Sponsor-Einnahmeninflation',initialAiSponsorTotal>0&&minTotal>=initialAiSponsorTotal*0.90&&maxTotal<=initialAiSponsorTotal*1.10,{initial:Math.round(initialAiSponsorTotal*1000)/1000,min:minTotal,max:maxTotal});

report.metrics={clubs:w.clubs.order.length,humanClubId:humanId,contractsCreated:summary.contractsCreated,clubsFilled:summary.clubsFilled,missingAfter:summary.missingAfter,bySlot:summary.bySlot,initialAiSponsorTotal:Math.round(initialAiSponsorTotal*1000)/1000,aiFinanceMetrics,sponsorSeasons};
const out=path.join(root,'reports','kf_0.25.5_fix_regression_test.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:out},null,2));process.exit(report.passed?0:1);
