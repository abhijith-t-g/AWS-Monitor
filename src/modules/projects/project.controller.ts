import { FastifyRequest, FastifyReply } from 'fastify';
import { projectService } from './project.service';
import { createProjectSchema, updateProjectSchema, projectIdSchema } from './project.schema';
import { ValidationError } from '../../shared/errors';
import { DEFAULT_PAGE_SIZE } from '../../config/constants';
import { prisma } from '../../infrastructure/database/prisma';

export class ProjectController {
  async listProjects(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = request.query as Record<string, string>;
    const page = parseInt(query['page'] ?? '1', 10);
    const search = query['search']?.trim();

    const { projects, total } = await projectService.listProjects({
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      search,
    });

    const totalPages = Math.ceil(total / DEFAULT_PAGE_SIZE);

    // HTMX partial response
    if (request.headers['hx-request']) {
      return reply.view('projects/partials/table.ejs', {
        projects,
        total,
        page,
        totalPages,
        search,
      });
    }

    return reply.view('projects/index.ejs', {
      title: 'Projects',
      projects,
      total,
      page,
      totalPages,
      search,
      user: request.user,
    });
  }

  async showProject(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const paramsResult = projectIdSchema.safeParse(request.params);
    if (!paramsResult.success) throw new ValidationError('Invalid project ID');

    const project = await projectService.getProject(paramsResult.data.projectId);

    return reply.view('projects/show.ejs', {
      title: project.name,
      project,
      user: request.user,
    });
  }

  async showCreateForm(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.view('projects/form.ejs', {
      title: 'Create Project',
      project: null,
      errors: null,
      user: request.user,
    });
  }

  async createProject(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const parseResult = createProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).view('projects/form.ejs', {
        title: 'Create Project',
        project: null,
        errors: parseResult.error.flatten().fieldErrors,
        user: request.user,
      });
    }

    const project = await projectService.createProject(parseResult.data);

    await prisma.auditLog.create({
      data: {
        userId: request.user!.id,
        action: 'project.create',
        target: 'Project',
        targetId: project.id,
        metadata: { name: project.name },
        ipAddress: request.ip,
      },
    });

    return reply.redirect(`/projects/${project.id}`);
  }

  async showEditForm(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const paramsResult = projectIdSchema.safeParse(request.params);
    if (!paramsResult.success) throw new ValidationError('Invalid project ID');

    const project = await projectService.getProject(paramsResult.data.projectId);

    return reply.view('projects/form.ejs', {
      title: `Edit ${project.name}`,
      project,
      errors: null,
      user: request.user,
    });
  }

  async updateProject(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const paramsResult = projectIdSchema.safeParse(request.params);
    if (!paramsResult.success) throw new ValidationError('Invalid project ID');

    const parseResult = updateProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      const project = await projectService.getProject(paramsResult.data.projectId);
      return reply.status(400).view('projects/form.ejs', {
        title: `Edit ${project.name}`,
        project,
        errors: parseResult.error.flatten().fieldErrors,
        user: request.user,
      });
    }

    const project = await projectService.updateProject(
      paramsResult.data.projectId,
      parseResult.data,
    );

    await prisma.auditLog.create({
      data: {
        userId: request.user!.id,
        action: 'project.update',
        target: 'Project',
        targetId: project.id,
        ipAddress: request.ip,
      },
    });

    return reply.redirect(`/projects/${project.id}`);
  }

  async deleteProject(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const paramsResult = projectIdSchema.safeParse(request.params);
    if (!paramsResult.success) throw new ValidationError('Invalid project ID');

    const project = await projectService.deleteProject(paramsResult.data.projectId);

    await prisma.auditLog.create({
      data: {
        userId: request.user!.id,
        action: 'project.delete',
        target: 'Project',
        targetId: paramsResult.data.projectId,
        ipAddress: request.ip,
      },
    });

    if (request.headers['hx-request']) {
      return reply.status(200).send('');
    }
    return reply.redirect('/projects');
  }

  async exportProject(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const paramsResult = projectIdSchema.safeParse(request.params);
    if (!paramsResult.success) throw new ValidationError('Invalid project ID');

    const query = request.query as Record<string, string>;
    const defaultEnd = new Date();
    const defaultStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let startDate = defaultStart;
    let endDate = defaultEnd;

    if (query['startDate']) {
      const parsedStart = new Date(query['startDate']);
      if (!isNaN(parsedStart.getTime())) startDate = parsedStart;
    }

    if (query['endDate']) {
      const parsedEnd = new Date(query['endDate']);
      if (!isNaN(parsedEnd.getTime())) endDate = parsedEnd;
    }

    if (endDate <= startDate) {
      throw new ValidationError('End date must be after start date');
    }

    const { buffer, filename } = await projectService.exportProjectExcel(
      paramsResult.data.projectId,
      startDate,
      endDate,
    );

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: request.user!.id,
        action: 'project.export_excel',
        target: 'Project',
        targetId: paramsResult.data.projectId,
        ipAddress: request.ip,
        metadata: { filename, startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      },
    });

    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(buffer);
  }
}

export const projectController = new ProjectController();
