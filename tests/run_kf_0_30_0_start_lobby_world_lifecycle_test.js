'use strict';

const fs=require('fs');
const fsp=require('fs/promises');
const os=require('os');
const path=require('path');
const { FileMetadataRepository, MAX_ACTIVE_WORLDS_PER_USER }=require('../server/persistence/file-metadata-repository');
const { LocalObjectStore }=require('../server/persistence/local-object-store');
const { WorldPersistenceService }=require('../server/persistence/world-persistence-service');
const { WorldRuntimeManager }=require('../server/services/world-runtime-manager');
const { WorldSessionService }=require('../server/services/world-session-service');

const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src','app.bundle.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server','index.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const currentVersion=String(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version||'');

const report={version:'0.30.0',passed:true,checks:[]};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}

function makeRecord(id,userId,displayName='Trainer'){
  const trainerId='trainer-'+id;
  return {
    id,
    schemaVersion:'kf-world-record-0.27.2',
    gameVersion:'0.30.0',
    createdAt:new Date().toISOString(),
    createdByUserId:userId,
    creationRules:{startVariant:'classic',leagueConfiguration:'default',clubSelection:'manual'},
    progression:{status:'waiting',deadlineAt:null,readyTrainerIds:[],lastHumanActivityAt:new Date().toISOString()},
    memberships:{
      byTrainerId:{
        [trainerId]:{
          trainerId,
          userProfileId:userId,
          clubId:null,
          status:'active',
          joinedAt:new Date().toISOString(),
          lastActivityAt:new Date().toISOString(),
          trainerDisplayName:displayName
        }
      },
      order:[trainerId]
    },
    gameState:{
      meta:{id,seasonNumber:1},
      clubs:{
        byId:{
          'club-a':{id:'club-a',name:'Club A'},
          'club-b':{id:'club-b',name:'Club B'},
          'club-c':{id:'club-c',name:'Club C'}
        },
        order:['club-a','club-b','club-c']
      }
    }
  };
}

async function create(service,id,userId,access='PRIVATE'){
  const isOpen=access==='OPEN', isApplication=access==='APPLICATION';
  return service.createWorld({
    userId,
    worldRecord:makeRecord(id,userId,userId),
    worldName:'Welt '+id,
    description:'Testwelt '+id,
    visibility:(isOpen||isApplication)?'PUBLIC':'PRIVATE',
    joinPolicy:isOpen?'OPEN':(isApplication?'APPLICATION':'INVITE_ONLY'),
    matches:[],
    financeEvents:[]
  });
}

