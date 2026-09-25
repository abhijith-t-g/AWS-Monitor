import { ResourceType, MetricCollectionStatus } from '@prisma/client';
import { metricRepository } from './metric.repository';
import { resourceRepository } from '../resources/resource.repository';
import { collectEC2Metrics } from '../../infrastructure/aws/cloudwatch.service';
import { env } from '../../config/env';
import { logger } from '../../shared/logger';
import { METRIC_CHART_DEFAULT_HOURS } from '../../config/constants';

export class MetricService {
  /**
   * Collect metrics for a single AWS resource and persist to the database.
   * Returns collectionStatus indicating success, partial (some metrics missing), or failure.
   */
  async collectAndStoreMetrics(resourceId: string): Promise<MetricCollectionStatus> {
    // Worker looks up resource directly — no projectId filter (worker has system-level access)
    const resource = await resourceRepository.findById(resourceId);
    if (!resource) {
      logger.warn({ msg: 'Resource not found during metric collection', resourceId });
      return MetricCollectionStatus.FAILED;
    }

    // Determine time window: collect for the last METRICS_PERIOD_SECONDS
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - env.METRICS_PERIOD_SECONDS * 1000);
    // Round timestamp to the nearest period for idempotency
    const snapshotTimestamp = new Date(
      Math.floor(endTime.getTime() / (env.METRICS_PERIOD_SECONDS * 1000)) *
        (env.METRICS_PERIOD_SECONDS * 1000),
    );

    try {
      if (resource.resourceType === ResourceType.EC2_INSTANCE) {
        return await this.collectEC2(
          resource.awsResourceId,
          resource.region,
          resource.id,
          startTime,
          endTime,
          snapshotTimestamp,
        );
      }

      // Unsupported resource type — record partial
      await metricRepository.upsert({
        resourceId: resource.id,
        timestamp: snapshotTimestamp,
        collectionStatus: MetricCollectionStatus.PARTIAL,
        errorMessage: `Metric collection not yet implemented for resource type: ${resource.resourceType}`,
      });

      return MetricCollectionStatus.PARTIAL;
    } catch (err) {
      const error = err as Error;
      logger.error({
        msg: 'Metric collection failed',
        resourceId,
        error: error.message,
      });

      await metricRepository.upsert({
        resourceId: resource.id,
        timestamp: snapshotTimestamp,
        collectionStatus: MetricCollectionStatus.FAILED,
        errorMessage: error.message,
      });

      return MetricCollectionStatus.FAILED;
    }
  }

  private async collectEC2(
    awsInstanceId: string,
    region: string,
    dbResourceId: string,
    startTime: Date,
    endTime: Date,
    snapshotTimestamp: Date,
  ): Promise<MetricCollectionStatus> {
    const metrics = await collectEC2Metrics(awsInstanceId, region, startTime, endTime);

    // Determine collection status
    const hasCore = metrics.cpuUtilization !== null;
    const hasAll =
      hasCore &&
      metrics.networkIn !== null &&
      metrics.networkOut !== null &&
      metrics.memoryUtilization !== null &&
      metrics.diskUtilization !== null;

    let status: MetricCollectionStatus;
    let errorMessage: string | null = null;

    if (!hasCore) {
      status = MetricCollectionStatus.FAILED;
      errorMessage = 'No CPU metrics returned from CloudWatch — instance may be stopped or metrics not publishing';
    } else if (!hasAll) {
      status = MetricCollectionStatus.PARTIAL;
      const missing: string[] = [];
      if (!metrics.memoryUtilization) missing.push('memory');
      if (!metrics.diskUtilization) missing.push('disk');
      if (missing.length > 0) {
        errorMessage = `Partial metrics — ${missing.join(', ')} unavailable. CloudWatch Agent may not be installed/running.`;
      }
    } else {
      status = MetricCollectionStatus.SUCCESS;
    }

    await metricRepository.upsert({
      resourceId: dbResourceId,
      timestamp: snapshotTimestamp,
      cpuUtilization: metrics.cpuUtilization?.average ?? null,
      concurrentUsers: metrics.concurrentUsers?.average ?? metrics.concurrentUsers?.maximum ?? null,
      memoryUtilization: metrics.memoryUtilization?.average ?? null,
      diskUtilization: metrics.diskUtilization?.average ?? null,
      networkInBytes: metrics.networkIn?.sum != null ? BigInt(Math.round(metrics.networkIn.sum)) : null,
      networkOutBytes: metrics.networkOut?.sum != null ? BigInt(Math.round(metrics.networkOut.sum)) : null,
      collectionStatus: status,
      errorMessage,
    });

    logger.info({
      msg: 'Metric snapshot stored',
      resourceId: dbResourceId,
      awsInstanceId,
      status,
      cpuAvg: metrics.cpuUtilization?.average?.toFixed(2),
      concurrentUsers: metrics.concurrentUsers?.average,
    });

    return status;
  }

  async getMetricsForResource(
    resourceId: string,
    hours = METRIC_CHART_DEFAULT_HOURS,
    limit = 500,
  ) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);
    return metricRepository.findByResourceAndTimeRange(resourceId, startTime, endTime, limit);
  }

  async getAggregatesForResource(resourceId: string, startTime: Date, endTime: Date) {
    return metricRepository.getAggregates(resourceId, startTime, endTime);
  }

  async cleanupOldMetrics(): Promise<number> {
    return metricRepository.deleteOlderThan(env.METRICS_RETENTION_DAYS);
  }
}

export const metricService = new MetricService();
