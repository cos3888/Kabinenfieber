const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(root,r),'utf8');
const report={passed:true,checks:[],metrics:{seasons:[]}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
class E{constructor(){this.innerHTML='';this.style={};this.dataset={};this.value='';this.classList={add(){},remove(){},contains(){return false}}}addEventListener(){}removeEventListener(){}setAttribute(k,v){this[k]=v}getAttribute(k){return this[k]||null}querySelector(){return null}querySelectorAll(){return[]}closest(){return null}getBoundingClientRect(){return{width:1760,height:990}}}
const els={'app-root':new E(),'modal-root':new E(),'app-shell':new E()};
const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new E(),getElementById:id=>els[id]||null,addEventListener(t,cb){if(t==='DOMContentLoaded')this.cb=cb},removeEventListener(){},createElement(){return new E()},querySelector(){return null},querySelectorAll(){return[]}};
let seed=260210;function seededRandom(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;} const math=Object.create(Math);math.random=seededRandom;
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame:cb=>cb(),cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:E,navigator:{userAgent:'node-test'},performance:{now:()=>Date.now()},localStorage:{getItem(){return null},setItem(){}}};
const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:E,navigator:windowObj.navigator,performance:windowObj.performance,Math:math});
for(const f of ['src/static-data.js','src/db1-db2-data.js'])vm.runInContext(read(f),context,{filename:f});
let code=read('src/app.bundle.js');
code=code.replace(/\n  if \(document\.readyState === 'loading'\) \{/,`\n  window.KFTest={AppState,startNewCareer,retirePlayersForSeasonEnd};\n  if (document.readyState === 'loading') {`);
vm.runInContext(code,context,{filename:'src/app.bundle.js'});if(document.cb)document.cb();const T=windowObj.KFTest;
T.startNewCareer();const w=T.AppState.world,initialActive=Object.keys(w.players.byId||{}).length;
for(let season=1;season<=10;season++){
  const t0=Date.now(),result=T.retirePlayersForSeasonEnd(w,season),ms=Date.now()-t0;
  Object.values(w.players.byId||{}).forEach(p=>{p.age=Number(p.age||18)+1;});
  report.metrics.seasons.push({season,retiredThisSeason:(result.retired||[]).length,activePlayers:Object.keys(w.players.byId||{}).length,retiredPlayers:Object.keys(((((w.history||{}).retiredPlayers||{}).byId)||{})).length,lifecycleMs:ms});
}
const active=w.players.byId||{},activeIds=Object.keys(active),order=w.players.order||[],retiredStore=(((w.history||{}).retiredPlayers||{}).byId)||{},retiredIds=Object.keys(retiredStore);
check('10 lifecycle seasons were processed',report.metrics.seasons.length===10,{seasons:report.metrics.seasons.length});
check('Retirees accumulate in compact historical store',retiredIds.length>0,{retiredPlayers:retiredIds.length});
check('Active truth shrinks exactly by archived retirements without duplicate identities',activeIds.length+retiredIds.length===initialActive,{initialActive,activePlayers:activeIds.length,retiredPlayers:retiredIds.length});
check('Active byId and players.order stay aligned',activeIds.length===order.length&&order.every(id=>!!active[id]),{byId:activeIds.length,order:order.length});
check('No retired player remains in active truth',activeIds.every(id=>!active[id].retired&&!retiredStore[id]),{activePlayers:activeIds.length});
let missingSquadRefs=0,retiredSquadRefs=0;
Object.values(w.squads||{}).forEach(s=>{const ids=[...(s.playerIds||[]),...(s.lineup||[]),...(s.bench||[]),...(s.reserve||[])];ids.forEach(id=>{if(!active[id])missingSquadRefs++;if(retiredStore[id])retiredSquadRefs++;});});
check('Squad structures contain no retired or missing player references',missingSquadRefs===0&&retiredSquadRefs===0,{missingSquadRefs,retiredSquadRefs});
const forbidden=['contract','fitness','form','morale','skills','injury','injuries','training','salaryDemand','suspensions'];
const badArchive=retiredIds.filter(id=>forbidden.some(k=>Object.prototype.hasOwnProperty.call(retiredStore[id]||{},k)));
check('Retired archive contains no active simulation payload',badArchive.length===0,{badArchive:badArchive.slice(0,10)});
const sampleActive=activeIds.slice(0,Math.min(300,activeIds.length));
const avgActiveBytes=sampleActive.length?sampleActive.reduce((sum,id)=>sum+Buffer.byteLength(JSON.stringify(active[id])),0)/sampleActive.length:0;
const archiveBytes=Buffer.byteLength(JSON.stringify(((w.history||{}).retiredPlayers)||{}));
const estimatedFullRetiredBytes=avgActiveBytes*retiredIds.length;
const ratio=estimatedFullRetiredBytes?archiveBytes/estimatedFullRetiredBytes:0;
check('Compact retiree store is materially smaller than retaining full active-style player objects',retiredIds.length===0||ratio<0.5,{archiveBytes,avgActiveBytes:Math.round(avgActiveBytes),estimatedFullRetiredBytes:Math.round(estimatedFullRetiredBytes),ratio:Number(ratio.toFixed(3))});
report.metrics.storage={retiredArchiveBytes:archiveBytes,retiredPlayers:retiredIds.length,avgActivePlayerBytes:Math.round(avgActiveBytes),estimatedFullRetiredBytes:Math.round(estimatedFullRetiredBytes),estimatedArchiveVsFullRatio:Number(ratio.toFixed(3))};
report.metrics.maxLifecycleMs=Math.max(...report.metrics.seasons.map(s=>s.lifecycleMs));
check('Retirement lifecycle runtime remains bounded across ten seasons',report.metrics.maxLifecycleMs<10000,{maxLifecycleMs:report.metrics.maxLifecycleMs});
const out=path.join(root,'reports','kf_0.26.2_longterm_lifecycle_test.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:out},null,2));process.exit(report.passed?0:1);
