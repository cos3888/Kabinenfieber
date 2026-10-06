'use strict';

const { DomainRuleError } = require('../persistence/errors');
const { TIME_MODEL_COUNTDOWN, TIME_MODEL_FIXED_SCHEDULE } = require('./round-management');

const COUNTDOWN_SECONDS = Object.freeze([600, 1800, 3600, 7200, 14400, 28800, 43200, 86400, 172800, 259200]);

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function normalizeWeekdays(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(Number)
    .filter(value => Number.isInteger(value) && value >= 0 && value <= 6))).sort((a,b) => a-b);
}

function validTimezone(timezone) {
  const value = String(timezone || '').trim();
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone:value }).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
}

function hasConfiguredRoundSettings(settings) {
  if (!settings || typeof settings !== 'object') return false;
  const mode = String(settings.roundTimeModel || '').toUpperCase();
  if (mode === TIME_MODEL_COUNTDOWN) {
    return COUNTDOWN_SECONDS.includes(Number(settings.roundDurationSeconds));
  }
  if (mode === TIME_MODEL_FIXED_SCHEDULE) {
    return normalizeWeekdays(settings.fixedScheduleWeekdays).length > 0 &&
      /^\d{2}:\d{2}$/.test(String(settings.fixedScheduleTime || '')) &&
      validTimezone(settings.timezone || 'UTC');
  }
  return false;
}

function normalizeRoundSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const mode = String(source.roundTimeModel || '').toUpperCase();
  const timezone = String(source.timezone || 'UTC').trim() || 'UTC';
  if (!validTimezone(timezone)) throw new DomainRuleError('Invalid round settings timezone');

  if (mode === TIME_MODEL_COUNTDOWN) {
    const seconds = Number(source.roundDurationSeconds);
    if (!COUNTDOWN_SECONDS.includes(seconds)) {
      throw new DomainRuleError('Unsupported countdown duration', { roundDurationSeconds:seconds });
    }
    return {
      roundTimeModel:TIME_MODEL_COUNTDOWN,
      roundDurationSeconds:seconds,
      timezone
    };
  }

  if (mode === TIME_MODEL_FIXED_SCHEDULE) {
    const weekdays = normalizeWeekdays(source.fixedScheduleWeekdays);
    const time = String(source.fixedScheduleTime || '');
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    if (!weekdays.length) throw new DomainRuleError('Fixed round times require at least one weekday');
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      throw new DomainRuleError('Fixed round times require a valid time');
    }
    return {
      roundTimeModel:TIME_MODEL_FIXED_SCHEDULE,
      fixedScheduleWeekdays:weekdays,
      fixedScheduleTime:time,
      timezone
    };
  }

  throw new DomainRuleError('Round settings mode is required');
}

function sameRoundSettings(a, b) {
  if (!hasConfiguredRoundSettings(a) || !hasConfiguredRoundSettings(b)) return false;
  const left = normalizeRoundSettings(a);
  const right = normalizeRoundSettings(b);
  return JSON.stringify(left) === JSON.stringify(right);
}

function voteSummary(proposal, eligibleUserIds = null) {
  const votes = proposal && proposal.votesByUserId && typeof proposal.votesByUserId === 'object'
    ? proposal.votesByUserId
    : {};
  const eligible = Array.isArray(eligibleUserIds) ? new Set(eligibleUserIds.map(String)) : null;
  let yes = 0;
  let no = 0;
  Object.keys(votes).forEach(userId => {
    if (eligible && !eligible.has(String(userId))) return;
    const vote = String(votes[userId] || '').toUpperCase();
    if (vote === 'YES') yes += 1;
    else if (vote === 'NO') no += 1;
  });
  const cast = yes + no;
  const requiredYes = Math.ceil(cast * 2 / 3);
  return {
    yes,
    no,
    cast,
    requiredYes,
    passed:cast > 0 && yes >= requiredYes,
    eligibleCount:eligible ? eligible.size : null,
    notVoted:eligible ? Math.max(0, eligible.size - cast) : null
  };
}

function proposalPublicView(proposal, eligibleUserIds = null) {
  if (!proposal) return null;
  return {
    ...clone(proposal),
    voteSummary:voteSummary(proposal, eligibleUserIds)
  };
}

module.exports = {
  COUNTDOWN_SECONDS,
  normalizeWeekdays,
  validTimezone,
  hasConfiguredRoundSettings,
  normalizeRoundSettings,
  sameRoundSettings,
  voteSummary,
  proposalPublicView
};
