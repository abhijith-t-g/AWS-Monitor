import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../infrastructure/database/prisma';
import { getMetricsQueue } from '../../infrastructure/queue/queue';
import { triggerImmediateCollection } from '../../jobs/metrics/collect-metrics.job';
import { requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../../config/constants';

export class DashboardController {
  async showDashboard(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const [
      totalProjects,
      totalResources,
      recentSnapshots,
      pendingReports,
    ] = await Promise.all([
      prisma.project.count({ where: { active: true } }),
      prisma.aWSResource.count({ where: { active: true } }),
      // Most recent metric snapshots across all resources (last 24h)
      prisma.metricSnapshot.findMany({
        where: {
          timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { timestamp: 'desc' },
        take: 10,
        include: {
          resource: {
            select: { name: true, awsResourceId: true, project: { select: { name: true } } },
          },
        },
      }),
      prisma.report.count({ where: { status: 'PENDING' } }),
    ]);

    // Count resources by collection status (last snapshot per resource)
    const resourcesWithIssues = await prisma.metricSnapshot.groupBy({
      by: ['resourceId'],
      where: {
        timestamp: { gte: new Date(Date.now() - 15 * 60 * 1000) }, // last 15 min
        collectionStatus: { not: 'SUCCESS' },
      },
      _count: true,
    });

    const healthyResourceCount = totalResources - resourcesWithIssues.length;

    // Queue stats for system status panel
    let queueStats = null;
    try {
      const queue = getMetricsQueue();
      queueStats = {
        waiting: await queue.getWaitingCount(),
        active: await queue.getActiveCount(),
        failed: await queue.getFailedCount(),
      };
    } catch {
      // Redis may not be connected in degraded mode
    }

    return reply.view('dashboard/index.ejs', {
      title: 'Dashboard',
      user: request.user,
      stats: {
        totalProjects,
        totalResources,
        healthyResourceCount,
        resourcesWithIssues: resourcesWithIssues.length,
        pendingReports,
      },
      recentSnapshots,
      queueStats,
    });
  }

  async triggerCollection(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    await requirePermission(PERMISSIONS.SYSTEM_VIEW)(request, reply);
    const jobId = await triggerImmediateCollection();
    return reply.view('dashboard/partials/collection-triggered.ejs', { jobId });
  }
}

export const dashboardController = new DashboardController();
