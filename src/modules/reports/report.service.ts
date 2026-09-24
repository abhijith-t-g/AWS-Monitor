import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../../infrastructure/database/prisma';
import { metricRepository } from '../metrics/metric.repository';
import { env } from '../../config/env';
import { logger } from '../../shared/logger';
import { ReportStatus, Prisma } from '@prisma/client';
import type { ReportParameters } from './report.schema';

export class ReportService {
  async listReports(userId: string, page = 1, pageSize = 25) {
    const where = { requestedBy: userId };
    const [total, reports] = await prisma.$transaction([
      prisma.report.count({ where }),
      prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, reports, totalPages: Math.ceil(total / pageSize) };
  }

  async createReportJob(userId: string, name: string, params: ReportParameters): Promise<string> {
    const report = await prisma.report.create({
      data: {
        name,
        requestedBy: userId,
        status: ReportStatus.PENDING,
        parameters: params as unknown as Prisma.InputJsonValue,
      },
    });
    return report.id;
  }

  async getReport(reportId: string, userId: string) {
    return prisma.report.findFirst({
      where: { id: reportId, requestedBy: userId },
    });
  }

  /**
   * Generate the Excel file for a report.
   * Called by the BullMQ worker — never called directly by an HTTP handler.
   */
  async generateExcel(reportId: string): Promise<void> {
    const report = await prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new Error(`Report ${reportId} not found`);

    await prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.PROCESSING },
    });

    try {
      const params = report.parameters as unknown as ReportParameters;
      const startDate = new Date(params.startDate);
      const endDate = new Date(params.endDate);

      // Fetch all resources referenced in the report
      const resources = await prisma.aWSResource.findMany({
        where: { id: { in: params.resourceIds } },
        include: { project: { select: { name: true } } },
      });

      // Build workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'AWS Infrastructure Monitor';
      workbook.created = new Date();

      // ── Summary Sheet ────────────────────────────────────────────────────────
      const summarySheet = workbook.addWorksheet('Summary', {
        pageSetup: { fitToPage: true, orientation: 'landscape' },
      });

      this.styleSummarySheet(summarySheet, report.name, startDate, endDate, resources, params);

      // Compute aggregates per resource
      for (const resource of resources) {
        const aggregates = await metricRepository.getAggregates(resource.id, startDate, endDate);
        summarySheet.addRow([
          resource.name,
          resource.awsResourceId,
          resource.project.name,
          resource.region,
          aggregates.avgCpu?.toFixed(2) ?? 'N/A',
          aggregates.minCpu?.toFixed(2) ?? 'N/A',
          aggregates.maxCpu?.toFixed(2) ?? 'N/A',
          aggregates.avgMemory?.toFixed(2) ?? 'N/A',
          aggregates.avgDisk?.toFixed(2) ?? 'N/A',
          aggregates.totalNetworkIn != null
            ? this.bytesToMB(aggregates.totalNetworkIn)
            : 'N/A',
          aggregates.totalNetworkOut != null
            ? this.bytesToMB(aggregates.totalNetworkOut)
            : 'N/A',
          aggregates.snapshotCount,
        ]);
      }

      // ── Detail Sheet ─────────────────────────────────────────────────────────
      const detailSheet = workbook.addWorksheet('Detailed Metrics');
      this.styleDetailSheet(detailSheet, params.includeMetrics);

      for (const resource of resources) {
        const snapshots = await metricRepository.findByResourceAndTimeRange(
          resource.id,
          startDate,
          endDate,
          10000, // cap at 10k rows per resource
        );

        for (const snap of snapshots) {
          const row: (string | number | null)[] = [
            snap.timestamp.toISOString(),
            resource.name,
            resource.awsResourceId,
            resource.project.name,
            snap.collectionStatus,
          ];

          if (params.includeMetrics.includes('cpu')) {
            row.push(snap.cpuUtilization != null ? Number(snap.cpuUtilization.toFixed(2)) : null);
          }
          if (params.includeMetrics.includes('memory')) {
            row.push(snap.memoryUtilization != null ? Number(snap.memoryUtilization.toFixed(2)) : null);
          }
          if (params.includeMetrics.includes('disk')) {
            row.push(snap.diskUtilization != null ? Number(snap.diskUtilization.toFixed(2)) : null);
          }
          if (params.includeMetrics.includes('network')) {
            row.push(
              snap.networkInBytes != null ? this.bytesToMB(snap.networkInBytes) : null,
              snap.networkOutBytes != null ? this.bytesToMB(snap.networkOutBytes) : null,
            );
          }

          detailSheet.addRow(row);
        }
      }

      // Save workbook to disk
      const outputDir = env.REPORTS_OUTPUT_DIR;
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filename = `report-${reportId}-${Date.now()}.xlsx`;
      const filePath = path.join(outputDir, filename);

      await workbook.xlsx.writeFile(filePath);

      await prisma.report.update({
        where: { id: reportId },
        data: {
          status: ReportStatus.COMPLETED,
          filePath,
          completedAt: new Date(),
        },
      });

      logger.info({ msg: 'Report generated', reportId, filePath });
    } catch (err) {
      const error = err as Error;
      logger.error({ msg: 'Report generation failed', reportId, error: error.message });

      await prisma.report.update({
        where: { id: reportId },
        data: {
          status: ReportStatus.FAILED,
          errorMessage: error.message,
        },
      });

      throw err;
    }
  }

  private styleSummarySheet(
    sheet: ExcelJS.Worksheet,
    reportName: string,
    startDate: Date,
    endDate: Date,
    resources: Array<{ name: string }>,
    params: ReportParameters,
  ) {
    sheet.mergeCells('A1:L1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = reportName;
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: 'center' };

    sheet.getCell('A2').value = `Period: ${startDate.toLocaleDateString()} — ${endDate.toLocaleDateString()}`;
    sheet.getCell('A3').value = `Resources: ${resources.length} | Metrics: ${params.includeMetrics.join(', ')}`;
    sheet.getCell('A4').value = `Generated: ${new Date().toISOString()}`;

    const headers = [
      'Resource Name',
      'AWS Resource ID',
      'Project',
      'Region',
      'Avg CPU %',
      'Min CPU %',
      'Max CPU %',
      'Avg Memory %',
      'Avg Disk %',
      'Net In (MB)',
      'Net Out (MB)',
      'Snapshots',
    ];

    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    sheet.columns = headers.map((h, i) => ({
      key: String(i),
      width: i === 0 ? 25 : i === 1 ? 22 : 15,
    }));
  }

  private styleDetailSheet(sheet: ExcelJS.Worksheet, includeMetrics: string[]) {
    const headers = ['Timestamp', 'Resource Name', 'AWS Resource ID', 'Project', 'Status'];
    if (includeMetrics.includes('cpu')) headers.push('CPU %');
    if (includeMetrics.includes('memory')) headers.push('Memory %');
    if (includeMetrics.includes('disk')) headers.push('Disk %');
    if (includeMetrics.includes('network')) {
      headers.push('Network In (MB)', 'Network Out (MB)');
    }

    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  }

  private bytesToMB(bytes: bigint): number {
    return Number(bytes) / (1024 * 1024);
  }
}

export const reportService = new ReportService();
