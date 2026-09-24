import { FastifyInstance } from 'fastify';
import { FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../../config/constants';
import { metricService } from './metric.service';
import { resourceService } from '../resources/resource.service';
import { ValidationError } from '../../shared/errors';

export async function metricRoutes(app: FastifyInstance): Promise<void> {
  const canRead = requirePermission(PERMISSIONS.METRICS_READ);

  // Get metrics data as JSON for charts (HTMX/Chart.js)
  app.get(
    '/projects/:projectId/resources/:resourceId/metrics',
    { preHandler: [requireAuth, canRead] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { projectId: string; resourceId: string };
      const query = request.query as { hours?: string };

      // Verify resource belongs to project (IDOR prevention)
      await resourceService.getResource(params.resourceId, params.projectId);

      const hours = Math.min(parseInt(query.hours ?? '24', 10), 720);
      const snapshots = await metricService.getMetricsForResource(params.resourceId, hours);

      // Format for Chart.js
      type Snap = (typeof snapshots)[number];
      const toMB = (b: bigint | null) => b != null ? Number(b) / (1024 * 1024) : null;
      const chartData = {
        labels: snapshots.map((s: Snap) => s.timestamp.toISOString()),
        cpu: snapshots.map((s: Snap) => s.cpuUtilization),
        memory: snapshots.map((s: Snap) => s.memoryUtilization),
        disk: snapshots.map((s: Snap) => s.diskUtilization),
        networkIn: snapshots.map((s: Snap) => toMB(s.networkInBytes)),
        networkOut: snapshots.map((s: Snap) => toMB(s.networkOutBytes)),
      };

      if (request.headers['hx-request']) {
        return reply.view('metrics/partials/charts.ejs', {
          chartData: JSON.stringify(chartData),
          snapshots,
          hours,
        });
      }

      return reply.send(chartData);
    },
  );
}
