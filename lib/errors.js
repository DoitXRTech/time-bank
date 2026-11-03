/**
 * Typed API errors. Each carries an HTTP status, a stable machine-readable `code`
 * (the client maps it to a Spanish message) and optional `metadata`.
 */

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', metadata = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.metadata = metadata;
  }
}

export class ValidationError extends AppError {
  constructor(message, metadata = {}) {
    super(message, 400, 'VALIDATION_ERROR', metadata);
  }
}

export class AuthenticationError extends AppError {
  constructor(message, metadata = {}) {
    super(message, 401, 'UNAUTHENTICATED', metadata);
  }
}

export class AuthorizationError extends AppError {
  constructor(message, metadata = {}) {
    super(message, 403, 'FORBIDDEN', metadata);
  }
}

export class NotFoundError extends AppError {
  constructor(message, metadata = {}) {
    super(message, 404, 'NOT_FOUND', metadata);
  }
}

export class MethodNotAllowedError extends AppError {
  constructor(allowed) {
    super('Method not allowed', 405, 'METHOD_NOT_ALLOWED', { allowed });
  }
}

export class ConflictError extends AppError {
  constructor(message, metadata = {}) {
    super(message, 409, 'CONFLICT', metadata);
  }
}

export class ExternalServiceError extends AppError {
  constructor(message, metadata = {}) {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR', metadata);
  }
}
