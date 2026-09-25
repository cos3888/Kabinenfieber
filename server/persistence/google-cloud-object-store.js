'use strict';

const { PersistenceConflictError, PersistenceNotFoundError } = require('./errors');

class GoogleCloudObjectStore {
  constructor({ bucketName, projectId, storageClient } = {}) {
    if (!bucketName) throw new Error('GoogleCloudObjectStore requires bucketName');
    if (!storageClient) {
      const { Storage } = require('@google-cloud/storage');
      storageClient = new Storage(projectId ? { projectId } : undefined);
    }
    this.bucket = storageClient.bucket(bucketName);
  }

  async read(key) {
    const file = this.bucket.file(key);
    try {
      const [[body], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
      return { body, generation: String(metadata.generation || '') };
    } catch (error) {
      if (error && (error.code === 404 || error.code === '404')) {
        throw new PersistenceNotFoundError(`Object not found: ${key}`, { key });
      }
      throw error;
    }
  }

  async exists(key) {
    const [exists] = await this.bucket.file(key).exists();
    return exists;
  }

  async write(key, body, { ifGenerationMatch = undefined, contentType = 'application/octet-stream', readGeneration = true } = {}) {
    const file = this.bucket.file(key);
    try {
      await file.save(Buffer.isBuffer(body) ? body : Buffer.from(body), {
        resumable: false,
        validation: 'crc32c',
        metadata: { contentType },
        ...(ifGenerationMatch !== undefined
          ? { preconditionOpts: { ifGenerationMatch: Number(ifGenerationMatch) } }
          : {})
      });
      if (!readGeneration) return { generation: null };
      const [metadata] = await file.getMetadata();
      return { generation: String(metadata.generation || '') };
    } catch (error) {
      if (error && (error.code === 412 || error.code === '412')) {
        throw new PersistenceConflictError(`Object generation mismatch: ${key}`, { key });
      }
      throw error;
    }
  }

  async delete(key) {
    try {
      await this.bucket.file(key).delete();
      return true;
    } catch (error) {
      if (error && (error.code === 404 || error.code === '404')) return false;
      throw error;
    }
  }

  async deletePrefix(prefix) {
    await this.bucket.deleteFiles({ prefix });
  }
}

module.exports = { GoogleCloudObjectStore };
