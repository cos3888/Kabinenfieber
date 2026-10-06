'use strict';

const fs=require('fs');
const path=require('path');

const app=fs.readFileSync(path.join(__dirname,'..','src','app.bundle.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','services','world-session-service.js'),'utf8');
const fileMeta=fs.readFileSync(path.join(__dirname,'..','server','persistence','file-metadata-repository.js'),'utf8');
const firestoreMeta=fs.readFileSync(path.join(__dirname,'..','server','persistence','firestore-metadata-repository.js'),'utf8');

const report={version:'0.32.0',passed:true,checks:[]};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}

check('Browser persists roundGeneration and resource scope revisions with management saves',
  app.includes('roundGeneration:KF029Remote.roundGeneration')&&
  app.includes('expectedScopeRevisions:Object.assign({},KF029Remote.scopeRevisions || {})')&&
  app.includes('KF029Remote.scopeRevisions=Object.assign({},data.scopeRevisions || KF029Remote.scopeRevisions || {})'));

check('Loaded worlds install authoritative round state and scope revisions',
  app.includes('KF029Remote.progression = data.roundState || null')&&
  app.includes('KF029Remote.roundGeneration = Number(data.roundGeneration')&&
  app.includes('KF029Remote.scopeRevisions = Object.assign({},data.scopeRevisions || {})'));

check('Ready makes the trainer read-only while navigation can continue',
  app.includes('function kf032RoundReadOnlyForMe()')&&
  app.includes('Du bist für diese Runde bereits bereit. Du kannst dich weiter umsehen, aber bis zum Rundenwechsel nichts mehr verändern.')&&
  app.includes('Bereit ✓'));

check('Round waiting uses GET polling instead of repeatedly sending Ready',
  app.includes("kf029Request('/api/v1/worlds/'+encodeURIComponent(record.id)+'/progression')")&&
  app.includes('function kf032ScheduleProgressPoll(actionEl,delayMs)')&&
  !app.includes("KF029Remote.progressTimer=setTimeout(function(){\n      KF029Remote.progressTimer=null;\n      void kf031RequestReadyAndMaybeAdvance(actionEl);"));

check('Multiplayer cannot skip coordinated rounds with calendar sim-until',
  app.includes('Mehrspielerwelten werden rundenweise fortgesetzt. Mehrere Kalenderslots können nicht an den anderen Trainern vorbei simuliert werden.'));

check('Current multiplayer match action is explicit Schnellberechnung with irreversible Co-Trainer delegation',
  app.includes("matchIntent:'QUICK'")&&
  app.includes("'Schnellberechnen'")&&
  app.includes('Der Co-Trainer übernimmt dein gesamtes Spiel. Ein späterer Live-Einstieg ist für dieses Match nicht möglich.'));

check('Lobby explains the existing manual two-account multiplayer test path',
  app.includes('Für einen Mehrspielertest wähle „Offene Welt“.')&&
  app.includes("action === 'kf-join-world'")&&
  app.includes('function kf030JoinWorld(worldId)'));

check('Multiplayer office mailbox is club-owned instead of mutating the old global mailbox',
  app.includes('world.clubMailboxes.byClub')&&
  app.includes('function kf032ClubMailbox(world,clubId,create)')&&
  app.includes('var mailbox=kf032ClubMailbox(world,club.id,true)')&&
  !app.includes('if(!world.mailbox)world.mailbox={byId:{},order:[],dismissedIds:{},initialized:false}'));

check('Server merges round management overlays into the authoritative progression commit',
  server.includes('_mergeManagementOverlayDelta')&&
  server.includes('progressWorldDelta = this._mergeManagementOverlayDelta(worldId, rows, worldDelta)'));

check('Both metadata backends can claim an expired round exactly once',
  fileMeta.includes('async claimDueWorldProgress')&&firestoreMeta.includes('async claimDueWorldProgress')&&
  fileMeta.includes('state.status = ROUND_STATUS_LOCKING')&&firestoreMeta.includes('state.status = ROUND_STATUS_LOCKING'));

console.log(JSON.stringify(report,null,2));
process.exit(report.passed?0:1);
