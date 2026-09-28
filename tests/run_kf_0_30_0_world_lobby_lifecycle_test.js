'use strict';

const fs=require('fs/promises');
const path=require('path');
const os=require('os');
const { LocalObjectStore }=require('../server/persistence/local-object-store');
const { FileMetadataRepository, MAX_ACTIVE_WORLDS_PER_USER }=require('../server/persistence/file-metadata-repository');
const { WorldPersistenceService }=require('../server/persistence/world-persistence-service');
const { WorldRuntimeManager }=require('../server/services/world-runtime-manager');
const { WorldSessionService }=require('../server/services/world-session-service');

const report={version:'0.30.0',passed:true,checks:[]};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}

function makeWorldRecord(worldId,userId,trainerId='trainer-owner'){
  const now=new Date().toISOString();
  return {
    id:worldId,
    schemaVersion:'kf-world-record-0.27.2',
    gameVersion:'0.30.0',
    createdAt:now,
    createdByUserId:userId,
    creationRules:{startVariant:'classic',leagueConfiguration:'default',clubSelection:'manual'},
    runtimeSettings:{roundDurationHours:null},
    progression:{status:'waiting',deadlineAt:null,readyTrainerIds:[],lastHumanActivityAt:now},
    memberships:{byTrainerId:{[trainerId]:{
      trainerId,userProfileId:userId,clubId:null,status:'active',
      joinedAt:now,lastActivityAt:now,trainerDisplayName:'Owner'
    }},order:[trainerId]},
    gameState:{
      meta:{id:worldId,seasonNumber:1,schemaVersion:'kf-core-0.27.2'},
      clubs:{byId:{
        'club-a':{id:'club-a',name:'Club A'},
        'club-b':{id:'club-b',name:'Club B'},
        'club-c':{id:'club-c',name:'Club C'}
      },order:['club-a','club-b','club-c']},
      players:{byId:{},order:[]},
      squads:{},
      calendar:{currentSlotKey:'w0',fixtures:[],slots:[]},
      history:{matches:[],seasonResults:{},seasonStandings:{},playerSeasons:{},playerMarketValues:{}},
      clubFinances:{byClub:{}}
    }
  };
}

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf0300-'));
  const metadata=new FileMetadataRepository({filePath:path.join(root,'metadata.json')});
  const worlds=new WorldPersistenceService({objectStore:new LocalObjectStore({rootDir:path.join(root,'objects')})});
  const runtime=new WorldRuntimeManager({worldPersistence:worlds,metadataRepository:metadata,idleMs:60000});
  const sessions=new WorldSessionService({metadataRepository:metadata,worldPersistence:worlds,runtimeManager:runtime});

  const owner='user-owner', guest='user-guest', worldId='world-lobby';
  const created=await sessions.createWorld({
    userId:owner,
    worldRecord:makeWorldRecord(worldId,owner),
    worldName:'Ostsee Liga',
    description:'Langfristige öffentliche Testwelt',
    startVariant:'classic',
    visibility:'PUBLIC',
    joinPolicy:'OPEN'
  });
  check('World creation persists lobby metadata and admin membership',
    created.registration.worldName==='Ostsee Liga'&&
    created.registration.description==='Langfristige öffentliche Testwelt'&&
    created.registration.startVariant==='classic'&&
    created.membership.role==='WORLD_ADMIN');

  const ownerLobby=await sessions.listWorlds(owner);
  check('Lobby exposes active-world counter and personal status',
    ownerLobby.activeWorldCount===1&&ownerLobby.maxActiveWorlds===MAX_ACTIVE_WORLDS_PER_USER&&
    ownerLobby.worlds.length===1&&ownerLobby.worlds[0].mine===true&&ownerLobby.worlds[0].participantCount===1);

  const guestLobby=await sessions.listWorlds(guest);
  check('Public world is visible to a non-member with join action',
    guestLobby.activeWorldCount===0&&guestLobby.worlds.length===1&&
    guestLobby.worlds[0].mine===false&&guestLobby.worlds[0].canJoin===true);

  const joined=await sessions.joinWorld({userId:guest,displayName:'Gast',worldId});
  check('Direct join creates server-authoritative membership without a club',
    joined.membership.userProfileId===guest&&joined.membership.clubId===null&&joined.membership.role==='PLAYER');

  const afterJoin=await sessions.listWorlds(guest);
  check('Joined world counts toward 5-world limit and participant count',
    afterJoin.activeWorldCount===1&&afterJoin.worlds[0].mine===true&&afterJoin.worlds[0].participantCount===2);

  const ownerOpened=await sessions.openWorld({userId:owner,worldId});
  const guestOpened=await sessions.openWorld({userId:guest,worldId});
  const ownerTakeover=await sessions.assignClub({userId:owner,worldId,clubId:'club-a',expectedRevision:ownerOpened.revision});
  const guestReload=await sessions.openWorld({userId:guest,worldId});
  const guestTakeover=await sessions.assignClub({userId:guest,worldId,clubId:'club-b',expectedRevision:guestReload.revision});
  check('Different human users can take different clubs',
    ownerTakeover.membership.clubId==='club-a'&&guestTakeover.membership.clubId==='club-b');

  let duplicateRejected=false;
  const guestAfterClub=await sessions.openWorld({userId:guest,worldId});
  try{await sessions.assignClub({userId:guest,worldId,clubId:'club-a',expectedRevision:guestAfterClub.revision});}
  catch(error){duplicateRejected=/already controls a club|already assigned/i.test(String(error.message||''));}
  check('Server still rejects conflicting club ownership',duplicateRejected);

  const left=await sessions.leaveWorld({userId:guest,worldId});
  check('Normal participant can leave without deleting shared world',left.left===true&&left.deleted===false);

  const ownerAfterLeave=await sessions.listWorlds(owner);
  check('Participant count updates after leave',ownerAfterLeave.worlds[0].participantCount===1);

  const deleted=await sessions.leaveWorld({userId:owner,worldId});
  check('Last participant leaving deletes the complete world registration',deleted.deleted===true);
  check('Deleted world frees the active slot', (await sessions.listWorlds(owner)).activeWorldCount===0 && (await metadata.getWorld(worldId))===null && (await worlds.getManifest(worldId))===null);

  const applicationWorld='world-application';
  await sessions.createWorld({
    userId:owner,
    worldRecord:makeWorldRecord(applicationWorld,owner,'trainer-app-owner'),
    worldName:'Bewerbungswelt',
    description:'Nur nach Bewerbung',
    startVariant:'classic',
    visibility:'PUBLIC',
    joinPolicy:'APPLICATION'
  });
  const application=await sessions.applyToWorld({userId:guest,displayName:'Gast',worldId:applicationWorld});
  const applicantLobby=await sessions.listWorlds(guest);
  const applicationRow=applicantLobby.worlds.find(row=>row.worldId===applicationWorld);
  check('Application world stores pending application without consuming active-world slot',
    application.status==='OPEN'&&applicantLobby.activeWorldCount===0&&applicationRow&&applicationRow.applicationStatus==='OPEN');

  const app=await fs.readFile(path.join(__dirname,'..','src','app.bundle.js'),'utf8');
  const index=await fs.readFile(path.join(__dirname,'..','index.html'),'utf8');
  const server=await fs.readFile(path.join(__dirname,'..','server','index.js'),'utf8');
  check('Browser renders lobby, 5-world counter and occupied-club state',
    app.includes('function kf030RenderLobby()')&&
    app.includes('Aktive Spielwelten: ')&&
    app.includes('is-human-occupied')&&
    app.includes('Belegt · '));
  check('World creation stays on lobby until server create resolves',
    app.includes("setCurrentView('start');")&&
    app.includes("setCurrentView('club-selection');")&&
    app.indexOf("setCurrentView('start');")<app.indexOf("setCurrentView('club-selection');",app.indexOf("setCurrentView('start');")));
  check('Current service/API/cache versions are 0.30.0',
    app.includes("var KF_VERSION = '0.30.0';")&&
    app.includes("var KF029_REMOTE_CONTRACT_VERSION = '0.30.0';")&&
    server.includes("const SERVICE_VERSION = '0.30.0';")&&
    server.includes("const API_VERSION = '0.30.0';")&&
    index.includes('app.bundle.js?v=0.30.0')&&index.includes('app.css?v=0.30.0'));

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{console.error(error);process.exit(1);});
