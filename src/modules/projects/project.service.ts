import { projectRepository } from './project.repository';
import { NotFoundError, ConflictError } from '../../shared/errors';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';
import type { CreateProjectInput, UpdateProjectInput } from './project.schema';
import { metricRepository } from '../metrics/metric.repository';
import ExcelJS from 'exceljs';

export class ProjectService {
  async listProjects(options: { page?: number; pageSize?: number; search?: string }) {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    return projectRepository.findAll({ page, pageSize, search: options.search });
  }

  async getProject(id: string) {
    const project = await projectRepository.findById(id);
    if (!project) throw new NotFoundError('Project');
    return project;
  }

  async createProject(data: CreateProjectInput) {
    return projectRepository.create(data);
  }

  async updateProject(id: string, data: UpdateProjectInput) {
    const existing = await projectRepository.findById(id);
    if (!existing) throw new NotFoundError('Project');
    return projectRepository.update(id, data);
  }

  async deleteProject(id: string) {
    const existing = await projectRepository.findById(id);
    if (!existing) throw new NotFoundError('Project');

    // Check for active resources before deletion
    const activeResources = existing.resources.filter((r) => r.active);
    if (activeResources.length > 0) {
      throw new ConflictError(
        `Cannot delete project with ${activeResources.length} active resource(s). Deactivate resources first.`,
      );
    }

    return projectRepository.softDelete(id);
  }

  /**
   * Generates a styled Excel workbook buffer for the project in the specified date range.
   */
  async exportProjectExcel(projectId: string, startDate: Date, endDate: Date): Promise<{ buffer: Buffer; filename: string }> {
    const project = await this.getProject(projectId);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Mobatia AWS Infrastructure Monitor';
    workbook.created = new Date();

    // 1. Overview Worksheet
    const overviewSheet = workbook.addWorksheet('Project Overview', {
      pageSetup: { fitToPage: true, orientation: 'landscape' },
    });

    // Title & Info
    overviewSheet.addRow(['MOBATIA AWS INFRASTRUCTURE MONITOR — PROJECT METRICS REPORT']);
    overviewSheet.addRow(['Project:', project.name]);
    overviewSheet.addRow(['AWS Account:', project.awsAccountId || 'Default / IAM Role']);
    overviewSheet.addRow(['Reporting Range:', `${startDate.toLocaleString()} to ${endDate.toLocaleString()}`]);
    overviewSheet.addRow(['Exported At:', new Date().toLocaleString()]);
    overviewSheet.addRow([]); // Blank line

    // Header styling
    overviewSheet.mergeCells('A1:J1');
    const titleCell = overviewSheet.getCell('A1');
    titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A8A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    overviewSheet.getRow(1).height = 30;

    const summaryHeaders = [
      'Resource Name',
      'AWS ID',
      'Type',
      'Region',
      'Avg CPU (%)',
      'Min CPU (%)',
      'Max CPU (%)',
      'Avg Concurrent Users',
      'Peak Concurrent Users',
      'Snapshots Count',
    ];

    const headerRow = overviewSheet.addRow(summaryHeaders);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2563EB' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'medium' },
        right: { style: 'thin' },
      };
    });

    // Populate resource aggregate rows
    for (const resource of project.resources) {
      const aggregates = await metricRepository.getAggregates(resource.id, startDate, endDate);
      const row = overviewSheet.addRow([
        resource.name,
        resource.awsResourceId,
        resource.resourceType.replace(/_/g, ' '),
        resource.region,
        aggregates.avgCpu != null ? Number(aggregates.avgCpu.toFixed(2)) : '—',
        aggregates.minCpu != null ? Number(aggregates.minCpu.toFixed(2)) : '—',
        aggregates.maxCpu != null ? Number(aggregates.maxCpu.toFixed(2)) : '—',
        aggregates.avgConcurrentUsers != null ? Math.round(aggregates.avgConcurrentUsers) : '—',
        aggregates.maxConcurrentUsers != null ? aggregates.maxConcurrentUsers : '—',
        aggregates.snapshotCount,
      ]);
      row.alignment = { vertical: 'middle' };
    }

    overviewSheet.columns.forEach((col) => {
      col.width = 20;
    });
    if (overviewSheet.getColumn(1)) overviewSheet.getColumn(1).width = 24;
    if (overviewSheet.getColumn(2)) overviewSheet.getColumn(2).width = 26;

    // 2. Detailed Telemetry Stream Sheet
    const detailSheet = workbook.addWorksheet('Telemetry Stream');
    const detailHeaders = [
      'Timestamp (UTC)',
      'Resource Name',
      'AWS ID',
      'CPU Utilization (%)',
      'Concurrent Users',
      'Status',
    ];
    const dHeaderRow = detailSheet.addRow(detailHeaders);
    dHeaderRow.height = 24;
    dHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E40AF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    for (const resource of project.resources) {
      const snapshots = await metricRepository.findByResourceAndTimeRange(resource.id, startDate, endDate, 5000);
      for (const s of snapshots) {
        detailSheet.addRow([
          s.timestamp.toISOString(),
          resource.name,
          resource.awsResourceId,
          s.cpuUtilization != null ? Number(s.cpuUtilization.toFixed(2)) : '',
          s.concurrentUsers != null ? s.concurrentUsers : '',
          s.collectionStatus,
        ]);
      }
    }

    detailSheet.columns.forEach((col) => {
      col.width = 22;
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    // Format date string for filename: YYYYMMDD_HHmm
    const fmt = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    };

    const cleanProjectName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Mobatia_${cleanProjectName}_${fmt(startDate)}_to_${fmt(endDate)}.xlsx`;

    return { buffer, filename };
  }
}

export const projectService = new ProjectService();
