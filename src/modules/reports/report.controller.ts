import { FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import { reportService } from './report.service';
import { createReportSchema } from './report.schema';
import { enqueueReportGeneration } from '../../jobs/reports/generate-report.worker';
import { requireAuth } from '../../middleware/auth.middleware';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { prisma } from '../../infrastructure/database/prisma';

export class ReportController {
  async listReports(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = request.query as Record<string, string>;
    const page = parseInt(query['page'] ?? '1', 10);

    const { reports, total, totalPages } = await reportService.listReports(
      request.user!.id,
      page,
    );

    if (request.headers['hx-request']) {
      return reply.view('reports/partials/table.ejs', { reports, page, totalPages, total });
    }

    return reply.view('reports/index.ejs', {
      title: 'Reports',
      reports,
      total,
      page,
      totalPages,
      user: request.user,
    });
  }

  async showCreateForm(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const projects = await prisma.project.findMany({
      where: { active: true },
      include: {
        resources: {
          where: { active: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    return reply.view('reports/form.ejs', {
      title: 'Generate Report',
      projects,
      errors: null,
      user: request.user,
    });
  }

  async createReport(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const parseResult = createReportSchema.safeParse(request.body);
    if (!parseResult.success) {
      const projects = await prisma.project.findMany({
        where: { active: true },
        include: {
          resources: {
            where: { active: true },
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      });
      return reply.status(400).view('reports/form.ejs', {
        title: 'Generate Report',
        projects,
        errors: parseResult.error.flatten().fieldErrors,
        user: request.user,
      });
    }

    const { name, resourceIds, startDate, endDate, includeMetrics } = parseResult.data;

    const reportId = await reportService.createReportJob(request.user!.id, name, {
      resourceIds,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      includeMetrics,
    });

    await enqueueReportGeneration(reportId, request.user!.id);

    await prisma.auditLog.create({
      data: {
        userId: request.user!.id,
        action: 'report.create',
        target: 'Report',
        targetId: reportId,
        metadata: { name },
        ipAddress: request.ip,
      },
    });

    return reply.redirect(`/reports/${reportId}`);
  }

  async showReport(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { reportId: string };
    const report = await reportService.getReport(params.reportId, request.user!.id);
    if (!report) throw new NotFoundError('Report');

    return reply.view('reports/show.ejs', {
      title: report.name,
      report,
      user: request.user,
    });
  }

  /** Poll endpoint for HTMX — returns the current report status badge */
  async getReportStatus(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { reportId: string };
    const report = await reportService.getReport(params.reportId, request.user!.id);
    if (!report) throw new NotFoundError('Report');

    return reply.view('reports/partials/status-badge.ejs', { report });
  }

  async downloadReport(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { reportId: string };
    const report = await reportService.getReport(params.reportId, request.user!.id);

    if (!report) throw new NotFoundError('Report');
    if (report.status !== 'COMPLETED' || !report.filePath) {
      throw new ValidationError('Report is not ready for download');
    }

    if (!fs.existsSync(report.filePath)) {
      throw new NotFoundError('Report file');
    }

    const filename = path.basename(report.filePath);
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${report.name.replace(/"/g, '')}.xlsx"`)
      .send(fs.createReadStream(report.filePath));
  }
}

export const reportController = new ReportController();
