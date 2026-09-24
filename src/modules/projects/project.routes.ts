import { FastifyInstance } from 'fastify';
import { projectController } from './project.controller';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../../config/constants';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  const canRead = requirePermission(PERMISSIONS.PROJECTS_READ);
  const canWrite = requirePermission(PERMISSIONS.PROJECTS_READ, PERMISSIONS.PROJECTS_WRITE);
  const canDelete = requirePermission(PERMISSIONS.PROJECTS_DELETE);

  app.get(
    '/projects',
    { preHandler: [requireAuth, canRead] },
    projectController.listProjects.bind(projectController),
  );

  app.get(
    '/projects/new',
    { preHandler: [requireAuth, canWrite] },
    projectController.showCreateForm.bind(projectController),
  );

  app.post(
    '/projects',
    { preHandler: [requireAuth, canWrite] },
    projectController.createProject.bind(projectController),
  );

  app.get(
    '/projects/:projectId',
    { preHandler: [requireAuth, canRead] },
    projectController.showProject.bind(projectController),
  );

  app.get(
    '/projects/:projectId/export',
    { preHandler: [requireAuth, canRead] },
    projectController.exportProject.bind(projectController),
  );

  app.get(
    '/projects/:projectId/edit',
    { preHandler: [requireAuth, canWrite] },
    projectController.showEditForm.bind(projectController),
  );

  app.post(
    '/projects/:projectId',
    { preHandler: [requireAuth, canWrite] },
    projectController.updateProject.bind(projectController),
  );

  app.delete(
    '/projects/:projectId',
    { preHandler: [requireAuth, canDelete] },
    projectController.deleteProject.bind(projectController),
  );
}
