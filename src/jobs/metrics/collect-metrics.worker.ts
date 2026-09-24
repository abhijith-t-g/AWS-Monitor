import { Worker, Job } from 'bullmq';
import { getRedis } from '../../infrastructure/redis/redis';
import { QUEUE_NAMES, JOB_NAMES } from '../../config/constants';
import { resourceRepository } from '../../modules/resources/resource.repository';
import { metricService } from '../../modules/metrics/metric.service';
import { getMetricsQueue } from '../../infrastructure/queue/queue';
import { logger } from '../../shared/logger';

export interface CollectAllMetricsJobData {
  scheduledAt: string; // ISO timestamp
}

export interface CollectResourceMetricsJobData {
  resourceId: string;
  awsResourceId: string;
  region: string;
  scheduledAt: string;
}

/**
 * Collect-All job: dispatched by the scheduler every 5 minutes.
 * Finds all active resources and enqueues individual resource jobs.
 * This pattern ensures a failure for one resource doesn't block others.
 */
async function handleCollectAllMetrics(job: Job<CollectAllMetricsJobData>): Promise<void> {
  logger.info({ msg: 'Starting metric collection run', jobId: job.id, scheduledAt: job.data.scheduledAt });

  const resources = await resourceRepository.findAllActive();
  if (resources.length === 0) {
    logger.info({ msg: 'No active resources to collect metrics for', jobId: job.id });
    return;
  }

  const queue = getMetricsQueue();

  // Enqueue one job per resource — isolated failures, concurrent processing
  await Promise.all(
    resources.map((resource) =>
      queue.add(
        JOB_NAMES.COLLECT_RESOURCE_METRICS,
        {
          resourceId: resource.id,
          awsResourceId: resource.awsResourceId,
          region: resource.region,
          scheduledAt: job.data.scheduledAt,
        } satisfies CollectResourceMetricsJobData,
        {
          jobId: `collect-resource-${resource.id}-${job.data.scheduledAt}`, // idempotent job ID
        },
      ),
    ),
  );

  logger.info({
    msg: `Enqueued ${resources.length} resource metric collection jobs`,
    jobId: job.id,
  });
}

/**
 * Collect-Resource job: collects metrics for a single AWS resource.
 * Uses idempotent job IDs so retries won't create duplicate snapshots.
 */
async function handleCollectResourceMetrics(
  job: Job<CollectResourceMetricsJobData>,
): Promise<void> {
  const { resourceId, awsResourceId, region } = job.data;

  logger.info({
    msg: 'Collecting metrics for resource',
    jobId: job.id,
    resourceId,
    awsResourceId,
    region,
  });

  const status = await metricService.collectAndStoreMetrics(resourceId);

  logger.info({
    msg: 'Resource metric collection complete',
    jobId: job.id,
    resourceId,
    status,
  });
}

/** Create and start the metrics BullMQ worker */
export function createMetricsWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.METRICS,
    async (job: Job) => {
      if (job.name === JOB_NAMES.COLLECT_ALL_METRICS) {
        await handleCollectAllMetrics(job as Job<CollectAllMetricsJobData>);
      } else if (job.name === JOB_NAMES.COLLECT_RESOURCE_METRICS) {
        await handleCollectResourceMetrics(job as Job<CollectResourceMetricsJobData>);
      } else {
        logger.warn({ msg: 'Unknown job name received by metrics worker', jobName: job.name });
      }
    },
    {
      connection: getRedis(),
      concurrency: 5, // Process up to 5 resource jobs simultaneously
      limiter: {
        max: 10,       // Max 10 jobs
        duration: 1000, // per 1 second (rate limit AWS API calls)
      },
    },
  );

  worker.on('completed', (job: Job) => {
    logger.debug({ msg: 'Metrics job completed', jobId: job.id, jobName: job.name });
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error({
      msg: 'Metrics job failed',
      jobId: job?.id,
      jobName: job?.name,
      attempt: job?.attemptsMade,
      error: err.message,
    });
  });

  worker.on('error', (err: Error) => {
    logger.error({ msg: 'Metrics worker error', error: err.message });
  });

  logger.info('Metrics worker started');
  return worker;
}
