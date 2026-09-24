import { env } from '../config/env';
import { connectRedis, disconnectRedis } from '../infrastructure/redis/redis';
import { disconnectPrisma } from '../infrastructure/database/prisma';
import { destroyAWSClients } from '../infrastructure/aws/aws.client';
import { closeQueues } from '../infrastructure/queue/queue';
import { createMetricsWorker } from '../jobs/metrics/collect-metrics.worker';
import { createReportsWorker } from '../jobs/reports/generate-report.worker';
import { scheduleMetricsCollection } from '../jobs/metrics/collect-metrics.job';
import { logger } from '../shared/logger';
import type { Worker } from 'bullmq';

async function startWorker(): Promise<void> {
  logger.info(`Starting ${env.APP_NAME} background worker...`);

  await connectRedis();

  // Register the repeatable metrics collection schedule
  await scheduleMetricsCollection();

  // Start workers
  const workers: Worker[] = [
    createMetricsWorker(),
    createReportsWorker(),
  ];

  logger.info('All workers started and listening for jobs');

  const shutdown = async (signal: string) => {
    logger.info({ msg: 'Worker received shutdown signal', signal });

    // Close all workers gracefully (finish current jobs, don't accept new ones)
    await Promise.allSettled(workers.map((w) => w.close()));

    await closeQueues();
    await disconnectPrisma();
    destroyAWSClients();
    await disconnectRedis();

    logger.info('Worker graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void startWorker();
