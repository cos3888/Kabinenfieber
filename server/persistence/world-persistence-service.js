'use strict';

const crypto = require('crypto');
const { encodeJsonGzip, decodeJsonGzip, encodeJson, decodeJson } = require('./json-codec');
const { PersistenceConflictError, PersistenceNotFoundError } = require('./errors');
const { validateWorldDelta, applyWorldDelta } = require('../domain/world-delta');

const MANIFEST_SCHEMA = 'kf-persistence-manifest-1';
const STORAGE_SCHEMA = 'kf-storage-0.31.0';
const DEFAULT_READ_CONCURRENCY = 8;
const DEFAULT_DELTA_COMPACTION_THRESHOLD = 64;

function safeKey(value, name) {
  const text = String(value == null ? '' : value);
  if (!text || !/^[A-Za-z0-9._:-]+$/.test(text)) throw new Error(`Invalid ${name}`);
  return text;
}

class WorldPersistenceService {
  constructor({ objectStore, readConcurrency = DEFAULT_READ_CONCURRENCY, deltaCompactionThreshold = DEFAULT_DELTA_COMPACTION_THRESHOLD }) {
    if (!objectStore) throw new Error('WorldPersistenceService requires objectStore');
    this.store = objectStore;
    this.readConcurrency = Math.max(1, Math.floor(Number(readConcurrency) || DEFAULT_READ_CONCURRENCY));
    this.deltaCompactionThreshold = Math.max(1, Math.floor(Number(deltaCompactionThreshold) || DEFAULT_DELTA_COMPACTION_THRESHOLD));
  }

  manifestKey(worldId) { return `worlds/${safeKey(worldId, 'worldId')}/manifest.json`; }
  revisionPrefix(worldId, revision) { return `worlds/${safeKey(worldId, 'worldId')}/revisions/${String(revision).padStart(8, '0')}`; }
  seasonPrefix(worldId, season) { return `worlds/${safeKey(worldId, 'worldId')}/current-season/${Number(season)}`; }
  createCommitId() { return crypto.randomUUID().replace(/-/g, ''); }
  commitPrefix(worldId, revision, commitId) {
    return `${this.revisionPrefix(worldId, revision)}/commits/${safeKey(commitId, 'commitId')}`;
  }
  seasonCommitPrefix(worldId, season, revision, commitId) {
    return `${this.seasonPrefix(worldId, season)}/revisions/${String(revision).padStart(8, '0')}/commits/${safeKey(commitId, 'commitId')}`;
  }

  async _readBody(key) {
    if (this.store && typeof this.store.readBody === 'function') return this.store.readBody(key);
    return (await this.store.read(key)).body;
  }

