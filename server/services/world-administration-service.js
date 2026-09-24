'use strict';

const { DomainRuleError } = require('../persistence/errors');
const { canManageWorld, setWorldMembershipRole } = require('../domain/world-memberships');

class WorldAdministrationService {
  constructor({ metadataRepository, worldPersistence }) {
    if (!metadataRepository || !worldPersistence) throw new Error('WorldAdministrationService requires metadataRepository and worldPersistence');
    this.metadata = metadataRepository;
    this.worlds = worldPersistence;
  }

  async changeRole({ worldId, actorUserId, targetUserId, role, expectedRevision }) {
    const worldRecord = await this.worlds.loadWorldRecord(worldId);
    setWorldMembershipRole(worldRecord, { actorUserId, targetUserId, role });
    const manifest = await this.worlds.commitWorldRecord({ worldRecord, expectedRevision });
    return { manifest, role };
  }

  async createInvitation({ worldId, actorUserId, invitedUserId = null, inviteId, expiresAt = null }) {
    const worldRecord = await this.worlds.loadWorldRecord(worldId);
    if (!canManageWorld(worldRecord, actorUserId)) throw new DomainRuleError('Only a world admin may invite players');
    return this.metadata.createInvitation({
      worldId,
      invitedByUserId: actorUserId,
      invitedUserId,
      inviteId,
      expiresAt
    });
  }
}

module.exports = { WorldAdministrationService };
