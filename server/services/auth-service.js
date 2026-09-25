'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const { DomainRuleError } = require('../persistence/errors');

const scrypt = promisify(crypto.scrypt);

function normalizeLoginName(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function validateLoginName(value) {
  const display = String(value || '').normalize('NFKC').trim();
  const key = normalizeLoginName(display);
  if (!/^[\p{L}\p{N}._-]{3,24}$/u.test(key)) {
    throw new DomainRuleError('Login name must contain 3-24 letters, numbers, dot, underscore or hyphen');
  }
  return { display, key };
}

function validatePassword(password) {
  const text = String(password || '');
  if (text.length < 8 || text.length > 128) throw new DomainRuleError('Password must contain 8-128 characters');
  return text;
}

function validateDisplayName(value, fallback) {
  const text = String(value || fallback || '').normalize('NFKC').trim();
  if (!text || text.length > 40) throw new DomainRuleError('Display name must contain 1-40 characters');
  return text;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(validatePassword(password), salt, 64);
  return `scrypt$${salt.toString('base64url')}$${Buffer.from(key).toString('base64url')}`;
}

async function verifyPassword(password, encoded) {
  try {
    const parts = String(encoded || '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = Buffer.from(parts[1], 'base64url');
    const expected = Buffer.from(parts[2], 'base64url');
    const actual = Buffer.from(await scrypt(String(password || ''), salt, expected.length));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function publicUser(profile, loginName = null) {
  if (!profile) return null;
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    ...(loginName ? { loginName } : {})
  };
}

class AuthService {
  constructor({ repository, sessionTtlMs = 30 * 24 * 60 * 60 * 1000, now = () => Date.now() }) {
    if (!repository) throw new Error('AuthService requires repository');
    this.repository = repository;
    this.sessionTtlMs = sessionTtlMs;
    this.now = now;
  }

  async _newSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const createdAtMs = this.now();
    const session = {
      tokenHash: tokenHash(token),
      userId,
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(createdAtMs + this.sessionTtlMs).toISOString()
    };
    await this.repository.createSession(session);
    return token;
  }

  async register({ loginName, password, displayName }) {
    const login = validateLoginName(loginName);
    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();
    const createdAt = new Date(this.now()).toISOString();
    const profile = {
      userId,
      displayName: validateDisplayName(displayName, login.display),
      createdAt,
      settings: {},
      cosmetics: { ownedSkinIds: [], ownedCosmeticIds: [], equippedProfileSkinId: null },
      lifetimeStats: {
        worldsJoined: 0, completedTrainerCareers: 0, seasons: 0, matches: 0,
        wins: 0, draws: 0, losses: 0, championships: 0, cupWins: 0,
        promotions: 0, relegations: 0
      }
    };
    const account = {
      userId,
      loginName: login.display,
      loginNameKey: login.key,
      passwordHash,
      createdAt
    };
    await this.repository.createAccount({ account, profile });
    const token = await this._newSession(userId);
    return { token, user: publicUser(profile, account.loginName) };
  }

  async login({ loginName, password }) {
    const login = validateLoginName(loginName);
    const account = await this.repository.getAccountByLoginNameKey(login.key);
    if (!account || !(await verifyPassword(password, account.passwordHash))) {
      throw new DomainRuleError('Invalid login name or password');
    }
    const profile = await this.repository.getProfile(account.userId);
    if (!profile) throw new DomainRuleError('User profile is missing');
    const token = await this._newSession(account.userId);
    return { token, user: publicUser(profile, account.loginName) };
  }

  async authenticate(token) {
    if (!token) throw new DomainRuleError('Authentication required');
    const hash = tokenHash(token);
    const session = await this.repository.getSession(hash);
    if (!session) throw new DomainRuleError('Invalid session');
    if (Date.parse(session.expiresAt) <= this.now()) {
      await this.repository.deleteSession(hash).catch(() => {});
      throw new DomainRuleError('Session expired');
    }
    const profile = await this.repository.getProfile(session.userId);
    if (!profile) throw new DomainRuleError('User profile is missing');
    return { session, user: publicUser(profile) };
  }

  async logout(token) {
    if (!token) return { deleted: false };
    return this.repository.deleteSession(tokenHash(token));
  }
}

module.exports = {
  AuthService,
  normalizeLoginName,
  hashPassword,
  verifyPassword,
  tokenHash
};
