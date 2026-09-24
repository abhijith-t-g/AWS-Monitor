import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationError, AuthorizationError } from '../shared/errors';
import type { Permission } from '../config/constants';
import type { AuthenticatedUser } from '../modules/auth/auth.types';

// Extend Fastify's request type to carry the authenticated user
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

/**
 * Asserts that a valid JWT cookie is present and populates request.user.
 * Throws AuthenticationError if missing or invalid.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // The JWT plugin populates request.user via onRequest hook registered in app.ts
  if (!request.user) {
    const isHx = request.headers['hx-request'] === 'true';
    const isApi = request.url.startsWith('/api');
    if (isHx) {
      reply.header('HX-Redirect', '/auth/login');
      return reply.redirect('/auth/login');
    }
    if (!isApi) {
      return reply.redirect(`/auth/login?redirect=${encodeURIComponent(request.url)}`);
    }
    throw new AuthenticationError();
  }
}

/**
 * Higher-order function — returns a Fastify preHandler that checks
 * whether the authenticated user has ALL the specified permissions.
 */
export function requirePermission(...permissions: Permission[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new AuthenticationError();
    }

    const userPermissions = new Set(request.user.permissions);

    for (const perm of permissions) {
      if (!userPermissions.has(perm)) {
        throw new AuthorizationError();
      }
    }
  };
}
