'use strict';

const path = require('path');

function loadConfig(env = process.env) {
  const dataDir = path.resolve(env.KF_DATA_DIR || path.join(process.cwd(), 'runtime-data'));
  return {
    port: Number(env.PORT || 8080),
    googleProjectId: env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT || '',
    objectStoreDriver: env.KF_OBJECT_STORE || 'local',
    metadataDriver: env.KF_METADATA_STORE || 'file',
    gcsBucket: env.KF_GCS_BUCKET || '',
    dataDir,
    metadataFile: path.resolve(env.KF_METADATA_FILE || path.join(dataDir, 'metadata.json')),
    authFile: path.resolve(env.KF_AUTH_FILE || path.join(dataDir, 'auth.json')),
    collectionPrefix: env.KF_FIRESTORE_PREFIX || 'kf_dev',
    allowedOrigins: String(env.KF_ALLOWED_ORIGINS || 'https://cos3888.github.io,http://localhost:8000,http://127.0.0.1:8000')
      .split(',').map(value => value.trim()).filter(Boolean),
    maxRequestBytes: Math.max(1024 * 1024, Number(env.KF_MAX_REQUEST_BYTES || 30 * 1024 * 1024)),
    runtimeIdleMs: Math.max(60 * 1000, Number(env.KF_RUNTIME_IDLE_MS || 15 * 60 * 1000))
  };
}

module.exports = { loadConfig };
