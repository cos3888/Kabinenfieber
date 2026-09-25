'use strict';

const { DomainRuleError } = require('../persistence/errors');

class FirestoreAuthRepository {
  constructor({ firestore, projectId, collectionPrefix = 'kf_dev' } = {}) {
    if (!firestore) {
      const { Firestore } = require('@google-cloud/firestore');
      firestore = new Firestore(projectId ? { projectId } : undefined);
    }
    this.db = firestore;
    this.names = {
      accounts: `${collectionPrefix}_user_accounts`,
      profiles: `${collectionPrefix}_user_profiles`,
      sessions: `${collectionPrefix}_auth_sessions`
    };
  }

  _account(loginNameKey) { return this.db.collection(this.names.accounts).doc(String(loginNameKey)); }
  _profile(userId) { return this.db.collection(this.names.profiles).doc(String(userId)); }
  _session(tokenHash) { return this.db.collection(this.names.sessions).doc(String(tokenHash)); }

  async createAccount({ account, profile }) {
    if (!account || !account.userId || !account.loginNameKey || !account.passwordHash) throw new DomainRuleError('Incomplete account');
    return this.db.runTransaction(async tx => {
      const accountRef = this._account(account.loginNameKey);
      const profileRef = this._profile(account.userId);
      const [accountDoc, profileDoc] = await Promise.all([tx.get(accountRef), tx.get(profileRef)]);
      if (accountDoc.exists) throw new DomainRuleError('Login name already exists');
      if (profileDoc.exists) throw new DomainRuleError('User profile already exists');
      tx.create(accountRef, account);
      tx.create(profileRef, profile);
      return { account, profile };
    });
  }

  async getAccountByLoginNameKey(loginNameKey) {
    const doc = await this._account(loginNameKey).get();
    return doc.exists ? doc.data() : null;
  }

  async getProfile(userId) {
    const doc = await this._profile(userId).get();
    return doc.exists ? doc.data() : null;
  }

  async saveProfile(profile) {
    if (!profile || !profile.userId) throw new DomainRuleError('Profile userId is required');
    await this._profile(profile.userId).set(profile);
    return profile;
  }

  async createSession(session) {
    if (!session || !session.tokenHash || !session.userId) throw new DomainRuleError('Incomplete session');
    await this._session(session.tokenHash).set(session);
    return session;
  }

  async getSession(tokenHash) {
    const doc = await this._session(tokenHash).get();
    return doc.exists ? doc.data() : null;
  }

  async deleteSession(tokenHash) {
    await this._session(tokenHash).delete();
    return { deleted: true };
  }
}

module.exports = { FirestoreAuthRepository };
