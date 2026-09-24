import 'dotenv/config';
import { z } from 'zod';

// ─── Environment validation ────────────────────────────────────────────────────
// The application fails fast on startup if required variables are missing or invalid.

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  APP_NAME: z.string().default('AWS Infrastructure Monitor'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),

  // CSRF
  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must be at least 32 characters'),

  // AWS (optional — prefer IAM roles when running inside AWS)
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_ENDPOINT_URL: z.string().url().optional().or(z.literal('')),

  // Metrics
  METRICS_CRON: z.string().default('*/5 * * * *'),
  METRICS_PERIOD_SECONDS: z.coerce.number().default(300),
  METRICS_RETENTION_DAYS: z.coerce.number().default(90),

  // Reports
  REPORTS_OUTPUT_DIR: z.string().default('./storage/reports'),

  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`\n❌  Environment validation failed:\n${issues}\n`);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();

export const isDev = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
