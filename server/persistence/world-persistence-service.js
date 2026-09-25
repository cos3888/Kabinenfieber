'use strict';

const { encodeJsonGzip, decodeJsonGzip, encodeJson, decodeJson } = require('./json-codec');
const { PersistenceConflictError, PersistenceNotFoundError } = require('./errors');

const MANIFEST_SCHEMA = 'kf-persistence-manifest-1';
const STORAGE_SCHEMA = 'kf-storage-0.28.0';

function safeKey(value, name) {
  const text = String(value == null ? '' : value);
  if (!text || !/^[A-Za-z0-9._:-]+$/.test(text)) throw new Error(`Invalid ${name}`);
  return text;
}

class WorldPersistenceService {
  constructor({ objectStore }) {
    if (!objectStore) throw new Error('WorldPersistenceService requires objectStore');
    this.store = objectStore;
  }

  manifestKey(worldId) { return `worlds/${safeKey(worldId, 'worldId')}/manifest.json`; }
  revisionPrefix(worldId, revision) { return `worlds/${safeKey(worldId, 'worldId')}/revisions/${String(revision).padStart(8, '0')}`; }
  seasonPrefix(worldId, season) { return `worlds/${safeKey(worldId, 'worldId')}/current-season/${Number(season)}`; }

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
    if (existing) throw new PersistenceConflictError('World is already initialized', { worldId });
    const revision = 1, prefix = this.revisionPrefix(worldId, revision);
    const worldPath = `${prefix}/world.json.gz`;
    await this.store.write(worldPath, await encodeJsonGzip(worldRecord, { level: 1 }), { contentType: 'application/gzip', readGeneration: false });
    const manifest = {
      schemaVersion: MANIFEST_SCHEMA,
      storageSchema: STORAGE_SCHEMA,
      worldId,
      revision,
      committedAt: new Date().toISOString(),
      worldRecordPath: worldPath,
      currentSeason: Number(worldRecord.gameState && worldRecord.gameState.meta && worldRecord.gameState.meta.seasonNumber || 1),
      matchSegments: {},
      financeSegments: {}
    };
    try {
      await this.store.write(this.manifestKey(worldId), encodeJson(manifest), { ifGenerationMatch: 0, contentType: 'application/json', readGeneration: false });
    } catch (error) {
      await this.store.delete(worldPath).catch(() => {});
      throw error;
    }
    return manifest;
  }

  async loadWorldRecordFromManifest(manifest) {
    if (!manifest) throw new PersistenceNotFoundError('World manifest not found');
    const object = await this.store.read(manifest.worldRecordPath);
    return decodeJsonGzip(object.body);
  }

  async loadWorldRecord(worldId) {
    const manifest = await this.getManifest(worldId);
    if (!manifest) throw new PersistenceNotFoundError('World manifest not found', { worldId });
    return this.loadWorldRecordFromManifest(manifest);
  }

  async loadMatchSegment(worldId, slotKey) {
    const manifest = await this.getManifest(worldId);
    if (!manifest) throw new PersistenceNotFoundError('World manifest not found', { worldId });
    const path = manifest.matchSegments[String(slotKey)];
    if (!path) return null;
    return decodeJsonGzip((await this.store.read(path)).body);
  }

  async loadFinanceSegment(worldId, slotKey) {
    const manifest = await this.getManifest(worldId);
    if (!manifest) throw new PersistenceNotFoundError('World manifest not found', { worldId });
    const path = manifest.financeSegments[String(slotKey)];
    if (!path) return null;
    return decodeJsonGzip((await this.store.read(path)).body);
  }


  async loadCurrentSeasonDetailsFromManifest(manifest) {
    if (!manifest) throw new PersistenceNotFoundError('World manifest not found');
    const matchPaths = Array.from(new Set(Object.values(manifest.matchSegments || {}).filter(Boolean)));
    const financePaths = Array.from(new Set(Object.values(manifest.financeSegments || {}).filter(Boolean)));
    const [matchSegments, financeSegments] = await Promise.all([
      Promise.all(matchPaths.map(async path => decodeJsonGzip((await this.store.read(path)).body))),
      Promise.all(financePaths.map(async path => decodeJsonGzip((await this.store.read(path)).body)))
    ]);
    return {
      season: Number(manifest.currentSeason || 1),
      matches: matchSegments.flatMap(segment => Array.isArray(segment && segment.matches) ? segment.matches : []),
      financeEvents: financeSegments.flatMap(segment => Array.isArray(segment && segment.events) ? segment.events : [])
    };
  }

  async loadCurrentSeasonDetails(worldId) {
    const manifest = await this.getManifest(worldId);
    if (!manifest) throw new PersistenceNotFoundError('World manifest not found', { worldId });
    return this.loadCurrentSeasonDetailsFromManifest(manifest);
  }

  async loadRuntimeSnapshot(worldId, manifest = null) {
    const committedManifest = manifest || await this.getManifest(worldId);
    if (!committedManifest) throw new PersistenceNotFoundError('World manifest not found', { worldId });
    const [worldRecord, details] = await Promise.all([
      this.loadWorldRecordFromManifest(committedManifest),
      this.loadCurrentSeasonDetailsFromManifest(committedManifest)
    ]);
    return {
      manifest: committedManifest,
      worldRecord,
      currentSeason: Number(committedManifest.currentSeason || details.season || 1),
      matches: details.matches || [],
      financeEvents: details.financeEvents || []
    };
  }

  async commitRuntimeSnapshot({ worldRecord, season, matches = [], financeEvents = [], expectedRevision }) {
    const worldId = safeKey(worldRecord && worldRecord.id, 'worldId');
    const envelope = await this._readManifestEnvelope(worldId);
    if (!envelope) throw new PersistenceNotFoundError('World manifest not found', { worldId });
    const current = envelope.manifest;
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(current.revision)) {
      throw new PersistenceConflictError('World revision mismatch', { worldId, expectedRevision, actualRevision: current.revision });
    }
    season = Number(season || (worldRecord.gameState && worldRecord.gameState.meta && worldRecord.gameState.meta.seasonNumber) || current.currentSeason || 1);
    if (!Number.isFinite(season) || season < 1) throw new Error('Invalid current season');

    const revision = Number(current.revision) + 1;
    const revisionPrefix = this.revisionPrefix(worldId, revision);
    const detailPrefix = `${this.seasonPrefix(worldId, season)}/revisions/${String(revision).padStart(8, '0')}/runtime`;
    const worldPath = `${revisionPrefix}/world.json.gz`;
    const matchPath = `${detailPrefix}/matches.json.gz`;
    const financePath = `${detailPrefix}/finances.json.gz`;
    const staged = [worldPath, matchPath, financePath];

    try {
      await this.store.write(worldPath, await encodeJsonGzip(worldRecord, { level: 1 }), { contentType: 'application/gzip', readGeneration: false });
      await this.store.write(matchPath, await encodeJsonGzip({ season, kind: 'runtime-snapshot', matches }), { contentType: 'application/gzip' });
      await this.store.write(financePath, await encodeJsonGzip({ season, kind: 'runtime-snapshot', events: financeEvents }), { contentType: 'application/gzip' });
      const next = {
        ...current,
        revision,
        committedAt: new Date().toISOString(),
        worldRecordPath: worldPath,
        currentSeason: season,
        matchSegments: { __runtime__: matchPath },
        financeSegments: { __runtime__: financePath }
      };
      await this.store.write(this.manifestKey(worldId), encodeJson(next), {
        ifGenerationMatch: envelope.generation,
        contentType: 'application/json',
        readGeneration: false
      });

      if (current.worldRecordPath && current.worldRecordPath !== worldPath) {
        await this.store.delete(current.worldRecordPath).catch(() => {});
      }
      const previousPaths = [
        ...Object.values(current.matchSegments || {}),
        ...Object.values(current.financeSegments || {})
      ].filter(Boolean);
      for (const oldPath of previousPaths) {
        if (oldPath !== matchPath && oldPath !== financePath) await this.store.delete(oldPath).catch(() => {});
      }
      const previousSeason = Number(current.currentSeason);
      if (Number.isFinite(previousSeason) && previousSeason !== season) {
        await this.store.deletePrefix(this.seasonPrefix(worldId, previousSeason)).catch(() => {});
      }
      return next;
    } catch (error) {
      for (const path of staged) await this.store.delete(path).catch(() => {});
      throw error;
    }
  }

  async commitProgressCheckpoint({
    worldRecord,
    season,
    matchesDelta = [],
    financeEventsDelta = [],
    expectedRevision,
    requestId = null
  }) {
    const worldId = safeKey(worldRecord && worldRecord.id, 'worldId');
    const envelope = await this._readManifestEnvelope(worldId);
    if (!envelope) throw new PersistenceNotFoundError('World manifest not found', { worldId });
    const current = envelope.manifest;
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(current.revision)) {
      if (requestId && String(current.lastCommitRequestId || '') === String(requestId)) {
        return { ...current, deduplicated: true };
      }
      throw new PersistenceConflictError('World revision mismatch', {
        worldId,
        expectedRevision,
        actualRevision: current.revision
      });
    }

    season = Number(season || (worldRecord.gameState && worldRecord.gameState.meta && worldRecord.gameState.meta.seasonNumber) || current.currentSeason || 1);
    if (!Number.isFinite(season) || season < 1) throw new Error('Invalid current season');

    const revision = Number(current.revision) + 1;
    const revisionKey = `r${String(revision).padStart(8, '0')}`;
    const revisionPrefix = this.revisionPrefix(worldId, revision);
    const detailPrefix = `${this.seasonPrefix(worldId, season)}/revisions/${String(revision).padStart(8, '0')}/progress`;
    const worldPath = `${revisionPrefix}/world.json.gz`;
    const matchPath = matchesDelta.length ? `${detailPrefix}/matches.json.gz` : null;
    const financePath = financeEventsDelta.length ? `${detailPrefix}/finances.json.gz` : null;
    const staged = [worldPath, matchPath, financePath].filter(Boolean);

    try {
      const worldPayload = await encodeJsonGzip(worldRecord, { level: 1 });
      await this.store.write(worldPath, worldPayload, {
        contentType: 'application/gzip',
        readGeneration: false
      });

      if (matchPath || financePath) {
        const detailWrites = [];
        if (matchPath) {
          detailWrites.push(
            encodeJsonGzip({ season, kind: 'progress-delta', matches: matchesDelta }, { level: 3 })
              .then(body => this.store.write(matchPath, body, { contentType: 'application/gzip', readGeneration: false }))
          );
        }
        if (financePath) {
          detailWrites.push(
            encodeJsonGzip({ season, kind: 'progress-delta', events: financeEventsDelta }, { level: 3 })
              .then(body => this.store.write(financePath, body, { contentType: 'application/gzip', readGeneration: false }))
          );
        }
        await Promise.all(detailWrites);
      }

      const seasonChanged = Number(current.currentSeason || 1) !== season;
      const nextMatchSegments = seasonChanged ? {} : { ...(current.matchSegments || {}) };
      const nextFinanceSegments = seasonChanged ? {} : { ...(current.financeSegments || {}) };
      if (matchPath) nextMatchSegments[revisionKey] = matchPath;
      if (financePath) nextFinanceSegments[revisionKey] = financePath;

      const next = {
        ...current,
        revision,
        committedAt: new Date().toISOString(),
        worldRecordPath: worldPath,
        currentSeason: season,
        matchSegments: nextMatchSegments,
        financeSegments: nextFinanceSegments,
        lastCommitRequestId: requestId || null,
        lastCommitKind: 'progress'
      };
      await this.store.write(this.manifestKey(worldId), encodeJson(next), {
        ifGenerationMatch: envelope.generation,
        contentType: 'application/json',
        readGeneration: false
      });

      if (current.worldRecordPath && current.worldRecordPath !== worldPath) {
        await this.store.delete(current.worldRecordPath).catch(() => {});
      }
      const previousSeason = Number(current.currentSeason);
      if (seasonChanged && Number.isFinite(previousSeason)) {
        await this.store.deletePrefix(this.seasonPrefix(worldId, previousSeason)).catch(() => {});
      }
      return next;
    } catch (error) {
      for (const path of staged) await this.store.delete(path).catch(() => {});
      throw error;
    }
  }

  async deleteWorld(worldId) {
    const id = safeKey(worldId, 'worldId');
    await this.store.deletePrefix(`worlds/${id}/`);
    return true;
  }

  async commitWorldRecord({ worldRecord, expectedRevision, requestId = null }) {
    const worldId = safeKey(worldRecord && worldRecord.id, 'worldId');
    const envelope = await this._readManifestEnvelope(worldId);
    if (!envelope) throw new PersistenceNotFoundError('World manifest not found', { worldId });
    const current = envelope.manifest;
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(current.revision)) {
      if (requestId && String(current.lastCommitRequestId || '') === String(requestId)) {
        return { ...current, deduplicated: true };
      }
      throw new PersistenceConflictError('World revision mismatch', { worldId, expectedRevision, actualRevision: current.revision });
    }
    const revision = Number(current.revision) + 1;
    const worldPath = `${this.revisionPrefix(worldId, revision)}/world.json.gz`;
    await this.store.write(worldPath, await encodeJsonGzip(worldRecord, { level: 1 }), {
      contentType: 'application/gzip',
      readGeneration: false
    });
    const next = {
      ...current,
      revision,
      committedAt: new Date().toISOString(),
      worldRecordPath: worldPath,
      lastCommitRequestId: requestId || null,
      lastCommitKind: 'world-record'
    };
    try {
      await this.store.write(this.manifestKey(worldId), encodeJson(next), {
        ifGenerationMatch: envelope.generation,
        contentType: 'application/json',
        readGeneration: false
      });
    } catch (error) {
      await this.store.delete(worldPath).catch(() => {});
      throw error;
    }
    if (current.worldRecordPath && current.worldRecordPath !== worldPath) {
      await this.store.delete(current.worldRecordPath).catch(() => {});
    }
    return next;
  }

  async commitSlot({ worldRecord, season, slotKey, matches = [], financeEvents = [], expectedRevision }) {
    const worldId = safeKey(worldRecord && worldRecord.id, 'worldId');
    slotKey = safeKey(slotKey, 'slotKey');
    const envelope = await this._readManifestEnvelope(worldId);
    if (!envelope) throw new PersistenceNotFoundError('World manifest not found', { worldId });
    const current = envelope.manifest;
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(current.revision)) {
      throw new PersistenceConflictError('World revision mismatch', { worldId, expectedRevision, actualRevision: current.revision });
    }
    if (Number(season) !== Number(current.currentSeason)) {
      throw new PersistenceConflictError('Slot season does not match current persisted season', { worldId, season, currentSeason: current.currentSeason });
    }

    const revision = Number(current.revision) + 1;
    const revisionPrefix = this.revisionPrefix(worldId, revision);
    const segmentPrefix = `${this.seasonPrefix(worldId, season)}/revisions/${String(revision).padStart(8, '0')}`;
    const worldPath = `${revisionPrefix}/world.json.gz`;
    const matchPath = `${segmentPrefix}/matches/${slotKey}.json.gz`;
    const financePath = `${segmentPrefix}/finances/${slotKey}.json.gz`;
    const staged = [worldPath, matchPath, financePath];

    try {
      await this.store.write(worldPath, await encodeJsonGzip(worldRecord, { level: 1 }), { contentType: 'application/gzip', readGeneration: false });
      await this.store.write(matchPath, await encodeJsonGzip({ season: Number(season), slotKey, matches }), { contentType: 'application/gzip' });
      await this.store.write(financePath, await encodeJsonGzip({ season: Number(season), slotKey, events: financeEvents }), { contentType: 'application/gzip' });
      const next = {
        ...current,
        revision,
        committedAt: new Date().toISOString(),
        worldRecordPath: worldPath,
        currentSeason: Number(season),
        matchSegments: { ...(current.matchSegments || {}), [slotKey]: matchPath },
        financeSegments: { ...(current.financeSegments || {}), [slotKey]: financePath }
      };
      await this.store.write(this.manifestKey(worldId), encodeJson(next), {
        ifGenerationMatch: envelope.generation,
        contentType: 'application/json',
        readGeneration: false
      });
      if (current.worldRecordPath && current.worldRecordPath !== worldPath) {
        await this.store.delete(current.worldRecordPath).catch(() => {});
      }
      return next;
    } catch (error) {
      for (const path of staged) await this.store.delete(path).catch(() => {});
      throw error;
    }
  }

  async commitSeasonTransition({ worldRecord, newSeason, expectedRevision }) {
    const worldId = safeKey(worldRecord && worldRecord.id, 'worldId');
    const envelope = await this._readManifestEnvelope(worldId);
    if (!envelope) throw new PersistenceNotFoundError('World manifest not found', { worldId });
    const current = envelope.manifest;
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(current.revision)) {
      throw new PersistenceConflictError('World revision mismatch', { worldId, expectedRevision, actualRevision: current.revision });
    }
    const previousSeason = Number(current.currentSeason);
    const revision = Number(current.revision) + 1;
    const prefix = this.revisionPrefix(worldId, revision);
    const worldPath = `${prefix}/world.json.gz`;
    await this.store.write(worldPath, await encodeJsonGzip(worldRecord, { level: 1 }), { contentType: 'application/gzip', readGeneration: false });
    const next = {
      ...current,
      revision,
      committedAt: new Date().toISOString(),
      worldRecordPath: worldPath,
      currentSeason: Number(newSeason),
      matchSegments: {},
      financeSegments: {}
    };
    try {
      await this.store.write(this.manifestKey(worldId), encodeJson(next), {
        ifGenerationMatch: envelope.generation,
        contentType: 'application/json',
        readGeneration: false
      });
    } catch (error) {
      await this.store.delete(worldPath).catch(() => {});
      throw error;
    }

    if (current.worldRecordPath && current.worldRecordPath !== worldPath) {
      await this.store.delete(current.worldRecordPath).catch(() => {});
    }
    if (Number.isFinite(previousSeason) && previousSeason !== Number(newSeason)) {
      await this.store.deletePrefix(this.seasonPrefix(worldId, previousSeason)).catch(() => {});
    }
    return next;
  }
}

module.exports = { WorldPersistenceService, MANIFEST_SCHEMA, STORAGE_SCHEMA };