(async()=>{
  check('World participation limit remains five',MAX_ACTIVE_WORLDS_PER_USER===5);
  check('Browser and backend use the lifecycle contract on the current package version',
    !!currentVersion&&
    app.includes("var KF_VERSION = '"+currentVersion+"';")&&
    app.includes("var KF029_REMOTE_CONTRACT_VERSION = '0.30.0';")&&
    server.includes("const SERVICE_VERSION = '"+currentVersion+"';")&&
    server.includes("const API_VERSION = '0.30.0';")&&
    index.includes('app.bundle.js?v='+currentVersion)&&index.includes('app.css?v='+currentVersion),
    {currentVersion});

  check('Lobby exposes filters and active-world counter',
    app.includes('Aktive Welten: ')&&
    app.includes('Alle Welten')&&app.includes('Meine Welten')&&
    app.includes('Alle Kategorien')&&app.includes('Bewerbung')&&app.includes('Einladung'));

  check('World creation waits for server success before club selection',
    app.includes("setCurrentView('start');")&&
    app.includes("KF029Remote.createPromise=kf029CreateRemoteWorld().then(function(data){")&&
    app.includes("KF029Remote.message='Spielwelt erstellt. Wähle jetzt deinen Verein.';")&&
    app.includes('goToClubSelection();'));

  check('Occupied clubs are derived from WorldRecord memberships',
    app.includes('function kf030ClubOccupant(record,clubId)')&&
    app.includes('Belegt · ')&&
    app.includes("if(kf030ClubOccupant(AppState.worldRecord,clubId)) return;"));

  check('Lifecycle API routes exist',
    server.includes("worldIdFromPath(pathname, '/join')")&&
    server.includes("worldIdFromPath(pathname, '/apply')")&&
    server.includes("worldIdFromPath(pathname, '/leave')")&&
    server.includes("req.method === 'DELETE'"));

  const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'kf-0300-'));
  const metadata=new FileMetadataRepository({filePath:path.join(temp,'metadata.json')});
  const store=new LocalObjectStore({rootDir:path.join(temp,'objects')});
  const worlds=new WorldPersistenceService({objectStore:store});
  const runtime=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:60000});
  const service=new WorldSessionService({metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtime});

  try{
    for(let i=1;i<=5;i++) await create(service,'u1-world-'+i,'u1');
    const five=await service.listWorlds('u1');
    check('Five active worlds are listed for one user',five.filter(w=>w.isMember).length===5,{count:five.length});

    let sixthError=null;
    try{await create(service,'u1-world-6-blocked','u1');}catch(error){sixthError=error;}
    check('Sixth world is rejected by authoritative metadata limit',
      !!sixthError&&/five active worlds/i.test(String(sixthError.message||'')),
      {error:sixthError&&sixthError.message});

    await service.deleteWorld({userId:'u1',worldId:'u1-world-1'});
    const afterDelete=await service.listWorlds('u1');
    check('Deleting the only-player world frees an active slot',
      afterDelete.filter(w=>w.isMember).length===4&&!await worlds.getManifest('u1-world-1'));

    await create(service,'u1-world-6','u1');
    check('A new world can be created after deletion',
      (await service.listWorlds('u1')).filter(w=>w.isMember).length===5);

    await create(service,'open-world','u2','OPEN');
    let joinLimitError=null;
    try{await service.joinWorld({userId:'u1',displayName:'User 1',worldId:'open-world'});}catch(error){joinLimitError=error;}
    check('Direct join also respects five-active-world limit',
      !!joinLimitError&&/five active worlds/i.test(String(joinLimitError.message||'')));

    await create(service,'application-limit-world','u3','APPLICATION');
    let applicationLimitError=null;
    try{await service.applyToWorld({userId:'u1',displayName:'User 1',worldId:'application-limit-world'});}catch(error){applicationLimitError=error;}
    check('Applications also respect five-active-world limit',
      !!applicationLimitError&&/five active worlds/i.test(String(applicationLimitError.message||'')));

    await service.deleteWorld({userId:'u1',worldId:'u1-world-2'});
    const joined=await service.joinWorld({userId:'u1',displayName:'User 1',worldId:'open-world'});
    check('Open world direct join creates a membership without club',
      joined.membership&&joined.membership.clubId===null&&joined.membership.role==='PLAYER');

    await service.leaveWorld({userId:'u1',worldId:'open-world'});
    check('Normal player can leave without deleting the world',
      !!await worlds.getManifest('open-world')&&!(await metadata.getParticipation({worldId:'open-world',userId:'u1'})));

    await create(service,'application-world','u3','APPLICATION');
    const application=await service.applyToWorld({userId:'u1',displayName:'User 1',worldId:'application-world'});
    check('Application worlds persist a pending application',application.status==='PENDING');
    const accepted=await service.resolveApplication({actorUserId:'u3',worldId:'application-world',applicantUserId:'u1',accept:true});
    check('World admin can accept application into canonical membership',
      accepted.membership&&accepted.membership.userProfileId==='u1');

    await service.leaveWorld({userId:'u1',worldId:'application-world'});

    const joinedU4=await service.joinWorld({userId:'u4',displayName:'User 4',worldId:'open-world'});
    check('Second player joined open world for admin-transfer test',!!joinedU4.membership);

    let transferError=null;
    try{await service.leaveWorld({userId:'u2',worldId:'open-world'});}catch(error){transferError=error;}
    check('Last admin cannot leave while other players remain without transfer',
      !!transferError&&/transfer administration/i.test(String(transferError.message||'')));

    await service.leaveWorld({userId:'u2',worldId:'open-world',transferAdminToUserId:'u4'});
    const openAfterTransfer=await worlds.loadWorldRecord('open-world');
    const u4Membership=Object.values(openAfterTransfer.memberships.byTrainerId).find(row=>row&&row.status==='active'&&row.userProfileId==='u4');
    check('Admin rights transfer before last admin leaves',
      u4Membership&&u4Membership.role==='WORLD_ADMIN');

    const lobbyU4=await service.listWorlds('u4');
    const openLobby=lobbyU4.find(w=>w.worldId==='open-world');
    check('Lobby derives participant count, capacity and membership state',
      openLobby&&openLobby.isMember&&openLobby.participantCount===1&&openLobby.maxPlayers===3);

    await service.leaveWorld({userId:'u4',worldId:'open-world'});
    check('Last participant leaving deletes the entire world',
      !(await worlds.getManifest('open-world'))&&!(await metadata.getWorld('open-world')));

  }finally{
    await fsp.rm(temp,{recursive:true,force:true});
  }

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{
  console.error(error);
  process.exit(1);
});
