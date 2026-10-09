'use strict';

const crypto = require('crypto');
const { DomainRuleError } = require('../persistence/errors');
const { ROLE_WORLD_ADMIN, ensureWorldMembershipRoles, activeMemberships, membershipForUser } = require('../domain/world-memberships');
const { MAX_WORLD_SLOTS, MAX_ACTIVE_WORLDS_PER_USER } = require('../persistence/file-metadata-repository');
const { normalizeWorldName, normalizeWorldAccess } = require('../domain/world-metadata');
const { applyWorldDelta } = require('../domain/world-delta');
const {
  ROUND_STATUS_OPEN, ROUND_STATUS_LOCKING, ROUND_STATUS_MATCHDAY, ROUND_STATUS_FINALIZING,
  TIME_MODEL_COUNTDOWN, TIME_MODEL_FIXED_SCHEDULE,
  splitManagementDeltaByScope, scopeRevisionMap, mergeWorldDeltas
} = require('../domain/round-management');
const {
  hasConfiguredRoundSettings, normalizeRoundSettings, applyRoundSettings,
  sameRoundSettings, proposalPublicView
} = require('../domain/round-settings');

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function normalizeScheduleWeekdays(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(Number)
    .filter(value => Number.isInteger(value) && value >= 0 && value <= 6))).sort((a,b) => a-b);
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
  }).formatToParts(date);
  const out = {};
  parts.forEach(part => { if (part.type !== 'literal') out[part.type] = part.value; });
  return {
    year:Number(out.year), month:Number(out.month), day:Number(out.day),
    hour:Number(out.hour), minute:Number(out.minute), second:Number(out.second)
  };
}

function zonedLocalToUtc({ year, month, day, hour, minute }, timeZone) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i=0; i<4; i+=1) {
    const shown = zonedParts(new Date(guess), timeZone);
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
    const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = targetAsUtc - shownAsUtc;
    if (!delta) break;
    guess += delta;
  }
  return new Date(guess);
}

function nextFixedScheduleAt(settings, afterMs = Date.now()) {
  const weekdays = normalizeScheduleWeekdays(settings && settings.fixedScheduleWeekdays);
  const time = String(settings && settings.fixedScheduleTime || '');
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!weekdays.length || !match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const timeZone = String(settings && settings.timezone || 'UTC');
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(afterMs)); }
  catch (_) { return null; }

  const localNow = zonedParts(new Date(afterMs), timeZone);
  const localBaseUtc = Date.UTC(localNow.year, localNow.month - 1, localNow.day);
  for (let offset=0; offset<8; offset+=1) {
    const dayDate = new Date(localBaseUtc + offset * 86400000);
    const weekday = dayDate.getUTCDay();
    if (!weekdays.includes(weekday)) continue;
    const candidate = zonedLocalToUtc({
      year:dayDate.getUTCFullYear(), month:dayDate.getUTCMonth()+1, day:dayDate.getUTCDate(),
      hour, minute
    }, timeZone);
    if (candidate.getTime() > Number(afterMs) + 999) return candidate.toISOString();
  }
  return null;
}

class WorldSessionService {
  constructor({ metadataRepository, worldPersistence, runtimeManager, progressionEngine = null }) {
    if (!metadataRepository || !worldPersistence || !runtimeManager) throw new Error('WorldSessionService dependencies are required');
    this.metadata = metadataRepository;
    this.worlds = worldPersistence;
    this.runtime = runtimeManager;
    this.progressionEngine = progressionEngine;
  }

  _clubNamesById(record) {
    const clubs = record && record.gameState && record.gameState.clubs;
    const names = {};
    if (!clubs || !clubs.byId) return names;
    Object.keys(clubs.byId).forEach(clubId => {
      const club = clubs.byId[clubId];
      if (club) names[clubId] = club.name || club.clubName || clubId;
    });
    return names;
  }

  _roundConfig(record) {
    const members = activeMemberships(record);
    const coordinationEnabled = members.filter(row => Boolean(row.clubId)).length >= 2;
    const configured = hasConfiguredRoundSettings(record && record.runtimeSettings);
    const setupPending = members.length >= 2 && !configured;
    const setupRequired = coordinationEnabled && !configured;
    const settings = configured ? normalizeRoundSettings(record.runtimeSettings) : null;
    if (!coordinationEnabled || !configured) {
      return {
        configured, setupPending, setupRequired, coordinationEnabled,
        settings, timeModel:null, durationSeconds:null, fixedDeadlineAt:null,
        fixedScheduleWeekdays:[], fixedScheduleTime:null,
        timezone:settings ? settings.timezone : null
      };
    }
    const timeModel = settings.roundTimeModel;
    return {
      configured:true, setupPending:false, setupRequired:false, coordinationEnabled:true,
      settings, timeModel,
      durationSeconds:timeModel === TIME_MODEL_COUNTDOWN ? Number(settings.roundDurationSeconds) : null,
      fixedDeadlineAt:timeModel === TIME_MODEL_FIXED_SCHEDULE ? nextFixedScheduleAt(settings) : null,
      fixedScheduleWeekdays:timeModel === TIME_MODEL_FIXED_SCHEDULE ? normalizeScheduleWeekdays(settings.fixedScheduleWeekdays) : [],
      fixedScheduleTime:timeModel === TIME_MODEL_FIXED_SCHEDULE ? settings.fixedScheduleTime : null,
      timezone:String(settings.timezone || 'UTC')
    };
  }

  _publicRoundState(state, activeUserIds = null) {
    if (!state) return state;
    return {
      ...state,
      pendingRoundSettingsChange:proposalPublicView(state.pendingRoundSettingsChange, activeUserIds)
    };
  }

  async _ensureRound(worldId, revision, authoritativeRecord = null) {
    const record = authoritativeRecord || this.runtime.peekWorldRecord(worldId, revision) || await this.worlds.loadWorldRecord(worldId);
    const config = this._roundConfig(record);
    let state = await this.metadata.ensureWorldRound({
      worldId,
      revision:Number(revision),
      timeModel:config.timeModel,
      fixedDeadlineAt:config.fixedDeadlineAt,
      setupRequired:config.setupRequired,
        soloMode:!config.coordinationEnabled
    });
    if (state && state.status === ROUND_STATUS_FINALIZING &&
        Number(state.revision) !== Number(revision) &&
        state.leaseId && state.progressionRunId) {
      state = await this.metadata.completeWorldProgress({
        worldId,
        expectedRevision:Number(state.revision),
        nextRevision:Number(revision),
        leaseId:state.leaseId,
        roundGeneration:Number(state.roundGeneration),
        progressionRunId:state.progressionRunId,
        allowCommittedRecovery:true
      });
      state = await this.metadata.ensureWorldRound({
        worldId,
        revision:Number(revision),
        timeModel:config.timeModel,
        fixedDeadlineAt:config.fixedDeadlineAt,
        setupRequired:config.setupRequired,
        soloMode:!config.coordinationEnabled
      });
    }
    return {
      state:{
        ...state,
        timeModel:config.timeModel,
        timezone:config.timezone,
        fixedScheduleWeekdays:config.fixedScheduleWeekdays,
        fixedScheduleTime:config.fixedScheduleTime,
        roundSetupRequired:config.setupRequired,
        roundSetupPending:config.setupPending,
        coordinationEnabled:config.coordinationEnabled
      },
      config,
      record
    };
  }