  async _mapWithConcurrency(items, mapper, concurrency = this.readConcurrency) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return [];
    const results = new Array(list.length);
    let cursor = 0;
    const workerCount = Math.min(Math.max(1, Math.floor(Number(concurrency) || 1)), list.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= list.length) return;
        results[index] = await mapper(list[index], index);
      }
    });
    await Promise.all(workers);
    return results;
  }

  async _loadJsonGzipObjects(paths) {
    return this._mapWithConcurrency(paths, async path => decodeJsonGzip(await this._readBody(path)));
  }

  async _deleteObjectsBestEffort(paths) {
    const unique = Array.from(new Set((paths || []).filter(Boolean)));
    await this._mapWithConcurrency(unique, async path => {
      try { await this.store.delete(path); } catch (_) {}
      return true;
    });
  }

  shouldCompactManifest(manifest) {
    const deltaPaths = Array.isArray(manifest && manifest.worldDeltaPaths) ? manifest.worldDeltaPaths.filter(Boolean) : [];
    return deltaPaths.length >= this.deltaCompactionThreshold;
  }

  async _readManifestEnvelope(worldId) {
    const key = this.manifestKey(worldId);
    try {
      const object = await this.store.read(key);
      return { manifest: decodeJson(object.body), generation: object.generation };
    } catch (error) {
      if (error && error.code === 'PERSISTENCE_NOT_FOUND') return null;
      throw error;
    }
  }

  async getManifest(worldId) {
    const envelope = await this._readManifestEnvelope(worldId);
    return envelope ? envelope.manifest : null;
  }

  async initializeWorld({ worldRecord }) {
    const worldId = safeKey(worldRecord && worldRecord.id, 'worldId');
    const existing = await this._readManifestEnvelope(worldId);
    if (existing) throw new PersistenceConflictError('World is already initialized', { worldId: worldId });
    const revision = 1, commitId = this.createCommitId();
    const worldPath = `${this.commitPrefix(worldId, revision, commitId)}/world.json.gz`;
    await this.store.write(worldPath, await encodeJsonGzip(worldRecord), { ifGenerationMatch: 0, contentType: 'application/gzip' });
    const manifest = {
      schemaVersion: MANIFEST_SCHEMA,
      storageSchema: STORAGE_SCHEMA,
      worldId,
      revision,
      committedAt: new Date().toISOString(),
      worldRecordPath: worldPath,
      currentSeason: Number(worldRecord.gameState && worldRecord.gameState.meta && worldRecord.gameState.meta.seasonNumber || 1),
      matchSegments: {},
      financeSegments: {},
      matchIndex: {},
      worldDeltaPaths: []
    };
    try {
      await this.store.write(this.manifestKey(worldId), encodeJson(manifest), { ifGenerationMatch: 0, contentType: 'application/json' });
    } catch (error) {
      await this.store.delete(worldPath).catch(() => {});
      throw error;
    }
    return manifest;
  }

  async loadWorldRecordFromManifest(manifest) {
    if (!manifest) throw new PersistenceNotFoundError('World manifest not found');
    const worldRecord = await decodeJsonGzip(await this._readBody(manifest.worldRecordPath));
    const deltaPaths = Array.isArray(manifest.worldDeltaPaths) ? manifest.worldDeltaPaths.filter(Boolean) : [];

    // World deltas are authoritative in manifest order. Load, decode and apply
    // one delta at a time so reconstructed deltas do not accumulate in memory.
    for (const deltaPath of deltaPaths) {
      const delta = await decodeJsonGzip(await this._readBody(deltaPath));
      applyWorldDelta(worldRecord, delta);
    }
    return worldRecord;
  }

  async loadWorldRecord(worldId) {
    const manifest = await this.getManifest(worldId);
    if (!manifest) throw new PersistenceNotFoundError('World manifest not found', { worldId: worldId });
    return this.loadWorldRecordFromManifest(manifest);
  }

  async loadMatchSegment(worldId, slotKey) {
    const manifest = await this.getManifest(worldId);
    if (!manifest) throw new PersistenceNotFoundError('World manifest not found', { worldId: worldId });
    const path = manifest.matchSegments[String(slotKey)];
    if (!path) return null;
    return decodeJsonGzip(await this._readBody(path));
  }

  async loadFinanceSegment(worldId, slotKey) {
    const manifest = await this.getManifest(worldId);
    if (!manifest) throw new PersistenceNotFoundError('World manifest not found', { worldId: worldId });
    const path = manifest.financeSegments[String(slotKey)];
    if (!path) return null;
    return decodeJsonGzip(await this._readBody(path));
  }


  async _loadSegments(paths) {
    return this._loadJsonGzipObjects(paths);
  }

  async loadCurrentSeasonDetailsFromManifest(manifest, { includeMatches = true, includeFinance = true } = {}) {
    if (!manifest) throw new PersistenceNotFoundError('World manifest not found');
    const matchPaths = includeMatches ? Array.from(new Set(Object.values(manifest.matchSegments || {}).filter(Boolean))) : [];
    const financePaths = includeFinance ? Array.from(new Set(Object.values(manifest.financeSegments || {}).filter(Boolean))) : [];
    const matchSegments = await this._loadSegments(matchPaths);
    const financeSegments = await this._loadSegments(financePaths);
    return {
      season: Number(manifest.currentSeason || 1),
      matches: matchSegments.flatMap(segment => Array.isArray(segment && segment.matches) ? segment.matches : []),
      financeEvents: financeSegments.flatMap(segment => Array.isArray(segment && segment.events) ? segment.events : [])
    };
  }

  async loadMatchDetail(worldId, matchId) {
    const manifest = await this.getManifest(worldId);
    if (!manifest) throw new PersistenceNotFoundError('World manifest not found', { worldId });
    const indexedPath = (manifest.matchIndex || {})[String(matchId)] || null;
    const paths = indexedPath
      ? [indexedPath]
      : Array.from(new Set(Object.values(manifest.matchSegments || {}).filter(Boolean)));
    for (const path of paths) {
      const segment = await decodeJsonGzip(await this._readBody(path));
      const match = (Array.isArray(segment && segment.matches) ? segment.matches : [])
        .find(row => row && String(row.id) === String(matchId));
      if (match) return match;
    }
    return null;
  }

  async loadCurrentSeasonDetails(worldId) {
    const manifest = await this.getManifest(worldId);
    if (!manifest) throw new PersistenceNotFoundError('World manifest not found', { worldId: worldId });
    return this.loadCurrentSeasonDetailsFromManifest(manifest);
  }

  async inspectWorldIntegrity(worldId) {
    const resolvedWorldId = safeKey(worldId, 'worldId');
    const envelope = await this._readManifestEnvelope(resolvedWorldId);
    if (!envelope) throw new PersistenceNotFoundError('World manifest not found', { worldId: resolvedWorldId });
    const manifest = envelope.manifest;

    const worldDeltaPaths = Array.isArray(manifest.worldDeltaPaths) ? manifest.worldDeltaPaths.filter(Boolean) : [];
    const matchEntries = Object.entries(manifest.matchSegments || {}).filter(([, value]) => Boolean(value));
    const financeEntries = Object.entries(manifest.financeSegments || {}).filter(([, value]) => Boolean(value));
    const matchIndexEntries = Object.entries(manifest.matchIndex || {}).filter(([, value]) => Boolean(value));

    const uniquePaths = Array.from(new Set([
      manifest.worldRecordPath,
      ...worldDeltaPaths,
      ...matchEntries.map(([, value]) => value),
      ...financeEntries.map(([, value]) => value),
      ...matchIndexEntries.map(([, value]) => value)
    ].filter(Boolean)));

    const existencePairs = await this._mapWithConcurrency(uniquePaths, async objectPath => [
      objectPath,
      await this.store.exists(objectPath)
    ]);
    const existsByPath = Object.fromEntries(existencePairs);

    const worldRecordExists = Boolean(manifest.worldRecordPath && existsByPath[manifest.worldRecordPath]);
    const missingWorldDeltaPaths = worldDeltaPaths.filter(objectPath => !existsByPath[objectPath]);
    const missingMatchSegments = matchEntries
      .filter(([, objectPath]) => !existsByPath[objectPath])
      .map(([slotKey, objectPath]) => ({ slotKey, path: objectPath }));
    const missingFinanceSegments = financeEntries
      .filter(([, objectPath]) => !existsByPath[objectPath])
      .map(([slotKey, objectPath]) => ({ slotKey, path: objectPath }));
    const missingMatchIndexReferences = matchIndexEntries
      .filter(([, objectPath]) => !existsByPath[objectPath])
      .map(([matchId, objectPath]) => ({ matchId, path: objectPath }));

    let consistentWorldDeltaCount = 0;
    for (const objectPath of worldDeltaPaths) {
      if (!existsByPath[objectPath]) break;
      consistentWorldDeltaCount += 1;
    }

    let worldRecordReconstructable = worldRecordExists && missingWorldDeltaPaths.length === 0;
    let reconstructionError = null;
    if (worldRecordReconstructable) {
      try {
        await this.loadWorldRecordFromManifest(manifest);
      } catch (error) {
        worldRecordReconstructable = false;
        reconstructionError = String(error && (error.code || error.message) || 'reconstruction_failed');
      }
    }

    let recoveryCapabilities = {
      status: 'unsupported',
      driver: 'unknown',
      objectVersioningEnabled: null,
      softDeleteEnabled: null,
      softDeleteRetentionSeconds: null,
      softDeleteEffectiveTime: null,
      error: null
    };
    if (this.store && typeof this.store.getRecoveryCapabilities === 'function') {
      try {
        recoveryCapabilities = {
          status: 'ok',
          ...(await this.store.getRecoveryCapabilities()),
          error: null
        };
      } catch (error) {
        recoveryCapabilities = {
          ...recoveryCapabilities,
          status: 'unknown',
          error: String(error && (error.code || error.message) || 'recovery_capability_check_failed')
        };
      }
    }

    const referencedPathCount = uniquePaths.length;
    const existingReferencedPathCount = uniquePaths.filter(objectPath => existsByPath[objectPath]).length;
    const healthy =
      worldRecordReconstructable &&
      missingMatchSegments.length === 0 &&
      missingFinanceSegments.length === 0 &&
      missingMatchIndexReferences.length === 0;

    return {
      worldId: resolvedWorldId,
      revision: Number(manifest.revision),
      manifestGeneration: envelope.generation,
      healthy,
      worldRecordPath: manifest.worldRecordPath || null,
      worldRecordExists,
      worldRecordReconstructable,
      reconstructionError,
      worldDeltaCount: worldDeltaPaths.length,
      consistentWorldDeltaCount,
      firstMissingWorldDeltaIndex: missingWorldDeltaPaths.length
        ? worldDeltaPaths.findIndex(objectPath => !existsByPath[objectPath])
        : null,
      missingWorldDeltaPaths,
      missingMatchSegments,
      missingFinanceSegments,
      missingMatchIndexReferences,
      referencedPathCount,
      existingReferencedPathCount,
      recoveryCapabilities
    };
  }

  async loadRuntimeSnapshot(worldId, manifest = null) {
    const committedManifest = manifest || await this.getManifest(worldId);
    if (!committedManifest) throw new PersistenceNotFoundError('World manifest not found', { worldId: worldId });
    const [worldRecord, details] = await Promise.all([
      this.loadWorldRecordFromManifest(committedManifest),
      this.loadCurrentSeasonDetailsFromManifest(committedManifest, { includeMatches: false, includeFinance: true })
    ]);
    return {
      manifest: committedManifest,
      worldRecord,
      currentSeason: Number(committedManifest.currentSeason || details.season || 1),
      matches: details.matches || [],
      financeEvents: details.financeEvents || []
    };
  }

  async commitRuntimeSnapshot({ worldRecord, season, matches = [], financeEvents = [], expectedRevision, progressionRunId = null, roundGeneration = null, progressionLeaseId = null }) {
    const worldId = safeKey(worldRecord && worldRecord.id, 'worldId');
    const envelope = await this._readManifestEnvelope(worldId);
    if (!envelope) throw new PersistenceNotFoundError('World manifest not found', { worldId: worldId });
    const current = envelope.manifest;
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(current.revision)) {
      throw new PersistenceConflictError('World revision mismatch', { worldId: worldId, expectedRevision, actualRevision: current.revision });
    }
    season = Number(season || (worldRecord.gameState && worldRecord.gameState.meta && worldRecord.gameState.meta.seasonNumber) || current.currentSeason || 1);
    if (!Number.isFinite(season) || season < 1) throw new Error('Invalid current season');

    const revision = Number(current.revision) + 1;
    const commitId = this.createCommitId();
    const revisionPrefix = this.commitPrefix(worldId, revision, commitId);
    const detailPrefix = `${this.seasonCommitPrefix(worldId, season, revision, commitId)}/runtime`;
    const worldPath = `${revisionPrefix}/world.json.gz`;
    const matchPath = `${detailPrefix}/matches.json.gz`;
    const financePath = `${detailPrefix}/finances.json.gz`;
    const staged = [worldPath, matchPath, financePath];

    try {
      const worldBody = await encodeJsonGzip(worldRecord);
      const matchBody = await encodeJsonGzip({ season, kind: 'runtime-snapshot', matches });
      const financeBody = await encodeJsonGzip({ season, kind: 'runtime-snapshot', events: financeEvents });
      await Promise.all([
        this.store.write(worldPath, worldBody, { ifGenerationMatch: 0, contentType: 'application/gzip' }),
        this.store.write(matchPath, matchBody, { ifGenerationMatch: 0, contentType: 'application/gzip' }),
        this.store.write(financePath, financeBody, { ifGenerationMatch: 0, contentType: 'application/gzip' })
      ]);
      const next = {
        ...current,
        revision,
        committedAt: new Date().toISOString(),
        worldRecordPath: worldPath,
        currentSeason: season,
        matchSegments: { __runtime__: matchPath },
        financeSegments: { __runtime__: financePath },
        matchIndex: Object.fromEntries((matches || []).filter(row => row && row.id).map(row => [String(row.id), matchPath])),
        worldDeltaPaths: [],
        lastProgressionCommit: progressionRunId ? {
          progressionRunId:String(progressionRunId),
          roundGeneration:Number(roundGeneration || 0),
          leaseId:progressionLeaseId ? String(progressionLeaseId) : null,
          fromRevision:Number(current.revision),
          toRevision:revision,
          slotKey:null,
          committedAt:new Date().toISOString()
        } : (current.lastProgressionCommit || null)
      };
      await this.store.write(this.manifestKey(worldId), encodeJson(next), {
        ifGenerationMatch: envelope.generation,
        contentType: 'application/json'
      });

      if (current.worldRecordPath && current.worldRecordPath !== worldPath) {
        await this.store.delete(current.worldRecordPath).catch(() => {});
      }
      const previousPaths = [
        ...Object.values(current.matchSegments || {}),
        ...Object.values(current.financeSegments || {}),
        ...(Array.isArray(current.worldDeltaPaths) ? current.worldDeltaPaths : [])
      ].filter(Boolean);
      await this._deleteObjectsBestEffort(previousPaths.filter(oldPath => oldPath !== matchPath && oldPath !== financePath));
      const previousSeason = Number(current.currentSeason);
      if (Number.isFinite(previousSeason) && previousSeason !== season) {
        await this.store.deletePrefix(this.seasonPrefix(worldId, previousSeason)).catch(() => {});
      }
      return next;
    } catch (error) {
      await this._deleteObjectsBestEffort(staged);
      throw error;
    }
  }

  async deleteWorld(worldId) {
    const id = safeKey(worldId, 'worldId');
    await this.store.deletePrefix(`worlds/${id}/`);
    return true;
  }

  async commitWorldRecord({ worldRecord, expectedRevision }) {
    const worldId = safeKey(worldRecord && worldRecord.id, 'worldId');
    const envelope = await this._readManifestEnvelope(worldId);
    if (!envelope) throw new PersistenceNotFoundError('World manifest not found', { worldId: worldId });
    const current = envelope.manifest;
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(current.revision)) {
      throw new PersistenceConflictError('World revision mismatch', { worldId: worldId, expectedRevision, actualRevision: current.revision });
    }
    const revision = Number(current.revision) + 1;
    const commitId = this.createCommitId();
    const worldPath = `${this.commitPrefix(worldId, revision, commitId)}/world.json.gz`;
    await this.store.write(worldPath, await encodeJsonGzip(worldRecord), { ifGenerationMatch: 0, contentType: 'application/gzip' });
    const next = { ...current, revision, committedAt: new Date().toISOString(), worldRecordPath: worldPath, worldDeltaPaths: [] };
    try {
      await this.store.write(this.manifestKey(worldId), encodeJson(next), {
        ifGenerationMatch: envelope.generation,
        contentType: 'application/json'
      });
    } catch (error) {
      await this.store.delete(worldPath).catch(() => {});
      throw error;
    }
    if (current.worldRecordPath && current.worldRecordPath !== worldPath) {
      await this.store.delete(current.worldRecordPath).catch(() => {});
    }
    for (const path of (Array.isArray(current.worldDeltaPaths) ? current.worldDeltaPaths : [])) {
      await this.store.delete(path).catch(() => {});
    }
    return next;
  }

  async compactWorld({ worldId = null, expectedRevision, worldRecord = null, force = false } = {}) {
    const resolvedWorldId = safeKey(worldId || (worldRecord && worldRecord.id), 'worldId');
    const envelope = await this._readManifestEnvelope(resolvedWorldId);
    if (!envelope) throw new PersistenceNotFoundError('World manifest not found', { worldId: resolvedWorldId });
    const current = envelope.manifest;
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(current.revision)) {
      throw new PersistenceConflictError('World revision mismatch', { worldId: resolvedWorldId, expectedRevision, actualRevision: current.revision });
    }

    const deltaPaths = Array.isArray(current.worldDeltaPaths) ? current.worldDeltaPaths.filter(Boolean) : [];
    if (!deltaPaths.length || (!force && !this.shouldCompactManifest(current))) {
      return { manifest: current, compacted: false, deltaCount: deltaPaths.length };
    }

    const authoritative = worldRecord || await this.loadWorldRecordFromManifest(current);
    if (!authoritative || String(authoritative.id || '') !== resolvedWorldId) {
      throw new Error('Compaction WorldRecord does not match worldId');
    }

    const compactedPath = `${this.revisionPrefix(resolvedWorldId, Number(current.revision))}/world-compacted-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.json.gz`;
    await this.store.write(compactedPath, await encodeJsonGzip(authoritative), { ifGenerationMatch: 0, contentType: 'application/gzip' });
    const next = {
      ...current,
      worldRecordPath: compactedPath,
      worldDeltaPaths: []
    };

    try {
      await this.store.write(this.manifestKey(resolvedWorldId), encodeJson(next), {
        ifGenerationMatch: envelope.generation,
        contentType: 'application/json'
      });
    } catch (error) {
      await this.store.delete(compactedPath).catch(() => {});
      throw error;
    }

    await this._deleteObjectsBestEffort([
      current.worldRecordPath,
      ...deltaPaths
    ].filter(path => path && path !== compactedPath));

    return { manifest: next, compacted: true, deltaCount: deltaPaths.length };
  }

  async commitWorldDelta({ worldId = null, worldDelta, expectedRevision }) {
    const resolvedWorldId = safeKey(worldId || (worldDelta && worldDelta.worldId), 'worldId');
    const envelope = await this._readManifestEnvelope(resolvedWorldId);
    if (!envelope) throw new PersistenceNotFoundError('World manifest not found', { worldId: resolvedWorldId });
    const current = envelope.manifest;
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(current.revision)) {
      throw new PersistenceConflictError('World revision mismatch', { worldId: resolvedWorldId, expectedRevision, actualRevision: current.revision });
    }

    validateWorldDelta(worldDelta, resolvedWorldId);
    const revision = Number(current.revision) + 1;
    const commitId = this.createCommitId();
    const deltaPath = `${this.commitPrefix(resolvedWorldId, revision, commitId)}/world-delta.json.gz`;

    try {
      await this.store.write(deltaPath, await encodeJsonGzip(worldDelta), { ifGenerationMatch: 0, contentType: 'application/gzip' });
      const next = {
        ...current,
        revision,
        committedAt: new Date().toISOString(),
        worldDeltaPaths: [...(Array.isArray(current.worldDeltaPaths) ? current.worldDeltaPaths : []), deltaPath]
      };
      await this.store.write(this.manifestKey(resolvedWorldId), encodeJson(next), {
        ifGenerationMatch: envelope.generation,
        contentType: 'application/json'
      });
      return next;
    } catch (error) {
      await this.store.delete(deltaPath).catch(() => {});
      throw error;
    }
  }

  async commitSlot({ worldId = null, worldRecord = null, worldDelta = null, season, slotKey, matches = [], financeEvents = [], expectedRevision, progressionRunId = null, roundGeneration = null, progressionLeaseId = null }) {
    const resolvedWorldId = safeKey(worldId || (worldRecord && worldRecord.id) || (worldDelta && worldDelta.worldId), 'worldId');
    slotKey = safeKey(slotKey, 'slotKey');
    const envelope = await this._readManifestEnvelope(resolvedWorldId);
    if (!envelope) throw new PersistenceNotFoundError('World manifest not found', { worldId: resolvedWorldId });
    const current = envelope.manifest;
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(current.revision)) {
      throw new PersistenceConflictError('World revision mismatch', { worldId: resolvedWorldId, expectedRevision, actualRevision: current.revision });
    }
    if (Number(season) !== Number(current.currentSeason)) {
      throw new PersistenceConflictError('Slot season does not match current persisted season', { worldId: resolvedWorldId, season, currentSeason: current.currentSeason });
    }

    const revision = Number(current.revision) + 1;
    const commitId = this.createCommitId();
    const revisionPrefix = this.commitPrefix(resolvedWorldId, revision, commitId);
    const segmentPrefix = this.seasonCommitPrefix(resolvedWorldId, season, revision, commitId);
    const worldPath = worldRecord ? `${revisionPrefix}/world.json.gz` : null;
    const deltaPath = worldDelta ? `${revisionPrefix}/world-delta.json.gz` : null;
    const matchPath = `${segmentPrefix}/matches/${slotKey}.json.gz`;
    const financePath = `${segmentPrefix}/finances/${slotKey}.json.gz`;
    const staged = [worldPath, deltaPath, matchPath, financePath].filter(Boolean);

    try {
      let worldBody;
      if (worldDelta) {
        validateWorldDelta(worldDelta, resolvedWorldId);
        worldBody = await encodeJsonGzip(worldDelta);
      } else if (worldRecord) {
        worldBody = await encodeJsonGzip(worldRecord);
      } else {
        throw new Error('Slot commit requires worldDelta or worldRecord');
      }
      const matchBody = await encodeJsonGzip({ season: Number(season), slotKey, matches });
      const financeBody = await encodeJsonGzip({ season: Number(season), slotKey, events: financeEvents });
      await Promise.all([
        this.store.write(worldDelta ? deltaPath : worldPath, worldBody, { ifGenerationMatch: 0, contentType: 'application/gzip' }),
        this.store.write(matchPath, matchBody, { ifGenerationMatch: 0, contentType: 'application/gzip' }),
        this.store.write(financePath, financeBody, { ifGenerationMatch: 0, contentType: 'application/gzip' })
      ]);
      const next = {
        ...current,
        revision,
        committedAt: new Date().toISOString(),
        worldRecordPath: worldPath || current.worldRecordPath,
        currentSeason: Number(season),
        matchSegments: { ...(current.matchSegments || {}), [slotKey]: matchPath },
        financeSegments: { ...(current.financeSegments || {}), [slotKey]: financePath },
        matchIndex: {
          ...(current.matchIndex || {}),
          ...Object.fromEntries((matches || []).filter(row => row && row.id).map(row => [String(row.id), matchPath]))
        },
        worldDeltaPaths: worldDelta
          ? [...(Array.isArray(current.worldDeltaPaths) ? current.worldDeltaPaths : []), deltaPath]
          : [],
        lastProgressionCommit: progressionRunId ? {
          progressionRunId:String(progressionRunId),
          roundGeneration:Number(roundGeneration || 0),
          leaseId:progressionLeaseId ? String(progressionLeaseId) : null,
          fromRevision:Number(current.revision),
          toRevision:revision,
          slotKey:String(slotKey),
          committedAt:new Date().toISOString()
        } : (current.lastProgressionCommit || null)
      };
      await this.store.write(this.manifestKey(resolvedWorldId), encodeJson(next), {
        ifGenerationMatch: envelope.generation,
        contentType: 'application/json'
      });
      if (worldRecord && current.worldRecordPath && current.worldRecordPath !== worldPath) {
        await this.store.delete(current.worldRecordPath).catch(() => {});
      }
      if (worldRecord) {
        await this._deleteObjectsBestEffort(Array.isArray(current.worldDeltaPaths) ? current.worldDeltaPaths : []);
      }
      return next;
    } catch (error) {
      await this._deleteObjectsBestEffort(staged);
      throw error;
    }
  }

  async commitSeasonTransition({ worldRecord, newSeason, expectedRevision }) {
    const worldId = safeKey(worldRecord && worldRecord.id, 'worldId');
    const envelope = await this._readManifestEnvelope(worldId);
    if (!envelope) throw new PersistenceNotFoundError('World manifest not found', { worldId: worldId });
    const current = envelope.manifest;
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(current.revision)) {
      throw new PersistenceConflictError('World revision mismatch', { worldId: worldId, expectedRevision, actualRevision: current.revision });
    }
    const previousSeason = Number(current.currentSeason);
    const revision = Number(current.revision) + 1;
    const commitId = this.createCommitId();
    const worldPath = `${this.commitPrefix(worldId, revision, commitId)}/world.json.gz`;
    await this.store.write(worldPath, await encodeJsonGzip(worldRecord), { ifGenerationMatch: 0, contentType: 'application/gzip' });
    const next = {
      ...current,
      revision,
      committedAt: new Date().toISOString(),
      worldRecordPath: worldPath,
      currentSeason: Number(newSeason),
      matchSegments: {},
      financeSegments: {},
      worldDeltaPaths: []
    };
    try {
      await this.store.write(this.manifestKey(worldId), encodeJson(next), {
        ifGenerationMatch: envelope.generation,
        contentType: 'application/json'
      });
    } catch (error) {
      await this.store.delete(worldPath).catch(() => {});
      throw error;
    }

    if (current.worldRecordPath && current.worldRecordPath !== worldPath) {
      await this.store.delete(current.worldRecordPath).catch(() => {});
    }
    for (const path of (Array.isArray(current.worldDeltaPaths) ? current.worldDeltaPaths : [])) {
      await this.store.delete(path).catch(() => {});
    }
    if (Number.isFinite(previousSeason) && previousSeason !== Number(newSeason)) {
      await this.store.deletePrefix(this.seasonPrefix(worldId, previousSeason)).catch(() => {});
    }
    return next;
  }
}

module.exports = { WorldPersistenceService, MANIFEST_SCHEMA, STORAGE_SCHEMA, DEFAULT_READ_CONCURRENCY, DEFAULT_DELTA_COMPACTION_THRESHOLD };
