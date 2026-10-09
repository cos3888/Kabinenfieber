'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

class FakeElement {
  constructor() {
    this.innerHTML = '';
    this.style = {};
    this.dataset = {};
    this.value = '';
    this.classList = { add(){}, remove(){}, contains(){ return false; } };
  }
  addEventListener() {}
  removeEventListener() {}
  setAttribute(key, value) { this[key] = value; }
  getAttribute(key) { return this[key] || null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  getBoundingClientRect() { return { width:1760, height:990 }; }
}

function seedFrom(value) {
  const text = String(value || 'kabinenfieber');
  let hash = 2166136261 >>> 0;
  for (let i=0; i<text.length; i+=1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1;
}

function createContext(seedValue) {
  let seed = seedFrom(seedValue);
  const seededMath = Object.create(Math);
  seededMath.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const elements = {
    'app-root':new FakeElement(),
    'modal-root':new FakeElement(),
    'app-shell':new FakeElement()
  };
  const document = {
    readyState:'loading',
    documentElement:{ clientWidth:1760, clientHeight:990, style:{ setProperty(){} } },
    body:new FakeElement(),
    getElementById:id => elements[id] || null,
    addEventListener(){},
    removeEventListener(){},
    createElement(){ return new FakeElement(); },
    querySelector(){ return null; },
    querySelectorAll(){ return []; }
  };
  const window = {
    innerWidth:1760,
    innerHeight:990,
    addEventListener(){},
    removeEventListener(){},
    requestAnimationFrame:callback => callback(),
    cancelAnimationFrame(){},
    console,
    setTimeout,
    clearTimeout,
    document,
    Element:FakeElement,
    navigator:{ userAgent:'kabinenfieber-server-progression' },
    performance:{ now:() => Date.now() },
    localStorage:{ getItem(){ return null; }, setItem(){} }
  };
  return vm.createContext({
    window,
    document,
    console,
    setTimeout,
    clearTimeout,
    Element:FakeElement,
    navigator:window.navigator,
    performance:window.performance,
    Math:seededMath,
    Map,
    WeakMap,
    Set
  });
}

class HeadlessProgressionEngine {
  constructor({ sourceRoot = path.resolve(process.cwd(), 'src') } = {}) {
    this.sourceRoot = sourceRoot;
    const staticData = fs.readFileSync(path.join(sourceRoot, 'static-data.js'), 'utf8');
    const dbData = fs.readFileSync(path.join(sourceRoot, 'db1-db2-data.js'), 'utf8');
    let app = fs.readFileSync(path.join(sourceRoot, 'app.bundle.js'), 'utf8');
    const anchor = "\n\n  if (document.readyState === 'loading') {";
    if (!app.includes(anchor)) throw new Error('Kabinenfieber progression engine export anchor not found');
    const exportHook = `
  window.KFServerProgressionEngine = {
    run:function(payload){
      resetState();
      var record = payload.worldRecord;
      registerWorldRecord(record);
      setWorldRecord(record);
      setSession({
        id:'server-progression',
        localUserProfileId:null,
        activeTrainerId:null,
        activeWorldId:record.id,
        activeClubId:null
      });
      kf029RestoreCurrentDetails(record.gameState, payload.matches || [], payload.financeEvents || []);
      var result = advanceCareerRound(record.gameState);
      return {
        worldRecord:record,
        matches:kf029CurrentMatches(),
        financeEvents:kf029CurrentFinanceEvents(),
        advanceResult:result
      };
    }
  };
`;
    app = app.replace(anchor, '\n' + exportHook + anchor);
    this.scripts = [
      new vm.Script(staticData, { filename:'src/static-data.js' }),
      new vm.Script(dbData, { filename:'src/db1-db2-data.js' }),
      new vm.Script(app, { filename:'src/app.bundle.js' })
    ];
  }

  run(payload) {
    if (!payload || !payload.worldRecord || !payload.worldRecord.gameState) {
      throw new Error('Headless progression requires a complete WorldRecord');
    }
    const context = createContext(payload.progressionRunId);
    this.scripts.forEach(script => script.runInContext(context));
    const engine = context.window && context.window.KFServerProgressionEngine;
    if (!engine || typeof engine.run !== 'function') throw new Error('Headless progression engine was not initialized');
    const result = engine.run({
      worldRecord:payload.worldRecord,
      matches:payload.matches || [],
      financeEvents:payload.financeEvents || [],
      progressionRunId:String(payload.progressionRunId || '')
    });
    if (!result || !result.worldRecord || !result.advanceResult) {
      throw new Error('Headless progression returned an incomplete result');
    }
    return result;
  }
}

module.exports = { HeadlessProgressionEngine };
