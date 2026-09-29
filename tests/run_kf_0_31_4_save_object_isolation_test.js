'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { LocalObjectStore } = require('../server/persistence/local-object-store');
const { WorldPersistenceService, MANIFEST_SCHEMA, STORAGE_SCHEMA } = require('../server/persistence/world-persistence-service');
const { WORLD_DELTA_SCHEMA } = require('../server/domain/world-delta');
const { encodeJsonGzip, encodeJson } = require('../server/persistence/json-codec');

const report = {
  suite:'KF_0.31.4 Save Object Isolation & Existing World Integrity',
  passed:true,
  checks:[],
  metrics:{}
};
function check(name, ok, details={}) {
  report.checks.push({ name, ok:!!ok, ...details });
  if (!ok) report.passed=false;
}
function markerOf(record) {
  return record && record.gameState && record.gameState.squads &&
    record.gameState.squads['club-a'] && record.gameState.squads['club-a'].tactics &&
    record.gameState.squads['club-a'].tactics.raceOwner;
}
function makeWorldRecord(worldId, marker='base', season=1) {
  return {
    id:worldId,
    createdByUserId:'u1',
    createdAt:new Date(0).toISOString(),
    memberships:{ byTrainerId:{} },
    gameState:{
      meta:{ id:worldId, seasonNumber:Number(season), version:'0.31.3' },
      players:{ byId:{} },
      clubs:{ byId:{} },
      squads:{ 'club-a':{ tactics:{ raceOwner:marker } } },
      calendar:{ currentSlotKey:'w0', fixtures:[], slots:[] },
      history:{ matches:[], seasonResults:{}, seasonStandings:{}, playerSeasons:{}, playerMarketValues:{} },
      clubFinances:{ byClub:{} }
    }
  };
}
function delta(worldId, value) {
  return {
    schemaVersion:WORLD_DELTA_SCHEMA,
    worldId,
    ops:[{ path:['gameState','squads','club-a','tactics','raceOwner'], value }]
  };
}
function match(id, slotKey='slot-1') {
  return { id, season:1, slotKey, homeClubId:'club-a', awayClubId:'club-b', homeGoals:1, awayGoals:0, events:[], playerStats:[] };
}
function financeEvent(id) {
  return { id, clubId:'club-a', seasonId:1, amount:100, type:'TEST' };
}

class DeterministicManifestRaceStore {
  constructor(base) {
    this.base=base;
    this.enabled=false;
    this.manifestKey=null;
    this.stagedWrites=[];
    this.resetBarrier();
  }
  resetBarrier() {
    this.manifestArrivals=0;
    this._secondArrived=null;
    this._firstDone=null;
    this.secondArrived=new Promise(resolve => { this._secondArrived=resolve; });
    this.firstDone=new Promise(resolve => { this._firstDone=resolve; });
  }
  arm(manifestKey) {
    this.enabled=true;
    this.manifestKey=manifestKey;
    this.stagedWrites=[];
    this.resetBarrier();
  }
  disarm() { this.enabled=false; }
  async read(key){ return this.base.read(key); }
  async readBody(key){ return this.base.readBody(key); }
  async exists(key){ return this.base.exists(key); }
  async delete(key){ return this.base.delete(key); }
  async deletePrefix(prefix){ return this.base.deletePrefix(prefix); }
  async write(key, body, options={}) {
    if (this.enabled && key !== this.manifestKey) this.stagedWrites.push(key);
    const raced =
      this.enabled &&
      key === this.manifestKey &&
      options &&
      options.ifGenerationMatch !== undefined &&
      String(options.ifGenerationMatch) !== '0';
    if (!raced) return this.base.write(key, body, options);

    const ticket=++this.manifestArrivals;
    if (ticket===1) {
      await this.secondArrived;
      try { return await this.base.write(key, body, options); }
      finally { this._firstDone(); }
    }
    if (ticket===2) {
      this._secondArrived();
      await this.firstDone;
      return this.base.write(key, body, options);
    }
    return this.base.write(key, body, options);
  }
}

