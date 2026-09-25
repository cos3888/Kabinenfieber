'use strict';

const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

async function encodeJsonGzip(value, { level = 6 } = {}) {
  return gzip(Buffer.from(JSON.stringify(value), 'utf8'), { level });
}

async function decodeJsonGzip(buffer) {
  const raw = await gunzip(buffer);
  return JSON.parse(raw.toString('utf8'));
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function decodeJson(buffer) {
  return JSON.parse(buffer.toString('utf8'));
}

module.exports = { encodeJsonGzip, decodeJsonGzip, encodeJson, decodeJson };
