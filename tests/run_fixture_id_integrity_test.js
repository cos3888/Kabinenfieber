const fs = require('fs');
const vm = require('vm');
const path = require('path');
class FakeElement { constructor(){ this.innerHTML=''; this.style={}; this.dataset={}; this.classList={add(){},remove(){},contains(){return false;}}; } addEventListener(){} removeEventListener(){} setAttribute(k,v){this[k]=v;} getAttribute(k){return this[k]||null;} querySelector(){return null;} querySelectorAll(){return [];} getBoundingClientRect(){return {width:1760,height:990};} }
const elements={'app-root':new FakeElement(),'modal-root':new FakeElement(),'app-shell':new FakeElement()};
const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new FakeElement(),getElementById(id){return elements[id]||null;},addEventListener(type,cb){if(type==='DOMContentLoaded')this._domReady=cb;},removeEventListener(){},createElement(){return new FakeElement();},querySelector(){return null;},querySelectorAll(){return[]}};
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame(cb){return cb();},cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:FakeElement,navigator:{userAgent:'node-test'}};
const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:FakeElement,navigator:windowObj.navigator});
function runFile(file){ vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file}); }
runFile('src/static-data.js'); runFile('src/db1-db2-data.js');
let appCode=fs.readFileSync(path.join(__dirname,'..','src/app.bundle.js'),'utf8');
appCode=appCode.replace(/\n  function boot\(\)\{/, `\n  window.KFTest={AppState:AppState,startNewCareer:startNewCareer,simulateLeagueFixture:simulateLeagueFixture,recordPlayedMatch:recordPlayedMatch,matchForFixture:matchForFixture,fixtureIsPlayed:fixtureIsPlayed,assignStableFixtureIds:assignStableFixtureIds,buildCalendar:buildCalendar,generateLeagueSchedule:generateLeagueSchedule,fixturesForSlot:fixturesForSlot,ensureDueNationalCupDraws:ensureDueNationalCupDraws,ensureDueFieberCupDraws:ensureDueFieberCupDraws,resolveCupFixtureParticipants:resolveCupFixtureParticipants,resolveFieberCupFixtureParticipants:resolveFieberCupFixtureParticipants,winnerClubIdFromFinalMatch:winnerClubIdFromFinalMatch};\n  function boot(){`);
vm.runInContext(appCode,context,{filename:'src/app.bundle.js'}); if(document._domReady)document._domReady();
const T=windowObj.KFTest;
const report={passed:true,checks:[],metrics:{}};
function check(name, ok, details={}){ report.checks.push({name, ok:!!ok, details}); if(!ok) report.passed=false; }
T.startNewCareer();
const world=T.AppState.world;
T.assignStableFixtureIds(world);
const fixtures=world.calendar.fixtures||[];
const ids=fixtures.map(f=>f.id);
check('Alle Fixtures haben stabile fx-IDs', fixtures.length>0 && fixtures.every(f=>/^fx:/.test(String(f.id||''))), {fixtures:fixtures.length, missing:fixtures.filter(f=>!/^fx:/.test(String(f.id||''))).slice(0,3).map(f=>f.id)});
check('Fixture-IDs sind eindeutig', new Set(ids).size===ids.length, {fixtures:ids.length, unique:new Set(ids).size});
const first=fixtures.find(f=>f.competition==='league') || fixtures[0];
const oldSameShape={ id:'legacy_old_same_shape', season:Number(first.season||1)-1, competition:first.competition, competitionLabel:first.competitionLabel, countryName:first.countryName||null, roundType:first.roundType, roundNumber:first.roundNumber, matchday:first.matchday, slotKey:first.slotKey, pairIndex:first.pairIndex||0, homeClubId:first.homeClubId, awayClubId:first.awayClubId, homeGoals:9, awayGoals:9, status:'played' };
world.history.matches.push(oldSameShape);
check('Altes Match ohne fixtureId markiert aktuelles Fixture nicht als gespielt', !T.matchForFixture(world, first) && !T.fixtureIsPlayed(world, first), {fixtureId:first.id, legacySeason:oldSameShape.season, fixtureSeason:first.season});
const played=T.recordPlayedMatch(world, first, T.simulateLeagueFixture(world, first));
check('recordPlayedMatch verknuepft Match und Fixture ueber IDs', !!played && played.fixtureId===first.id && first.playedMatchId===played.id && T.fixtureIsPlayed(world, first), {fixtureId:first.id, playedMatchId:first.playedMatchId, matchFixtureId:played&&played.fixtureId});
check('Gespieltes Fixture hat genau ein Match in world.history.matches', (world.history.matches||[]).filter(m=>m.fixtureId===first.id).length===1, {fixtureId:first.id, matches:(world.history.matches||[]).filter(m=>m.fixtureId===first.id).map(m=>m.id)});
check('Jedes Match mit fixtureId verweist auf existierendes Fixture der Kalenderwahrheit', (world.history.matches||[]).filter(m=>m.fixtureId).every(m=>ids.includes(m.fixtureId)), {withFixtureId:(world.history.matches||[]).filter(m=>m.fixtureId).length});
// Migration: identisches Altdaten-Match der gleichen Saison ohne fixtureId darf nur exakt ein ungespieltes Clone-Fixture verbinden.
const clone=Object.assign({}, first, { id:'fx:test:migration:001', status:'scheduled', playedMatchId:null, result:null, pairIndex:999 });
world.calendar.fixtures.push(clone);
const legacySameSeason={ id:'legacy_same_season_exact', season:clone.season, competition:clone.competition, competitionLabel:clone.competitionLabel, countryName:clone.countryName||null, roundType:clone.roundType, roundNumber:clone.roundNumber, matchday:clone.matchday, slotKey:clone.slotKey, pairIndex:clone.pairIndex, homeClubId:clone.homeClubId, awayClubId:clone.awayClubId, homeGoals:1, awayGoals:0, status:'played' };
world.history.matches.push(legacySameSeason);
const migrated=T.matchForFixture(world, clone);
check('Legacy-Fallback verbindet nur exakte gleiche Saison/Slot/Paarung und setzt fixtureId nach', migrated && migrated.id===legacySameSeason.id && migrated.fixtureId===clone.id && clone.playedMatchId===legacySameSeason.id, {migrated:migrated&&migrated.id, fixtureId:clone.id});
report.metrics={fixtures:fixtures.length, matches:world.history.matches.length, uniqueFixtureIds:new Set((world.calendar.fixtures||[]).map(f=>f.id)).size};
const out=path.join(__dirname,'..','reports','current_fixture_id_integrity_test.json');
fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,reportFile:out},null,2));
process.exit(report.passed?0:1);
