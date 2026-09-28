'use strict';

const { encodeJsonGzip, decodeJsonGzip, encodeJson, decodeJson } = require('./json-codec');
const { PersistenceConflictError, PersistenceNotFoundError } = require('./errors');
const { validateWorldDelta, applyWorldDelta } = require('../domain/world-delta');

const MANIFEST_SCHEMA = 'kf-persistence-manifest-1';
const STORAGE_SCHEMA = 'kf-storage-0.31.0';

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
    if (existing) throw new PersistenceConflictError('World is already initialized', { worldId: worldId });
    const revision = 1, prefix = this.revisionPrefix(worldId, revision);
    const worldPath = `${prefix}/world.json.gz`;
    await this.store.write(worldPath, await encodeJsonGzip(worldRecord), { contentType: 'application/gzip' });
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
    const object = await this.store.read(manifest.worldRecordPath);
    const worldRecord = await decodeJsonGzip(object.body);
    const deltaPaths = Array.isArray(manifest.worldDeltaPaths) ? manifest.worldDeltaPaths.filter(Boolean) : [];
    for (const path of deltaPaths) {
      const delta = await decodeJsonGzip((await this.store.read(path)).body);
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
    return decodeJsonGzip((await this.store.read(path)).body);
  }

  async loadFinanceSegment(worldId, slotKey) {
    const manifest = await this.getManifest(worldId);
    if (!manifest) throw new PersistenceNotFoundError('World manifest not found', { worldId: worldId });
    const path = manifest.financeSegments[String(slotKey)];
    if (!path) return null;
    return decodeJsonGzip((await this.store.read(path)).body);
  }


  async _loadSegments(paths) {
    const rows = [];
    for (const path of paths) {
      rows.push(await decodeJsonGzip((await this.store.read(path)).body));
    }
    return rows;
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
      const segment = await decodeJsonGzip((await this.store.read(path)).body);
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

  async commitRuntimeSnapshot({ worldRecord, season, matches = [], financeEvents = [], expectedRevision }) {
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
    const revisionPrefix = this.revisionPrefix(worldId, revision);
    const detailPrefix = `${this.seasonPrefix(worldId, season)}/revisions/${String(revision).padStart(8, '0')}/runtime`;
    const worldPath = `${revisionPrefix}/world.json.gz`;
    const matchPath = `${detailPrefix}/matches.json.gz`;
    const financePath = `${detailPrefix}/finances.json.gz`;
    const staged = [worldPath, matchPath, financePath];

    try {
      await this.store.write(worldPath, await encodeJsonGzip(worldRecord), { contentType: 'application/gzip' });
      await this.store.write(matchPath, await encodeJsonGzip({ season, kind: 'runtime-snapshot', matches }), { contentType: 'application/gzip' });
      await this.store.write(financePath, await encodeJsonGzip({ season, kind: 'runtime-snapshot', events: financeEvents }), { contentType: 'application/gzip' });
      const next = {
        ...current,
        revision,
        committedAt: new Date().toISOString(),
        worldRecordPath: worldPath,
        currentSeason: season,
        matchSegments: { __runtime__: matchPath },
        financeSegments: { __runtime__: financePath },
        matchIndex: Object.fromEntries((matches || []).filter(row => row && row.id).map(row => [String(row.id), matchPath])),
        worldDeltaPaths: []
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
    const worldPath = `${this.revisionPrefix(worldId, revision)}/world.json.gz`;
    await this.store.write(worldPath, await encodeJsonGzip(worldRecord), { contentType: 'application/gzip' });
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

  async commitSlot({ worldId = null, worldRecord = null, worldDelta = null, season, slotKey, matches = [], financeEvents = [], expectedRevision }) {
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
    const revisionPrefix = this.revisionPrefix(resolvedWorldId, revision);
    const segmentPrefix = `${this.seasonPrefix(resolvedWorldId, season)}/revisions/${String(revision).padStart(8, '0')}`;
    const worldPath = worldRecord ? `${revisionPrefix}/world.json.gz` : null;
    const deltaPath = worldDelta ? `${revisionPrefix}/world-delta.json.gz` : null;
    const matchPath = `${segmentPrefix}/matches/${slotKey}.json.gz`;
    const financePath = `${segmentPrefix}/finances/${slotKey}.json.gz`;
    const staged = [worldPath, deltaPath, matchPath, financePath].filter(Boolean);

    try {
      if (worldDelta) {
        validateWorldDelta(worldDelta, resolvedWorldId);
        await this.store.write(deltaPath, await encodeJsonGzip(worldDelta), { contentType: 'application/gzip' });
      } else if (worldRecord) {
        await this.store.write(worldPath, await encodeJsonGzip(worldRecord), { contentType: 'application/gzip' });
      } else {
        throw new Error('Slot commit requires worldDelta or worldRecord');
      }
      await this.store.write(matchPath, await encodeJsonGzip({ season: Number(season), slotKey, matches }), { contentType: 'application/gzip' });
      await this.store.write(financePath, await encodeJsonGzip({ season: Number(season), slotKey, events: financeEvents }), { contentType: 'application/gzip' });
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
          : []
      };
      await this.store.write(this.manifestKey(resolvedWorldId), encodeJson(next), {
        ifGenerationMatch: envelope.generation,
        contentType: 'application/json'
      });
      if (worldRecord && current.worldRecordPath && current.worldRecordPath !== worldPath) {
        await this.store.delete(current.worldRecordPath).catch(() => {});
      }
      if (worldRecord) {
        for (const path of (Array.isArray(current.worldDeltaPaths) ? current.worldDeltaPaths : [])) {
          await this.store.delete(path).catch(() => {});
        }
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
    if (!envelope) throw new PersistenceNotFoundError('World manifest not found', { worldId: worldId });
    const current = envelope.manifest;
    if (expectedRevision !== undefined && Number(expectedRevision) !== Number(current.revision)) {
      throw new PersistenceConflictError('World revision mismatch', { worldId: worldId, expectedRevision, actualRevision: current.revision });
    }
    const previousSeason = Number(current.currentSeason);
    const revision = Number(current.revision) + 1;
    const prefix = this.revisionPrefix(worldId, revision);
    const worldPath = `${prefix}/world.json.gz`;
    await this.store.write(worldPath, await encodeJsonGzip(worldRecord), { contentType: 'application/gzip' });
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

module.exports = { WorldPersistenceService, MANIFEST_SCHEMA, STORAGE_SCHEMA };
