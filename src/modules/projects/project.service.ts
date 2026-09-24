import { projectRepository } from './project.repository';
import { NotFoundError, ConflictError } from '../../shared/errors';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../config/constants';
import type { CreateProjectInput, UpdateProjectInput } from './project.schema';

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
}

export const projectService = new ProjectService();
