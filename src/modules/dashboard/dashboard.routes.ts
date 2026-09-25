import { FastifyInstance } from 'fastify';
import { dashboardController } from './dashboard.controller';
import { requireAuth, requirePermission, requireCsrf } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../../config/constants';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [requireAuth] }, (_req, reply) => reply.redirect('/dashboard'));
  app.get('/dashboard', { preHandler: [requireAuth] }, dashboardController.showDashboard.bind(dashboardController));
  app.post('/dashboard/collect-now', { preHandler: [requireAuth, requirePermission(PERMISSIONS.SYSTEM_VIEW), requireCsrf] }, dashboardController.triggerCollection.bind(dashboardController));
}
