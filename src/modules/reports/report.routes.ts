import { FastifyInstance } from 'fastify';
import { reportController } from './report.controller';
import { requireAuth, requirePermission, requireCsrf } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../../config/constants';

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  const canRead = requirePermission(PERMISSIONS.REPORTS_READ);
  const canGenerate = requirePermission(PERMISSIONS.REPORTS_GENERATE);

  app.get('/reports', { preHandler: [requireAuth, canRead] }, reportController.listReports.bind(reportController));
  app.get('/reports/new', { preHandler: [requireAuth, canGenerate] }, reportController.showCreateForm.bind(reportController));
  app.post('/reports', { preHandler: [requireAuth, canGenerate, requireCsrf] }, reportController.createReport.bind(reportController));
  app.get('/reports/:reportId', { preHandler: [requireAuth, canRead] }, reportController.showReport.bind(reportController));
  app.get('/reports/:reportId/status', { preHandler: [requireAuth, canRead] }, reportController.getReportStatus.bind(reportController));
  app.get('/reports/:reportId/download', { preHandler: [requireAuth, canRead] }, reportController.downloadReport.bind(reportController));
}
