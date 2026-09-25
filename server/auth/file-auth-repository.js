'use strict';

const fs = require('fs/promises');
const path = require('path');
const { DomainRuleError } = require('../persistence/errors');

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

class FileAuthRepository {
  constructor({ filePath }) {
    if (!filePath) throw new Error('FileAuthRepository requires filePath');
    this.filePath = path.resolve(filePath);
    this._queue = Promise.resolve();
  }

  async _read() {
    try {
      const data = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      data.accounts = data.accounts || {};
      data.profiles = data.profiles || {};
      data.sessions = data.sessions || {};
      return data;
    } catch (error) {
      if (error && error.code === 'ENOENT') return { schemaVersion: 1, accounts: {}, profiles: {}, sessions: {} };
      throw error;
    }
  }

  async _write(data) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(data), 'utf8');
    await fs.rename(tmp, this.filePath);
  }

  _mutate(fn) {
    const run = this._queue.then(async () => {
      const data = await this._read();
      const result = await fn(data);
      await this._write(data);
      return clone(result);
    });
    this._queue = run.catch(() => {});
    return run;
  }

  async createAccount({ account, profile }) {
    return this._mutate(data => {
      if (!account || !account.userId || !account.loginNameKey || !account.passwordHash) throw new DomainRuleError('Incomplete account');
      if (data.accounts[account.loginNameKey]) throw new DomainRuleError('Login name already exists');
      if (data.profiles[account.userId]) throw new DomainRuleError('User profile already exists');
      data.accounts[account.loginNameKey] = clone(account);
      data.profiles[account.userId] = clone(profile);
      return { account, profile };
    });
  }

  async getAccountByLoginNameKey(loginNameKey) {
    const data = await this._read();
    return data.accounts[String(loginNameKey)] ? clone(data.accounts[String(loginNameKey)]) : null;
  }

  async getProfile(userId) {
    const data = await this._read();
    return data.profiles[String(userId)] ? clone(data.profiles[String(userId)]) : null;
  }

  async saveProfile(profile) {
    return this._mutate(data => {
      if (!profile || !profile.userId) throw new DomainRuleError('Profile userId is required');
      data.profiles[String(profile.userId)] = clone(profile);
      return profile;
    });
  }

  async createSession(session) {
    return this._mutate(data => {
      if (!session || !session.tokenHash || !session.userId) throw new DomainRuleError('Incomplete session');
      data.sessions[String(session.tokenHash)] = clone(session);
      return session;
    });
  }

  async getSession(tokenHash) {
    const data = await this._read();
    return data.sessions[String(tokenHash)] ? clone(data.sessions[String(tokenHash)]) : null;
  }

  async deleteSession(tokenHash) {
    return this._mutate(data => {
      const existed = Boolean(data.sessions[String(tokenHash)]);
      delete data.sessions[String(tokenHash)];
      return { deleted: existed };
    });
  }
}

module.exports = { FileAuthRepository };
