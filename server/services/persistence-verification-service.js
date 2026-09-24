'use strict';

const crypto = require('crypto');

function normalizeVerificationError(error) {
  const code = String(error && (error.code ?? error.status ?? '')).toLowerCase();
  const message = String(error && error.message || '').toLowerCase();
  if (code === '403' || code === '7' || code === 'permission_denied' || message.includes('permission denied') || message.includes('permission_denied')) return 'permission_denied';
  if (code === '404' || code === '5' || code === 'not_found' || message.includes('not found')) return 'not_found';
  if (code === '409' || code === '412' || message.includes('precondition')) return 'conflict';
  if (message.includes('verification_payload_mismatch')) return 'payload_mismatch';
  if (message.includes('verification_cleanup_failed')) return 'cleanup_failed';
  if (message.includes('verification_method_missing')) return 'unsupported';
  return 'error';
}

async function verifyObjectStore(objectStore, probeId, payload) {
  const key = `_system/persistence-verification/${probeId}.json`;
  let failure = null;
  try {
    await objectStore.write(key, Buffer.from(payload, 'utf8'), { ifGenerationMatch: 0, contentType: 'application/json' });
    const loaded = await objectStore.read(key);
    if (!loaded || !Buffer.isBuffer(loaded.body) || loaded.body.toString('utf8') !== payload) {
      throw new Error('verification_payload_mismatch');
    }
  } catch (error) {
    failure = error;
  }
  try {
    await objectStore.delete(key);
  } catch (cleanupError) {
    if (!failure) {
      cleanupError.message = `verification_cleanup_failed: ${cleanupError.message || 'object store cleanup failed'}`;
      failure = cleanupError;
    }
  }
  if (failure) throw failure;
  return true;
}

async function verifyMetadataStore(metadata, probeId, payload) {
  if (!metadata || typeof metadata.verifyRoundTrip !== 'function') throw new Error('verification_method_missing');
  return metadata.verifyRoundTrip({ probeId, payload });
}

async function settleCheck(driver, fn) {
  try {
    await fn();
    return { driver, status: 'ok', error: null };
  } catch (error) {
    return { driver, status: 'failed', error: normalizeVerificationError(error) };
  }
}

async function runPersistenceVerification({
  objectStore,
  metadata,
  objectStoreDriver = 'unknown',
  metadataDriver = 'unknown',
  probeId = crypto.randomUUID(),
  now = () => new Date().toISOString()
}) {
  const startedAt = now();
  const payload = JSON.stringify({ kind: 'kabinenfieber-persistence-verification', probeId });
  const [objectStoreCheck, metadataStoreCheck] = await Promise.all([
    settleCheck(objectStoreDriver, () => verifyObjectStore(objectStore, probeId, payload)),
    settleCheck(metadataDriver, () => verifyMetadataStore(metadata, probeId, payload))
  ]);
  return {
    status: objectStoreCheck.status === 'ok' && metadataStoreCheck.status === 'ok' ? 'ok' : 'failed',
    startedAt,
    completedAt: now(),
    objectStore: objectStoreCheck,
    metadataStore: metadataStoreCheck
  };
}

module.exports = { runPersistenceVerification, normalizeVerificationError };
