'use strict';

const fs=require('fs/promises');
const os=require('os');
const path=require('path');

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf029-http-'));
  process.env.KF_OBJECT_STORE='local';
  process.env.KF_METADATA_STORE='file';
  process.env.KF_DATA_DIR=root;
  process.env.KF_OBJECT_STORE_DIR=path.join(root,'objects');
  process.env.KF_METADATA_FILE=path.join(root,'metadata.json');
  process.env.KF_AUTH_FILE=path.join(root,'auth.json');
  process.env.KF_ALLOWED_ORIGINS='https://cos3888.github.io';
  process.env.KF_RUNTIME_IDLE_MS='60000';
  const {server}=require('../server/index');

  const report={version:'0.29.0-http',passed:true,checks:[]};
  function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const port=server.address().port;
  const base='http://127.0.0.1:'+port;
  async function request(url, options={}){
    const res=await fetch(base+url,options);
    let data=null; try{data=await res.json();}catch(_){}
    return {res,data};
  }
  const origin='https://cos3888.github.io';
  const headers={'content-type':'application/json','origin':origin};

  const reg=await request('/api/v1/auth/register',{
    method:'POST',headers,body:JSON.stringify({loginName:'ApiTester',password:'api-test-passwort',displayName:'API Trainer'})
  });
  check('HTTP register creates user and returns CORS header',
    reg.res.status===201&&reg.data&&reg.data.ok&&reg.data.token&&reg.res.headers.get('access-control-allow-origin')===origin,
    {status:reg.res.status,cors:reg.res.headers.get('access-control-allow-origin')});
  const token=reg.data&&reg.data.token;
  const userId=reg.data&&reg.data.user&&reg.data.user.userId;
  const authHeaders={...headers,authorization:'Bearer '+token};

  const me=await request('/api/v1/auth/me',{headers:{origin,authorization:'Bearer '+token}});
  check('Bearer token authenticates /auth/me',me.res.status===200&&me.data.user.userId===userId);

  const worldId='http-world';
  const record={
    id:worldId,schemaVersion:'kf-world-record-0.27.2',gameVersion:'0.29.3',
    createdAt:new Date().toISOString(),createdByUserId:userId,
    progression:{status:'waiting',readyTrainerIds:[],lastHumanActivityAt:new Date().toISOString()},
    memberships:{byTrainerId:{'trainer-http':{
      trainerId:'trainer-http',userProfileId:userId,clubId:null,status:'active',
      joinedAt:new Date().toISOString(),trainerDisplayName:'API Trainer'
    }},order:['trainer-http']},
    gameState:{
      meta:{id:worldId,seasonNumber:1,schemaVersion:'kf-core-0.27.2'},
      clubs:{byId:{},order:[]},players:{byId:{},order:[]},squads:{},
      calendar:{fixtures:[],slots:[]},history:{matches:[]},clubFinances:{byClub:{}}
    }
  };
  const created=await request('/api/v1/worlds',{
    method:'POST',headers:authHeaders,body:JSON.stringify({clientVersion:'0.29.5',worldRecord:record,worldName:'HTTP Welt',visibility:'PUBLIC',joinPolicy:'OPEN',matches:[],financeEvents:[]})
  });
  check('Authenticated HTTP world creation returns compact revision/membership response',
    created.res.status===201&&created.data.revision===1&&created.data.membership.role==='WORLD_ADMIN'&&!Object.prototype.hasOwnProperty.call(created.data,'worldRecord'),
    {status:created.res.status,revision:created.data&&created.data.revision});

  const list=await request('/api/v1/worlds',{headers:{origin,authorization:'Bearer '+token}});
  check('HTTP world list contains the created world',list.res.status===200&&list.data.worlds.length===1&&list.data.worlds[0].worldId===worldId);

  const opened=await request('/api/v1/worlds/'+encodeURIComponent(worldId),{headers:{origin,authorization:'Bearer '+token}});
  check('HTTP open returns authoritative WorldRecord and detail stores',
    opened.res.status===200&&opened.data.worldRecord.id===worldId&&Array.isArray(opened.data.matches)&&Array.isArray(opened.data.financeEvents));

  opened.data.worldRecord.gameState.meta.httpMarker='saved';
  const saved=await request('/api/v1/worlds/'+encodeURIComponent(worldId)+'/snapshot',{
    method:'PUT',headers:authHeaders,body:JSON.stringify({
      expectedRevision:opened.data.revision,
      clientVersion:'0.29.5',
      worldRecord:opened.data.worldRecord,
      matches:[{id:'m-http',season:1}],
      financeEvents:[{id:'f-http',clubId:'club-x',seasonId:1,amount:1}]
    })
  });
  check('HTTP snapshot save advances revision',saved.res.status===200&&saved.data.revision===opened.data.revision+1);

  const wrong=await request('/api/v1/worlds/'+encodeURIComponent(worldId),{headers:{origin,authorization:'Bearer wrong-token'}});
  check('Invalid bearer token is rejected',wrong.res.status===401);

  const preflight=await fetch(base+'/api/v1/worlds',{method:'OPTIONS',headers:{origin,'access-control-request-method':'GET','access-control-request-headers':'authorization'}});
  check('GitHub Pages CORS preflight is allowed',preflight.status===204&&preflight.headers.get('access-control-allow-origin')===origin);

  await new Promise(resolve=>server.close(resolve));
  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(async error=>{
  console.error(error);
  process.exit(1);
});