  async _managementOverlayContext(worldId, revision) {
    const ensured = await this._ensureRound(worldId, revision);
    const rows = await this.metadata.getManagementScopes({
      worldId,
      roundGeneration:ensured.state.roundGeneration
    });
    return {
      ...ensured,
      rows,
      scopeRevisions:scopeRevisionMap(rows)
    };
  }

  _applyManagementOverlays(worldRecord, rows) {
    const effective = clone(worldRecord);
    for (const row of rows || []) {
      if (row && row.worldDelta) applyWorldDelta(effective, row.worldDelta);
    }
    return effective;
  }

  _mergeManagementOverlayDelta(worldId, rows, progressDelta) {
    let combined = null;
    for (const row of rows || []) {
      if (!row || !row.worldDelta) continue;
      combined = mergeWorldDeltas(combined, row.worldDelta);
    }
    if (progressDelta) combined = mergeWorldDeltas(combined, progressDelta);
    return combined || {
      schemaVersion:'kf-world-delta-0.31.0',
      worldId:String(worldId),
      ops:[]
    };
  }

  _buildMatchdayPlan(record, progressionState) {
    const world = record && record.gameState;
    const calendar = world && world.calendar || {};
    const slots = Array.isArray(calendar.slots) ? calendar.slots : [];
    const currentKey = String(calendar.currentSlotKey || '');
    const currentIndex = slots.findIndex(slot => slot && String(slot.key || '') === currentKey);
    const nextSlot = currentIndex >= 0 ? slots[currentIndex + 1] : null;
    const nextSlotKey = nextSlot && nextSlot.key ? String(nextSlot.key) : null;
    const fixtures = nextSlotKey
      ? (calendar.fixtures || []).filter(fixture => fixture && String(fixture.slotKey || '') === nextSlotKey && String(fixture.status || 'scheduled') !== 'played')
      : [];
    const members = activeMemberships(record);
    const memberByClubId = {};
    members.forEach(member => {
      if (member && member.clubId) memberByClubId[String(member.clubId)] = member;
    });
    const intents = progressionState && progressionState.matchIntentByUserId || {};
    const fixturePlans = fixtures.map(fixture => {
      const participants = [fixture.homeClubId, fixture.awayClubId].map(clubId => {
        const member = memberByClubId[String(clubId || '')];
        if (!member) return null;
        const userId = String(member.userProfileId);
        const intent = String(intents[userId] || 'QUICK').toUpperCase() === 'LIVE' ? 'LIVE' : 'QUICK';
        return {
          userId,
          trainerId:member.trainerId,
          clubId:String(clubId),
          intent,
          delegatedToCoTrainer:intent !== 'LIVE'
        };
      }).filter(Boolean);
      const liveUserIds = participants.filter(row => row.intent === 'LIVE').map(row => row.userId);
      const delegatedUserIds = participants.filter(row => row.delegatedToCoTrainer).map(row => row.userId);
      return {
        fixtureId:String(fixture.id),
        homeClubId:String(fixture.homeClubId || ''),
        awayClubId:String(fixture.awayClubId || ''),
        mode:liveUserIds.length ? 'LIVE' : 'QUICK',
        liveUserIds,
        delegatedUserIds,
        participants
      };
    });
    const liveUserIds = Array.from(new Set(fixturePlans.flatMap(row => row.liveUserIds)));
    const delegatedUserIds = Array.from(new Set(fixturePlans.flatMap(row => row.delegatedUserIds)));
    return {
      slotKey:nextSlotKey,
      fixturePlans,
      hasLiveFixtures:fixturePlans.some(row => row.mode === 'LIVE'),
      liveUserIds,
      delegatedUserIds
    };
  }

  async _effectiveRoundRecord(worldId, userId, revision, roundGeneration) {
    const baseRecord = userId
      ? (await this.runtime.openWorld({ userId, worldId })).worldRecord
      : this.runtime.peekWorldRecord(worldId, revision) || await this.worlds.loadWorldRecord(worldId);
    const rows = await this.metadata.getManagementScopes({ worldId, roundGeneration });
    return this._applyManagementOverlays(baseRecord, rows);
  }

  _assertLiveFixturesComplete(progressState) {
    const plan = progressState && progressState.matchdayPlan || {};
    const liveFixtureIds = (plan.fixturePlans || [])
      .filter(row => row && row.mode === 'LIVE')
      .map(row => String(row.fixtureId));
    if (!liveFixtureIds.length) return;
    const completed = new Set((plan.completedLiveFixtureIds || []).map(String));
    const pendingFixtureIds = liveFixtureIds.filter(id => !completed.has(id));
    if (pendingFixtureIds.length) {
      throw new DomainRuleError('Live matches are still running', { pendingFixtureIds });
    }
  }

  async markLiveFixtureCompleted({ userId, worldId, roundGeneration, progressionRunId, fixtureId }) {
    const participation = await this.metadata.getParticipation({ worldId, userId });
    if (!participation) throw new DomainRuleError('User is not a member of this world');
    const state = await this.metadata.getWorldProgression(worldId);
    if (!state || state.status !== ROUND_STATUS_MATCHDAY) throw new DomainRuleError('Matchday is not active');
    if (Number(state.roundGeneration) !== Number(roundGeneration) ||
        String(state.progressionRunId || '') !== String(progressionRunId || '')) {
      throw new DomainRuleError('Progression generation mismatch');
    }
    const fixturePlan = (((state.matchdayPlan||{}).fixturePlans)||[])
      .find(row => row && String(row.fixtureId) === String(fixtureId));
    if (!fixturePlan || fixturePlan.mode !== 'LIVE') throw new DomainRuleError('Live fixture is not part of this matchday');
    if (!(fixturePlan.liveUserIds || []).map(String).includes(String(userId))) {
      throw new DomainRuleError('Only a live participant may complete this fixture');
    }
    return this.metadata.markLiveFixtureCompleted({
      worldId,
      roundGeneration:Number(roundGeneration),
      progressionRunId,
      fixtureId
    });
  }

