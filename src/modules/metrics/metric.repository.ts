import { prisma } from '../../infrastructure/database/prisma';
import { MetricCollectionStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

export interface MetricSnapshotInput {
  resourceId: string;
  timestamp: Date;
  cpuUtilization?: number | null;
  memoryUtilization?: number | null;
  memoryUsedBytes?: bigint | null;
  diskUtilization?: number | null;
  diskUsedBytes?: bigint | null;
  diskPath?: string | null;
  networkInBytes?: bigint | null;
  networkOutBytes?: bigint | null;
  collectionStatus: MetricCollectionStatus;
  errorMessage?: string | null;
}

export class MetricRepository {
  /**
   * Upsert a metric snapshot — if a snapshot already exists for (resourceId, timestamp),
   * update it rather than throwing a duplicate error. Ensures idempotency.
   */
  async upsert(data: MetricSnapshotInput) {
    const create: Prisma.MetricSnapshotCreateInput = {
      resource: { connect: { id: data.resourceId } },
      timestamp: data.timestamp,
      cpuUtilization: data.cpuUtilization ?? null,
      memoryUtilization: data.memoryUtilization ?? null,
      memoryUsedBytes: data.memoryUsedBytes ?? null,
      diskUtilization: data.diskUtilization ?? null,
      diskUsedBytes: data.diskUsedBytes ?? null,
      diskPath: data.diskPath ?? '/',
      networkInBytes: data.networkInBytes ?? null,
      networkOutBytes: data.networkOutBytes ?? null,
      collectionStatus: data.collectionStatus,
      errorMessage: data.errorMessage ?? null,
    };

    const update: Prisma.MetricSnapshotUpdateInput = {
      cpuUtilization: data.cpuUtilization ?? null,
      memoryUtilization: data.memoryUtilization ?? null,
      memoryUsedBytes: data.memoryUsedBytes ?? null,
      diskUtilization: data.diskUtilization ?? null,
      diskUsedBytes: data.diskUsedBytes ?? null,
      diskPath: data.diskPath ?? '/',
      networkInBytes: data.networkInBytes ?? null,
      networkOutBytes: data.networkOutBytes ?? null,
      collectionStatus: data.collectionStatus,
      errorMessage: data.errorMessage ?? null,
    };

    return prisma.metricSnapshot.upsert({
      where: {
        resourceId_timestamp: {
          resourceId: data.resourceId,
          timestamp: data.timestamp,
        },
      },
      create,
      update,
    });
  }

  /**
   * Fetch metrics for a resource within a time range, paginated.
   * Ordered oldest → newest for charting.
   */
  async findByResourceAndTimeRange(
    resourceId: string,
    startTime: Date,
    endTime: Date,
    limit = 500,
  ) {
    return prisma.metricSnapshot.findMany({
      where: {
        resourceId,
        timestamp: { gte: startTime, lte: endTime },
        collectionStatus: { not: 'FAILED' },
      },
      orderBy: { timestamp: 'asc' },
      take: limit,
    });
  }

  /**
   * Get aggregated summary statistics for a resource over a time range.
   * Uses SQL aggregation — does NOT load all rows into memory.
   */
  async getAggregates(
    resourceId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<{
    avgCpu: number | null;
    minCpu: number | null;
    maxCpu: number | null;
    avgMemory: number | null;
    avgDisk: number | null;
    totalNetworkIn: bigint | null;
    totalNetworkOut: bigint | null;
    snapshotCount: number;
  }> {
    const result = await prisma.metricSnapshot.aggregate({
      where: {
        resourceId,
        timestamp: { gte: startTime, lte: endTime },
        collectionStatus: { not: 'FAILED' },
      },
      _avg: { cpuUtilization: true, memoryUtilization: true, diskUtilization: true },
      _min: { cpuUtilization: true },
      _max: { cpuUtilization: true },
      _sum: { networkInBytes: true, networkOutBytes: true },
      _count: { id: true },
    });

    return {
      avgCpu: result._avg.cpuUtilization,
      minCpu: result._min.cpuUtilization,
      maxCpu: result._max.cpuUtilization,
      avgMemory: result._avg.memoryUtilization,
      avgDisk: result._avg.diskUtilization,
      totalNetworkIn: result._sum.networkInBytes,
      totalNetworkOut: result._sum.networkOutBytes,
      snapshotCount: result._count.id,
    };
  }

  /** Delete snapshots older than retentionDays — run periodically for data hygiene */
  async deleteOlderThan(retentionDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const { count } = await prisma.metricSnapshot.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });
    return count;
  }

  /** Latest snapshot for each resource — used on the dashboard */
  async getLatestByResources(resourceIds: string[]) {
    if (resourceIds.length === 0) return [];

    // Get the latest snapshot for each resource using a subquery
    const latestTimestamps = await prisma.metricSnapshot.groupBy({
      by: ['resourceId'],
      where: { resourceId: { in: resourceIds } },
      _max: { timestamp: true },
    });

    const conditions = latestTimestamps.map((r) => ({
      resourceId: r.resourceId,
      timestamp: r._max.timestamp!,
    }));

    if (conditions.length === 0) return [];

    return prisma.metricSnapshot.findMany({
      where: { OR: conditions },
      orderBy: { timestamp: 'desc' },
    });
  }
}

export const metricRepository = new MetricRepository();
