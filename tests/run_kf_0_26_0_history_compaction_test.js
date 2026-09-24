const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(root,r),'utf8');
const report={passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
function stable(v){return JSON.stringify(v,Object.keys(v||{}).sort());}
class E{constructor(){this.innerHTML='';this.style={};this.dataset={};this.value='';this.classList={add(){},remove(){},contains(){return false}}}addEventListener(){}removeEventListener(){}setAttribute(k,v){this[k]=v}getAttribute(k){return this[k]||null}querySelector(){return null}querySelectorAll(){return[]}closest(){return null}getBoundingClientRect(){return{width:1760,height:990}}}
const els={'app-root':new E(),'modal-root':new E(),'app-shell':new E()};
const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new E(),getElementById:id=>els[id]||null,addEventListener(t,cb){if(t==='DOMContentLoaded')this.cb=cb},removeEventListener(){},createElement(){return new E()},querySelector(){return null},querySelectorAll(){return[]}};
let seed=260000;const math=Object.create(Math);math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame:cb=>cb(),cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:E,navigator:{userAgent:'node-test'},performance:{now:()=>Date.now()},localStorage:{getItem(){return null},setItem(){}}};
const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:E,navigator:windowObj.navigator,performance:windowObj.performance,Math:math,Map,WeakMap,Set});
for(const f of ['src/static-data.js','src/db1-db2-data.js'])vm.runInContext(read(f),context,{filename:f});
let code=read('src/app.bundle.js');
code=code.replace(/\n\n  if \(document\.readyState === 'loading'\) \{/,`\n  window.KFTest={AppState,startNewCareer,kf0260PrepareCompletedSeason,kf0260CommitCompletedSeason,kf0260MigrateCompletedSeasonHistory,kf0260SeasonResultRecords,derivePlayerStatsFromHistory,derivePlayerCompetitionStats,buildLeaguePlayerStatMap,buildClubCompetitionRows,buildAllTimeLeagueTable,clubCurrentRankingPoints,analyzeOpponentRecentMatches,latestMatchForClub,recentMatchesForClub,migrateWorldDataTruthToCurrent};\n\n  if (document.readyState === 'loading') {`);
vm.runInContext(code,context,{filename:'src/app.bundle.js'});if(document.cb)document.cb();
const T=windowObj.KFTest;
check('Runtime meldet KF_0.26.2',code.includes("var KF_VERSION = '0.27.2';")&&read('index.html').includes('KF_0.27.2')&&JSON.parse(read('package.json')).version==='0.27.2');
T.startNewCareer();const w=T.AppState.world;
check('Neuwelt verwendet kf-core-0.26.2',w.meta.schemaVersion==='kf-core-0.27.2',{schema:w.meta.schemaVersion});
const leagueKey=w.clubs.byId[w.clubs.order[0]].leagueKey;
const leagueClubs=w.clubs.order.filter(id=>w.clubs.byId[id].leagueKey===leagueKey).slice(0,2),homeId=leagueClubs[0],awayId=leagueClubs[1];
const homePlayers=(w.squads[homeId].playerIds||[]).slice(0,11),awayPlayers=(w.squads[awayId].playerIds||[]).slice(0,11);
function stats(ids,side,clubId,base){return ids.map((id,i)=>({playerId:id,side,clubId,appearances:1,minutesPlayed:90,starter:true,goals:i===1?1:0,assists:i===2?1:0,yellow:i===3?1:0,yellowRed:0,red:0,rating:6.2+((i+base)%8)*0.18}));}
function mk(id,slotKey,homeGoals,awayGoals,reverse=false){
 const h=reverse?awayId:homeId,a=reverse?homeId:awayId,hp=reverse?awayPlayers:homePlayers,ap=reverse?homePlayers:awayPlayers;
 return {id,fixtureId:'fx_'+id,status:'played',season:1,competition:'league',leagueKey,roundType:'league',matchday:id==='m1'?1:2,slotKey,week:id==='m1'?1:2,homeClubId:h,awayClubId:a,homeGoals,awayGoals,homeLineupIds:hp.slice(),awayLineupIds:ap.slice(),playerStats:stats(hp,'home',h,0).concat(stats(ap,'away',a,3)),matchStats:{expectedGoals:{home:1.43,away:.82},attacksByZone:{home:{left:6,center:9,right:5},away:{left:3,center:5,right:7}}},usedTactics:{home:{pressing:2,buildUp:1,attackStyle:2,attackSide:0,defensiveLine:1},away:{pressing:-1,buildUp:0,attackStyle:-1,attackSide:1,defensiveLine:-1}},events:[{type:'goal',minute:20},{type:'situation',minute:31}],reportBlocks:[{x:'large historical payload'}],usedTacticsTimeline:[{minute:1}],simMeta:{debug:'x'.repeat(18000)}};
}
w.history.matches=Array.from({length:12},(_,i)=>mk('m'+String(i+1),'w'+String(i+1)+'-middle',i%3===0?2:1,i%4===0?0:1,i%2===1));
const legacyWorld=JSON.parse(JSON.stringify(w));legacyWorld.meta.seasonNumber=2;legacyWorld.meta.schemaVersion='kf-core-0.25.1';
const playerId=homePlayers[1];
const beforePlayer=T.derivePlayerStatsFromHistory(w,playerId,1);
const beforeComp=T.derivePlayerCompetitionStats(w,playerId,'current');
const beforeLeague=T.buildLeaguePlayerStatMap(w,leagueKey,'current')[playerId];
const beforeClub=T.buildClubCompetitionRows(w,homeId,'1');
const beforeAllTime=T.buildAllTimeLeagueTable(w,leagueKey).find(r=>r.clubId===homeId);
const beforeRank=T.clubCurrentRankingPoints(w,homeId);
const beforeAnalysis=T.analyzeOpponentRecentMatches(w,homeId);
const beforeLatest=T.latestMatchForClub(w,homeId);
const beforeBytes=Buffer.byteLength(JSON.stringify(w.history.matches),'utf8');
const prepared=T.kf0260PrepareCompletedSeason(w,1);
check('Saisonvorbereitung findet alle Vollmatches',prepared.matchCount===12,{matchCount:prepared.matchCount});
w.meta.seasonNumber=2;
const commit=T.kf0260CommitCompletedSeason(w,prepared);
check('Vollmatches der abgeschlossenen Saison werden aus history.matches entfernt',w.history.matches.length===0&&commit.removedMatches===12,{remaining:w.history.matches.length,commit});
const results=T.kf0260SeasonResultRecords(w,1);
check('Kompakte Ergebniswahrheit behaelt Paarung und Ergebnis',results.length===12&&results[0].homeClubId&&results[0].awayClubId&&typeof results[0].homeGoals==='number',{result:results[0]});
check('Historische Ergebnisse enthalten keine Matchdetaildaten',results.every(r=>!('playerStats'in r)&&!('events'in r)&&!('matchStats'in r)&&!('usedTactics'in r)&&!('homeLineupIds'in r)&&!('id'in r)),{keys:Object.keys(results[0]||{})});
const ps=(((w.history.playerSeasons||{})['1']||{}).byPlayerId||{})[playerId];
check('Spieler-Saisonsnapshot wurde dauerhaft materialisiert',!!ps&&ps.totals.appearances===12&&ps.totals.goals===12,{snapshot:ps&&ps.totals});
const afterPlayer=T.derivePlayerStatsFromHistory(w,playerId,1);
check('Spieler-Gesamtwerte bleiben nach Matchloeschung identisch',JSON.stringify(beforePlayer)===JSON.stringify(afterPlayer),{beforePlayer,afterPlayer});
const afterComp=T.derivePlayerCompetitionStats(w,playerId,'1');
check('Spielerprofil-Wettbewerbsstatistik inklusive Note/Elf-des-Tages bleibt erhalten',JSON.stringify(beforeComp)===JSON.stringify(afterComp),{beforeComp,afterComp});
const afterLeague=T.buildLeaguePlayerStatMap(w,leagueKey,'1')[playerId];
function slim(row){if(!row)return null;return {appearances:row.appearances,goals:row.goals,assists:row.assists,yellow:row.yellow,yellowRed:row.yellowRed,red:row.red,ratingTotal:row.ratingTotal,ratingCount:row.ratingCount,avgRating:row.avgRating,cleanSheets:row.cleanSheets,goalsAgainst:row.goalsAgainst,goalkeeper:row.goalkeeper};}
check('Historische Ligaspielerstatistik bleibt identisch',JSON.stringify(slim(beforeLeague))===JSON.stringify(slim(afterLeague)),{before:slim(beforeLeague),after:slim(afterLeague)});
const afterClub=T.buildClubCompetitionRows(w,homeId,'1');
check('Vereins-Saisonstatistik bleibt aus kompakten Ergebnissen identisch',JSON.stringify(beforeClub)===JSON.stringify(afterClub),{beforeClub,afterClub});
const afterAllTime=T.buildAllTimeLeagueTable(w,leagueKey).find(r=>r.clubId===homeId);
check('Ewige Ligawerte bleiben identisch',JSON.stringify(beforeAllTime)===JSON.stringify(afterAllTime),{beforeAllTime,afterAllTime});
const afterRank=T.clubCurrentRankingPoints(w,homeId);
check('Vereinsranking behaelt dieselben Ergebniswerte',JSON.stringify(beforeRank)===JSON.stringify(afterRank),{beforeRank,afterRank});
const afterAnalysis=T.analyzeOpponentRecentMatches(w,homeId);
function analysisSlim(a){return {count:a.count,zones:a.zones,goalsFor:a.goalsFor,goalsAgainst:a.goalsAgainst,xgFor:a.xgFor,xgAgainst:a.xgAgainst,tactics:a.tactics};}
check('Vorsaison-Kontext erhaelt Gegneranalyse exakt',JSON.stringify(analysisSlim(beforeAnalysis))===JSON.stringify(analysisSlim(afterAnalysis)),{before:analysisSlim(beforeAnalysis),after:analysisSlim(afterAnalysis)});
const afterLatest=T.latestMatchForClub(w,homeId);
const beforeLatestIds=beforeLatest&&(beforeLatest.homeClubId===homeId?beforeLatest.homeLineupIds:beforeLatest.awayLineupIds);const afterLatestIds=afterLatest&&(afterLatest.homeClubId===homeId?afterLatest.homeLineupIds:afterLatest.awayLineupIds);
check('Letzte bekannte Aufstellung bleibt fuer Prognose/Teamchemie verfuegbar',afterLatest&&JSON.stringify(beforeLatestIds)===JSON.stringify(afterLatestIds),{beforeLatestIds,afterLatestIds});
const recentCtx=w.history.previousSeasonRecentContext||{};
check('Uebergangssnapshot ist pro Club strikt auf maximal fuenf Matches begrenzt',Object.values(recentCtx.byClub||{}).every(list=>Array.isArray(list)&&list.length<=5),{clubs:Object.keys(recentCtx.byClub||{}).length});
const afterBytes=Buffer.byteLength(JSON.stringify({seasonResults:w.history.seasonResults,playerSeasons:w.history.playerSeasons,previousSeasonRecentContext:w.history.previousSeasonRecentContext,matches:w.history.matches}),'utf8');
check('Historienverdichtung reduziert die Testdaten deutlich',afterBytes<beforeBytes*.65,{beforeBytes,afterBytes,ratio:afterBytes/beforeBytes});
const legacyMigration=T.migrateWorldDataTruthToCurrent(legacyWorld);
check('Bestehende 0.25.x-Welten migrieren abgeschlossene Vollmatches automatisch',legacyWorld.meta.schemaVersion==='kf-core-0.27.2'&&(legacyWorld.history.matches||[]).length===0&&T.kf0260SeasonResultRecords(legacyWorld,1).length===12&&Object.keys((((legacyWorld.history.playerSeasons||{})['1']||{}).byPlayerId)||{}).length>0,{migration:legacyMigration,results:T.kf0260SeasonResultRecords(legacyWorld,1).length,currentMatches:(legacyWorld.history.matches||[]).length});
report.metrics={beforeBytes,afterBytes,ratio:afterBytes/beforeBytes,resultCount:results.length,playerSeasonCount:Object.keys(((w.history.playerSeasons||{})['1']||{}).byPlayerId||{}).length,recentContextClubs:Object.keys(recentCtx.byClub||{}).length};
const out=path.join(root,'reports','kf_0.26.0_history_compaction_test.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:out},null,2));process.exit(report.passed?0:1);
