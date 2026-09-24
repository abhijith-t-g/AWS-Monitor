import Fastify, { FastifyInstance } from 'fastify';
import path from 'path';
import fastifyHelmet from '@fastify/helmet';
import fastifyCookie from '@fastify/cookie';
import fastifyFormbody from '@fastify/formbody';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import ejs from 'ejs';
import { env } from '../config/env';
import { authRoutes } from '../modules/auth/auth.routes';
import { dashboardRoutes } from '../modules/dashboard/dashboard.routes';
import { projectRoutes } from '../modules/projects/project.routes';
import { resourceRoutes } from '../modules/resources/resource.routes';
import { reportRoutes } from '../modules/reports/report.routes';
import { metricRoutes } from '../modules/metrics/metric.routes';
import { userRoutes } from '../modules/users/user.routes';
import { registerErrorHandler } from '../middleware/error.middleware';
import { authService } from '../modules/auth/auth.service';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV !== 'production'
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            },
          }
        : {}),
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    trustProxy: true,
    bodyLimit: 1 * 1024 * 1024, // 1 MB request body limit
  });

  // ── Plugins ──────────────────────────────────────────────────────────────────
  await registerPlugins(app);

  // ── JWT/Auth hook — populates request.user on every request ────────────────
  app.addHook('onRequest', async (request) => {
    const token = request.cookies?.['auth_token'];
    if (token) {
      try {
        request.user = await authService.verifyToken(token);
      } catch {
        // Token invalid — request.user remains undefined, protected routes will redirect to login
      }
    }
  });

  // ── Error handler ─────────────────────────────────────────────────────────
  registerErrorHandler(app);

  // ── Routes ────────────────────────────────────────────────────────────────
  await registerRoutes(app);

  return app;
}

async function registerPlugins(app: FastifyInstance): Promise<void> {
  // Security headers
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'", // Needed by Tailwind CDN runtime compiler
          'https://cdn.tailwindcss.com',
          'https://cdn.jsdelivr.net',
          'https://unpkg.com',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://cdn.jsdelivr.net',
          'https://cdn.tailwindcss.com',
          'https://unpkg.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // Cookie support (for JWT HttpOnly cookie)
  await app.register(fastifyCookie);

  // Form body parsing (application/x-www-form-urlencoded for HTML forms)
  await app.register(fastifyFormbody);

  // Multipart form support (for file uploads if needed)
  await app.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  });

  // Rate limiting
  await app.register(fastifyRateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    skipOnError: true,
    keyGenerator: (request) => request.ip,
  });

  // Static files
  await app.register(fastifyStatic, {
    root: path.join(process.cwd(), 'public'),
    prefix: '/public/',
  });

  // EJS template engine
  await app.register(fastifyView, {
    engine: { ejs },
    root: path.join(process.cwd(), 'src/views'),
    layout: 'layouts/main.ejs',
    defaultContext: {
      // Globals available in all templates
      appName: env.APP_NAME,
    },
    options: {
      rmWhitespace: env.NODE_ENV === 'production',
    },
  });
}

async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes);
  await app.register(dashboardRoutes);
  await app.register(projectRoutes);
  await app.register(resourceRoutes);
  await app.register(reportRoutes);
  await app.register(metricRoutes);
  await app.register(userRoutes);
}
