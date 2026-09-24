const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(root,r),'utf8');
const report={version:'0.27.0',passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
class E{constructor(){this.innerHTML='';this.style={};this.dataset={};this.value='';this.classList={add(){},remove(){},contains(){return false}}}addEventListener(){}removeEventListener(){}setAttribute(k,v){this[k]=v}getAttribute(k){return this[k]||null}querySelector(){return null}querySelectorAll(){return[]}closest(){return null}getBoundingClientRect(){return{width:1760,height:990}}}
const els={'app-root':new E(),'modal-root':new E(),'app-shell':new E()};
const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new E(),getElementById:id=>els[id]||null,addEventListener(t,cb){if(t==='DOMContentLoaded')this.cb=cb},removeEventListener(){},createElement(){return new E()},querySelector(){return null},querySelectorAll(){return[]}};
let seed=261001;const math=Object.create(Math);math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame:cb=>cb(),cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:E,navigator:{userAgent:'node-test'},performance:{now:()=>Date.now()},localStorage:{getItem(){return null},setItem(){}}};
const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:E,navigator:windowObj.navigator,performance:windowObj.performance,Math:math,Map,WeakMap,Set});
for(const f of ['src/static-data.js','src/db1-db2-data.js'])vm.runInContext(read(f),context,{filename:f});
let code=read('src/app.bundle.js');
code=code.replace(/\n\n  if \(document\.readyState === 'loading'\) \{/,`\n  window.KFTest={AppState,startNewCareer,kf021ProcessMatchContractBonuses,kf021PaySeasonPlayerBonus,kf021PayInterClubBonus,kf0261BonusKeySeen,kf0261MigrateLegacyBonusEvents,migrateWorldDataTruthToCurrent,addFinanceEvent,financeCurrentCash,worldRecordForGameState,assignTrainerClub};\n\n  if (document.readyState === 'loading') {`);
vm.runInContext(code,context,{filename:'src/app.bundle.js'});if(document.cb)document.cb();const T=windowObj.KFTest;
check('Runtime meldet KF_0.26.2',code.includes("var KF_VERSION = '0.27.1';")&&read('index.html').includes('KF_0.27.1')&&JSON.parse(read('package.json')).version==='0.27.1');
T.startNewCareer();const w=T.AppState.world;
check('Neuwelt verwendet kf-core-0.26.2',w.meta.schemaVersion==='kf-core-0.27.1',{schema:w.meta.schemaVersion});
check('bonusEvents ist nur leerer Legacy-Container',Array.isArray(w.history.bonusEvents)&&w.history.bonusEvents.length===0,{bonusEvents:(w.history.bonusEvents||[]).length});

const clubId=w.clubs.order[0],club2=w.clubs.order[1],club3=w.clubs.order[2];
const playerId=(w.squads[clubId].playerIds||[])[0],player=w.players.byId[playerId];
player.contract=player.contract||{};player.contract.bonuses=Object.assign({},player.contract.bonuses||{},{appearanceBonus:.02,goalBonus:.03,cleanSheetBonus:0,championshipBonus:.11});
const match={id:'kf0261_match_1',fixtureId:'kf0261_fx_1',status:'played',season:Number(w.meta.seasonNumber||1),competition:'league',roundType:'league',leagueKey:w.clubs.byId[clubId].leagueKey,homeClubId:clubId,awayClubId:club2,homeGoals:1,awayGoals:0,playerStats:[{playerId,side:'home',clubId,appearances:1,minutesPlayed:90,starter:true,goals:1,assists:0}]};
const beforeCash=T.financeCurrentCash(w,w.clubs.byId[clubId]);
const paid1=T.kf021ProcessMatchContractBonuses(w,match),after1=T.financeCurrentCash(w,w.clubs.byId[clubId]);
const paid2=T.kf021ProcessMatchContractBonuses(w,match),after2=T.financeCurrentCash(w,w.clubs.byId[clubId]);
const matchKeys=[match.id+'|'+playerId+'|appearance',match.id+'|'+playerId+'|goal'];
const clubFinance=w.clubFinances.byClub[clubId].financeEvents||[];
const bookedMatchEvents=clubFinance.filter(ev=>matchKeys.includes(ev.eventKey));
check('Matchprämien werden einmal gebucht',paid1===.05&&paid2===0&&Math.abs((after1-beforeCash)+.05)<.001&&after2===after1,{paid1,paid2,beforeCash,after1,after2});
check('Idempotenzschlüssel liegen auf echten FinanceEvents',bookedMatchEvents.length===2&&bookedMatchEvents.every(ev=>ev.source==='contractBonus'),{events:bookedMatchEvents});
check('Matchprämien lassen bonusEvents leer',w.history.bonusEvents.length===0,{bonusEvents:w.history.bonusEvents.length});

const reloaded=JSON.parse(JSON.stringify(w));T.migrateWorldDataTruthToCurrent(reloaded);
const reloadedPlayer=reloaded.players.byId[playerId];
const beforeReloadCount=(reloaded.clubFinances.byClub[clubId].financeEvents||[]).length;
const paidReload=T.kf021ProcessMatchContractBonuses(reloaded,match);
const afterReloadCount=(reloaded.clubFinances.byClub[clubId].financeEvents||[]).length;
check('Save/Reload rekonstruiert Bonus-Deduplizierung aus FinanceEvents',paidReload===0&&beforeReloadCount===afterReloadCount&&matchKeys.every(key=>T.kf0261BonusKeySeen(reloaded,key)),{paidReload,beforeReloadCount,afterReloadCount});

const season=Number(w.meta.seasonNumber||1),seasonKey=['seasonbonus',season,clubId,playerId,'champion'].join('|');
const seasonPaid1=T.kf021PaySeasonPlayerBonus(w,player,clubId,'champion',.11,season),seasonPaid2=T.kf021PaySeasonPlayerBonus(w,player,clubId,'champion',.11,season);
const seasonEvents=(w.clubFinances.byClub[clubId].financeEvents||[]).filter(ev=>ev.eventKey===seasonKey);
check('Saisonprämie ist ebenfalls idempotent ohne Bonus-Historie',seasonPaid1===true&&seasonPaid2===false&&seasonEvents.length===1&&w.history.bonusEvents.length===0,{seasonPaid1,seasonPaid2,seasonEvents:seasonEvents.length});

// Leihspieler: dieselbe Prämie wird nach Gehaltsanteil auf zwei FinanceEvents verteilt, aber nur einmal verarbeitet.
const loanWorld=JSON.parse(JSON.stringify(w));T.migrateWorldDataTruthToCurrent(loanWorld);const loanPlayer=loanWorld.players.byId[playerId];
loanPlayer.loan={parentClubId:clubId,loanClubId:club2,wageSharePercent:40,endSeason:season};loanPlayer.clubId=club2;loanPlayer.contract.bonuses=Object.assign({},loanPlayer.contract.bonuses||{},{appearanceBonus:.1,goalBonus:0,cleanSheetBonus:0});
const loanMatch={id:'kf0261_loan_match',fixtureId:'kf0261_loan_fx',status:'played',season,competition:'league',roundType:'league',leagueKey:loanWorld.clubs.byId[club2].leagueKey,homeClubId:club2,awayClubId:club3,homeGoals:0,awayGoals:1,playerStats:[{playerId,side:'home',clubId:club2,appearances:1,minutesPlayed:90,starter:true,goals:0}]};
const loanKey=loanMatch.id+'|'+playerId+'|appearance',loanPaid1=T.kf021ProcessMatchContractBonuses(loanWorld,loanMatch),loanPaid2=T.kf021ProcessMatchContractBonuses(loanWorld,loanMatch);
const loanEvents=[...(loanWorld.clubFinances.byClub[clubId].financeEvents||[]),...(loanWorld.clubFinances.byClub[club2].financeEvents||[])].filter(ev=>ev.eventKey===loanKey);
check('Leih-Prämie wird einmal und im 40/60-Gehaltsanteil gebucht',loanPaid1===.1&&loanPaid2===0&&loanEvents.length===2&&Math.abs(loanEvents.reduce((sum,ev)=>sum+Number(ev.amount||0),0)+.1)<.001&&loanEvents.some(ev=>ev.clubId===club2&&Math.abs(ev.amount+.04)<.001)&&loanEvents.some(ev=>ev.clubId===clubId&&Math.abs(ev.amount+.06)<.001),{loanPaid1,loanPaid2,loanEvents});

const transferKey='transferAppearance|legacy-test|'+playerId+'|25';
const record=T.worldRecordForGameState(w),assign=T.assignTrainerClub(record,T.AppState.session.activeTrainerId,club2);
const pBefore=(w.clubFinances.byClub[club2].financeEvents||[]).length,bBefore=(w.clubFinances.byClub[club3].financeEvents||[]).length,mailBefore=((w.mailbox||{}).order||[]).length;
const transfer1=T.kf021PayInterClubBonus(w,club2,club3,player,.4,'Transfer-Einsatzbonus Test',transferKey);
const transfer2=T.kf021PayInterClubBonus(w,club2,club3,player,.4,'Transfer-Einsatzbonus Test',transferKey);
const pAfter=(w.clubFinances.byClub[club2].financeEvents||[]).filter(ev=>ev.eventKey===transferKey),bAfter=(w.clubFinances.byClub[club3].financeEvents||[]).filter(ev=>ev.eventKey===transferKey),mailAfter=((w.mailbox||{}).order||[]).length;
check('Transferklausel schreibt einen gemeinsamen eventKey auf Ausgabe und Einnahme',transfer1===true&&transfer2===true&&pAfter.length===1&&bAfter.length===1&&pAfter[0].amount===-.4&&bAfter[0].amount===.4,{payer:pAfter,beneficiary:bAfter,pBefore,bBefore});
check('Transferklausel-Mail bleibt bei menschlicher Beteiligung erhalten und wird nicht dupliziert',assign&&assign.ok===true&&mailAfter===mailBefore+1,{mailBefore,mailAfter,assignedClub:club2});

const transferReload=JSON.parse(JSON.stringify(w));T.migrateWorldDataTruthToCurrent(transferReload);
const pCountBefore=(transferReload.clubFinances.byClub[club2].financeEvents||[]).length,bCountBefore=(transferReload.clubFinances.byClub[club3].financeEvents||[]).length;
T.kf021PayInterClubBonus(transferReload,club2,club3,transferReload.players.byId[playerId],.4,'Transfer-Einsatzbonus Test',transferKey);
check('Transferklausel bleibt nach Reload ohne Doppelbuchung',pCountBefore===(transferReload.clubFinances.byClub[club2].financeEvents||[]).length&&bCountBefore===(transferReload.clubFinances.byClub[club3].financeEvents||[]).length,{pCountBefore,pCountAfter:(transferReload.clubFinances.byClub[club2].financeEvents||[]).length,bCountBefore,bCountAfter:(transferReload.clubFinances.byClub[club3].financeEvents||[]).length});

// Legacy 0.26.0 transfer clause: FinanceEvents exist but had no eventKey; migration must attach it before clearing bonusEvents.
const legacy=JSON.parse(JSON.stringify(w));legacy.meta.schemaVersion='kf-core-0.26.0';legacy.history.bonusEvents=[];
const legacyKey='transferSuccess|legacy-migrate|'+playerId+'|promotion',legacyLabel='Transfer-Erfolgsbonus (promotion): Legacy';
legacy.clubFinances.byClub[club2].financeEvents.push({id:'legacy-pay',clubId:club2,seasonId:season,slotKey:'legacy',type:'transferExpense',direction:'expense',amount:-.7,label:legacyLabel,source:'transferClause',playerId});
legacy.clubFinances.byClub[club3].financeEvents.push({id:'legacy-income',clubId:club3,seasonId:season,slotKey:'legacy',type:'transferIncome',direction:'income',amount:.7,label:legacyLabel,source:'transferClause',playerId});
legacy.history.bonusEvents.push({eventKey:legacyKey,type:'transfer_clause',season,playerId,payerClubId:club2,beneficiaryClubId:club3,amount:.7,label:legacyLabel});
const legacyBytes=Buffer.byteLength(JSON.stringify(legacy.history.bonusEvents));
const migration=T.migrateWorldDataTruthToCurrent(legacy);
const migratedPay=legacy.clubFinances.byClub[club2].financeEvents.find(ev=>ev.id==='legacy-pay'),migratedIncome=legacy.clubFinances.byClub[club3].financeEvents.find(ev=>ev.id==='legacy-income');
check('0.26.0-Migration überträgt Legacy-Transferkey und leert Bonus-Historie',legacy.meta.schemaVersion==='kf-core-0.27.1'&&legacy.history.bonusEvents.length===0&&migratedPay.eventKey===legacyKey&&migratedIncome.eventKey===legacyKey,{migration:migration.bonusMigration,migratedPay,migratedIncome});

const currentBonusBytes=Buffer.byteLength(JSON.stringify(w.history.bonusEvents));
report.metrics={matchBonusPaid:paid1,matchBonusEventCount:bookedMatchEvents.length,seasonBonusEventCount:seasonEvents.length,loanBonusEventCount:loanEvents.length,transferEventCount:pAfter.length+bAfter.length,legacyBonusBytesSample:legacyBytes,currentBonusBytes,legacyMigration:migration.bonusMigration};
const out=path.join(root,'reports','kf_0.26.1_bonus_event_cleanup_test.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:out},null,2));process.exit(report.passed?0:1);
