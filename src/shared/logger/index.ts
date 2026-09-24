import pino from 'pino';
import { env } from '../../config/env';

export const logger = pino({
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
  // Redact sensitive fields from logs
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.passwordHash',
      'body.currentPassword',
      'body.newPassword',
      'AWS_SECRET_ACCESS_KEY',
      'awsSecretAccessKey',
      'secretAccessKey',
      'JWT_SECRET',
      'jwtSecret',
    ],
    censor: '[REDACTED]',
  },
});

export type Logger = typeof logger;
