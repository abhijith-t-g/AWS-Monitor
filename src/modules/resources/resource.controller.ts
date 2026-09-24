import { FastifyRequest, FastifyReply } from 'fastify';
import { resourceService } from './resource.service';
import { createResourceSchema, updateResourceSchema, resourceIdSchema } from './resource.schema';
import { projectIdSchema } from '../projects/project.schema';
import { ValidationError } from '../../shared/errors';
import { prisma } from '../../infrastructure/database/prisma';
import { ResourceType } from '@prisma/client';

export class ResourceController {
  async listResources(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const paramsResult = projectIdSchema.safeParse(request.params);
    if (!paramsResult.success) throw new ValidationError('Invalid project ID');

    const resources = await resourceService.listByProject(paramsResult.data.projectId);

    if (request.headers['hx-request']) {
      return reply.view('resources/partials/table.ejs', { resources });
    }

    return reply.view('resources/index.ejs', {
      title: 'Resources',
      resources,
      projectId: paramsResult.data.projectId,
      user: request.user,
      resourceTypes: Object.values(ResourceType),
    });
  }

  async showResource(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const paramsResult = resourceIdSchema.safeParse(request.params);
    if (!paramsResult.success) throw new ValidationError('Invalid resource ID');

    const resource = await resourceService.getResource(
      paramsResult.data.resourceId,
      paramsResult.data.projectId,
    );

    return reply.view('resources/show.ejs', {
      title: resource.name,
      resource,
      user: request.user,
    });
  }

  async showCreateForm(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const paramsResult = projectIdSchema.safeParse(request.params);
    if (!paramsResult.success) throw new ValidationError('Invalid project ID');

    return reply.view('resources/form.ejs', {
      title: 'Add Resource',
      resource: null,
      projectId: paramsResult.data.projectId,
      errors: null,
      resourceTypes: Object.values(ResourceType),
      user: request.user,
    });
  }

  async createResource(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const paramsResult = projectIdSchema.safeParse(request.params);
    if (!paramsResult.success) throw new ValidationError('Invalid project ID');

    const parseResult = createResourceSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).view('resources/form.ejs', {
        title: 'Add Resource',
        resource: null,
        projectId: paramsResult.data.projectId,
        errors: parseResult.error.flatten().fieldErrors,
        resourceTypes: Object.values(ResourceType),
        user: request.user,
      });
    }

    const resource = await resourceService.createResource(
      paramsResult.data.projectId,
      parseResult.data,
    );

    await prisma.auditLog.create({
      data: {
        userId: request.user!.id,
        action: 'resource.create',
        target: 'AWSResource',
        targetId: resource.id,
        metadata: { awsResourceId: resource.awsResourceId },
        ipAddress: request.ip,
      },
    });

    return reply.redirect(`/projects/${paramsResult.data.projectId}/resources/${resource.id}`);
  }

  async updateResource(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const paramsResult = resourceIdSchema.safeParse(request.params);
    if (!paramsResult.success) throw new ValidationError('Invalid IDs');

    const parseResult = updateResourceSchema.safeParse(request.body);
    if (!parseResult.success) {
      const resource = await resourceService.getResource(
        paramsResult.data.resourceId,
        paramsResult.data.projectId,
      );
      return reply.status(400).view('resources/form.ejs', {
        title: `Edit ${resource.name}`,
        resource,
        projectId: paramsResult.data.projectId,
        errors: parseResult.error.flatten().fieldErrors,
        resourceTypes: Object.values(ResourceType),
        user: request.user,
      });
    }

    const resource = await resourceService.updateResource(
      paramsResult.data.resourceId,
      paramsResult.data.projectId,
      parseResult.data,
    );

    await prisma.auditLog.create({
      data: {
        userId: request.user!.id,
        action: 'resource.update',
        target: 'AWSResource',
        targetId: resource.id,
        ipAddress: request.ip,
      },
    });

    return reply.redirect(
      `/projects/${paramsResult.data.projectId}/resources/${resource.id}`,
    );
  }

  async deleteResource(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const paramsResult = resourceIdSchema.safeParse(request.params);
    if (!paramsResult.success) throw new ValidationError('Invalid IDs');

    await resourceService.deleteResource(
      paramsResult.data.resourceId,
      paramsResult.data.projectId,
    );

    await prisma.auditLog.create({
      data: {
        userId: request.user!.id,
        action: 'resource.delete',
        target: 'AWSResource',
        targetId: paramsResult.data.resourceId,
        ipAddress: request.ip,
      },
    });

    if (request.headers['hx-request']) {
      return reply.status(200).send('');
    }
    return reply.redirect(`/projects/${paramsResult.data.projectId}`);
  }
}

export const resourceController = new ResourceController();