async function createWorld(service, worldId) {
  return service.initializeWorld({ worldRecord:makeWorldRecord(worldId) });
}
function raceOutcome(results) {
  const fulfilledIndexes=results.map((row,index)=>row.status==='fulfilled'?index:-1).filter(index=>index>=0);
  const rejectedIndexes=results.map((row,index)=>row.status==='rejected'?index:-1).filter(index=>index>=0);
  return { fulfilledIndexes, rejectedIndexes };
}
async function assertTwoWayRace({ name, raceStore, service, worldId, runA, runB, verifyWinner, expectedStagedMinimum=2 }) {
  raceStore.arm(service.manifestKey(worldId));
  const results=await Promise.allSettled([runA(),runB()]);
  raceStore.disarm();
  const { fulfilledIndexes, rejectedIndexes }=raceOutcome(results);
  check(`${name}: exactly one manifest CAS wins`,
    fulfilledIndexes.length===1 && rejectedIndexes.length===1 &&
      results[rejectedIndexes[0]].reason && results[rejectedIndexes[0]].reason.code==='PERSISTENCE_CONFLICT',
    { statuses:results.map(row=>row.status), rejectedCode:rejectedIndexes.length?results[rejectedIndexes[0]].reason&&results[rejectedIndexes[0]].reason.code:null }
  );
  check(`${name}: staged paths are isolated`,
    raceStore.stagedWrites.length>=expectedStagedMinimum &&
      new Set(raceStore.stagedWrites).size===raceStore.stagedWrites.length,
    { stagedPaths:raceStore.stagedWrites }
  );
  const manifest=await service.getManifest(worldId);
  check(`${name}: revision advances exactly once`, Number(manifest.revision)===2, { revision:manifest.revision });
  await verifyWinner({ manifest, winnerIndex:fulfilledIndexes[0], loserIndex:rejectedIndexes[0], results });
  return { manifest, winnerIndex:fulfilledIndexes[0], loserIndex:rejectedIndexes[0], results };
}

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf0314-'));
  try {
    const base=new LocalObjectStore({ rootDir:path.join(root,'objects') });
    const racingStore=new DeterministicManifestRaceStore(base);
    const factory=()=>new WorldPersistenceService({ objectStore:racingStore, deltaCompactionThreshold:100000 });

    // 1) Management/world-delta race reproduces the production damage path, now expected safe.
    {
      const worldId='race-management';
      const init=factory();
      await createWorld(init,worldId);
      const a=factory(), b=factory();
      const race=await assertTwoWayRace({
        name:'parallel management saves',
        raceStore:racingStore, service:init, worldId,
        runA:()=>a.commitWorldDelta({ worldId, expectedRevision:1, worldDelta:delta(worldId,'save-a') }),
        runB:()=>b.commitWorldDelta({ worldId, expectedRevision:1, worldDelta:delta(worldId,'save-b') }),
        verifyWinner:async({manifest,winnerIndex})=>{
          const winnerPath=manifest.worldDeltaPaths[manifest.worldDeltaPaths.length-1];
          check('parallel management saves: winner object survives loser cleanup',
            await base.exists(winnerPath), { winnerPath });
          let loaded=null, loadError=null;
          try { loaded=await init.loadWorldRecord(worldId); } catch(error) { loadError=error; }
          const expected=winnerIndex===0?'save-a':'save-b';
          check('parallel management saves: winner remains cold-loadable',
            !loadError && markerOf(loaded)===expected,
            { expected, actual:markerOf(loaded), loadError:loadError&&loadError.code });
        }
      });

      // Explicit conflict retry against the new authoritative revision.
      const retryService=race.loserIndex===0?a:b;
      const retry=await retryService.commitWorldDelta({
        worldId,
        expectedRevision:race.manifest.revision,
        worldDelta:delta(worldId,'retry-winner')
      });
      const retryLoaded=await init.loadWorldRecord(worldId);
      check('conflict retry succeeds from authoritative revision',
        Number(retry.revision)===3 && markerOf(retryLoaded)==='retry-winner',
        { revision:retry.revision, marker:markerOf(retryLoaded) });
    }

    // 2) Slot race: world delta + match + finance must all be attempt-local.
    {
      const worldId='race-slot';
      const init=factory();
      await createWorld(init,worldId);
      const a=factory(), b=factory();
      await assertTwoWayRace({
        name:'parallel slot saves',
        raceStore:racingStore, service:init, worldId, expectedStagedMinimum:6,
        runA:()=>a.commitSlot({
          worldId, worldDelta:delta(worldId,'slot-a'), season:1, slotKey:'slot-1',
          matches:[match('match-a')], financeEvents:[financeEvent('finance-a')], expectedRevision:1
        }),
        runB:()=>b.commitSlot({
          worldId, worldDelta:delta(worldId,'slot-b'), season:1, slotKey:'slot-1',
          matches:[match('match-b')], financeEvents:[financeEvent('finance-b')], expectedRevision:1
        }),
        verifyWinner:async({manifest,winnerIndex})=>{
          const expected=winnerIndex===0?'slot-a':'slot-b';
          const expectedMatch=winnerIndex===0?'match-a':'match-b';
          const refs=[
            manifest.worldDeltaPaths[manifest.worldDeltaPaths.length-1],
            manifest.matchSegments['slot-1'],
            manifest.financeSegments['slot-1']
          ];
          const refsExist=await Promise.all(refs.map(p=>base.exists(p)));
          check('parallel slot saves: all winning objects survive loser cleanup',refsExist.every(Boolean),{refs});
          const loaded=await init.loadWorldRecord(worldId);
          const detail=await init.loadMatchSegment(worldId,'slot-1');
          check('parallel slot saves: winner world and match segment remain readable',
            markerOf(loaded)===expected &&
              Array.isArray(detail.matches) && detail.matches.some(row=>row.id===expectedMatch),
            { marker:markerOf(loaded), expected, matches:detail.matches.map(row=>row.id) });
        }
      });
    }

    // 3) Full WorldRecord save race.
    {
      const worldId='race-world-record';
      const init=factory();
      await createWorld(init,worldId);
      const a=factory(), b=factory();
      await assertTwoWayRace({
        name:'parallel full snapshot saves',
        raceStore:racingStore, service:init, worldId,
        runA:()=>a.commitWorldRecord({ worldRecord:makeWorldRecord(worldId,'full-a'), expectedRevision:1 }),
        runB:()=>b.commitWorldRecord({ worldRecord:makeWorldRecord(worldId,'full-b'), expectedRevision:1 }),
        verifyWinner:async({manifest,winnerIndex})=>{
          check('parallel full snapshot saves: winner world object survives',await base.exists(manifest.worldRecordPath),{worldRecordPath:manifest.worldRecordPath});
          const loaded=await init.loadWorldRecord(worldId);
          check('parallel full snapshot saves: winner cold-loads',
            markerOf(loaded)===(winnerIndex===0?'full-a':'full-b'),{marker:markerOf(loaded)});
        }
      });
    }

    // 4) Runtime snapshot race.
    {
      const worldId='race-runtime';
      const init=factory();
      await createWorld(init,worldId);
      const a=factory(), b=factory();
      await assertTwoWayRace({
        name:'parallel runtime snapshot saves',
        raceStore:racingStore, service:init, worldId, expectedStagedMinimum:6,
        runA:()=>a.commitRuntimeSnapshot({
          worldRecord:makeWorldRecord(worldId,'runtime-a'), season:1,
          matches:[match('runtime-match-a')], financeEvents:[financeEvent('runtime-fin-a')], expectedRevision:1
        }),
        runB:()=>b.commitRuntimeSnapshot({
          worldRecord:makeWorldRecord(worldId,'runtime-b'), season:1,
          matches:[match('runtime-match-b')], financeEvents:[financeEvent('runtime-fin-b')], expectedRevision:1
        }),
        verifyWinner:async({manifest,winnerIndex})=>{
          const refs=[manifest.worldRecordPath,manifest.matchSegments.__runtime__,manifest.financeSegments.__runtime__];
          check('parallel runtime snapshot saves: all winner objects survive',
            (await Promise.all(refs.map(p=>base.exists(p)))).every(Boolean),{refs});
          const snap=await init.loadRuntimeSnapshot(worldId);
          check('parallel runtime snapshot saves: winner cold-loads',
            markerOf(snap.worldRecord)===(winnerIndex===0?'runtime-a':'runtime-b'),
            {marker:markerOf(snap.worldRecord)});
        }
      });
    }

    // 5) Season transition race.
    {
      const worldId='race-season-transition';
      const init=factory();
      await createWorld(init,worldId);
      const a=factory(), b=factory();
      await assertTwoWayRace({
        name:'parallel season transitions',
        raceStore:racingStore, service:init, worldId,
        runA:()=>a.commitSeasonTransition({ worldRecord:makeWorldRecord(worldId,'season-a',2), newSeason:2, expectedRevision:1 }),
        runB:()=>b.commitSeasonTransition({ worldRecord:makeWorldRecord(worldId,'season-b',2), newSeason:2, expectedRevision:1 }),
        verifyWinner:async({manifest,winnerIndex})=>{
          check('parallel season transitions: winner object survives',await base.exists(manifest.worldRecordPath),{worldRecordPath:manifest.worldRecordPath});
          const loaded=await init.loadWorldRecord(worldId);
          check('parallel season transitions: winner is authoritative',
            Number(manifest.currentSeason)===2 && markerOf(loaded)===(winnerIndex===0?'season-a':'season-b'),
            {season:manifest.currentSeason,marker:markerOf(loaded)});
        }
      });
    }

    // 6) Read-only integrity diagnostics: healthy world.
    {
      const worldId='integrity-healthy';
      const service=factory();
      await createWorld(service,worldId);
      await service.commitSlot({
        worldId, worldDelta:delta(worldId,'healthy'), season:1, slotKey:'slot-healthy',
        matches:[match('healthy-match','slot-healthy')],
        financeEvents:[financeEvent('healthy-fin')],
        expectedRevision:1
      });
      const before=await service.getManifest(worldId);
      const integrity=await service.inspectWorldIntegrity(worldId);
      const after=await service.getManifest(worldId);
      check('integrity: healthy world is fully reconstructable',
        integrity.healthy && integrity.worldRecordExists && integrity.worldRecordReconstructable &&
        integrity.missingWorldDeltaPaths.length===0 &&
        integrity.missingMatchSegments.length===0 &&
        integrity.missingFinanceSegments.length===0 &&
        integrity.missingMatchIndexReferences.length===0,
        {integrity});
      check('integrity: diagnosis is read-only',JSON.stringify(before)===JSON.stringify(after),{});
      check('integrity: recovery capability check is read-only and explicit',
        integrity.recoveryCapabilities &&
        integrity.recoveryCapabilities.status==='ok' &&
        integrity.recoveryCapabilities.driver==='local' &&
        integrity.recoveryCapabilities.objectVersioningEnabled===false &&
        integrity.recoveryCapabilities.softDeleteEnabled===false,
        {recoveryCapabilities:integrity.recoveryCapabilities});
    }

    // 7) Missing base snapshot.
    {
      const worldId='integrity-missing-base';
      const service=factory();
      await createWorld(service,worldId);
      const manifest=await service.getManifest(worldId);
      await base.delete(manifest.worldRecordPath);
      const integrity=await service.inspectWorldIntegrity(worldId);
      check('integrity: missing base snapshot is explicit',
        !integrity.healthy && !integrity.worldRecordExists && !integrity.worldRecordReconstructable,
        {integrity});
    }

    // 8) Missing world delta.
    {
      const worldId='integrity-missing-delta';
      const service=factory();
      await createWorld(service,worldId);
      const saved=await service.commitWorldDelta({worldId,expectedRevision:1,worldDelta:delta(worldId,'delta')});
      const missing=saved.worldDeltaPaths[saved.worldDeltaPaths.length-1];
      await base.delete(missing);
      const integrity=await service.inspectWorldIntegrity(worldId);
      check('integrity: missing world delta is explicit and ordered prefix is reported',
        !integrity.healthy && !integrity.worldRecordReconstructable &&
        integrity.missingWorldDeltaPaths.length===1 &&
        integrity.missingWorldDeltaPaths[0]===missing &&
        integrity.consistentWorldDeltaCount===0 &&
        integrity.firstMissingWorldDeltaIndex===0,
        {integrity});
    }

    // 9) Missing match segment and matchIndex reference.
    {
      const worldId='integrity-missing-match';
      const service=factory();
      await createWorld(service,worldId);
      const saved=await service.commitSlot({
        worldId, worldDelta:delta(worldId,'match'), season:1, slotKey:'slot-match',
        matches:[match('missing-match','slot-match')], financeEvents:[], expectedRevision:1
      });
      const missing=saved.matchSegments['slot-match'];
      await base.delete(missing);
      const integrity=await service.inspectWorldIntegrity(worldId);
      check('integrity: missing match segment and index reference are explicit',
        !integrity.healthy &&
        integrity.missingMatchSegments.some(row=>row.path===missing) &&
        integrity.missingMatchIndexReferences.some(row=>row.matchId==='missing-match'&&row.path===missing),
        {integrity});
    }

    // 10) Missing finance segment.
    {
      const worldId='integrity-missing-finance';
      const service=factory();
      await createWorld(service,worldId);
      const saved=await service.commitSlot({
        worldId, worldDelta:delta(worldId,'finance'), season:1, slotKey:'slot-finance',
        matches:[], financeEvents:[financeEvent('missing-fin')], expectedRevision:1
      });
      const missing=saved.financeSegments['slot-finance'];
      await base.delete(missing);
      const integrity=await service.inspectWorldIntegrity(worldId);
      check('integrity: missing finance segment is explicit',
        !integrity.healthy && integrity.missingFinanceSegments.some(row=>row.path===missing),
        {integrity});
    }

    // 11) Existing KF_0.31.3 deterministic object layout remains loadable without migration.
    {
      const worldId='legacy-0313-layout';
      const service=factory();
      const record=makeWorldRecord(worldId,'legacy');
      const worldPath=`worlds/${worldId}/revisions/00000001/world.json.gz`;
      const manifest={
        schemaVersion:MANIFEST_SCHEMA,
        storageSchema:STORAGE_SCHEMA,
        worldId,
        revision:1,
        committedAt:new Date(0).toISOString(),
        worldRecordPath:worldPath,
        currentSeason:1,
        matchSegments:{},
        financeSegments:{},
        matchIndex:{},
        worldDeltaPaths:[]
      };
      await base.write(worldPath,await encodeJsonGzip(record));
      await base.write(service.manifestKey(worldId),encodeJson(manifest),{ifGenerationMatch:0});
      const loaded=await service.loadWorldRecord(worldId);
      const saved=await service.commitWorldDelta({worldId,expectedRevision:1,worldDelta:delta(worldId,'post-upgrade')});
      const reloaded=await service.loadWorldRecord(worldId);
      check('legacy KF_0.31.3 layout loads without migration',
        markerOf(loaded)==='legacy' && Number(saved.revision)===2 && markerOf(reloaded)==='post-upgrade',
        {savedPath:saved.worldDeltaPaths[saved.worldDeltaPaths.length-1]});
      check('new save after legacy load uses isolated commit path',
        /\/commits\/[A-Fa-f0-9]{32}\/world-delta\.json\.gz$/.test(saved.worldDeltaPaths[saved.worldDeltaPaths.length-1]),
        {path:saved.worldDeltaPaths[saved.worldDeltaPaths.length-1]});
    }

    report.metrics={
      checks:report.checks.length,
      failedChecks:report.checks.filter(row=>!row.ok).length
    };
  } finally {
    await fs.rm(root,{ recursive:true, force:true });
  }

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{ console.error(error); process.exit(1); });
