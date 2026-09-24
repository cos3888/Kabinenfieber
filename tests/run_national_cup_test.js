const fs = require('fs'); const vm = require('vm'); const path = require('path');
class FakeElement { constructor(){ this.innerHTML=''; this.style={}; this.dataset={}; this.classList={add(){},remove(){},contains(){return false;}}; } addEventListener(){} removeEventListener(){} setAttribute(k,v){this[k]=v;} getAttribute(k){return this[k]||null;} querySelector(){return null;} querySelectorAll(){return [];} getBoundingClientRect(){return {width:1760,height:990};} }
const elements={'app-root':new FakeElement(),'modal-root':new FakeElement(),'app-shell':new FakeElement()};
const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new FakeElement(),getElementById(id){return elements[id]||null;},addEventListener(t,cb){if(t==='DOMContentLoaded')this._domReady=cb;},removeEventListener(){},createElement(){return new FakeElement();},querySelector(){return null;},querySelectorAll(){return[]}};
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame(cb){return cb();},cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:FakeElement,navigator:{userAgent:'node-test'}};
const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:FakeElement,navigator:windowObj.navigator});
function runFile(file){ vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file}); }
runFile('src/static-data.js'); runFile('src/db1-db2-data.js');
let appCode=fs.readFileSync(path.join(__dirname,'..','src/app.bundle.js'),'utf8');
appCode=appCode.replace(/\n  function boot\(\)\{/, `\n  window.KFTest={AppState:AppState,startNewCareer:startNewCareer,ensureDueNationalCupDraws:ensureDueNationalCupDraws,nationalCupSlotForRound:nationalCupSlotForRound,slotIndexForKey:slotIndexForKey,simulateLeagueFixture:simulateLeagueFixture,recordPlayedMatch:recordPlayedMatch,winnerClubIdFromFinalMatch:winnerClubIdFromFinalMatch,matchDisplayScore:matchDisplayScore,renderCupDrawView:renderCupDrawView,buildCompetitionHistoryRows:buildCompetitionHistoryRows,buildLeagueTable:buildLeagueTable};\n  function boot(){`);
vm.runInContext(appCode,context,{filename:'src/app.bundle.js'}); if(document._domReady)document._domReady();
const T=windowObj.KFTest; const report={passed:true,checks:[]}; function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details}); if(!ok)report.passed=false;}
function level(w,id){return Number((w.clubs.byId[id]||{}).leagueLevel||0)} function country(w,id){return (w.clubs.byId[id]||{}).countryName}
function cupFixtures(w,c,r){return (w.calendar.fixtures||[]).filter(f=>f.competition==='cup'&&f.countryName===c&&Number(f.roundNumber||0)===Number(r));}
T.startNewCareer(); const w=T.AppState.world; const l3=w.clubs.order.find(id=>level(w,id)===3&&country(w,id)==='Deutschland'); const l1=w.clubs.order.find(id=>level(w,id)===1&&country(w,id)==='Deutschland');
function due(round){const target=T.nationalCupSlotForRound(w,round); return w.calendar.slots[Math.max(0,T.slotIndexForKey(w,target.key)-4)];}
let d1=T.ensureDueNationalCupDraws(w,due(1),{activeClubId:l3}); let draw1=d1.visibleDraw||(d1.draws||[]).find(d=>d.countryName==='Deutschland');
check('Runde-1-Auslosung sichtbar und erzeugt 14 Spiele', !!draw1 && cupFixtures(w,'Deutschland',1).length===14, {round:draw1&&draw1.roundNumber});
let r1=cupFixtures(w,'Deutschland',1); check('Runde 1 hat 4 Liga-2-Duelle und 10 Liga-2/Liga-3-Duelle', r1.filter(f=>level(w,f.homeClubId)===2&&level(w,f.awayClubId)===2).length===4 && r1.filter(f=>[level(w,f.homeClubId),level(w,f.awayClubId)].sort().join('-')==='2-3').length===10, {});
r1.forEach(f=>{const m=T.simulateLeagueFixture(w,f); T.recordPlayedMatch(w,f,m);});
let d2=T.ensureDueNationalCupDraws(w,due(2),{activeClubId:l1}); let r2=cupFixtures(w,'Deutschland',2);
check('Runde-2-Auslosung fuer Erstligist sichtbar und erzeugt 16 Spiele', !!d2.visibleDraw && r2.length===16, {r2:r2.length});
r2.slice(0,3).forEach(f=>{const m=T.simulateLeagueFixture(w,f); T.recordPlayedMatch(w,f,m);});
const played=(w.history.matches||[]).filter(m=>m.competition==='cup'&&m.countryName==='Deutschland');
check('Gespielte Pokalspiele haben eindeutige Sieger', played.length>0 && played.every(m=>T.winnerClubIdFromFinalMatch(m)), {played:played.length});
const rows=T.buildCompetitionHistoryRows(w,'cup','Deutschland'); check('Pokal-Historie wertet keine Remis als Endzustand', rows.every(r=>Number(r.draws||0)===0), {});
T.AppState.session.activeClubId=l3; if (T.AppState.session.localController) T.AppState.session.localController.clubId=l3; const html=draw1?(T.AppState.ui.cupDrawId=draw1.id,T.renderCupDrawView()):''; check('Auslosungsmenue rendert im Fensterstil', /Pokal-Auslosung/.test(html)&&/Live-Ziehung/.test(html)&&/Topf/.test(html), {htmlLen:html.length});
const out=path.join(__dirname,'..','reports','current_national_cup_test.json'); fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,JSON.stringify(report,null,2)); console.log(JSON.stringify({...report,reportFile:out},null,2)); process.exit(report.passed?0:1);
