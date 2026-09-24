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
    collectionPrefix: env.KF_FIRESTORE_PREFIX || 'kf_dev'
  };
}

module.exports = { loadConfig };
