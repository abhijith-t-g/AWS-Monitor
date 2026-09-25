import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app/app';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'] ?? 'mysql://root:password@localhost:3306/aws_monitor_test';
  process.env['REDIS_URL'] = process.env['TEST_REDIS_URL'] ?? 'redis://localhost:6379/1';
  process.env['JWT_SECRET'] = 'test-jwt-secret-that-is-at-least-32-chars-long';
  process.env['CSRF_SECRET'] = 'test-csrf-secret-that-is-at-least-32-chars-long';

  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Auth routes', () => {
  it('GET /auth/login returns 200', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/login',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Sign In');
  });

  it('POST /auth/login without CSRF token returns 403', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: 'email=wrong%40test.com&password=wrongpassword',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('POST /auth/login with invalid credentials returns 401 when CSRF token is provided', async () => {
    const getRes = await app.inject({
      method: 'GET',
      url: '/auth/login',
    });
    expect(getRes.statusCode).toBe(200);

    const cookies = getRes.cookies;
    const csrfMatch = getRes.body.match(/name="_csrf" value="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      cookies: cookies.reduce((acc, c) => ({ ...acc, [c.name]: c.value }), {}),
      payload: `_csrf=${encodeURIComponent(csrfToken)}&email=wrong%40test.com&password=wrongpassword`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('GET /dashboard without auth redirects to login', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard',
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers['location']).toContain('/auth/login');
  });

  it('GET /projects without auth redirects to login', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/projects',
    });
    expect(response.statusCode).toBe(302);
  });
});

describe('Security', () => {
  it('helmet headers are set', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/login',
    });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  it('unknown routes return 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/nonexistent-route-xyz',
    });
    expect(response.statusCode).toBe(404);
  });
});
