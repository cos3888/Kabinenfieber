const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(root,r),'utf8');
const report={passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
class E{constructor(){this.innerHTML='';this.style={};this.dataset={};this.value='';this.classList={add(){},remove(){},contains(){return false}}}addEventListener(){}removeEventListener(){}setAttribute(k,v){this[k]=v}getAttribute(k){return this[k]||null}querySelector(){return null}querySelectorAll(){return[]}closest(){return null}getBoundingClientRect(){return{width:1760,height:990}}}
const els={'app-root':new E(),'modal-root':new E(),'app-shell':new E()};
const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new E(),getElementById:id=>els[id]||null,addEventListener(t,cb){if(t==='DOMContentLoaded')this.cb=cb},removeEventListener(){},createElement(){return new E()},querySelector(){return null},querySelectorAll(){return[]}};
let seed=250026;const math=Object.create(Math);math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame:cb=>cb(),cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:E,navigator:{userAgent:'node-test'},performance:{now:()=>Date.now()},localStorage:{getItem(){return null},setItem(){}}};
const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:E,navigator:windowObj.navigator,performance:windowObj.performance,Math:math,Map,WeakMap,Set});
for(const f of ['src/static-data.js','src/db1-db2-data.js'])vm.runInContext(read(f),context,{filename:f});
let code=read('src/app.bundle.js');
code=code.replace(/\n  if \(document\.readyState === 'loading'\) \{/,`\n  /* Test-only: keep the real final season-transition function, but stub unrelated heavy subsystems. */\n  ensureSeasonFinalPhaseSetup=function(){ return {standings:[],relegationTies:[]}; };\n  finalizeSeasonStandings=function(){ return []; };\n  refreshClubAggregates=function(){}; updateClubSeasonValues=function(){}; applySeasonLeagueChanges=function(){};\n  kf021DetermineLeagueOutcomes=function(){ return {promotedClubIds:[],relegatedClubIds:[]}; };\n  kf021ProcessSeasonPlayerBonuses=function(){ return {}; }; kf021ProcessTransferSuccessAddons=function(){};\n  processLoanPurchaseObligationsAtSeasonEnd=function(){ return 0; }; kf021ApplySeasonContractClauses=function(){ return 0; };\n  processContractOptionDeadline=function(){ return 0; }; kf024MaintainUncontrolledClubMinimumRosters=function(){ return {clubsTouched:0,contractsExtended:0}; };\n  recordLicenceDecisionForSeasonEnd=function(){ return []; }; kf021ApplyPendingInsolvencies=function(){ return {clubs:[],released:0}; };\n  processExpiringContractsAtSeasonEnd=function(){ return 0; }; returnDueLoanPlayers=function(){ return 0; };\n  processPlayerKnowledgeForSeasonEnd=function(){ return {}; }; runPlayerFinancialValuation=function(){ return {updated:0,historyEntries:0}; }; markPlayerMarketValuationCheckpoint=function(){};\n  resetPlayersForNewSeason=function(){}; processCareerEndAndNewPlayers=function(){ return {}; }; generateLeagueSchedule=function(){}; kf0251InvalidateCalendarRuntimeIndex=function(){};\n  kf021AddInsolvencyYouth=function(){ return {}; }; processDueFutureMovements=function(){ return 0; }; processDueTransferNegotiationResponses=function(){};\n  decrementActiveStatusesForSlot=function(){}; kf0251EnsureNormalMinimumRosters=function(){ return 0; }; kf0251ArchiveSeasonMatches=function(){ return 0; }; refreshAllClubRosterContractAggregates=function(){};\n  window.KFTest={AppState,startNewCareer,advanceIntoNextSeason,sponsorContractsForClub,assignTrainerClub,worldRecordForGameState,kf0255AutoFillAiSponsorSlots,buildCalendar,financeEventsForSeason};\n  if (document.readyState === 'loading') {`);
vm.runInContext(code,context,{filename:'src/app.bundle.js'});if(document.cb)document.cb();
const T=windowObj.KFTest;
check('KF_0.25.6 Sponsorfix bleibt unter KF_0.29.3 aktiv',code.includes("var KF_VERSION = '0.29.3';")&&read('index.html').includes('KF_0.29.3')&&JSON.parse(read('package.json')).version==='0.29.3',{});
check('Tatsaechlich aktiver licence-aware Saisonwechsel ruft Sponsor-Autofill direkt nach resetFinanceForNewSeason auf',/Sporting obligations are resolved before the licence[\s\S]*?advanceIntoNextSeason=function\(world\)\{[\s\S]*?step\('finance_new_season',[\s\S]*?resetFinanceForNewSeason\(world,previousSeason\);world\.meta\.lastAiSponsorAutofill=kf0255AutoFillAiSponsorSlots\(world,world\.meta\.seasonNumber\);refreshClubAggregates\(world\)/.test(code),{});
check('Sponsor-Lookups verwenden nur einen ableitbaren Runtime-Index und keine persistente zweite Wahrheit',/var kf0256SponsorContractIndexByWorld = new WeakMap\(\);[\s\S]*?function sponsorContractsForClub/.test(code)&&!code.includes('world.sponsorContracts.byClub'),{});

T.startNewCareer();
const w=T.AppState.world,humanId=w.clubs.order[0],record=T.worldRecordForGameState(w);
const assigned=T.assignTrainerClub(record,(T.AppState.session||{}).activeTrainerId,humanId);
check('Humanclub wird ueber echtes Membership-Modell gesetzt',assigned&&assigned.ok,{humanId});
let indexMismatch=0;
for(const season of [1,2,3]){
  for(const clubId of w.clubs.order){
    const indexed=T.sponsorContractsForClub(w,clubId,season).map(c=>c.id).sort();
    const raw=((w.sponsorContracts||{}).order||[]).map(id=>w.sponsorContracts.byId[id]).filter(c=>c&&c.clubId===clubId&&c.status==='active'&&Number(c.startSeasonId||1)<=season&&Number(c.endSeasonId||1)>=season).map(c=>c.id).sort();
    if(indexed.length!==raw.length||indexed.some((id,i)=>id!==raw[i]))indexMismatch++;
  }
}
check('Runtime-Sponsorindex liefert exakt dieselben aktiven Vertraege wie die kanonische Historie',indexMismatch===0,{indexMismatch});
const maxSlots=10,aiIds=w.clubs.order.filter(id=>id!==humanId);
function activeCount(clubId,season){return T.sponsorContractsForClub(w,clubId,season).length;}
check('Vor dem kritischen Wechsel sind alle KI-Clubs auch in Saison 2 noch 10/10 belegt',aiIds.every(id=>activeCount(id,2)===maxSlots),{clubs:aiIds.length});
check('Humanclub wird durch Autofill nicht auf 10/10 gezwungen',activeCount(humanId,2)<maxSlots,{humanContracts:activeCount(humanId,2)});

/* Direkt auf den kritischen S2->S3-Zustand gehen: Startvertraege laufen Ende S2 aus. */
w.meta.seasonNumber=2;
w.calendar=T.buildCalendar(2);
const t0=Date.now();
const result=T.advanceIntoNextSeason(w);
const transitionMs=Date.now()-t0;
check('Echter advanceIntoNextSeason wechselt von S2 auf S3',Number(w.meta.seasonNumber)===3&&result&&Number(result.newSeason)===3,{season:w.meta.seasonNumber,transitionMs});
const s3Counts=aiIds.map(id=>activeCount(id,3));
check('Kritischer S3-Integrationsfall: alle KI-Clubs werden im echten Saisonwechsel wieder 10/10 belegt',s3Counts.every(n=>n===maxSlots),{min:Math.min(...s3Counts),max:Math.max(...s3Counts)});
check('S3-Autofill wurde im echten Saisonwechsel ausgefuehrt',w.meta.lastAiSponsorAutofill&&Number(w.meta.lastAiSponsorAutofill.season)===3&&Number(w.meta.lastAiSponsorAutofill.contractsCreated)>0,{lastAiSponsorAutofill:w.meta.lastAiSponsorAutofill});
check('Humanclub bleibt auch im echten S3-Saisonwechsel unangetastet',activeCount(humanId,3)===0,{humanContracts:activeCount(humanId,3)});
let duplicateClubs=0,mainConflicts=0;const mainSeen=new Set();
for(const clubId of aiIds){const used=new Set();for(const c of T.sponsorContractsForClub(w,clubId,3)){if(used.has(c.sponsorId))duplicateClubs++;used.add(c.sponsorId);if(c.slotType==='main'){const key=w.clubs.byId[clubId].countryName+'|'+c.sponsorId;if(mainSeen.has(key))mainConflicts++;mainSeen.add(key);}}}
check('S3 erzeugt weder Sponsor-Doppelbelegung noch Hauptsponsor-Konflikte',duplicateClubs===0&&mainConflicts===0,{duplicateClubs,mainConflicts});
const s3IncomeMissing=aiIds.filter(id=>{const cs=T.sponsorContractsForClub(w,id,3);const events=T.financeEventsForSeason(w,id,3).filter(ev=>ev&&ev.type==='sponsorIncome');return events.length!==cs.length;});
check('Neu geschlossene S3-Vertraege buchen ihre Sponsorzahlung im neuen Finanzjahr',s3IncomeMissing.length===0,{clubsWithMismatch:s3IncomeMissing.length,sample:s3IncomeMissing.slice(0,5)});

/* Der Algorithmus selbst war bereits bis S10 geprueft; fuer 0.25.6 sichern wir zusaetzlich die Folgeerneuerung S5 nach dem echten S3-Einstieg. */
w.meta.seasonNumber=4;w.meta.lastAiSponsorAutofill=T.kf0255AutoFillAiSponsorSlots(w,4);
check('S4 benoetigt wegen Zweijahreslaufzeit keine erneute KI-Vertragswelle',Number(w.meta.lastAiSponsorAutofill.contractsCreated)===0&&aiIds.every(id=>activeCount(id,4)===maxSlots),{summary:w.meta.lastAiSponsorAutofill});
w.meta.seasonNumber=5;w.meta.lastAiSponsorAutofill=T.kf0255AutoFillAiSponsorSlots(w,5);
check('S5 erneuert die in S3 gestarteten Zweijahresvertraege wieder vollstaendig',Number(w.meta.lastAiSponsorAutofill.contractsCreated)>0&&aiIds.every(id=>activeCount(id,5)===maxSlots),{summary:w.meta.lastAiSponsorAutofill});

report.metrics={clubs:w.clubs.order.length,humanClubId:humanId,transitionMs,lastAiSponsorAutofill:w.meta.lastAiSponsorAutofill,s3ContractCount:s3Counts.reduce((a,b)=>a+b,0)};
const out=path.join(root,'reports','kf_0.25.6_fix_regression_test.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:out},null,2));process.exit(report.passed?0:1);
