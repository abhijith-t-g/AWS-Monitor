import { Worker, Job } from 'bullmq';
import { getRedis } from '../../infrastructure/redis/redis';
import { QUEUE_NAMES, JOB_NAMES } from '../../config/constants';
import { reportService } from '../../modules/reports/report.service';
import { getReportsQueue } from '../../infrastructure/queue/queue';
import { logger } from '../../shared/logger';

export interface GenerateReportJobData {
  reportId: string;
  requestedBy: string;
}

export function createReportsWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAMES.REPORTS,
    async (job: Job<GenerateReportJobData>) => {
      const { reportId, requestedBy } = job.data;

      logger.info({
        msg: 'Starting report generation',
        jobId: job.id,
        reportId,
        requestedBy,
      });

      await reportService.generateExcel(reportId);

      logger.info({
        msg: 'Report generation complete',
        jobId: job.id,
        reportId,
      });
    },
    {
      connection: getRedis(),
      concurrency: 2, // Limit concurrent report generation (CPU/memory intensive)
    },
  );

  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error({
      msg: 'Report generation job failed',
      jobId: job?.id,
      reportId: (job?.data as GenerateReportJobData | undefined)?.reportId,
      attempt: job?.attemptsMade,
      error: err.message,
    });
  });

  worker.on('error', (err: Error) => {
    logger.error({ msg: 'Reports worker error', error: err.message });
  });

  logger.info('Reports worker started');
  return worker;
}

export async function enqueueReportGeneration(reportId: string, requestedBy: string): Promise<string | undefined> {
  const queue = getReportsQueue();
  const job = await queue.add(
    JOB_NAMES.GENERATE_REPORT,
    { reportId, requestedBy } satisfies GenerateReportJobData,
  );
  return job.id;
}
