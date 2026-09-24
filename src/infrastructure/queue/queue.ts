import { Queue, QueueEvents } from 'bullmq';
import { getRedis } from '../../infrastructure/redis/redis';
import { QUEUE_NAMES } from '../../config/constants';
import { logger } from '../../shared/logger';

// ─── Metrics Queue ────────────────────────────────────────────────────────────

let metricsQueue: Queue | null = null;

export function getMetricsQueue(): Queue {
  if (!metricsQueue) {
    metricsQueue = new Queue(QUEUE_NAMES.METRICS, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // 5 seconds initial delay
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });

    metricsQueue.on('error', (err: Error) => {
      logger.error({ msg: 'Metrics queue error', error: err.message });
    });
  }

  return metricsQueue;
}

// ─── Reports Queue ────────────────────────────────────────────────────────────

let reportsQueue: Queue | null = null;

export function getReportsQueue(): Queue {
  if (!reportsQueue) {
    reportsQueue = new Queue(QUEUE_NAMES.REPORTS, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    });

    reportsQueue.on('error', (err: Error) => {
      logger.error({ msg: 'Reports queue error', error: err.message });
    });
  }

  return reportsQueue;
}

/** Gracefully close all queues */
export async function closeQueues(): Promise<void> {
  await Promise.allSettled([
    metricsQueue?.close(),
    reportsQueue?.close(),
  ]);
  metricsQueue = null;
  reportsQueue = null;
}
