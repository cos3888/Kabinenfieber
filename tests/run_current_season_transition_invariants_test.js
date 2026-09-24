const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(root,r),'utf8');
const report={passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
class E{constructor(){this.innerHTML='';this.style={};this.dataset={};this.value='';this.classList={add(){},remove(){},contains(){return false}}}addEventListener(){}removeEventListener(){}setAttribute(k,v){this[k]=v}getAttribute(k){return this[k]||null}querySelector(){return null}querySelectorAll(){return[]}closest(){return null}getBoundingClientRect(){return{width:1760,height:990}}}
const els={'app-root':new E(),'modal-root':new E(),'app-shell':new E()};
const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new E(),getElementById:id=>els[id]||null,addEventListener(t,cb){if(t==='DOMContentLoaded')this.cb=cb},removeEventListener(){},createElement(){return new E()},querySelector(){return null},querySelectorAll(){return[]}};
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame:cb=>cb(),cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:E,navigator:{userAgent:'node-test'},performance:{now:()=>Date.now()},localStorage:{getItem(){return null},setItem(){}}};
const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:E,navigator:windowObj.navigator,performance:windowObj.performance});
for(const f of ['src/static-data.js','src/db1-db2-data.js'])vm.runInContext(read(f),context,{filename:f});
let code=read('src/app.bundle.js');
code=code.replace(/\n  if \(document\.readyState === 'loading'\) \{/,`\n  window.KFTest={AppState,startNewCareer,advanceIntoNextSeason};\n  if (document.readyState === 'loading') {`);
vm.runInContext(code,context,{filename:'src/app.bundle.js'});if(document.cb)document.cb();const T=windowObj.KFTest;
T.startNewCareer();const w=T.AppState.world;const before=Number(w.meta.seasonNumber||1);T.advanceIntoNextSeason(w);
check('Season advances exactly once',Number(w.meta.seasonNumber)===before+1,{before,after:w.meta.seasonNumber});
const mismatches={squadCount:[],averageAge:[],salaryCommitted:[],salaryBudgetRemaining:[],clubId:[],contracts:[],legacyContractFields:[],formation:[]};
function round2(v){return Math.round((Number(v)||0)*1000)/1000;}
for(const clubId of w.clubs.order){
  const club=w.clubs.byId[clubId],squad=w.squads[clubId]||{playerIds:[]};
  const ids=(squad.playerIds||[]).filter(id=>w.players.byId[id]);
  const expectedCount=ids.length;
  const expectedAge=ids.length?round2(ids.reduce((sum,id)=>sum+Number(w.players.byId[id].age||0),0)/ids.length):0;
  const expectedSalary=round2(ids.reduce((sum,id)=>{const p=w.players.byId[id],c=p.contract||{};return sum+Number(c.salaryBase||0);},0));
  const expectedRemaining=round2(Math.max(0,Number(club.salaryBudget||0)-expectedSalary));
  if(Number(club.squadCount||0)!==expectedCount)mismatches.squadCount.push({clubId,actual:club.squadCount,expected:expectedCount});
  if(Math.abs(Number(club.averageAge||0)-expectedAge)>0.001)mismatches.averageAge.push({clubId,actual:club.averageAge,expected:expectedAge});
  if(Math.abs(Number(club.salaryCommitted||0)-expectedSalary)>0.001)mismatches.salaryCommitted.push({clubId,actual:club.salaryCommitted,expected:expectedSalary});
  if(Math.abs(Number(club.salaryBudgetRemaining||0)-expectedRemaining)>0.001)mismatches.salaryBudgetRemaining.push({clubId,actual:club.salaryBudgetRemaining,expected:expectedRemaining});
  for(const id of ids){const p=w.players.byId[id];if(p.clubId!==clubId && !(p.loan&&p.loan.loanClubId===clubId))mismatches.clubId.push({clubId,playerId:id,playerClubId:p.clubId});if(!p.contract||p.contract.salaryBase==null||p.contract.validUntilSeason==null)mismatches.contracts.push({clubId,playerId:id});if(['salary','contractUntilSeason','contractUntilDisplay'].some(k=>Object.prototype.hasOwnProperty.call(p,k)))mismatches.legacyContractFields.push({clubId,playerId:id});}
  if(!squad.lineupMaskState||!squad.lineupMaskState.formationKey||Object.prototype.hasOwnProperty.call(club,'currentFormationKey'))mismatches.formation.push({clubId,formation:squad.lineupMaskState&&squad.lineupMaskState.formationKey,legacy:Object.prototype.hasOwnProperty.call(club,'currentFormationKey')});
}
check('All club squadCount aggregates match current squads',mismatches.squadCount.length===0,{count:mismatches.squadCount.length,sample:mismatches.squadCount.slice(0,5)});
check('All club averageAge aggregates match current players',mismatches.averageAge.length===0,{count:mismatches.averageAge.length,sample:mismatches.averageAge.slice(0,5)});
check('All club salaryCommitted aggregates match current contracts',mismatches.salaryCommitted.length===0,{count:mismatches.salaryCommitted.length,sample:mismatches.salaryCommitted.slice(0,5)});
check('All club salaryBudgetRemaining values match budget minus current contracts',mismatches.salaryBudgetRemaining.length===0,{count:mismatches.salaryBudgetRemaining.length,sample:mismatches.salaryBudgetRemaining.slice(0,5)});
check('Squad membership remains consistent with player club ownership/loan destination',mismatches.clubId.length===0,{count:mismatches.clubId.length,sample:mismatches.clubId.slice(0,5)});
check('All club players retain canonical contracts after season transition',mismatches.contracts.length===0,{count:mismatches.contracts.length,sample:mismatches.contracts.slice(0,5)});
check('Season transition does not recreate legacy contract scalar fields',mismatches.legacyContractFields.length===0,{count:mismatches.legacyContractFields.length,sample:mismatches.legacyContractFields.slice(0,5)});
check('Current formation remains canonical in world.squads after season transition',mismatches.formation.length===0,{count:mismatches.formation.length,sample:mismatches.formation.slice(0,5)});
report.metrics={version:'0.27.0-current',clubs:w.clubs.order.length,mismatchCounts:Object.fromEntries(Object.entries(mismatches).map(([k,v])=>[k,v.length]))};
const out=path.join(root,'reports','current_season_transition_invariants_test.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:out},null,2));process.exit(report.passed?0:1);
