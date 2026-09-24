import { FastifyInstance } from 'fastify';
import { resourceController } from './resource.controller';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../../config/constants';

export async function resourceRoutes(app: FastifyInstance): Promise<void> {
  const canRead = requirePermission(PERMISSIONS.RESOURCES_READ);
  const canWrite = requirePermission(PERMISSIONS.RESOURCES_READ, PERMISSIONS.RESOURCES_WRITE);
  const canDelete = requirePermission(PERMISSIONS.RESOURCES_DELETE);

  // All resource routes are nested under /projects/:projectId/resources
  app.get(
    '/projects/:projectId/resources',
    { preHandler: [requireAuth, canRead] },
    resourceController.listResources.bind(resourceController),
  );

  app.get(
    '/projects/:projectId/resources/new',
    { preHandler: [requireAuth, canWrite] },
    resourceController.showCreateForm.bind(resourceController),
  );

  app.post(
    '/projects/:projectId/resources',
    { preHandler: [requireAuth, canWrite] },
    resourceController.createResource.bind(resourceController),
  );

  app.get(
    '/projects/:projectId/resources/:resourceId',
    { preHandler: [requireAuth, canRead] },
    resourceController.showResource.bind(resourceController),
  );

  app.post(
    '/projects/:projectId/resources/:resourceId',
    { preHandler: [requireAuth, canWrite] },
    resourceController.updateResource.bind(resourceController),
  );

  app.delete(
    '/projects/:projectId/resources/:resourceId',
    { preHandler: [requireAuth, canDelete] },
    resourceController.deleteResource.bind(resourceController),
  );
}
