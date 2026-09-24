import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  AWSServiceError,
  isAppError,
} from '../../src/shared/errors';

describe('Error classes', () => {
  it('ValidationError has status 400', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.isOperational).toBe(true);
  });

  it('AuthenticationError has status 401', () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTHENTICATION_ERROR');
  });

  it('AuthorizationError has status 403', () => {
    const err = new AuthorizationError();
    expect(err.statusCode).toBe(403);
  });

  it('NotFoundError has status 404 with resource name', () => {
    const err = new NotFoundError('Project');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Project not found');
  });

  it('AWSServiceError has status 502', () => {
    const err = new AWSServiceError('CloudWatch unavailable', 'ThrottlingException');
    expect(err.statusCode).toBe(502);
    expect(err.awsCode).toBe('ThrottlingException');
  });

  it('isAppError returns true for AppError instances', () => {
    expect(isAppError(new ValidationError('test'))).toBe(true);
    expect(isAppError(new Error('plain'))).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError('string')).toBe(false);
  });
});
