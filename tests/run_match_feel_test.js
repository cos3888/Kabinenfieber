const fs = require('fs');
const vm = require('vm');
const path = require('path');
class FakeElement { constructor(id=''){ this.id=id; this.nodeType=1; this.innerHTML=''; this.style={}; this.dataset={}; this.classList={add(){},remove(){},contains(){return false;}}; this.children=[]; this.parentNode=null; this.tBodies=[]; this.tagName='DIV'; this.textContent=''; this.value=''; this.checked=false; } addEventListener(){} removeEventListener(){} setAttribute(k,v){this[k]=v;} getAttribute(k){return this[k]||null;} removeAttribute(k){delete this[k];} closest(){return null;} querySelectorAll(){return [];} querySelector(){return null;} getBoundingClientRect(){return{width:1760,height:990};} appendChild(c){this.children.push(c); c.parentNode=this; return c;} }
const elements={'app-root':new FakeElement('app-root'),'modal-root':new FakeElement('modal-root'),'app-shell':new FakeElement('app-shell'),'sim-progress-text':new FakeElement('sim-progress-text')};
const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new FakeElement('body'),getElementById(id){return elements[id]||null;},addEventListener(type,cb){if(type==='DOMContentLoaded')this._domReady=cb;},removeEventListener(){},createElement(tag){const el=new FakeElement(); el.tagName=String(tag||'div').toUpperCase(); return el;},querySelectorAll(){return[];},querySelector(){return null;}};
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame(cb){return cb();},cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:FakeElement,navigator:{userAgent:'node-test'}};
const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:FakeElement,navigator:windowObj.navigator});
function runFile(file){vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file});}
runFile('src/static-data.js'); try{runFile('src/db1-db2-data.js');}catch(_){ }
let appCode=fs.readFileSync(path.join(__dirname,'..','src/app.bundle.js'),'utf8');
const injection=`\n  window.KFTest = { AppState:AppState, StaticData:StaticData, startNewCareer:startNewCareer, simulateLeagueFixture:simulateLeagueFixture, recordPlayedMatch:recordPlayedMatch, fixturesForSlot:fixturesForSlot, renderMatchInfoModalBody:renderMatchInfoModalBody, reportRelevantEvents:reportRelevantEvents, matchBriefText:matchBriefText, matchHeadlineText:matchHeadlineText, heatmapCellsForMatch:heatmapCellsForMatch, clubNameById:clubNameById, ensureSquadTactics:ensureSquadTactics };\n`;
appCode=appCode.replace(/\n  function boot\(\)\{/, injection+'\n  function boot(){');
vm.runInContext(appCode,context,{filename:'src/app.bundle.js'}); if(document._domReady)document._domReady();
const T=windowObj.KFTest;
const report={passed:true, checks:[], metrics:{}, samples:[]};
function check(name, ok, details={}){report.checks.push({name,ok:!!ok,details}); if(!ok)report.passed=false;}
function avg(arr){return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;}
function terminal(e){return ['goal','penalty_goal','shot_saved','keeper_save_big','keeper_save_strong','keeper_save_simple','shot_missed','shot_blocked','woodwork','shot_from_distance','shot_under_pressure','shot_clear'].includes(e.type||e.situationId);}
function badText(html){return /(undefined|\{team\}|\{opponent\}|\{player\}|\bueber\b|\bAussen|\bRaeume\b|\bBaelle\b|\bfuer\b)/i.test(html||'');}
T.startNewCareer();
const world=T.AppState.world;
const fixtures=world.calendar.fixtures.filter(f=>f.competition==='league').slice(0,20);
const matches=fixtures.map(f=>T.simulateLeagueFixture(world,f));
const totals=matches.map(m=>m.homeGoals+m.awayGoals);
const xgs=matches.map(m=>Number(m.matchStats.expectedGoals.home||0)+Number(m.matchStats.expectedGoals.away||0));
const shots=matches.map(m=>Number(m.matchStats.shots.home||0)+Number(m.matchStats.shots.away||0));
const reportCounts=matches.map(m=>T.reportRelevantEvents(m).length);
const reportFirstMinute=matches.map(m=>{const r=T.reportRelevantEvents(m); return r.length?Number(r[0].minute||0):99;});
const lateStarts=reportFirstMinute.filter(m=>m>45).length;
const extremes=matches.filter(m=> (m.homeGoals>=3 && Number(m.matchStats.expectedGoals.home||0)<0.8) || (m.awayGoals>=3 && Number(m.matchStats.expectedGoals.away||0)<0.8));
const tacticalTimelineCount=matches.filter(m=>m.usedTacticsTimeline && ((m.usedTacticsTimeline.home||[]).length>1 || (m.usedTacticsTimeline.away||[]).length>1)).length;
let textProblems=[];
matches.slice(0,30).forEach(m=>{
  const overview=T.renderMatchInfoModalBody(m.id,'overview');
  const events=T.renderMatchInfoModalBody(m.id,'events');
  const analysis=T.renderMatchInfoModalBody(m.id,'analysis');
  if(badText(overview)||badText(events)||badText(analysis)) textProblems.push({matchId:m.id});
});
report.metrics={
  sampleSize:matches.length,
  avgGoals:+avg(totals).toFixed(2),
  avgXg:+avg(xgs).toFixed(2),
  avgShots:+avg(shots).toFixed(2),
  avgReportEvents:+avg(reportCounts).toFixed(2),
  lateReportStarts:lateStarts,
  extremeLowXgHighGoalMatches:extremes.length,
  tacticalTimelineMatches:tacticalTimelineCount,
  textProblems:textProblems.length,
  textBlockCounts:{
    eventTextBlocks:Object.values(T.StaticData.matchTextBlocks||{}).reduce((sum,arr)=>sum+(arr||[]).length,0),
    shortReports:(T.StaticData.matchShortReportBlocks||[]).length,
    headlines:(((T.StaticData.matchSummaryBlocks||{}).headline)||[]).length,
    summaries:(((T.StaticData.matchSummaryBlocks||{}).summary)||[]).length,
    analysis:Object.values(T.StaticData.matchAnalysisBlocks||{}).reduce((sum,arr)=>sum+(arr||[]).length,0)
  }
};
check('Durchschnittliche Matchdichte liegt im spielbaren Korridor', report.metrics.avgShots>=12 && report.metrics.avgShots<=30 && report.metrics.avgXg>=1.6 && report.metrics.avgXg<=4.2, report.metrics);
check('Berichte starten nicht regelmäßig erst nach der Halbzeit', lateStarts <= Math.max(2, Math.round(matches.length*0.08)), {lateStarts, sampleSize:matches.length});
check('Berichte haben ausreichend Ereignisdichte', report.metrics.avgReportEvents>=8 && report.metrics.avgReportEvents<=21, {avgReportEvents:report.metrics.avgReportEvents});
check('Extreme 3-Tore-unter-0,8-xG-Fälle bleiben selten', extremes.length <= Math.max(1, Math.round(matches.length*0.03)), {extremes:extremes.length});
check('KI-Trainerreaktionen werden in der Sofortberechnung historisch gespeichert', tacticalTimelineCount > 0, {tacticalTimelineCount});
check('Textausgabe enthält keine offenen Platzhalter oder alte ASCII-Umschreibungen', textProblems.length===0, {textProblems:textProblems.slice(0,5)});
check('Textfundament ist deutlich erweitert', report.metrics.textBlockCounts.shortReports>=25 && report.metrics.textBlockCounts.headlines>=25 && report.metrics.textBlockCounts.summaries>=30 && report.metrics.textBlockCounts.analysis>=150, report.metrics.textBlockCounts);
report.samples=matches.slice(0,5).map(m=>({id:m.id,result:`${m.homeGoals}:${m.awayGoals}`,xg:m.matchStats.expectedGoals,shots:m.matchStats.shots,reportEvents:T.reportRelevantEvents(m).length,headline:T.matchHeadlineText(world,m),brief:T.matchBriefText(world,m),timeline:m.usedTacticsTimeline}));
const out=path.join(__dirname,'..','reports','current_match_feel_test.json'); fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({ passed: report.passed, checks: report.checks, metrics: report.metrics, reportFile: out }, null, 2));
process.exit(report.passed?0:1);
