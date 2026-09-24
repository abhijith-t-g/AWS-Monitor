// Centralized application error hierarchy.
// HTTP routes catch these and return appropriate status codes.
// Stack traces are only logged server-side and never sent to clients in production.

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public readonly details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class AWSServiceError extends AppError {
  public readonly awsCode?: string;
  constructor(message: string, awsCode?: string) {
    super(message, 502, 'AWS_SERVICE_ERROR');
    this.awsCode = awsCode;
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'A database error occurred') {
    super(message, 500, 'DATABASE_ERROR', false);
  }
}

export class JobError extends AppError {
  constructor(message: string) {
    super(message, 500, 'JOB_ERROR', false);
  }
}

export function isAppError(err: unknown): err is AppError {
  return (
    err instanceof AppError ||
    (typeof err === 'object' &&
      err !== null &&
      'statusCode' in err &&
      'code' in err &&
      typeof (err as Record<string, unknown>)['code'] === 'string')
  );
}
