'use strict';

const fs=require('fs');
const path=require('path');

const app=fs.readFileSync(path.join(__dirname,'..','src','app.bundle.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','services','world-session-service.js'),'utf8');
const runtime=fs.readFileSync(path.join(__dirname,'..','server','services','world-runtime-manager.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
const fileMeta=fs.readFileSync(path.join(__dirname,'..','server','persistence','file-metadata-repository.js'),'utf8');
const firestoreMeta=fs.readFileSync(path.join(__dirname,'..','server','persistence','firestore-metadata-repository.js'),'utf8');

const report={version:'0.32.0',passed:true,checks:[]};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}

const readyStart=app.indexOf('async function kf031RequestReadyAndMaybeAdvance(');
const readyEnd=app.indexOf('async function kf031EnsureMatchDetail(',readyStart);
const readySource=app.slice(readyStart,readyEnd);
const claimedStart=app.indexOf('async function kf032AdvanceClaimedRound(');
const claimedEnd=app.indexOf('function kf032ScheduleProgressPoll(',claimedStart);
const claimedSource=app.slice(claimedStart,claimedEnd);
const pollStart=app.indexOf('async function kf032PollProgressAndMaybeAdvance(');
const pollEnd=app.indexOf('async function kf031RequestReadyAndMaybeAdvance(',pollStart);
const pollSource=app.slice(pollStart,pollEnd);
const lineupDropStart=app.indexOf('function handleLineupDrop(');
const lineupDropEnd=app.indexOf('function positionDisplayOrder(',lineupDropStart);
const lineupDropSource=app.slice(lineupDropStart,lineupDropEnd);

check('Browser persists roundGeneration and resource scope revisions with management saves',
  app.includes('roundGeneration:KF029Remote.roundGeneration')&&
  app.includes('expectedScopeRevisions:Object.assign({},KF029Remote.scopeRevisions || {})')&&
  app.includes('KF029Remote.scopeRevisions=Object.assign({},state.scopeRevisions || KF029Remote.scopeRevisions || {})'));

check('Loaded worlds install authoritative round state and all remote worlds start polling',
  app.includes('KF029Remote.progression = data.roundState || null')&&
  app.includes('KF029Remote.roundGeneration = Number(data.roundGeneration')&&
  app.includes('KF029Remote.scopeRevisions = Object.assign({},data.scopeRevisions || {})')&&
  app.includes('if (KF029Remote.user && AppState.worldRecord)')&&
  app.includes('kf032ScheduleProgressPoll(null,250)'));

check('Ready makes the trainer visibly read-only while navigation can continue',
  app.includes('function kf032RoundReadOnlyForMe()')&&
  app.includes('🔒 Runde abgeschlossen')&&
  app.includes('Du wartest auf die anderen Trainer.')&&
  app.includes('Änderungen sind erst im nächsten Slot wieder möglich.')&&
  app.includes('Runde abgeschlossen ✓'));

check('Read-only also blocks direct lineup drag/drop before it mutates the squad',
  lineupDropSource.includes('kf032RoundReadOnlyForMe()')&&
  lineupDropSource.indexOf('kf032RoundReadOnlyForMe()')<lineupDropSource.indexOf('ensureLineupMaskState'));

check('Every open multiplayer world polls server progression without F5',
  pollSource.includes("kf029Request('/api/v1/worlds/'+encodeURIComponent(record.id)+'/progression')")&&
  app.includes('function kf032ScheduleProgressPoll(actionEl,delayMs)')&&
  pollSource.includes('active?1000:4500'));

check('Browser is no longer the authoritative round progression engine',
  claimedSource.includes('Der Browser ist nur Anzeige')&&
  !claimedSource.includes("kf029BaseHandleAction('office-advance'")&&
  !claimedSource.includes("kf029CommitHardCheckpoint('calendar-slot')")&&
  !readySource.includes('kf032AdvanceClaimedRound(state,actionEl)'));

check('Mobile world creation separates Countdown and Feste Rundenzeiten and only shows mode-specific fields',
  app.includes('class="kf-round-mode-card')&&
  app.includes('data-mode="COUNTDOWN"')&&
  app.includes('data-mode="FIXED_SCHEDULE"')&&
  app.includes('Feste Rundenzeiten')&&
  app.includes('-countdown-section')&&
  app.includes('-fixed-section')&&
  app.includes('class="kf-round-day-chip"')&&
  app.includes("Intl.DateTimeFormat().resolvedOptions().timeZone"));

check('FIXED_SCHEDULE office has no Ready or Weiter control and only shows the final five-minute countdown',
  app.includes("officeFixedSchedule=!!(officeRoundState&&officeRoundState.timeModel==='FIXED_SCHEDULE')")&&
  app.includes("}else if(!officeFixedSchedule){")&&
  app.includes('fixedRemaining!=null&&fixedRemaining<=300')&&
  app.includes('<strong>Nächster Rundenwechsel</strong>'));

check('Countdown exposes only coarse supported duration choices',
  app.includes("[600,'10 Minuten']")&&
  app.includes("[1800,'30 Minuten']")&&
  app.includes("[3600,'1 Stunde']")&&
  app.includes("[7200,'2 Stunden']")&&
  app.includes("[14400,'4 Stunden']")&&
  app.includes("[28800,'8 Stunden']")&&
  app.includes("[43200,'12 Stunden']")&&
  app.includes("[86400,'24 Stunden']")&&
  app.includes("[172800,'48 Stunden']")&&
  app.includes("[259200,'72 Stunden']"));

check('World details keeps Spielrhythmus permanently reachable for assigned and unassigned trainers',
  app.includes("title:'Weltdetails'")&&
  app.includes('data-action="kf-world-round-settings"')&&
  app.includes('data-action="kf-world-details">Weltdetails</button>')&&
  app.includes("if (action === 'office-options' && KF029Remote.user)"));

check('Legacy worlds force initial rhythm setup without a vote and stay read-only until the admin completes it',
  app.includes('roundSetupRequired')&&
  app.includes('Diese ältere Spielwelt hat noch keinen Spielrhythmus.')&&
  app.includes('data-action="kf-round-settings-initialize"')&&
  app.includes('lockClose:true')&&
  server.includes('initializeRoundSettings')&&
  server.includes('Only the world admin may configure the initial round settings'));

check('Later rhythm changes expose proposal timing, 2/3 vote information and delayed activation',
  app.includes('data-action="kf-round-settings-propose"')&&
  app.includes('data-action="kf-round-settings-vote"')&&
  app.includes('2/3 der tatsächlich abgegebenen Stimmen')&&
  app.includes('Abstimmung frühestens auswerten')&&
  app.includes('Bei Annahme gültig ab')&&
  server.includes('proposeRoundSettingsChange')&&
  server.includes('evaluateRoundSettingsChangeForProgression'));

check('Server round configuration is sourced from WorldRecord.runtimeSettings, not lobby metadata',
  server.includes('_roundConfig(record)')&&
  server.includes('record && record.runtimeSettings')&&
  !server.includes('_roundConfig(meta)'));

check('Multiplayer cannot skip coordinated calendar slots with sim-until',
  app.includes('In einer Mehrspielerwelt wird jeder Kalenderslot gemeinsam über den Rundentakt verarbeitet.'));

check('Current multiplayer match intent remains Schnellberechnung with irreversible Co-Trainer delegation',
  app.includes("matchIntent:'QUICK'")&&
  app.includes('Schnellberechnung: Der Co-Trainer übernimmt dein gesamtes Spiel.')&&
  app.includes('Ein späterer Live-Einstieg ist für dieses Match nicht möglich.'));

check('Processing copy is neutral unless the server match plan proves a match slot',
  app.includes('function kf032ProcessingIsMatchSlot(state)')&&
  app.includes('Nächster Kalenderslot wird verarbeitet …')&&
  app.includes('Spieltag wird verarbeitet …'));

check('Server executes claimed progression using one authoritative server commit path',
  server.includes('async _executeClaimedProgression')&&
  server.includes('this.runtime.runServerProgression')&&
  runtime.includes('async runServerProgression')&&
  runtime.includes('progressionRunId'));

check('Only active trainers with assigned clubs count for Ready and blocking',
  server.includes('listActiveAssignedUserIdsForWorld')&&
  fileMeta.includes('async listActiveAssignedUserIdsForWorld')&&
  firestoreMeta.includes('async listActiveAssignedUserIdsForWorld'));

check('Both metadata backends reclaim an expired lease without reopening the round',
  fileMeta.includes('let reclaimedLease = false')&&firestoreMeta.includes('let reclaimedLease = false')&&
  !fileMeta.includes('state.status = ROUND_STATUS_OPEN;\n        state.leaseId = null;')&&
  !firestoreMeta.includes('state.status = ROUND_STATUS_OPEN;\n        state.leaseId = null;'));

check('Server exposes a protected recovery sweep independent of browser polling',
  index.includes("'/api/v1/internal/progression/sweep'")&&
  index.includes("x-kf-progression-token")&&
  index.includes('sweepDueProgressions()'));

console.log(JSON.stringify(report,null,2));
process.exit(report.passed?0:1);
