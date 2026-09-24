const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(root,r),'utf8');
const report={version:'0.27.0',passed:true,checks:[],metrics:{}};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
class E{constructor(){this.innerHTML='';this.style={};this.dataset={};this.value='';this.classList={add(){},remove(){},contains(){return false}}}addEventListener(){}removeEventListener(){}setAttribute(k,v){this[k]=v}getAttribute(k){return this[k]||null}querySelector(){return null}querySelectorAll(){return[]}closest(){return null}getBoundingClientRect(){return{width:1760,height:990}}}
const els={'app-root':new E(),'modal-root':new E(),'app-shell':new E(),'sim-progress-text':new E()};
const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new E(),getElementById:id=>els[id]||null,addEventListener(t,cb){if(t==='DOMContentLoaded')this.cb=cb},removeEventListener(){},createElement(){return new E()},querySelector(){return null},querySelectorAll(){return[]}};
let seed=270023;function seededRandom(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}const math=Object.create(Math);math.random=seededRandom;
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame:cb=>cb(),cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:E,navigator:{userAgent:'node-test'},performance:{now:()=>Date.now()},localStorage:{getItem(){return null},setItem(){}}};
const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:E,navigator:windowObj.navigator,performance:windowObj.performance,Math:math,Map,WeakMap,Set});
for(const f of ['src/static-data.js','src/db1-db2-data.js'])vm.runInContext(read(f),context,{filename:f});
let code=read('src/app.bundle.js');
code=code.replace(/\n  if \(document\.readyState === 'loading'\) \{/,`\n  window.KFTest={AppState,startNewCareer,advanceCareerRound,nextCalendarSlot,WorldRepository,CurrentSeasonMatchRepository,renderMatchInfoModalBody};\n  if (document.readyState === 'loading') {`);
vm.runInContext(code,context,{filename:'src/app.bundle.js'});if(document.cb)document.cb();const T=windowObj.KFTest;
function jsonBytes(v,seen){if(v===null)return 4;const t=typeof v;if(t==='string')return Buffer.byteLength(JSON.stringify(v));if(t==='number')return Number.isFinite(v)?Buffer.byteLength(String(v)):4;if(t==='boolean')return v?4:5;if(t!=='object')return 0;seen=seen||new Set();if(seen.has(v))throw new Error('Cycle');seen.add(v);let total=2;if(Array.isArray(v)){for(let i=0;i<v.length;i++){if(i)total++;const x=v[i],tx=typeof x;total+=(x===undefined||tx==='function'||tx==='symbol')?4:jsonBytes(x,seen);}}else{let first=true;for(const k of Object.keys(v)){const x=v[k],tx=typeof x;if(x===undefined||tx==='function'||tx==='symbol')continue;if(!first)total++;first=false;total+=Buffer.byteLength(JSON.stringify(k))+1+jsonBytes(x,seen);}}seen.delete(v);return total;}
function mib(n){return Math.round(n/1048576*100)/100;}
function financeStats(w){let count=0,bytes=0;Object.values((((w||{}).clubFinances||{}).byClub)||{}).forEach(f=>{const rows=(f&&f.financeEvents)||[];count+=rows.length;bytes+=jsonBytes(rows);});return{count,bytes};}
const initStart=Date.now();T.startNewCareer();const initMs=Date.now()-initStart,w=T.AppState.world,r=T.AppState.worldRecord;T.AppState.session.activeClubId=null;
check('Career initializes as KF_0.27.0',String((w.meta||{}).schemaVersion)==='kf-core-0.27.1',{schema:(w.meta||{}).schemaVersion,initMs});
const initialRecordBytes=jsonBytes(r);
let steps=0,matches=0,guard=0,fatal=null;const simStart=Date.now();
while(Number(w.meta.seasonNumber||0)===1&&guard++<1000){const next=T.nextCalendarSlot(w);if(!next){fatal='No next slot';break;}if(String(next.label||'').indexOf('Saisonübergang')===0)break;const stepStart=Date.now();const step=T.advanceCareerRound(w);const stepMs=Date.now()-stepStart;steps++;if(!step||!step.advanced){fatal='Advance stopped: '+(step&&step.reason);break;}matches+=(step.simulatedMatches||[]).length;if(steps%20===0)console.log(`[progress] steps=${steps} matches=${matches} stepMs=${stepMs} index=${((w.history||{}).matches||[]).length} store=${T.CurrentSeasonMatchRepository.count(w,1)}`);}
const simMs=Date.now()-simStart;
const preRecordBytes=jsonBytes(r),compactMatchesBytes=jsonBytes((w.history||{}).matches||[]),storeBytes=T.CurrentSeasonMatchRepository.serializedBytes(w,1),storeCount=T.CurrentSeasonMatchRepository.count(w,1),finance=financeStats(w);
let stringifyOk=true,stringifyError=null,stringifyBytes=0,stringifyMs=0;{const t=Date.now();try{const s=JSON.stringify(r);stringifyBytes=Buffer.byteLength(s);}catch(e){stringifyOk=false;stringifyError=String(e&&e.message||e);}stringifyMs=Date.now()-t;}
let repositorySaveOk=true,repositorySaveError=null;try{T.WorldRepository.save(r);}catch(e){repositorySaveOk=false;repositorySaveError=String(e&&e.message||e);}
const ids=T.CurrentSeasonMatchRepository.listIds(w,1),sampleId=ids[Math.floor(ids.length/2)]||ids[0]||null;let reportHtml='';if(sampleId)reportHtml=T.renderMatchInfoModalBody(sampleId,'events')||'';
check('Full season completes before rollover',!fatal&&matches>7000,{fatal,steps,matches,simMs});
check('Every current-season compact match has exactly one full store payload',storeCount===((w.history||{}).matches||[]).length&&storeCount===matches,{storeCount,indexCount:((w.history||{}).matches||[]).length,matches});
check('Monolithic WorldRecord is JSON-serializable after match extraction',stringifyOk,{stringifyError,stringifyMs,stringifyMiB:mib(stringifyBytes)});
check('WorldRepository.save succeeds at end of full season',repositorySaveOk,{repositorySaveError});
check('A report from an old matchday of the current season remains loadable on demand',!!sampleId&&reportHtml.length>500,{sampleId,htmlLength:reportHtml.length});
const beforeTransitionStore=storeCount,t0=Date.now(),transition=T.advanceCareerRound(w),transitionMs=Date.now()-t0,afterStore=T.CurrentSeasonMatchRepository.count(w,1),postRecordBytes=jsonBytes(r);
check('Season transition succeeds',transition&&transition.type==='season-transition'&&Number(w.meta.seasonNumber)===2,{type:transition&&transition.type,season:w.meta.seasonNumber,transitionMs});
check('Full match store of completed season is deleted after successful compaction',beforeTransitionStore>0&&afterStore===0,{beforeTransitionStore,afterStore,cleanup:transition&&transition.pipeline&&transition.pipeline.currentSeasonMatchStoreCleanup});
report.metrics={initMs,steps,matches,simMs,transitionMs,initialRecordBytes,preRecordBytes,compactMatchesBytes,fullMatchStoreBytes:storeBytes,totalSeparatedPersistenceBytes:preRecordBytes+storeBytes,financeEventBytes:finance.bytes,financeEvents:finance.count,postTransitionRecordBytes:postRecordBytes,storeCountBeforeTransition:storeCount,storeCountAfterTransition:afterStore,stringifyBytes,stringifyMs,
 baseline0262:{preRecordMiB:550.9,fullMatchesMiB:389.8,clubFinancesMiB:124.9,postRecordMiB:70.0},
 sizesMiB:{initial:mib(initialRecordBytes),worldRecordPre:mib(preRecordBytes),compactMatches:mib(compactMatchesBytes),fullMatchStore:mib(storeBytes),combined:mib(preRecordBytes+storeBytes),financeEvents:mib(finance.bytes),postTransition:mib(postRecordBytes)},
 comparisonPct:{worldRecordVs0262:Math.round((preRecordBytes/(550.9*1048576))*1000)/10,worldRecordReductionVs0262:Math.round((1-preRecordBytes/(550.9*1048576))*1000)/10,combinedVs0262:Math.round(((preRecordBytes+storeBytes)/(550.9*1048576))*1000)/10}};
const out=path.join(root,'reports','kf_0.27.0_server_storage_test.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:out},null,2));process.exit(report.passed?0:1);
