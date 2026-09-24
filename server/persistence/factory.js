'use strict';

const path = require('path');
const { LocalObjectStore } = require('./local-object-store');
const { GoogleCloudObjectStore } = require('./google-cloud-object-store');
const { FileMetadataRepository } = require('./file-metadata-repository');
const { FirestoreMetadataRepository } = require('./firestore-metadata-repository');
const { WorldPersistenceService } = require('./world-persistence-service');
const { WorldAdministrationService } = require('../services/world-administration-service');

function createPersistence(config) {
  const objectStore = config.objectStoreDriver === 'gcs'
    ? new GoogleCloudObjectStore({ bucketName: config.gcsBucket, projectId: config.googleProjectId })
    : new LocalObjectStore({ rootDir: path.join(config.dataDir, 'objects') });
  const metadata = config.metadataDriver === 'firestore'
    ? new FirestoreMetadataRepository({ projectId: config.googleProjectId, collectionPrefix: config.collectionPrefix })
    : new FileMetadataRepository({ filePath: config.metadataFile });
  const worlds = new WorldPersistenceService({ objectStore });
  const administration = new WorldAdministrationService({ metadataRepository: metadata, worldPersistence: worlds });
  return { objectStore, metadata, worlds, administration };
}

module.exports = { createPersistence };
