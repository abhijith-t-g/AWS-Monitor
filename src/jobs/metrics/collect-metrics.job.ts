import { getMetricsQueue } from '../../infrastructure/queue/queue';
import { JOB_NAMES } from '../../config/constants';
import { env } from '../../config/env';
import { logger } from '../../shared/logger';

/**
 * Registers the repeatable "collect-all-metrics" cron job in BullMQ.
 * BullMQ handles the scheduling — NOT setInterval().
 *
 * The job is idempotent — calling this multiple times (e.g. on restart)
 * does not create duplicate schedules because BullMQ deduplicates by the
 * combination of (jobId + repeat key).
 */
export async function scheduleMetricsCollection(): Promise<void> {
  const queue = getMetricsQueue();

  await queue.add(
    JOB_NAMES.COLLECT_ALL_METRICS,
    { scheduledAt: new Date().toISOString() },
    {
      repeat: {
        pattern: env.METRICS_CRON, // default: */5 * * * *
      },
      jobId: 'collect-all-metrics-recurring',
      removeOnComplete: true,
    } as any,
  );

  logger.info({
    msg: 'Metrics collection schedule registered',
    cron: env.METRICS_CRON,
  });
}

/**
 * Trigger an immediate metric collection (useful for "collect now" admin action).
 */
export async function triggerImmediateCollection(): Promise<string | undefined> {
  const queue = getMetricsQueue();

  const job = await queue.add(
    JOB_NAMES.COLLECT_ALL_METRICS,
    { scheduledAt: new Date().toISOString() },
    {
      priority: 1, // High priority
    },
  );

  logger.info({ msg: 'Immediate metric collection triggered', jobId: job.id });
  return job.id;
}
