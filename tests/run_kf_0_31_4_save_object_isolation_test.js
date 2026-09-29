'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { LocalObjectStore } = require('../server/persistence/local-object-store');
const { WorldPersistenceService } = require('../server/persistence/world-persistence-service');
const { WORLD_DELTA_SCHEMA } = require('../server/domain/world-delta');

const report = { suite:'KF_0.31.4 save object isolation pre-fix race regression', passed:true, checks:[] };
function check(name, ok, details={}) {
  report.checks.push({ name, ok:!!ok, ...details });
  if (!ok) report.passed=false;
}

function makeWorldRecord(worldId) {
  return {
    id:worldId,
    createdByUserId:'u1',
    createdAt:new Date(0).toISOString(),
    memberships:{ byTrainerId:{} },
    gameState:{
      meta:{ id:worldId, seasonNumber:1, version:'0.31.3' },
      squads:{ 'club-a':{ tactics:{ raceOwner:'base' } } },
      calendar:{ currentSlotKey:'w0', fixtures:[], slots:[] },
      history:{ matches:[] },
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

class DeterministicManifestRaceStore {
  constructor(base) {
    this.base=base;
    this.manifestKey=null;
    this.enabled=false;
    this.manifestArrivals=0;
    this.stagedWrites=[];
    this._secondArrived=null;
    this._firstDone=null;
    this.secondArrived=new Promise(resolve => { this._secondArrived=resolve; });
    this.firstDone=new Promise(resolve => { this._firstDone=resolve; });
  }
  arm(manifestKey) { this.manifestKey=manifestKey; this.enabled=true; }
  async read(key){ return this.base.read(key); }
  async readBody(key){ return this.base.readBody(key); }
  async exists(key){ return this.base.exists(key); }
  async delete(key){ return this.base.delete(key); }
  async deletePrefix(prefix){ return this.base.deletePrefix(prefix); }
  async write(key, body, options={}) {
    if (this.enabled && key !== this.manifestKey) this.stagedWrites.push(key);
    const isRacedManifest =
      this.enabled &&
      key === this.manifestKey &&
      options &&
      options.ifGenerationMatch !== undefined &&
      String(options.ifGenerationMatch) !== '0';

    if (!isRacedManifest) return this.base.write(key, body, options);

    const ticket=++this.manifestArrivals;
    if (ticket === 1) {
      await this.secondArrived;
      try {
        return await this.base.write(key, body, options);
      } finally {
        this._firstDone();
      }
    }
    if (ticket === 2) {
      this._secondArrived();
      await this.firstDone;
      return this.base.write(key, body, options);
    }
    return this.base.write(key, body, options);
  }
}

(async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'kf0314-race-'));
  try {
    const base=new LocalObjectStore({ rootDir:path.join(root,'objects') });
    const racingStore=new DeterministicManifestRaceStore(base);
    const initializer=new WorldPersistenceService({ objectStore:racingStore, deltaCompactionThreshold:100000 });
    const worldId='world-race-object-isolation';
    const initial=await initializer.initializeWorld({ worldRecord:makeWorldRecord(worldId) });
    racingStore.arm(initializer.manifestKey(worldId));

    // Two independent persistence instances emulate two Cloud Run processes.
    const saveA=new WorldPersistenceService({ objectStore:racingStore, deltaCompactionThreshold:100000 });
    const saveB=new WorldPersistenceService({ objectStore:racingStore, deltaCompactionThreshold:100000 });

    const results=await Promise.allSettled([
      saveA.commitWorldDelta({ worldId, expectedRevision:initial.revision, worldDelta:delta(worldId,'save-a') }),
      saveB.commitWorldDelta({ worldId, expectedRevision:initial.revision, worldDelta:delta(worldId,'save-b') })
    ]);

    const fulfilledIndexes=results.map((row,index)=>row.status==='fulfilled'?index:-1).filter(index=>index>=0);
    const rejected=results.filter(row=>row.status==='rejected');
    check('Exactly one concurrent manifest CAS wins', fulfilledIndexes.length===1 && rejected.length===1, {
      statuses:results.map(row=>row.status),
      rejectedCodes:rejected.map(row=>row.reason&&row.reason.code)
    });

    const candidateWrites=racingStore.stagedWrites.filter(key =>
      key.includes('/revisions/00000002/') && key.endsWith('.json.gz')
    );
    check('Concurrent saves use isolated staged object paths', new Set(candidateWrites).size===2, {
      stagedPaths:candidateWrites
    });

    const manifest=await initializer.getManifest(worldId);
    const winnerPath=manifest && Array.isArray(manifest.worldDeltaPaths)
      ? manifest.worldDeltaPaths[manifest.worldDeltaPaths.length-1]
      : null;
    const winnerExists=winnerPath ? await base.exists(winnerPath) : false;
    check('Losing save cleanup cannot remove the winner object', !!winnerPath && winnerExists, { winnerPath });

    let reloaded=null, loadError=null;
    try { reloaded=await initializer.loadWorldRecord(worldId); } catch (error) { loadError=error; }
    const expectedWinner=fulfilledIndexes[0]===0?'save-a':'save-b';
    check('Winner remains cold-loadable after loser cleanup',
      !loadError && reloaded && reloaded.gameState.squads['club-a'].tactics.raceOwner===expectedWinner,
      { expectedWinner, actual:reloaded&&reloaded.gameState&&reloaded.gameState.squads['club-a'].tactics.raceOwner, loadError:loadError&&loadError.code }
    );
    check('Authoritative revision advances exactly once', manifest && Number(manifest.revision)===2, { revision:manifest&&manifest.revision });
  } finally {
    await fs.rm(root,{ recursive:true, force:true });
  }

  console.log(JSON.stringify(report,null,2));
  process.exit(report.passed?0:1);
})().catch(error=>{ console.error(error); process.exit(1); });
