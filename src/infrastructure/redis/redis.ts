import IORedis from 'ioredis';
import { env } from '../../config/env';
import { logger } from '../../shared/logger';

let redisInstance: IORedis | null = null;

export function getRedis(): IORedis {
  if (!redisInstance) {
    redisInstance = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,   // Required by BullMQ
      lazyConnect: true,
    });

    redisInstance.on('connect', () => {
      logger.info('Redis connected');
    });

    redisInstance.on('error', (err: Error) => {
      // Log error without exposing connection string (which may contain credentials)
      logger.error({ msg: 'Redis error', error: err.message });
    });

    redisInstance.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  return redisInstance;
}

export async function connectRedis(): Promise<void> {
  const redis = getRedis();
  await redis.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
}
