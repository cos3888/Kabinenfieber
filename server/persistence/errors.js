'use strict';

class PersistenceConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PersistenceConflictError';
    this.code = 'PERSISTENCE_CONFLICT';
    this.details = details;
  }
}

class PersistenceNotFoundError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PersistenceNotFoundError';
    this.code = 'PERSISTENCE_NOT_FOUND';
    this.details = details;
  }
}

class DomainRuleError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DomainRuleError';
    this.code = 'DOMAIN_RULE_VIOLATION';
    this.details = details;
  }
}

module.exports = { PersistenceConflictError, PersistenceNotFoundError, DomainRuleError };
