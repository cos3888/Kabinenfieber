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
const injection=`\n  window.KFTest = { AppState:AppState, StaticData:StaticData, startNewCareer:startNewCareer, simulateLeagueFixture:simulateLeagueFixture, renderMatchInfoModalBody:renderMatchInfoModalBody, reportRelevantEvents:reportRelevantEvents, reportDisplayEvents:reportDisplayEvents, matchEventText:matchEventText, matchBriefText:matchBriefText, matchHeadlineText:matchHeadlineText };\n`;
appCode=appCode.replace(/\n  function boot\(\)\{/, injection+'\n  function boot(){');
vm.runInContext(appCode,context,{filename:'src/app.bundle.js'}); if(document._domReady)document._domReady();
const T=windowObj.KFTest;
const report={passed:true,checks:[],metrics:{},samples:[]};
function check(name, ok, details={}){ report.checks.push({name,ok:!!ok,details}); if(!ok) report.passed=false; }
function key(ev){ return ev && (ev.type || ev.situationId) || ''; }
function isGoal(ev){ return ['goal','penalty_goal'].includes(key(ev)); }
function isShot(ev){ return ['goal','penalty_goal','shot_saved','keeper_save_big','keeper_save_strong','keeper_save_simple','shot_missed','shot_blocked','woodwork','shot_from_distance','shot_under_pressure','shot_clear'].includes(key(ev)); }
function isSot(ev){ return ['goal','penalty_goal','shot_saved','keeper_save_big','keeper_save_strong','keeper_save_simple'].includes(key(ev)); }
function isBig(ev){ return key(ev)==='big_chance' || key(ev)==='shot_clear' || (isShot(ev) && Number(ev.xg||0)>=0.25); }
function sideCount(events, side, fn){ return events.filter(ev=>ev.side===side && fn(ev)).length; }
function strip(html){ return String(html||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(); }
function textBad(text){ return /(undefined|null|\{team\}|\{opponent\}|\{player\}|Spielgerät|Spielgeraet|verfindet|\bdie Hausherren (bringt|kommt|hat|nutzt|bleibt|sucht)\b|\bdie Gäste (bringt|kommt|hat|nutzt|bleibt|sucht)\b)/i.test(text||''); }
T.startNewCareer();
const world=T.AppState.world;
const fixtures=world.calendar.fixtures.filter(f=>f.competition==='league').slice(0,18);
const matches=fixtures.map(f=>T.simulateLeagueFixture(world,f));
let missingKickoff=0, missingHalftime=0, missingFulltime=0, goalMisses=0, statOverclaims=0, badTexts=0, hugeGaps=0, earlySidewechsel=0, repeatedGapText=0, badSameMinuteOrder=0;
const samples=[];
matches.forEach(m=>{
  const display=T.reportDisplayEvents(m);
  const core=T.reportRelevantEvents(m);
  const eventIds=new Set(display.map(e=>e.eventId));
  const goals=(m.events||[]).filter(isGoal);
  if(!display.length || key(display[0])!=='report_kickoff') missingKickoff++;
  if(!display.some(e=>key(e)==='report_halftime' && Number(e.minute||0)===45)) missingHalftime++;
  if(!display.length || key(display[display.length-1])!=='report_fulltime') missingFulltime++;
  goals.forEach(g=>{ if(!eventIds.has(g.eventId)) goalMisses++; });
  for(const side of ['home','away']){
    const stats=m.matchStats||{};
    const shotsStat=Number((stats.shots||{})[side]||0);
    const sotStat=Number((stats.shotsOnTarget||{})[side]||0);
    const bigStat=Number((stats.bigChances||{})[side]||0);
    const dShots=sideCount(display,side,isShot);
    const dSot=sideCount(display,side,isSot);
    const dBig=sideCount(display,side,isBig);
    if(dShots>shotsStat || dSot>sotStat || dBig>bigStat) statOverclaims++;
  }
  const html=T.renderMatchInfoModalBody(m.id,'events')+'\n'+T.renderMatchInfoModalBody(m.id,'analysis')+'\n'+T.matchHeadlineText(world,m)+'\n'+T.matchBriefText(world,m);
  if(textBad(strip(html))) badTexts++;
  const relevant = display.filter(e=>!['report_kickoff','report_fulltime','report_phase_gap'].includes(key(e)));
  const gapTexts=new Set();
  display.forEach(e=>{
    if(key(e)==='report_phase_gap'){
      const text=T.matchEventText(world,m,e);
      if(Number(e.minute||0)<46 && /Seitenwechsel/i.test(text)) earlySidewechsel++;
      if(gapTexts.has(text)) repeatedGapText++;
      gapTexts.add(text);
    }
  });
  for(let i=1;i<display.length;i++){
    const gap=Number(display[i].minute||0)-Number(display[i-1].minute||0);
    if(gap>=20) hugeGaps++;
    if(Number(display[i].minute||0)===Number(display[i-1].minute||0) && T.reportRelevantEvents && key(display[i-1])==='goal' && ['big_chance','medium_chance','low_chance','shot_clear','keeper_one_on_one'].includes(key(display[i]))) badSameMinuteOrder++;
  }
  samples.push({id:m.id,result:`${m.homeGoals}:${m.awayGoals}`,displayEvents:display.length,coreEvents:core.length,first:key(display[0]),last:key(display[display.length-1]),headline:T.matchHeadlineText(world,m),brief:T.matchBriefText(world,m)});
});
report.metrics={sampleSize:matches.length,missingKickoff,missingHalftime,missingFulltime,goalMisses,statOverclaims,badTexts,hugeGaps,earlySidewechsel,repeatedGapText,badSameMinuteOrder};
check('Jeder Bericht beginnt mit Anstoß', missingKickoff===0, {missingKickoff});
check('Jeder Bericht enthält die Halbzeit', missingHalftime===0, {missingHalftime});
check('Jeder Bericht endet mit Abpfiff', missingFulltime===0, {missingFulltime});
check('Alle Tore bleiben im Bericht', goalMisses===0, {goalMisses});
check('Bericht behauptet nicht mehr Schüsse/Schüsse aufs Tor/Großchancen als Spielwerte', statOverclaims===0, {statOverclaims});
check('Berichte haben keine großen unkommentierten Lücken ab 20 Minuten', hugeGaps===0, {hugeGaps});
check('Seitenwechsel-Lückenfüller stehen nicht vor Minute 46', earlySidewechsel===0, {earlySidewechsel});
check('Lückenfüller wiederholen sich nicht im selben Bericht', repeatedGapText===0, {repeatedGapText});
check('Events gleicher Minute erzählen Chance vor Tor', badSameMinuteOrder===0, {badSameMinuteOrder});
check('Gerenderte Texte enthalten keine offenen Platzhalter oder bekannten Rollenfehler', badTexts===0, {badTexts});
report.samples=samples.slice(0,6);
const out=path.join(__dirname,'..','reports','current_report_consistency_test.json'); fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,checks:report.checks,metrics:report.metrics,reportFile:out},null,2));
process.exit(report.passed?0:1);
