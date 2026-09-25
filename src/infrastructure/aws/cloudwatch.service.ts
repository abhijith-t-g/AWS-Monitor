import {
  GetMetricStatisticsCommand,
  Statistic,
  type Datapoint,
} from '@aws-sdk/client-cloudwatch';
import { getCloudWatchClient } from './aws.client';
import { env } from '../../config/env';
import { AWSServiceError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { CW_NAMESPACE_EC2, CW_NAMESPACE_CW_AGENT } from '../../config/constants';

export interface MetricResult {
  average?: number;
  minimum?: number;
  maximum?: number;
  sum?: number;
  timestamp: Date;
}

interface GetMetricParams {
  region: string;
  namespace: string;
  metricName: string;
  dimensions: Array<{ Name: string; Value: string }>;
  statistics: Statistic[];
  startTime: Date;
  endTime: Date;
  periodSeconds?: number;
}

/**
 * Fetch a single CloudWatch metric. Returns the most recent datapoint or null if no data.
 *
 * NOTE ON MEMORY / DISK METRICS:
 * These require the CloudWatch Agent installed and configured on the EC2 instance.
 * The agent publishes to the "CWAgent" namespace with dimensions:
 *   - InstanceId
 *   - path (for disk metrics)
 *
 * If the CloudWatch Agent is not running on an instance, these metrics will return null.
 * The metric snapshot will record collectionStatus=PARTIAL in that case.
 */
async function getMetricStatistics(params: GetMetricParams): Promise<MetricResult | null> {
  const client = getCloudWatchClient(params.region);

  try {
    const response = await client.send(
      new GetMetricStatisticsCommand({
        Namespace: params.namespace,
        MetricName: params.metricName,
        Dimensions: params.dimensions,
        StartTime: params.startTime,
        EndTime: params.endTime,
        Period: params.periodSeconds ?? env.METRICS_PERIOD_SECONDS,
        Statistics: params.statistics,
      }),
    );

    const datapoints: Datapoint[] = response.Datapoints ?? [];
    if (datapoints.length === 0) return null;

    // Sort by timestamp descending, take the most recent
    datapoints.sort((a, b) => {
      const ta = a.Timestamp?.getTime() ?? 0;
      const tb = b.Timestamp?.getTime() ?? 0;
      return tb - ta;
    });

    const latest = datapoints[0]!;
    return {
      average: latest.Average,
      minimum: latest.Minimum,
      maximum: latest.Maximum,
      sum: latest.Sum,
      timestamp: latest.Timestamp ?? new Date(),
    };
  } catch (err) {
    const error = err as { name?: string; message?: string };
    logger.warn({
      msg: 'CloudWatch GetMetricStatistics failed',
      metricName: params.metricName,
      namespace: params.namespace,
      errorName: error.name,
      errorMessage: error.message,
    });
    throw new AWSServiceError(
      `CloudWatch metric ${params.metricName} unavailable: ${error.message ?? 'unknown'}`,
      error.name,
    );
  }
}

export interface EC2Metrics {
  cpuUtilization: MetricResult | null;
  concurrentUsers: MetricResult | null;
  networkIn: MetricResult | null;
  networkOut: MetricResult | null;
  memoryUtilization: MetricResult | null;
  diskUtilization: MetricResult | null;
}

/**
 * Collect all available metrics for an EC2 instance / AWS resource.
 * Focuses on CPU Utilization and Concurrent Users / Active Sessions.
 */
export async function collectEC2Metrics(
  instanceId: string,
  region: string,
  startTime: Date,
  endTime: Date,
): Promise<EC2Metrics> {
  const ec2Dimensions = [{ Name: 'InstanceId', Value: instanceId }];

  // Run metric fetches concurrently and isolate failures
  const [cpuResult, connResult, networkInResult, networkOutResult, memResult, diskResult] =
    await Promise.allSettled([
      // CPU — primary metric
      getMetricStatistics({
        region,
        namespace: CW_NAMESPACE_EC2,
        metricName: 'CPUUtilization',
        dimensions: ec2Dimensions,
        statistics: ['Average', 'Maximum', 'Minimum'],
        startTime,
        endTime,
      }),

      // Concurrent Users / Active Connections
      getMetricStatistics({
        region,
        namespace: CW_NAMESPACE_EC2,
        metricName: 'ActiveConnectionCount',
        dimensions: ec2Dimensions,
        statistics: ['Average', 'Maximum'],
        startTime,
        endTime,
      }),

      // Network In
      getMetricStatistics({
        region,
        namespace: CW_NAMESPACE_EC2,
        metricName: 'NetworkIn',
        dimensions: ec2Dimensions,
        statistics: ['Sum'],
        startTime,
        endTime,
      }),

      // Network Out
      getMetricStatistics({
        region,
        namespace: CW_NAMESPACE_EC2,
        metricName: 'NetworkOut',
        dimensions: ec2Dimensions,
        statistics: ['Sum'],
        startTime,
        endTime,
      }),

      // Memory — optional (CloudWatch Agent)
      getMetricStatistics({
        region,
        namespace: CW_NAMESPACE_CW_AGENT,
        metricName: 'mem_used_percent',
        dimensions: ec2Dimensions,
        statistics: ['Average'],
        startTime,
        endTime,
      }),

      // Disk — optional (CloudWatch Agent)
      getMetricStatistics({
        region,
        namespace: CW_NAMESPACE_CW_AGENT,
        metricName: 'disk_used_percent',
        dimensions: [
          ...ec2Dimensions,
          { Name: 'path', Value: '/' },
        ],
        statistics: ['Average'],
        startTime,
        endTime,
      }),
    ]);

  return {
    cpuUtilization: cpuResult.status === 'fulfilled' ? cpuResult.value : null,
    concurrentUsers: connResult.status === 'fulfilled' ? connResult.value : null,
    networkIn: networkInResult.status === 'fulfilled' ? networkInResult.value : null,
    networkOut: networkOutResult.status === 'fulfilled' ? networkOutResult.value : null,
    memoryUtilization: memResult.status === 'fulfilled' ? memResult.value : null,
    diskUtilization: diskResult.status === 'fulfilled' ? diskResult.value : null,
  };
}
