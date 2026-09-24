const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(root,r),'utf8');
const report={passed:true,checks:[],metrics:{seasons:[]}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
class E{constructor(){this.innerHTML='';this.style={};this.dataset={};this.value='';this.classList={add(){},remove(){},contains(){return false}}}addEventListener(){}removeEventListener(){}setAttribute(k,v){this[k]=v}getAttribute(k){return this[k]||null}querySelector(){return null}querySelectorAll(){return[]}closest(){return null}getBoundingClientRect(){return{width:1760,height:990}}}
const els={'app-root':new E(),'modal-root':new E(),'app-shell':new E()};
const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new E(),getElementById:id=>els[id]||null,addEventListener(t,cb){if(t==='DOMContentLoaded')this.cb=cb},removeEventListener(){},createElement(){return new E()},querySelector(){return null},querySelectorAll(){return[]}};
let seed=123456789;function seededRandom(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}
const math=Object.create(Math);math.random=seededRandom;
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame:cb=>cb(),cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:E,navigator:{userAgent:'node-test'},performance:{now:()=>Date.now()},localStorage:{getItem(){return null},setItem(){}}};
const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:E,navigator:windowObj.navigator,performance:windowObj.performance,Math:math});
for(const f of ['src/static-data.js','src/db1-db2-data.js'])vm.runInContext(read(f),context,{filename:f});
let code=read('src/app.bundle.js');
code=code.replace(/\n  if \(document\.readyState === 'loading'\) \{/,`\n  window.KFTest={AppState,startNewCareer,advanceIntoNextSeason,runPlayerFinancialValuation,kf024MaintainUncontrolledClubMinimumRosters,assignTrainerClub};\n  if (document.readyState === 'loading') {`);
vm.runInContext(code,context,{filename:'src/app.bundle.js'});if(document.cb)document.cb();const T=windowObj.KFTest;
T.startNewCareer();const w=T.AppState.world;
const humanClubId=w.clubs.order[0],humanSquad=w.squads[humanClubId];
T.assignTrainerClub(T.AppState.worldRecord,T.AppState.session.activeTrainerId,humanClubId);T.AppState.session.activeClubId=humanClubId;
const humanExpiring=(humanSquad.playerIds||[]).slice(0,3).map(id=>w.players.byId[id]).filter(Boolean);humanExpiring.forEach(p=>{if(p.contract)p.contract.validUntilSeason=1;});
T.kf024MaintainUncontrolledClubMinimumRosters(w,1,22);
check('Neutral roster maintenance never extends a human-controlled club automatically',humanExpiring.every(p=>p.contract&&Number(p.contract.validUntilSeason)===1),{clubId:humanClubId,players:humanExpiring.map(p=>({id:p.id,validUntilSeason:p.contract&&p.contract.validUntilSeason}))});
for(let season=1;season<=4;season++){
  const mid=T.runPlayerFinancialValuation(w,'midseason',{history:true});
  const t0=Date.now();T.advanceIntoNextSeason(w);const ms=Date.now()-t0;
  const clubSizes=w.clubs.order.map(id=>((w.squads[id]||{}).playerIds||[]).filter(pid=>w.players.byId[pid]&&!w.players.byId[pid].retired).length);const uncontrolledSizes=w.clubs.order.filter(id=>id!==humanClubId).map(id=>((w.squads[id]||{}).playerIds||[]).filter(pid=>w.players.byId[pid]&&!w.players.byId[pid].retired).length);
  const activePlayers=w.players.order.filter(id=>w.players.byId[id]&&!w.players.byId[id].retired).length;
  const freeAgents=w.players.order.filter(id=>{const p=w.players.byId[id];return p&&!p.retired&&!p.clubId;}).length;
  const histories=Object.values((w.history||{}).playerMarketValues||{}),historyEntries=histories.reduce((n,rows)=>n+(rows||[]).length,0);
  const maxPerSeason=Math.max(0,...histories.flatMap(rows=>{const c={};for(const r of rows||[])c[r.season]=(c[r.season]||0)+1;return Object.values(c);}));
  report.metrics.seasons.push({completedSeason:season,newSeason:w.meta.seasonNumber,transitionMs:ms,minSquad:Math.min(...clubSizes),maxSquad:Math.max(...clubSizes),under18:uncontrolledSizes.filter(n=>n<18).length,under22:uncontrolledSizes.filter(n=>n<22).length,activePlayers,freeAgents,historyEntries,maxMarketValueEntriesPerPlayerSeason:maxPerSeason,midHistoryEntries:mid.historyEntries||0});
}
check('World reaches season 5',Number(w.meta.seasonNumber)===5,{season:w.meta.seasonNumber});
check('No uncontrolled club drops below the 22-player operational minimum',report.metrics.seasons.every(s=>s.under22===0),{seasons:report.metrics.seasons});
check('Market-value history never exceeds two entries per player and season',report.metrics.seasons.every(s=>s.maxMarketValueEntriesPerPlayerSeason<=2),{seasons:report.metrics.seasons});
check('Season-transition runtime does not show explosive growth',report.metrics.seasons.every(s=>s.transitionMs<30000),{seasons:report.metrics.seasons});
const out=path.join(root,'reports','current_multiseason_stability_test.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:out},null,2));process.exit(report.passed?0:1);
