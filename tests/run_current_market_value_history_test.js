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
code=code.replace(/\n  if \(document\.readyState === 'loading'\) \{/,`\n  window.KFTest={AppState,startNewCareer,runMidseasonMarketValuationIfDue,runPlayerFinancialValuation,playerMarketValueHistoryForPlayer,kf021LeagueMatchdaySlotIndex,migrateWorldDataTruthToCurrent};\n  if (document.readyState === 'loading') {`);
vm.runInContext(code,context,{filename:'src/app.bundle.js'});if(document.cb)document.cb();const T=windowObj.KFTest;
T.startNewCareer();const w=T.AppState.world;
const initialLegacy=Object.prototype.hasOwnProperty.call(w.history,'playerValueSnapshots');
const initialKeys=Object.keys(w.history.playerMarketValues||{});
check('Fresh worlds use playerMarketValues and no legacy snapshot array',!initialLegacy&&initialKeys.length===0,{legacy:initialLegacy,historyPlayers:initialKeys.length});
const playerId=w.players.order.find(id=>w.players.byId[id]&&!w.players.byId[id].retired),player=w.players.byId[playerId];
const before=Number(player.marketValue||0);
const targetIndex=T.kf021LeagueMatchdaySlotIndex(w,17),targetSlot=w.calendar.slots[targetIndex];
const mid=T.runMidseasonMarketValuationIfDue(w,targetSlot);
const midRows=T.playerMarketValueHistoryForPlayer(w,playerId);
check('Midseason valuation runs immediately before transfer window 2',!!mid&&mid.phase==='midseason'&&midRows.length===1&&midRows[0].phase==='midseason',{targetSlot:targetSlot&&targetSlot.key,result:mid,row:midRows[0]});
check('Market-value history stores value and only change-oriented metadata',midRows[0]&&['season','phase','reason','marketValue','change','changePct'].every(k=>Object.prototype.hasOwnProperty.call(midRows[0],k))&&Object.keys(midRows[0]).every(k=>['season','phase','reason','marketValue','change','changePct'].includes(k)),{row:midRows[0]});
const historyCountAfterMid=Object.values(w.history.playerMarketValues||{}).reduce((n,rows)=>n+(rows||[]).length,0);
const midAgain=T.runMidseasonMarketValuationIfDue(w,targetSlot);
const historyCountAfterRepeat=Object.values(w.history.playerMarketValues||{}).reduce((n,rows)=>n+(rows||[]).length,0);
check('Repeated entry into the same checkpoint cannot create a third/duplicate valuation',midAgain===null&&historyCountAfterRepeat===historyCountAfterMid,{first:historyCountAfterMid,repeat:historyCountAfterRepeat});
const marketBeforeSeasonStart=Number(player.marketValue||0),startAttempt=T.runPlayerFinancialValuation(w,'season_start',{history:true}),marketAfterSeasonStart=Number(player.marketValue||0);
check('Season start is not a market-value checkpoint',startAttempt.skipped===true&&marketBeforeSeasonStart===marketAfterSeasonStart,{startAttempt,before:marketBeforeSeasonStart,after:marketAfterSeasonStart});
const end=T.runPlayerFinancialValuation(w,'season_end',{history:true});
const endRows=T.playerMarketValueHistoryForPlayer(w,playerId);
check('Season end creates the second and final valuation point for the season',end.phase==='seasonEnd'&&endRows.length===2&&endRows[1].phase==='seasonEnd',{result:end,rows:endRows});
const endRepeat=T.runPlayerFinancialValuation(w,'season_end',{history:true});
const repeatedRows=T.playerMarketValueHistoryForPlayer(w,playerId);
check('A season can never gain more than two market-value entries',endRepeat.skipped===true&&repeatedRows.length===2,{repeat:endRepeat,rows:repeatedRows});
const invalid=Object.entries(w.history.playerMarketValues||{}).filter(([,rows])=>{const bySeason={};for(const row of rows||[]){bySeason[row.season]=(bySeason[row.season]||0)+1;if(!['midseason','seasonEnd'].includes(row.phase))return true;}return Object.values(bySeason).some(n=>n>2);});
check('All player histories obey maximum two entries per season',invalid.length===0,{invalid:invalid.slice(0,3)});

const legacyPlayerId=playerId;
delete w.history.playerMarketValues;
w.history.playerValueSnapshots=[
  {playerId:legacyPlayerId,season:7,reason:'winter_window_open',marketValue:12.5},
  {playerId:legacyPlayerId,season:7,reason:'season_end',marketValue:14.0}
];
const readBeforeMigration=T.playerMarketValueHistoryForPlayer(w,legacyPlayerId);
check('Reading market-value history does not silently migrate legacy snapshots',readBeforeMigration.length===0&&Array.isArray(w.history.playerValueSnapshots)&&w.history.playerValueSnapshots.length===2,{rows:readBeforeMigration,legacyCount:w.history.playerValueSnapshots&&w.history.playerValueSnapshots.length});
const migration=T.migrateWorldDataTruthToCurrent(w),legacyRows=T.playerMarketValueHistoryForPlayer(w,legacyPlayerId);
check('Explicit world migration converts legacy market-value snapshots',migration.marketValues===2&&!Object.prototype.hasOwnProperty.call(w.history,'playerValueSnapshots')&&legacyRows.length===2&&legacyRows[0].phase==='midseason'&&legacyRows[1].phase==='seasonEnd',{migration,rows:legacyRows});
report.metrics={players:w.players.order.length,historyPlayers:Object.keys(w.history.playerMarketValues||{}).length,historyEntries:Object.values(w.history.playerMarketValues||{}).reduce((n,rows)=>n+(rows||[]).length,0),samplePlayer:playerId,sampleInitialValue:before,sampleRows:repeatedRows};
const out=path.join(root,'reports','current_market_value_history_test.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:out},null,2));process.exit(report.passed?0:1);