  async _claimProgressIfDue(worldId, revision, activeUserIds, actorUserId) {
    let state = await this.metadata.claimDueWorldProgress({
      worldId,
      expectedRevision:Number(revision),
      activeUserIds,
      leaseMs:120000
    });
    if (state && state.shouldAdvance && state.status === ROUND_STATUS_LOCKING) {
      const effectiveRecord = await this._effectiveRoundRecord(
        worldId,
        actorUserId || activeUserIds[0],
        revision,
        Number(state.roundGeneration)
      );
      const matchdayPlan = this._buildMatchdayPlan(effectiveRecord, state);
      const matchday = await this.metadata.beginMatchday({
        worldId,
        expectedRevision:Number(revision),
        roundGeneration:Number(state.roundGeneration),
        leaseId:state.leaseId,
        progressionRunId:state.progressionRunId,
        matchdayPlan
      });
      state = { ...state, ...matchday, shouldAdvance:true };
    }
    return state;
  }

  async _syncLobbyProjection(record) {
    const clubs = record && record.gameState && record.gameState.clubs;
    const config = this._roundConfig(record);
    const settings = config.settings || {};
    const derivedNextRoundAt = config.configured && config.timeModel === TIME_MODEL_FIXED_SCHEDULE
      ? nextFixedScheduleAt(settings)
      : null;
    return this.metadata.setWorldLobbyProjection({
      worldId: record.id,
      currentSeason: Number(record.gameState.meta && record.gameState.meta.seasonNumber || 1),
      maxPlayers: clubs && Array.isArray(clubs.order) ? clubs.order.length : 0,
      clubNamesById: this._clubNamesById(record),
      roundConfigured:config.configured,
      roundSetupRequired:config.setupRequired,
      roundTimeModel:config.timeModel,
      roundDurationSeconds:config.durationSeconds,
      nextRoundAt:derivedNextRoundAt,
      fixedScheduleWeekdays:config.fixedScheduleWeekdays,
      fixedScheduleTime:config.fixedScheduleTime,
      timezone:config.timezone
    });
  }

  async _repairLobbyProjectionIfLegacy(meta, userId) {
    if (!meta || !meta.worldId || !meta.membership) return meta;
    const membership = meta.membership;
    const legacyParticipation = !membership.projectionUpdatedAt || !membership.trainerId || !membership.role;
    const clubNames = meta.clubNamesById || {};
    const legacyWorld = !meta.projectionUpdatedAt || !Object.keys(clubNames).length || meta.currentSeason == null ||
      meta.maxPlayers == null || meta.roundConfigured == null;
    if (!legacyParticipation && !legacyWorld) return meta;

    const record = await this.worlds.loadWorldRecord(meta.worldId);
    if (!record) return meta;
    ensureWorldMembershipRoles(record);
    const authoritativeMembership = membershipForUser(record, userId);
    if (!authoritativeMembership) return meta;

    let projectedMembership = authoritativeMembership;
    try {
      if (legacyWorld) await this._syncLobbyProjection(record);
      projectedMembership = await this._syncParticipationProjection(meta.worldId, authoritativeMembership);
    } catch (error) {
      projectedMembership = clone(authoritativeMembership);
    }

    const clubs = record.gameState && record.gameState.clubs;
    return {
      ...meta,
      currentSeason:Number(record.gameState && record.gameState.meta && record.gameState.meta.seasonNumber || meta.currentSeason || 1),
      maxPlayers:clubs && Array.isArray(clubs.order) ? clubs.order.length : Number(meta.maxPlayers || 0),
      clubNamesById:this._clubNamesById(record),
      isMember:true,
      membership:clone(projectedMembership)
    };
  }

  async _syncParticipationProjection(worldId, membership) {
    if (!membership) return null;
    return this.metadata.setParticipationProjection({
      worldId,
      userId: membership.userProfileId,
      trainerId: membership.trainerId,
      clubId: membership.clubId || null,
      role: membership.role || 'PLAYER',
      trainerDisplayName: membership.trainerDisplayName || null
    });
  }

  _prepareInitialWorld(worldRecord, userId) {
    if (!worldRecord || !worldRecord.id || !worldRecord.gameState || !worldRecord.gameState.meta) throw new DomainRuleError('Initial WorldRecord is incomplete');
    if (String(worldRecord.gameState.meta.id) !== String(worldRecord.id)) throw new DomainRuleError('WorldRecord id and gameState.meta.id must match');
    const record = clone(worldRecord);
    record.createdByUserId = userId;
    const members = activeMemberships(record);
    if (members.length !== 1 || String(members[0].userProfileId) !== String(userId)) {
      throw new DomainRuleError('A new world must start with exactly one authenticated human user');
    }
    ensureWorldMembershipRoles(record);
    return record;
  }

  async _claimFreeSlot(worldId, userId, createdAt, worldMetadata) {
    let lastError = null;
    for (let slotId = 1; slotId <= MAX_WORLD_SLOTS; slotId += 1) {
      const slot = await this.metadata.getSlot(slotId);
      if (slot && slot.status === 'OCCUPIED') continue;
      try {
        return await this.metadata.createWorldRegistration({
          slotId, worldId, createdByUserId: userId, createdAt,
          worldName: worldMetadata.worldName,
          description: worldMetadata.description,
          visibility: worldMetadata.visibility,
          joinPolicy: worldMetadata.joinPolicy
        });
      } catch (error) {
        lastError = error;
        if (error && error.code === 'DOMAIN_RULE_VIOLATION' && /slot/i.test(String(error.message || ''))) continue;
        throw error;
      }
    }
    if (lastError) throw lastError;
    throw new DomainRuleError('No free world slot available');
  }

