'use strict';

const path = require('path');
const { LocalObjectStore } = require('./local-object-store');
const { GoogleCloudObjectStore } = require('./google-cloud-object-store');
const { FileMetadataRepository } = require('./file-metadata-repository');
const { FirestoreMetadataRepository } = require('./firestore-metadata-repository');
const { WorldPersistenceService } = require('./world-persistence-service');
const { WorldAdministrationService } = require('../services/world-administration-service');
const { FileAuthRepository } = require('../auth/file-auth-repository');
const { FirestoreAuthRepository } = require('../auth/firestore-auth-repository');
const { AuthService } = require('../services/auth-service');
const { WorldRuntimeManager } = require('../services/world-runtime-manager');
const { WorldSessionService } = require('../services/world-session-service');

function createPersistence(config) {
  const objectStore = config.objectStoreDriver === 'gcs'
    ? new GoogleCloudObjectStore({ bucketName: config.gcsBucket, projectId: config.googleProjectId })
    : new LocalObjectStore({ rootDir: path.join(config.dataDir, 'objects') });
  const metadata = config.metadataDriver === 'firestore'
    ? new FirestoreMetadataRepository({ projectId: config.googleProjectId, collectionPrefix: config.collectionPrefix })
    : new FileMetadataRepository({ filePath: config.metadataFile });
  const worlds = new WorldPersistenceService({ objectStore });
  const administration = new WorldAdministrationService({ metadataRepository: metadata, worldPersistence: worlds });
  const authRepository = config.metadataDriver === 'firestore'
    ? new FirestoreAuthRepository({ projectId: config.googleProjectId, collectionPrefix: config.collectionPrefix })
    : new FileAuthRepository({ filePath: config.authFile });
  const auth = new AuthService({ repository: authRepository });
  const runtime = new WorldRuntimeManager({
    worldPersistence: worlds,
    metadataRepository: metadata,
    idleMs: config.runtimeIdleMs
  });
  const worldSessions = new WorldSessionService({
    metadataRepository: metadata,
    worldPersistence: worlds,
    runtimeManager: runtime
  });
  return { objectStore, metadata, worlds, administration, authRepository, auth, runtime, worldSessions };
}

module.exports = { createPersistence };
