const fs=require('fs');const path=require('path');const vm=require('vm');
const root=path.resolve(__dirname,'..');const read=r=>fs.readFileSync(path.join(root,r),'utf8');
const js=read('src/app.bundle.js'),html=read('index.html'),pkg=JSON.parse(read('package.json'));
const report={version:'0.27.0-current',passed:true,checks:[]};function check(name,ok,details){report.checks.push({name,ok:!!ok,details:details||{}});if(!ok)report.passed=false;}
check('process metadata exists',js.includes('processId:processId')&&js.includes('processKey:processKey')&&js.includes('activeByProcessKey'));
check('pending decisions use numeric absolute due index',js.includes('responseDueSlotIndex')&&js.includes('currentNegotiationAbsoluteSlotIndex')&&js.includes('negotiationDueAbsoluteIndex'));
check('mailbox is not cleared during calendar progress',!js.includes('world.mailbox.byId = {}; world.mailbox.order = [];'));
check('normal slot progression processes pending negotiations',/applyRoundPlayerUpdates\(world, \[\]\);\s*processDueTransferNegotiationResponses\(world\);/.test(js)&&/refreshClubAggregates\(world, touchedClubIds\);\s*processDueTransferNegotiationResponses\(world\);/.test(js));
try{
 class FakeElement{constructor(){this.innerHTML='';this.style={setProperty(){}};this.dataset={};this.classList={add(){},remove(){},contains(){return false;}};this.children=[];this.parentNode=null;}addEventListener(){}removeEventListener(){}setAttribute(k,v){this[k]=v;}getAttribute(k){return this[k]||null;}querySelector(){return null;}querySelectorAll(){return [];}closest(){return null;}getBoundingClientRect(){return{width:1760,height:990};}appendChild(c){c.parentNode=this;this.children.push(c);return c;}insertBefore(c){c.parentNode=this;this.children.push(c);return c;}}
 const elements={'app-root':new FakeElement(),'modal-root':new FakeElement(),'app-shell':new FakeElement()};
 const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new FakeElement(),getElementById(id){return elements[id]||null;},addEventListener(type,cb){if(type==='DOMContentLoaded')this._domReady=cb;},removeEventListener(){},createElement(){return new FakeElement();},querySelector(){return null;},querySelectorAll(){return[]}};
 const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame(cb){return cb();},cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:FakeElement,navigator:{userAgent:'node-test'}};
 const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:FakeElement,navigator:windowObj.navigator});
 function run(file){let src=read(file);if(file==='src/app.bundle.js')src=src.replace('  function boot(){',`  window.__KFTest02012Negotiation={state:function(){return AppState;},setClub:function(id){AppState.session.activeClubId=id;},createTransfer:createClubTransferNegotiationSnapshot,createContract:createPlayerContractNegotiationSnapshot,rows:squadPlanningActivityRows,schedule:playerContractResponseSchedule,processDue:processDueTransferNegotiationResponses,addMail:addTransferMailboxMessage,advance:advanceCareerRound,actions:renderPlayerProfileActionButtons,normalize:normalizeActiveNegotiationProcesses,activePair:activeNegotiationProcessForPair,latestTransfers:squadPlanningLatestTransferNegotiations,latestContracts:squadPlanningLatestContractNegotiations};\n  function boot(){`);vm.runInContext(src,context,{filename:file});}
 run('src/static-data.js');run('src/db1-db2-data.js');run('src/app.bundle.js');if(document._domReady)document._domReady();windowObj.KFApp.startNewCareer();
 const api=windowObj.__KFTest02012Negotiation,world=api.state().world;
 const activeClubId=(world.clubs.order||[]).find(id=>world.squads[id]);api.setClub(activeClubId);const activeClub=world.clubs.byId[activeClubId];
 world.mailbox={byId:{},order:[],dismissedIds:{},initialized:true};world.negotiations={transfers:{byId:{},order:[],activeByPlayerId:{},activeByProcessKey:{},currentByThreadId:{}},playerContracts:{byId:{},order:[],activeByPlayerId:{},activeByProcessKey:{},currentByThreadId:{}}};world.history.transferNegotiations=[];
 const foreignPlayer=(world.players.order||[]).map(id=>world.players.byId[id]).find(p=>p&&p.clubId&&p.clubId!==activeClubId&&!p.retired);
 const assessment={score:60,label:'verhandlungsbereit',reasons:['Test'],demand:10,boardScore:70,boardLabel:'vertretbar'};
 const first=api.createTransfer(world,foreignPlayer,activeClub,'permanent',{fee:5},assessment,'pending',{type:'pending'},{});
 const second=api.createTransfer(world,foreignPlayer,activeClub,'permanent',{fee:6},assessment,'renegotiation_requested',{type:'renegotiation_requested'},{});
 check('same player and interested club reuse one process',first.processId===second.processId&&first.threadId===second.threadId,{first:first.processId,second:second.processId});
 check('old offer round becomes snapshot only',first.status==='superseded'&&api.latestTransfers(world).filter(r=>r.playerId===foreignPlayer.id&&r.toClubId===activeClubId).length===1);
 const contractAssessment={playerScore:60,playerLabel:'offen',playerReasons:['Test'],boardScore:70,boardLabel:'vertretbar',boardReasons:['Test'],boardVeto:false};
 const contract=api.createContract(world,foreignPlayer,activeClub,{salaryBase:1},contractAssessment,'pending',{type:'pending'}, {type:'transfer',targetClubId:activeClubId,transferNegotiationId:second.id,processId:second.processId,processKey:second.processKey,fromClubId:foreignPlayer.clubId,agreedFee:6});
 const combinedRows=api.rows(world,activeClub,'current').filter(r=>r.player&&r.player.id===foreignPlayer.id);
 check('club and contract phase render as one activity',combinedRows.length===1&&combinedRows[0].processId===second.processId&&!combinedRows[0].isTransferNegotiation,{count:combinedRows.length,status:combinedRows[0]&&combinedRows[0].status});
 const ownPlayer=(world.squads[activeClubId].playerIds||[]).map(id=>world.players.byId[id]).find(Boolean);
 const otherClubs=(world.clubs.order||[]).map(id=>world.clubs.byId[id]).filter(c=>c&&c.id!==activeClubId).slice(0,2);
 api.createTransfer(world,ownPlayer,otherClubs[0],'permanent',{fee:2},assessment,'pending',{type:'pending'},{});
 api.createTransfer(world,ownPlayer,otherClubs[1],'permanent',{fee:3},assessment,'pending',{type:'pending'},{});
 const outgoingRows=api.rows(world,activeClub,'current').filter(r=>r.player&&r.player.id===ownPlayer.id&&r.art!=='Eigener Abgang');
 check('different interested clubs remain separate activities',outgoingRows.length===2&&new Set(outgoingRows.map(r=>r.to)).size===2,{count:outgoingRows.length,clubs:outgoingRows.map(r=>r.to)});
 const schedule=api.schedule(world,2);check('pending schedule stores absolute due slot',Number.isFinite(schedule.responseDueSlotIndex)&&schedule.responseDueSlotIndex>0&&!!schedule.responseSlotKey,schedule);
 const duePlayer=(world.players.order||[]).map(id=>world.players.byId[id]).find(p=>p&&p.id!==foreignPlayer.id&&p.clubId&&p.clubId!==activeClubId&&!p.retired);
 const dueRecord=api.createTransfer(world,duePlayer,activeClub,'permanent',{fee:4},assessment,'pending',Object.assign({type:'pending'},schedule),{});
 const mailsBeforeDue=world.mailbox.order.length;api.processDue(world);const beforeDue=api.latestTransfers(world).find(r=>r.processId===dueRecord.processId);
 check('pending negotiation does not resolve before numeric due slot',beforeDue&&beforeDue.status==='pending',{status:beforeDue&&beforeDue.status});
 world.calendar.currentSlotKey=schedule.responseSlotKey;api.processDue(world);const afterDue=api.latestTransfers(world).find(r=>r.processId===dueRecord.processId);
 check('pending negotiation resolves at numeric due slot and creates mail',afterDue&&afterDue.status!=='pending'&&world.mailbox.order.length>mailsBeforeDue,{status:afterDue&&afterDue.status,mails:world.mailbox.order.length-mailsBeforeDue});
 const infoMail=api.addMail(world,'Transferabteilung','Bedenkzeit',foreignPlayer.fullName+': Antwort wird erwartet.');const before=world.mailbox.order.length;
 api.advance(world);check('informational negotiation mail survives calendar progress',!!world.mailbox.byId[infoMail.id]&&world.mailbox.order.includes(infoMail.id),{before,after:world.mailbox.order.length});
 const actionHtml=api.actions(foreignPlayer,activeClubId);
}catch(err){check('runtime test did not throw',false,{error:String(err&&err.stack||err)});}
const out=path.join(root,'reports','current_negotiation_regression_test.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks,reportFile:out},null,2));process.exit(report.passed?0:1);
