import { FastifyInstance } from 'fastify';
import { dashboardController } from './dashboard.controller';
import { requireAuth } from '../../middleware/auth.middleware';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [requireAuth] }, (_req, reply) => reply.redirect('/dashboard'));
  app.get('/dashboard', { preHandler: [requireAuth] }, dashboardController.showDashboard.bind(dashboardController));
  app.post('/dashboard/collect-now', { preHandler: [requireAuth] }, dashboardController.triggerCollection.bind(dashboardController));
}