  async createWorld({ userId, worldRecord, worldName, description = '', visibility, joinPolicy, matches = [], financeEvents = [] }) {
    const record = this._prepareInitialWorld(worldRecord, userId);
    const access = normalizeWorldAccess({ visibility, joinPolicy });
    const worldMetadata = {
      worldName: normalizeWorldName(worldName),
      description: String(description || '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 200),
      visibility: access.visibility,
      joinPolicy: access.joinPolicy
    };
    const createdAt = record.createdAt || new Date().toISOString();
    const registration = await this._claimFreeSlot(record.id, userId, createdAt, worldMetadata);
    try {
      await this._syncLobbyProjection(record);
      await this._syncParticipationProjection(record.id, activeMemberships(record)[0]);
      const manifest = await this.worlds.initializeWorld({ worldRecord: record });
      if ((matches && matches.length) || (financeEvents && financeEvents.length)) {
        await this.worlds.commitRuntimeSnapshot({
          worldRecord: record,
          season: Number(record.gameState.meta.seasonNumber || 1),
          matches,
          financeEvents,
          expectedRevision: manifest.revision
        });
      }
      const opened = await this.runtime.openWorld({ worldId: record.id, userId });
      return { registration, ...opened };
    } catch (error) {
      await this.worlds.deleteWorld(record.id).catch(() => {});
      await this.metadata.deleteWorldRegistration({ worldId: record.id, expectedCreatedByUserId: userId }).catch(() => {});
      throw error;
    }
  }

  async listWorlds(userId) {
    const rows = await this.metadata.listLobbyWorlds(userId);
    const worlds = [];
    for (const meta of rows) {
      const manifest = await this.worlds.getManifest(meta.worldId);
      if (!manifest) continue;
      const effectiveMeta = await this._repairLobbyProjectionIfLegacy(meta, userId);
      const membership = effectiveMeta.membership || null;
      const clubName = membership && membership.clubId
        ? ((effectiveMeta.clubNamesById || {})[membership.clubId] || membership.clubId)
        : null;
      worlds.push({
        worldId: effectiveMeta.worldId,
        slotId: effectiveMeta.slotId,
        worldName: effectiveMeta.worldName || `Welt ${effectiveMeta.slotId}`,
        description: effectiveMeta.description || '',
        visibility: effectiveMeta.visibility || 'PRIVATE',
        joinPolicy: effectiveMeta.joinPolicy || 'INVITE_ONLY',
        createdAt: effectiveMeta.createdAt,
        createdByUserId: effectiveMeta.createdByUserId,
        revision: Number(manifest.revision),
        currentSeason: Number(effectiveMeta.currentSeason || manifest.currentSeason || 1),
        participantCount: Number(effectiveMeta.participantCount || 0),
        maxPlayers: Number(effectiveMeta.maxPlayers || 0),
        isMember: Boolean(membership),
        membership: membership ? clone(membership) : null,
        clubName,
        applicationStatus: effectiveMeta.applicationStatus || null,
        isAdmin: Boolean(membership && membership.role === ROLE_WORLD_ADMIN)
      });
    }
    return worlds.sort((a, b) => Number(a.slotId) - Number(b.slotId));
  }

  async joinWorld({ userId, displayName, worldId }) {
    const activeUserIds = await this.metadata.listActiveUserIdsForWorld(worldId);
    if (activeUserIds.length >= 18) throw new DomainRuleError('World already has the maximum of 18 human managers');
    const meta = await this.metadata.getWorld(worldId);
    if (!meta || meta.status !== 'ACTIVE') throw new DomainRuleError('Active world not found');
    if (meta.visibility !== 'PUBLIC' || meta.joinPolicy !== 'OPEN') throw new DomainRuleError('World does not allow direct joining');
    const record = await this.worlds.loadWorldRecord(worldId);
    ensureWorldMembershipRoles(record);
    if (membershipForUser(record, userId)) throw new DomainRuleError('User already participates in this world');
    const trainerId = 'trainer-' + crypto.randomUUID();
    const joinedAt = new Date().toISOString();
    record.memberships.byTrainerId[trainerId] = {
      trainerId,
      userProfileId:userId,
      clubId:null,
      status:'active',
      joinedAt,
      lastActivityAt:joinedAt,
      trainerDisplayName:String(displayName || 'Trainer').slice(0, 40),
      role:'PLAYER'
    };
    record.memberships.order.push(trainerId);
    const manifest = await this.worlds.getManifest(worldId);
    await this.metadata.addParticipationIndex({ worldId, userId, joinedAt });
    try {
      const next = await this.worlds.commitWorldRecord({ worldRecord:record, expectedRevision:manifest.revision });
      await this._syncParticipationProjection(worldId, record.memberships.byTrainerId[trainerId]).catch(() => {});
      await this.runtime.unloadWorld(worldId);
      return { revision:Number(next.revision), currentSeason:Number(next.currentSeason || manifest.currentSeason || 1), membership:clone(record.memberships.byTrainerId[trainerId]) };
    } catch (error) {
      await this.metadata.removeParticipationIndex({ worldId, userId }).catch(() => {});
      throw error;
    }
  }

  async applyToWorld({ userId, displayName, worldId }) {
    const activeWorldIds = await this.metadata.listActiveWorldIdsForUser(userId);
    if (activeWorldIds.length >= MAX_ACTIVE_WORLDS_PER_USER) {
      throw new DomainRuleError('User already participates in five active worlds');
    }
    return this.metadata.createWorldApplication({ worldId, userId, displayName });
  }

  async listApplications({ userId, worldId }) {
    const record = await this.worlds.loadWorldRecord(worldId);
    ensureWorldMembershipRoles(record);
    const actor = membershipForUser(record, userId);
    if (!actor || actor.role !== ROLE_WORLD_ADMIN) throw new DomainRuleError('Only a world admin may review applications');
    return this.metadata.listWorldApplications(worldId);
  }

  async resolveApplication({ actorUserId, worldId, applicantUserId, accept }) {
    const record = await this.worlds.loadWorldRecord(worldId);
    ensureWorldMembershipRoles(record);
    const actor = membershipForUser(record, actorUserId);
    if (!actor || actor.role !== ROLE_WORLD_ADMIN) throw new DomainRuleError('Only a world admin may review applications');
    const application = await this.metadata.getWorldApplication({ worldId, userId:applicantUserId });
    if (!application || application.status !== 'PENDING') throw new DomainRuleError('Pending application not found');
    if (!accept) {
      return this.metadata.resolveWorldApplication({ worldId, userId:applicantUserId, status:'REJECTED', resolvedByUserId:actorUserId });
    }
    const activeUserIds = await this.metadata.listActiveUserIdsForWorld(worldId);
    if (activeUserIds.length >= 18) throw new DomainRuleError('World already has the maximum of 18 human managers');
    const meta = await this.metadata.getWorld(worldId);
    if (!meta || meta.status !== 'ACTIVE' || meta.joinPolicy !== 'APPLICATION') throw new DomainRuleError('World does not accept applications');
    if (membershipForUser(record, applicantUserId)) throw new DomainRuleError('User already participates in this world');
    const trainerId='trainer-'+crypto.randomUUID();
    const joinedAt=new Date().toISOString();
    record.memberships.byTrainerId[trainerId]={
      trainerId,userProfileId:applicantUserId,clubId:null,status:'active',joinedAt,lastActivityAt:joinedAt,
      trainerDisplayName:String(application.displayName || 'Trainer').slice(0,40),role:'PLAYER'
    };
    record.memberships.order.push(trainerId);
    const manifest=await this.worlds.getManifest(worldId);
    await this.metadata.addParticipationIndex({ worldId, userId:applicantUserId, joinedAt });
    try {
      const next=await this.worlds.commitWorldRecord({ worldRecord:record, expectedRevision:manifest.revision });
      await this._syncParticipationProjection(worldId, record.memberships.byTrainerId[trainerId]).catch(() => {});
      await this.metadata.resolveWorldApplication({ worldId, userId:applicantUserId, status:'ACCEPTED', resolvedByUserId:actorUserId });
      await this.runtime.unloadWorld(worldId);
      return { revision:Number(next.revision), membership:clone(record.memberships.byTrainerId[trainerId]) };
    } catch(error) {
      await this.metadata.removeParticipationIndex({ worldId, userId:applicantUserId }).catch(()=>{});
      throw error;
    }
  }

  async leaveWorld({ userId, worldId, transferAdminToUserId = null }) {
    const record = await this.worlds.loadWorldRecord(worldId);
    ensureWorldMembershipRoles(record);
    const membership = membershipForUser(record, userId);
    if (!membership) throw new DomainRuleError('User is not a member of this world');
    const active = activeMemberships(record);
    if (active.length === 1) return this.deleteWorld({ userId, worldId });
    const admins=active.filter(row => row.role === ROLE_WORLD_ADMIN);
    if (membership.role === ROLE_WORLD_ADMIN && admins.length === 1) {
      if (!transferAdminToUserId) throw new DomainRuleError('Last world admin must transfer administration before leaving');
      const target=active.find(row => String(row.userProfileId) === String(transferAdminToUserId) && row !== membership);
      if (!target) throw new DomainRuleError('Admin transfer target is not an active world member');
      target.role=ROLE_WORLD_ADMIN;
    }
    const previousParticipation=await this.metadata.getParticipation({ worldId, userId });
    membership.status='left';
    membership.leftAt=new Date().toISOString();
    membership.clubId=null;
    const manifest=await this.worlds.getManifest(worldId);
    await this.metadata.removeParticipationIndex({ worldId, userId });
    let next;
    try {
      next=await this.worlds.commitWorldRecord({ worldRecord:record, expectedRevision:manifest.revision });
    } catch (error) {
      if (previousParticipation) {
        await this.metadata.addParticipationIndex({
          worldId,
          userId,
          joinedAt:previousParticipation.joinedAt || new Date().toISOString()
        }).catch(() => {});
      }
      throw error;
    }
    if (transferAdminToUserId) {
      const target = activeMemberships(record).find(row => String(row.userProfileId) === String(transferAdminToUserId));
      if (target) await this._syncParticipationProjection(worldId, target).catch(() => {});
    }
    await this.runtime.unloadWorld(worldId);
    return { deleted:false, revision:Number(next.revision) };
  }

  async deleteWorld({ userId, worldId }) {
    const record = await this.worlds.loadWorldRecord(worldId);
    ensureWorldMembershipRoles(record);
    const membership = membershipForUser(record, userId);
    const active=activeMemberships(record);
    if (!membership || membership.role !== ROLE_WORLD_ADMIN) throw new DomainRuleError('Only a world admin may delete a world');
    if (active.length > 1) throw new DomainRuleError('A world with other active players cannot be deleted');
    await this.runtime.unloadWorld(worldId);
    await this.metadata.deleteWorldRegistration({ worldId });
    await this.worlds.deleteWorld(worldId);
    return { deleted:true, worldId };
  }


  async _executeClaimedProgression(worldId, revision, state) {
    if (!state || !state.progressionRunId || !state.leaseId) return state;
    if (state.status === ROUND_STATUS_MATCHDAY) {
      const plan = state.matchdayPlan || {};
      const liveFixtureIds = (plan.fixturePlans || []).filter(row => row && row.mode === 'LIVE').map(row => String(row.fixtureId));
      const completed = new Set((plan.completedLiveFixtureIds || []).map(String));
      if (liveFixtureIds.some(id => !completed.has(id))) return state;
    }
    if (state.status !== ROUND_STATUS_MATCHDAY && state.status !== ROUND_STATUS_FINALIZING) return state;
    if (!this.progressionEngine) throw new Error('Server progression engine is not configured');

    let finalizing = state;
    if (state.status === ROUND_STATUS_MATCHDAY) {
      finalizing = await this.metadata.beginFinalizing({
        worldId,
        expectedRevision:Number(revision),
        roundGeneration:Number(state.roundGeneration),
        leaseId:state.leaseId,
        progressionRunId:state.progressionRunId
      });
    }

    const activeVotingUserIds = await this.metadata.listActiveUserIdsForWorld(worldId);
    finalizing = await this.metadata.evaluateRoundSettingsChangeForProgression({
      worldId,
      roundGeneration:Number(finalizing.roundGeneration),
      activeUserIds:activeVotingUserIds
    });

    const effectiveRecord = await this._effectiveRoundRecord(
      worldId,
      null,
      revision,
      Number(finalizing.roundGeneration)
    );
    const pendingRoundSettingsChange = finalizing.pendingRoundSettingsChange;
    if (pendingRoundSettingsChange && pendingRoundSettingsChange.status === 'APPROVED' &&
        Number(pendingRoundSettingsChange.effectiveRoundGeneration) <= Number(finalizing.roundGeneration) + 1) {
      effectiveRecord.runtimeSettings = applyRoundSettings(
        effectiveRecord.runtimeSettings,
        pendingRoundSettingsChange.proposedSettings
      );
    }
    const committed = await this.runtime.runServerProgression({
      worldId,
      effectiveWorldRecord:effectiveRecord,
      expectedRevision:Number(revision),
      progressionRunId:finalizing.progressionRunId,
      roundGeneration:Number(finalizing.roundGeneration),
      progressionLeaseId:finalizing.leaseId,
      engine:this.progressionEngine
    });

    await this.metadata.completeWorldProgress({
      worldId,
      expectedRevision:Number(revision),
      nextRevision:Number(committed.revision),
      leaseId:finalizing.leaseId,
      roundGeneration:Number(finalizing.roundGeneration),
      progressionRunId:finalizing.progressionRunId
    });
    await this._syncLobbyProjection(committed.worldRecord).catch(() => {});
    const ensured = await this._ensureRound(worldId, committed.revision, committed.worldRecord);
    return {
      ...ensured.state,
      revision:Number(committed.revision),
      advanceResult:committed.advanceResult || null,
      shouldAdvance:false
    };
  }

  async initializeRoundSettings({ userId, worldId, expectedRevision, settings }) {
    const opened = await this.runtime.openWorld({ userId, worldId });
    const record = opened.worldRecord;
    ensureWorldMembershipRoles(record);
    const membership = membershipForUser(record, userId);
    if (!membership || membership.role !== ROLE_WORLD_ADMIN) {
      throw new DomainRuleError('Only the world admin may configure the initial round settings');
    }
    if (hasConfiguredRoundSettings(record.runtimeSettings)) {
      throw new DomainRuleError('World round settings are already configured');
    }
    const normalized = normalizeRoundSettings(settings);
    const ensured = await this._ensureRound(worldId, opened.revision, record);
    if (!ensured.state.roundSetupPending) throw new DomainRuleError('World round settings do not require initial setup');
    if (ensured.state.status !== ROUND_STATUS_OPEN) throw new DomainRuleError('Initial round settings can only be configured while the world is open');

    const committed = await this.runtime.updateRoundSettings({
      worldId,
      userId,
      expectedRevision:Number(expectedRevision),
      roundSettings:normalized
    });
    const config = this._roundConfig(committed.worldRecord);
    const state = await this.metadata.ensureWorldRound({
      worldId,
      revision:Number(committed.revision),
      timeModel:config.timeModel,
      fixedDeadlineAt:config.fixedDeadlineAt,
      setupRequired:false
    });
    await this._syncLobbyProjection(committed.worldRecord).catch(() => {});
    const activeUserIds = await this.metadata.listActiveUserIdsForWorld(worldId);
    return {
      revision:Number(committed.revision),
      currentSeason:Number(committed.currentSeason || 1),
      committedAt:committed.committedAt,
      settings:clone(config.settings),
      progression:this._publicRoundState(state, activeUserIds)
    };
  }

  async proposeRoundSettingsChange({
    userId, worldId, settings, evaluationRoundGeneration = null, effectiveRoundGeneration = null
  }) {
    const opened = await this.runtime.openWorld({ userId, worldId });
    const record = opened.worldRecord;
    ensureWorldMembershipRoles(record);
    const membership = membershipForUser(record, userId);
    if (!membership || membership.role !== ROLE_WORLD_ADMIN) {
      throw new DomainRuleError('Only the world admin may propose round settings changes');
    }
    const currentConfig = this._roundConfig(record);
    if (!currentConfig.configured) throw new DomainRuleError('Initial round settings must be configured first');
    const normalized = normalizeRoundSettings(settings);
    if (sameRoundSettings(currentConfig.settings, normalized)) {
      throw new DomainRuleError('Proposed round settings are identical to the current settings');
    }

    const ensured = await this._ensureRound(worldId, opened.revision, record);
    const currentGeneration = Number(ensured.state.roundGeneration);
    const evaluation = evaluationRoundGeneration == null ? currentGeneration + 1 : Number(evaluationRoundGeneration);
    const effective = effectiveRoundGeneration == null ? evaluation + 1 : Number(effectiveRoundGeneration);
    await this.metadata.proposeRoundSettingsChange({
      worldId,
      userId,
      roundGeneration:currentGeneration,
      proposedSettings:normalized,
      evaluationRoundGeneration:evaluation,
      effectiveRoundGeneration:effective
    });
    const state = await this.metadata.getWorldProgression(worldId);
    const activeUserIds = await this.metadata.listActiveUserIdsForWorld(worldId);
    return this._publicRoundState(state, activeUserIds);
  }

  async castRoundSettingsVote({ userId, worldId, vote }) {
    const participation = await this.metadata.getParticipation({ worldId, userId });
    if (!participation) throw new DomainRuleError('User is not a member of this world');
    const before = await this.metadata.getWorldProgression(worldId);
    const pending = before && before.pendingRoundSettingsChange;
    if (!pending || pending.status !== 'VOTING') throw new DomainRuleError('No active round settings vote');
    if (String(pending.proposedByUserId) === String(userId) && String(vote || '').toUpperCase() !== 'YES') {
      throw new DomainRuleError('The proposing admin vote is fixed to YES');
    }
    await this.metadata.castRoundSettingsVote({ worldId, userId, vote });
    const state = await this.metadata.getWorldProgression(worldId);
    const activeUserIds = await this.metadata.listActiveUserIdsForWorld(worldId);
    return this._publicRoundState(state, activeUserIds);
  }

  async runDueProgression({ worldId }) {
    const manifest = await this.worlds.getManifest(worldId);
    if (!manifest) return null;
    const activeUserIds = await this.metadata.listActiveAssignedUserIdsForWorld(worldId);
    const ensured = await this._ensureRound(worldId, manifest.revision);
    let state = ensured.state;
    if (state.status === ROUND_STATUS_OPEN && (!ensured.config.coordinationEnabled || state.roundSetupRequired)) return state;
    if (state.status === ROUND_STATUS_OPEN || state.status === ROUND_STATUS_LOCKING || state.status === ROUND_STATUS_MATCHDAY) {
      state = await this._claimProgressIfDue(worldId, manifest.revision, activeUserIds, null) || state;
    }
    if (!this.progressionEngine) return state;
    if (state && (state.status === ROUND_STATUS_FINALIZING ||
        (state.shouldAdvance && state.status === ROUND_STATUS_MATCHDAY))) {
      return this._executeClaimedProgression(worldId, manifest.revision, { ...state, shouldAdvance:true });
    }
    if (state && state.status === ROUND_STATUS_MATCHDAY) {
      const plan = state.matchdayPlan || {};
      const liveFixtureIds = (plan.fixturePlans || []).filter(row => row && row.mode === 'LIVE').map(row => String(row.fixtureId));
      const completed = new Set((plan.completedLiveFixtureIds || []).map(String));
      if (liveFixtureIds.length && liveFixtureIds.every(id => completed.has(id))) {
        return this._executeClaimedProgression(worldId, manifest.revision, { ...state, shouldAdvance:true });
      }
    }
    return state;
  }

  async sweepDueProgressions() {
    const worldIds = typeof this.metadata.listActiveWorldIds === 'function'
      ? await this.metadata.listActiveWorldIds()
      : [];
    const results = [];
    for (const worldId of worldIds) {
      try {
        const state = await this.runDueProgression({ worldId });
        results.push({ worldId, ok:true, state:state ? { status:state.status, revision:state.revision, roundGeneration:state.roundGeneration } : null });
      } catch (error) {
        results.push({ worldId, ok:false, error:String(error && (error.code || error.message) || error) });
      }
    }
    return results;
  }

  async getProgression({ userId, worldId }) {
    const participation = await this.metadata.getParticipation({ worldId, userId });
    if (!participation) throw new DomainRuleError('User is not a member of this world');
    await this.runDueProgression({ worldId });
    const manifest = await this.worlds.getManifest(worldId);
    if (!manifest) throw new DomainRuleError('Active world not found');
    const activeAssignedUserIds = await this.metadata.listActiveAssignedUserIdsForWorld(worldId);
    const activeUserIds = await this.metadata.listActiveUserIdsForWorld(worldId);
    const { state } = await this._ensureRound(worldId, manifest.revision);
    const rows = await this.metadata.getManagementScopes({ worldId, roundGeneration:state.roundGeneration });
    return {
      ...this._publicRoundState(state, activeUserIds),
      activeTrainerCount:activeAssignedUserIds.length,
      readyTrainerCount:(state.readyUserIds || []).map(String).filter(id => activeAssignedUserIds.map(String).includes(id)).length,
      scopeRevisions:scopeRevisionMap(rows),
      shouldAdvance:false
    };
  }

  async markReady({ userId, worldId, expectedRevision, roundGeneration = null, matchIntent = 'QUICK' }) {
    const participation = await this.metadata.getParticipation({ worldId, userId });
    if (!participation) throw new DomainRuleError('User is not a member of this world');
    const manifest = await this.worlds.getManifest(worldId);
    if (!manifest) throw new DomainRuleError('Active world not found');
    if (!participation.clubId) throw new DomainRuleError('Trainer must control a club before completing a round');
    const activeUserIds = await this.metadata.listActiveAssignedUserIdsForWorld(worldId);
    if (Number(expectedRevision) !== Number(manifest.revision) && (activeUserIds.length <= 1 || roundGeneration == null)) {
      const error = new Error('World revision mismatch');
      error.code = 'PERSISTENCE_CONFLICT';
      error.details = { worldId, expectedRevision, actualRevision:manifest.revision };
      throw error;
    }
    const ensured = await this._ensureRound(worldId, manifest.revision);
    const config = ensured.config;
    if (config.setupRequired) throw new DomainRuleError('World round settings require initial setup');
    if (config.coordinationEnabled && config.timeModel === TIME_MODEL_FIXED_SCHEDULE) {
      throw new DomainRuleError('Fixed-schedule worlds do not use a Ready action');
    }
    if (roundGeneration != null && Number(roundGeneration) !== Number(ensured.state.roundGeneration)) {
      const error = new Error('Round generation mismatch');
      error.code = 'PERSISTENCE_CONFLICT';
      error.details = { worldId, expectedRoundGeneration:roundGeneration, actualRoundGeneration:ensured.state.roundGeneration };
      throw error;
    }
    const deadlineAt = config.coordinationEnabled ? new Date(Date.now() + config.durationSeconds * 1000).toISOString() : null;
    let result = await this.metadata.markTrainerReady({
      worldId,
      userId,
      expectedRevision:Number(manifest.revision),
      roundGeneration:Number(ensured.state.roundGeneration),
      activeUserIds,
      deadlineAt,
      timeModel:config.coordinationEnabled ? config.timeModel : TIME_MODEL_COUNTDOWN,
      matchIntent,
      leaseMs:120000
    });
    if (result.shouldAdvance && result.status === ROUND_STATUS_LOCKING) {
      const effectiveRecord = await this._effectiveRoundRecord(
        worldId,
        userId,
        manifest.revision,
        Number(result.roundGeneration)
      );
      const matchdayPlan = this._buildMatchdayPlan(effectiveRecord, result);
      const matchday = await this.metadata.beginMatchday({
        worldId,
        expectedRevision:Number(manifest.revision),
        roundGeneration:Number(result.roundGeneration),
        leaseId:result.leaseId,
        progressionRunId:result.progressionRunId,
        matchdayPlan
      });
      result = {
        ...result,
        ...matchday,
        shouldAdvance:true
      };
      if (!matchdayPlan.hasLiveFixtures && this.progressionEngine) {
        result = await this._executeClaimedProgression(worldId, manifest.revision, result);
      }
    }
    return result;
  }

  async releaseProgress({ userId, worldId, expectedRevision, leaseId }) {
    const participation = await this.metadata.getParticipation({ worldId, userId });
    if (!participation) throw new DomainRuleError('User is not a member of this world');
    return this.metadata.releaseWorldProgress({
      worldId,
      expectedRevision:Number(expectedRevision),
      leaseId
    });
  }

  async openWorld({ userId, worldId }) {
    const opened = await this.runtime.openWorld({ userId, worldId });
    const record = opened && opened.worldRecord;
    if (record) {
      ensureWorldMembershipRoles(record);
      const membership = membershipForUser(record, userId);
      await this._syncLobbyProjection(record).catch(() => {});
      if (membership) await this._syncParticipationProjection(worldId, membership).catch(() => {});
      const overlay = await this._managementOverlayContext(worldId, opened.revision);
      const effectiveRecord = this._applyManagementOverlays(record, overlay.rows);
      const activeUserIds = await this.metadata.listActiveUserIdsForWorld(worldId);
      return {
        ...opened,
        worldRecord:effectiveRecord,
        roundState:clone(this._publicRoundState(overlay.state, activeUserIds)),
        roundGeneration:Number(overlay.state.roundGeneration),
        scopeRevisions:clone(overlay.scopeRevisions)
      };
    }
    return opened;
  }

  async inspectWorldIntegrity({ userId, worldId }) {
    const participation = await this.metadata.getParticipation({ worldId, userId });
    if (!participation) throw new DomainRuleError('User is not a member of this world');
    return this.worlds.inspectWorldIntegrity(worldId);
  }

  async loadMatchDetail({ userId, worldId, matchId }) {
    return this.runtime.loadMatchDetail({ userId, worldId, matchId });
  }

  async saveWorld({ userId, worldId, worldRecord, expectedRevision, matches, financeEvents, progressLeaseId = null }) {
    const current = await this.runtime.openWorld({ userId, worldId });
    const multiplayer = activeMemberships(current.worldRecord).filter(row => Boolean(row.clubId)).length >= 2;
    let allowMultiplayerProgress = false;
    let progressState = null;
    if (progressLeaseId) {
      progressState = await this.metadata.getWorldProgression(worldId);
      const state = progressState;
      if (!state ||
          Number(state.revision) !== Number(expectedRevision) ||
          (state.status !== ROUND_STATUS_MATCHDAY && state.status !== ROUND_STATUS_FINALIZING) ||
          String(state.leaseId || '') !== String(progressLeaseId)) {
        throw new DomainRuleError('Progression lease mismatch');
      }
      allowMultiplayerProgress = true;
    } else if (multiplayer) {
      throw new DomainRuleError('Multiplayer snapshot progress requires a progress lease');
    }
    if (progressLeaseId && progressState) this._assertLiveFixturesComplete(progressState);

    let worldCommitted = false;
    try {
      if (progressLeaseId && progressState && progressState.status === ROUND_STATUS_MATCHDAY) {
        progressState = await this.metadata.beginFinalizing({
          worldId,
          expectedRevision:Number(expectedRevision),
          roundGeneration:Number(progressState.roundGeneration),
          leaseId:progressLeaseId,
          progressionRunId:progressState.progressionRunId
        });
      }
      let snapshotRecord = worldRecord;
      if (progressLeaseId && progressState) {
        const rows = await this.metadata.getManagementScopes({
          worldId,
          roundGeneration:Number(progressState.roundGeneration)
        });
        snapshotRecord = this._applyManagementOverlays(worldRecord, rows);
      }
      const result = await this.runtime.saveSnapshot({
        userId, worldId, worldRecord:snapshotRecord, expectedRevision, matches, financeEvents, allowMultiplayerProgress
      });
      worldCommitted = true;
      await this._syncLobbyProjection(snapshotRecord).catch(() => {});
      if (progressLeaseId) {
        await this.metadata.completeWorldProgress({
          worldId,
          expectedRevision:Number(expectedRevision),
          nextRevision:Number(result.revision),
          leaseId:progressLeaseId,
          roundGeneration:Number(progressState.roundGeneration),
          progressionRunId:progressState.progressionRunId || null
        });
      }
      return result;
    } catch (error) {
      if (progressLeaseId && !worldCommitted) {
        await this.metadata.releaseWorldProgress({
          worldId,
          expectedRevision:Number(expectedRevision),
          leaseId:progressLeaseId
        }).catch(() => {});
      }
      throw error;
    }
  }

  async saveManagementDelta({
    userId, worldId, worldDelta, expectedRevision,
    roundGeneration = null, expectedScopeRevisions = {}
  }) {
    const current = await this.runtime.openWorld({ userId, worldId });
    const assignedCount = activeMemberships(current.worldRecord).filter(row => Boolean(row.clubId)).length;
    if (assignedCount < 2) {
      return this.runtime.saveManagementDelta({
        userId,
        worldId,
        worldDelta,
        expectedRevision
      });
    }

    const manifest = await this.worlds.getManifest(worldId);
    if (!manifest) throw new DomainRuleError('Active world not found');
    const revisionDrift = Number(expectedRevision) !== Number(manifest.revision);
    if (revisionDrift && roundGeneration == null) {
      const error = new Error('World revision mismatch');
      error.code = 'PERSISTENCE_CONFLICT';
      error.details = { worldId, expectedRevision, actualRevision:manifest.revision };
      throw error;
    }

    const base = await this.runtime.openWorld({ userId, worldId });
    const membership = membershipForUser(base.worldRecord, userId);
    if (!membership) throw new DomainRuleError('User is not a member of this world');
    const overlay = await this._managementOverlayContext(worldId, manifest.revision);
    if (roundGeneration != null && Number(roundGeneration) !== Number(overlay.state.roundGeneration)) {
      const error = new Error('Round generation mismatch');
      error.code = 'PERSISTENCE_CONFLICT';
      error.details = { expectedRoundGeneration:roundGeneration, actualRoundGeneration:overlay.state.roundGeneration };
      throw error;
    }
    if (overlay.state.status !== ROUND_STATUS_OPEN) {
      throw new DomainRuleError('Round is locked for management changes', { status:overlay.state.status });
    }
    if ((overlay.state.readyUserIds || []).map(String).includes(String(userId))) {
      throw new DomainRuleError('Trainer is already ready for this round');
    }

    const effectiveRecord = this._applyManagementOverlays(base.worldRecord, overlay.rows);
    const scopeDeltas = splitManagementDeltaByScope(effectiveRecord, membership, worldDelta);
    const committed = await this.metadata.commitManagementScopes({
      worldId,
      userId,
      roundGeneration:Number(overlay.state.roundGeneration),
      expectedWorldRevision:Number(manifest.revision),
      scopeDeltas,
      expectedScopeRevisions:expectedScopeRevisions || {}
    });
    const rows = await this.metadata.getManagementScopes({
      worldId,
      roundGeneration:Number(overlay.state.roundGeneration)
    });
    return {
      revision:Number(manifest.revision),
      currentSeason:Number(manifest.currentSeason || base.currentSeason || 1),
      committedAt:new Date().toISOString(),
      roundGeneration:Number(committed.roundGeneration),
      scopeRevisions:scopeRevisionMap(rows)
    };
  }

  async saveSlot({ userId, worldId, worldRecord = null, worldDelta = null, expectedRevision, season, slotKey, matches, financeEvents, progressLeaseId = null }) {
    const setupManifest = await this.worlds.getManifest(worldId);
    if (!setupManifest) throw new DomainRuleError('Active world not found');
    const setupRound = await this._ensureRound(worldId, setupManifest.revision);
    if (setupRound.state.roundSetupRequired) {
      throw new DomainRuleError('World round settings require initial setup before slot progress');
    }
    const multiplayer = activeMemberships(setupRound.record).filter(row => Boolean(row.clubId)).length >= 2;
    if (multiplayer && !progressLeaseId) throw new DomainRuleError('Multiplayer slot progress requires a progress lease');
    let progressState = null;
    if (progressLeaseId) {
      progressState = await this.metadata.getWorldProgression(worldId);
      const state = progressState;
      if (!state ||
          Number(state.revision) !== Number(expectedRevision) ||
          (state.status !== ROUND_STATUS_MATCHDAY && state.status !== ROUND_STATUS_FINALIZING) ||
          String(state.leaseId || '') !== String(progressLeaseId)) {
        throw new DomainRuleError('Progression lease mismatch');
      }
    }
    if (progressLeaseId && progressState) this._assertLiveFixturesComplete(progressState);
    let worldCommitted = false;
    try {
      if (progressLeaseId && progressState && progressState.status === ROUND_STATUS_MATCHDAY) {
        progressState = await this.metadata.beginFinalizing({
          worldId,
          expectedRevision:Number(expectedRevision),
          roundGeneration:Number(progressState.roundGeneration),
          leaseId:progressLeaseId,
          progressionRunId:progressState.progressionRunId
        });
      }
      let progressWorldRecord = worldRecord;
      let progressWorldDelta = worldDelta;
      if (progressLeaseId && progressState) {
        const rows = await this.metadata.getManagementScopes({
          worldId,
          roundGeneration:Number(progressState.roundGeneration)
        });
        if (worldDelta) {
          progressWorldDelta = this._mergeManagementOverlayDelta(worldId, rows, worldDelta);
        } else if (worldRecord) {
          progressWorldRecord = this._applyManagementOverlays(worldRecord, rows);
        }
      }
      const result = await this.runtime.saveSlot({
        userId, worldId, worldRecord:progressWorldRecord, worldDelta:progressWorldDelta,
        expectedRevision, season, slotKey, matches, financeEvents
      });
      worldCommitted = true;
      if (progressLeaseId) {
        await this.metadata.completeWorldProgress({
          worldId,
          expectedRevision:Number(expectedRevision),
          nextRevision:Number(result.revision),
          leaseId:progressLeaseId,
          roundGeneration:Number(progressState.roundGeneration),
          progressionRunId:progressState.progressionRunId || null
        });
      }
      return result;
    } catch (error) {
      if (progressLeaseId && !worldCommitted) {
        await this.metadata.releaseWorldProgress({
          worldId,
          expectedRevision:Number(expectedRevision),
          leaseId:progressLeaseId
        }).catch(() => {});
      }
      throw error;
    }
  }

  async assignClub({ userId, worldId, clubId, expectedRevision }) {
    const manifest = await this.worlds.getManifest(worldId);
    if (!manifest) throw new DomainRuleError('Active world not found');
    const ensured = await this._ensureRound(worldId, manifest.revision);
    if (ensured.state.status !== ROUND_STATUS_OPEN) {
      throw new DomainRuleError('Club takeover paused during active round calculation');
    }
    const result = await this.runtime.assignClub({ userId, worldId, clubId, expectedRevision });
    await this._syncParticipationProjection(worldId, result.membership).catch(() => {});
    return result;
  }
}

module.exports = { WorldSessionService };
