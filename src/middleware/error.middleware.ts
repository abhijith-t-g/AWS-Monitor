import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { isAppError, AuthenticationError, ValidationError } from '../shared/errors';
import { isProd } from '../config/env';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(async (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    // Zod validation errors from route schemas
    if (error instanceof ZodError) {
      return reply.status(400).view('error.ejs', {
        title: 'Validation Error',
        message: 'Invalid input data',
        details: error.flatten().fieldErrors,
      });
    }

    // Application errors (expected, operational)
    if (isAppError(error)) {
      request.log.warn({
        err: error.message,
        code: error.code,
        statusCode: error.statusCode,
        url: request.url,
      });

      // Authentication errors redirect to login
      if (error instanceof AuthenticationError || error.code === 'AUTHENTICATION_ERROR') {
        return reply.redirect(`/auth/login?redirect=${encodeURIComponent(request.url)}`);
      }

      return reply.status(error.statusCode).view('error.ejs', {
        title: error.code.replace(/_/g, ' '),
        message: error.message,
        details: error instanceof ValidationError ? error.details : undefined,
      });
    }

    // Fastify's built-in validation errors (JSON schema)
    const fastifyError = error as { statusCode?: number; message?: string; validation?: unknown };
    if (fastifyError.statusCode && fastifyError.statusCode < 500) {
      return reply.status(fastifyError.statusCode).view('error.ejs', {
        title: 'Bad Request',
        message: fastifyError.message ?? 'Bad request',
      });
    }

    // Unexpected / programmer errors — log full error server-side
    request.log.error({
      err: error,
      url: request.url,
      method: request.method,
    });

    return reply.status(500).view('error.ejs', {
      title: 'Internal Server Error',
      message: isProd
        ? 'An unexpected error occurred. Please try again later.'
        : (error instanceof Error ? error.message : 'Unknown error'),
    });
  });

  // 404 handler
  app.setNotFoundHandler(async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(404).view('error.ejs', {
      title: 'Not Found',
      message: 'The page you are looking for does not exist.',
    });
  });
}
