'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { PersistenceConflictError, PersistenceNotFoundError } = require('./errors');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

class LocalObjectStore {
  constructor({ rootDir }) {
    if (!rootDir) throw new Error('LocalObjectStore requires rootDir');
    this.rootDir = path.resolve(rootDir);
  }

  _path(key) {
    const clean = String(key || '').replace(/^\/+/, '');
    const resolved = path.resolve(this.rootDir, clean);
    if (!resolved.startsWith(this.rootDir + path.sep) && resolved !== this.rootDir) {
      throw new Error('Object key escapes storage root');
    }
    return resolved;
  }

  async read(key) {
    const target = this._path(key);
    try {
      const body = await fs.readFile(target);
      return { body, generation: sha256(body) };
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        throw new PersistenceNotFoundError(`Object not found: ${key}`, { key });
      }
      throw error;
    }
  }

  async exists(key) {
    try {
      await fs.access(this._path(key));
      return true;
    } catch (error) {
      if (error && error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async write(key, body, { ifGenerationMatch = undefined } = {}) {
    const target = this._path(key);
    const data = Buffer.isBuffer(body) ? body : Buffer.from(body);
    await fs.mkdir(path.dirname(target), { recursive: true });

    if (ifGenerationMatch !== undefined) {
      const exists = await this.exists(key);
      if (String(ifGenerationMatch) === '0') {
        if (exists) throw new PersistenceConflictError(`Object already exists: ${key}`, { key });
      } else {
        if (!exists) throw new PersistenceConflictError(`Object changed or disappeared: ${key}`, { key });
        const current = await this.read(key);
        if (String(current.generation) !== String(ifGenerationMatch)) {
          throw new PersistenceConflictError(`Object generation mismatch: ${key}`, {
            key,
            expected: String(ifGenerationMatch),
            actual: String(current.generation)
          });
        }
      }
    }

    const tmp = `${target}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, target);
    return { generation: sha256(data) };
  }

  async delete(key) {
    try {
      await fs.unlink(this._path(key));
      return true;
    } catch (error) {
      if (error && error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async deletePrefix(prefix) {
    const target = this._path(prefix);
    await fs.rm(target, { recursive: true, force: true });
  }
}

module.exports = { LocalObjectStore };
