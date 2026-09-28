'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src','app.bundle.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const server=fs.readFileSync(path.join(root,'server','index.js'),'utf8');

const report={version:'0.29.6',passed:true,checks:[]};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}

function block(a,b){
  const x=app.indexOf(a),y=app.indexOf(b,x+a.length);
  return x>=0&&y>x?app.slice(x,y):'';
}

(async()=>{
  const helper=block('async function kf029CommitClubTakeover(worldId, clubId){','async function kf029RecoverCommittedProgress');
  check('Dedicated takeover helper exists',helper.includes('await KF029Remote.createPromise')&&helper.includes("'/club'"));

  const awaitPos=helper.indexOf('await KF029Remote.createPromise');
  const requestPos=helper.indexOf("return kf029Request('/api/v1/worlds/'");
  check('Club request is issued only after world creation wait',
    awaitPos>=0&&requestPos>awaitPos,
    {awaitPos,requestPos});

  let releaseCreate;
  const calls=[];
  const context={
    KF029Remote:{
      createPromise:null,
      revision:null,
      message:''
    },
    renderApp:()=>{},
    encodeURIComponent,
    kf029Request:async (url,options)=>{
      calls.push({url,options});
      return {ok:true,revision:8};
    }
  };
  vm.createContext(context);
  vm.runInContext(helper+'\nthis.kf029CommitClubTakeover=kf029CommitClubTakeover;',context);

  context.KF029Remote.createPromise=new Promise(resolve=>{
    releaseCreate=()=>{
      context.KF029Remote.revision=7;
      resolve({revision:7});
    };
  });

  const pending=context.kf029CommitClubTakeover('world-race','club-a');
  await Promise.resolve();
  await Promise.resolve();
  check('No /club request happens while creation is pending',calls.length===0,{calls:calls.length});

  releaseCreate();
  await pending;
  check('Takeover uses revision produced by finished world creation',
    calls.length===1&&
    calls[0].url==='/api/v1/worlds/world-race/club'&&
    calls[0].options.body.expectedRevision===7&&
    calls[0].options.body.clubId==='club-a',
    {calls});

  calls.length=0;
  context.KF029Remote.revision=null;
  context.KF029Remote.createPromise=Promise.reject(new Error('create_failed'));
  let rejected=null;
  try{
    await context.kf029CommitClubTakeover('world-failed','club-b');
  }catch(error){
    rejected=error;
  }
  check('Failed world creation prevents takeover request',
    !!rejected&&rejected.kfWorldCreationFailed===true&&calls.length===0,
    {error:rejected&&rejected.message,calls:calls.length});

  const action=block("if (action === 'take-over-club') {","if (action === 'open-active-club-profile')");
  check('UI takeover path uses helper instead of direct /club request',
    action.includes('kf029CommitClubTakeover(AppState.worldRecord.id, selectedId)')&&
    !action.includes("void kf029Request('/api/v1/worlds/' + encodeURIComponent(AppState.worldRecord.id) + '/club'"));

  check('Repeated takeover click is guarded while commit is pending',
    action.includes("KF029Remote.checkpointReason === 'take-over-club'")&&
    app.includes("takeoverBusy ? ' disabled aria-disabled=\"true\"'"));

  check('0.29.6 cache busting and service build are current',
    app.includes("var KF_VERSION = '0.29.6';")&&
    index.includes('KF_0.29.6')&&
    index.includes('app.bundle.js?v=0.29.6')&&
    server.includes("const SERVICE_VERSION = '0.29.6';")&&
    server.includes("const API_VERSION = '0.29.5';"));

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
