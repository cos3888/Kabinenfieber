const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),read=r=>fs.readFileSync(path.join(root,r),'utf8');
const report={passed:true,checks:[]};function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
class E{constructor(){this.innerHTML='';this.style={};this.dataset={};this.value='';this.classList={add(){},remove(){},contains(){return false}}}addEventListener(){}removeEventListener(){}setAttribute(k,v){this[k]=v}getAttribute(k){return this[k]||null}querySelector(){return null}querySelectorAll(){return[]}closest(){return null}getBoundingClientRect(){return{width:1760,height:990}}}
const els={'app-root':new E(),'modal-root':new E(),'app-shell':new E()};const document={readyState:'loading',documentElement:{clientWidth:1760,clientHeight:990,style:{setProperty(){}}},body:new E(),getElementById:id=>els[id]||null,addEventListener(t,cb){if(t==='DOMContentLoaded')this.cb=cb},removeEventListener(){},createElement(){return new E()},querySelector(){return null},querySelectorAll(){return[]}};
const windowObj={innerWidth:1760,innerHeight:990,addEventListener(){},removeEventListener(){},requestAnimationFrame:cb=>cb(),cancelAnimationFrame(){},console,setTimeout,clearTimeout,document,Element:E,navigator:{userAgent:'node-test'},performance:{now:()=>Date.now()},localStorage:{getItem(){return null},setItem(){}}};const context=vm.createContext({window:windowObj,document,console,setTimeout,clearTimeout,Element:E,navigator:windowObj.navigator,performance:windowObj.performance,Map,WeakMap});
for(const f of ['src/static-data.js','src/db1-db2-data.js'])vm.runInContext(read(f),context,{filename:f});let code=read('src/app.bundle.js');code=code.replace(/\n  if \(document\.readyState === 'loading'\) \{/ , `\nwindow.KFTest={AppState,createEmptyWorld,createUserProfile,createWorldRecord,createTrainerForWorld,removeTrainerFromWorld,activeTrainerCount,activeMemberships,assignTrainerClub,isHumanControlledClub,WorldRepository,UserProfileRepository,executeWorldCommand,ensureRuntimeDerivedIndex,KF_SERVER_POLICY,migrateLegacyWorldToRecord};\n  if (document.readyState === 'loading') {`);vm.runInContext(code,context,{filename:'src/app.bundle.js'});if(document.cb)document.cb();const T=windowObj.KFTest;

const profile=T.createUserProfile({id:'user-main',displayName:'Steffen'});
const records=[];
for(let i=0;i<5;i++){const g=T.createEmptyWorld({seasonNumber:1});const r=T.createWorldRecord({gameState:g,createdByUserId:profile.id});const res=T.createTrainerForWorld(profile,r,{displayName:'Trainer '+(i+1)});records.push({r,res});}
check('User profile supports exactly five active trainer slots',T.activeTrainerCount(profile)===5&&profile.trainers.order.length===5,{count:T.activeTrainerCount(profile),max:profile.trainers.maxActive});
const sixthRecord=T.createWorldRecord({gameState:T.createEmptyWorld({seasonNumber:1}),createdByUserId:profile.id});const sixth=T.createTrainerForWorld(profile,sixthRecord,{displayName:'Trainer 6'});
check('Sixth simultaneous trainer/world participation is rejected',!sixth.ok&&T.activeTrainerCount(profile)===5,{message:sixth.message});
const duplicateProfile=T.createUserProfile({id:'dup-user',displayName:'Dup'});const duplicateWorld=T.createWorldRecord({gameState:T.createEmptyWorld({seasonNumber:1}),createdByUserId:duplicateProfile.id});const firstDup=T.createTrainerForWorld(duplicateProfile,duplicateWorld,{displayName:'First'});const duplicate=T.createTrainerForWorld(duplicateProfile,duplicateWorld,{displayName:'Duplicate'});
check('A user cannot have two active trainers in the same world',firstDup.ok&&!duplicate.ok&&String(duplicate.message).includes('bereits einen aktiven Trainer'),{message:duplicate.message});

const sample=records[0].r;
check('WorldRecord separates server state from football gameState',sample.gameState&&sample.memberships&&sample.progression&&sample.creationRules&&!Object.prototype.hasOwnProperty.call(sample.gameState,'memberships')&&!Object.prototype.hasOwnProperty.call(sample.gameState,'progression'),{});
check('Football gameState contains no singleplayer/session/controller ownership fields',!Object.prototype.hasOwnProperty.call(sample.gameState,'control')&&!Object.prototype.hasOwnProperty.call(sample.gameState.meta,'mode')&&!Object.prototype.hasOwnProperty.call(sample.gameState.meta,'sourceSessionId'),{meta:sample.gameState.meta});
check('World creator is historical metadata only and no owner field exists',sample.createdByUserId===profile.id&&!Object.prototype.hasOwnProperty.call(sample,'ownerUserId'),{});
check('Progression foundation stores deadline and world activity separately',Object.prototype.hasOwnProperty.call(sample.progression,'deadlineAt')&&Object.prototype.hasOwnProperty.call(sample.progression,'lastHumanActivityAt')&&Array.isArray(sample.progression.readyTrainerIds),{progression:sample.progression});
check('Profile owns cosmetics and lifetime statistics outside trainers',profile.cosmetics&&profile.lifetimeStats&&Array.isArray(profile.pastTrainerCareers),{});

// World repository: JSON-safe save/load and isolated copies.
T.WorldRepository.save(sample);const loaded=T.WorldRepository.load(sample.id);const before=JSON.stringify(sample.gameState);loaded.gameState.meta.testIsolation='changed';const loadedAgain=T.WorldRepository.load(sample.id);
check('WorldRepository round-trips serializable WorldRecords',!!loaded&&loaded.id===sample.id&&JSON.stringify(T.WorldRepository.load(sample.id).gameState)===before,{worldId:sample.id});
check('Loaded WorldRecords are isolated copies',!Object.prototype.hasOwnProperty.call(sample.gameState.meta,'testIsolation')&&!Object.prototype.hasOwnProperty.call(loadedAgain.gameState.meta,'testIsolation'),{});

// Runtime caches are separated per world.
const ga=T.createEmptyWorld({seasonNumber:1}),gb=T.createEmptyWorld({seasonNumber:1});ga.calendar.fixtures=[{id:'fa',slotKey:'s1'}];gb.calendar.fixtures=[{id:'fb',slotKey:'s1'}];
const ia=T.ensureRuntimeDerivedIndex(ga,'fixtures'),ib=T.ensureRuntimeDerivedIndex(gb,'fixtures');
check('Runtime derived caches are world-scoped',ia!==ib&&ia.fixtureById.fa&&!ia.fixtureById.fb&&ib.fixtureById.fb&&!ib.fixtureById.fa,{a:Object.keys(ia.fixtureById),b:Object.keys(ib.fixtureById)});

// World supports up to 432 human memberships, independently of one profile.
const big=T.createWorldRecord({gameState:T.createEmptyWorld({seasonNumber:1}),createdByUserId:'seed'});let allOk=true;for(let i=0;i<432;i++){const p=T.createUserProfile({id:'u'+i,displayName:'U'+i});const x=T.createTrainerForWorld(p,big,{displayName:'T'+i});if(!x.ok){allOk=false;break;}}
const extraP=T.createUserProfile({id:'u-extra'});const extra=T.createTrainerForWorld(extraP,big,{displayName:'Extra'});
check('A world supports 1-432 active human trainers and rejects 433',allOk&&T.activeMemberships(big).length===432&&!extra.ok,{count:T.activeMemberships(big).length,message:extra.message});

// Club control derives only from membership, not gameState controller maps.
const controlProfile=T.createUserProfile({id:'control-user',displayName:'Control'});const controlGame=T.createEmptyWorld({seasonNumber:1});controlGame.clubs.byId.c1={id:'c1',name:'Club'};controlGame.clubs.order=['c1'];controlGame.squads.c1={playerIds:[],lineup:[],bench:[],reserve:[],tactics:{},lineupMaskState:{formationKey:'4-4-2',playerPlacementById:{}}};const controlRecord=T.createWorldRecord({gameState:controlGame,createdByUserId:controlProfile.id});const ct=T.createTrainerForWorld(controlProfile,controlRecord,{displayName:'Coach'});const assign=T.assignTrainerClub(controlRecord,ct.trainer.id,'c1');
check('Human club control is derived from active WorldMembership',assign.ok&&T.isHumanControlledClub(controlGame,'c1')&&!Object.prototype.hasOwnProperty.call(controlGame,'control'),{});

// Deleting the last trainer frees the profile slot, archives summary and deletes the empty world from repository.
T.WorldRepository.save(controlRecord);const pastBefore=controlProfile.pastTrainerCareers.length;const removed=T.removeTrainerFromWorld(controlProfile,controlRecord,ct.trainer.id,{reason:'test'});
check('Ending trainer career frees slot and preserves profile career history',removed.ok&&T.activeTrainerCount(controlProfile)===0&&controlProfile.pastTrainerCareers.length===pastBefore+1&&controlProfile.lifetimeStats.completedTrainerCareers===1,{});
check('World with no human trainers is removed from repository',removed.worldEmpty&&!T.WorldRepository.has(controlRecord.id),{});


// Legacy 0.24 world control/session metadata migrates into record membership instead of staying in gameState.
const legacyProfile=T.createUserProfile({id:'legacy-user',displayName:'Legacy'});const legacy=T.createEmptyWorld({seasonNumber:1});legacy.meta.mode='singleplayer';legacy.meta.sourceSessionId='old-session';legacy.control={clubControllers:{legacyClub:'old-controller'},controllerTypes:{legacyClub:'human'}};legacy.clubs.byId.legacyClub={id:'legacyClub'};legacy.clubs.order=['legacyClub'];legacy.squads.legacyClub={playerIds:[]};const migrated=T.migrateLegacyWorldToRecord(legacy,legacyProfile);
check('Legacy world control metadata migrates out of football gameState',migrated&&T.activeMemberships(migrated).length===1&&T.activeMemberships(migrated)[0].clubId==='legacyClub'&&!Object.prototype.hasOwnProperty.call(legacy,'control')&&!Object.prototype.hasOwnProperty.call(legacy.meta,'mode')&&!Object.prototype.hasOwnProperty.call(legacy.meta,'sourceSessionId'),{});

const out=path.join(root,'reports','current_server_foundation_test.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:out},null,2));process.exit(report.passed?0:1);
