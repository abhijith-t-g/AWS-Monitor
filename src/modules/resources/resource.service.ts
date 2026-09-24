import { resourceRepository } from './resource.repository';
import { projectRepository } from '../projects/project.repository';
import { NotFoundError, ConflictError } from '../../shared/errors';
import type { CreateResourceInput, UpdateResourceInput } from './resource.schema';

export class ResourceService {
  async listByProject(projectId: string) {
    // Verify project exists (prevents leaking existence of other projects)
    const project = await projectRepository.findById(projectId);
    if (!project) throw new NotFoundError('Project');

    return resourceRepository.findByProject(projectId);
  }

  async getResource(resourceId: string, projectId: string) {
    // projectId scoping prevents IDOR — always pass the URL param
    const resource = await resourceRepository.findById(resourceId, projectId);
    if (!resource) throw new NotFoundError('Resource');
    return resource;
  }

  async createResource(projectId: string, data: CreateResourceInput) {
    const project = await projectRepository.findById(projectId);
    if (!project) throw new NotFoundError('Project');

    // Check for duplicate AWS resource ID within the same project+region
    const resources = await resourceRepository.findByProject(projectId);
    const duplicate = resources.find(
      (r) => r.awsResourceId === data.awsResourceId && r.region === data.region,
    );
    if (duplicate) {
      throw new ConflictError(
        `Resource '${data.awsResourceId}' already exists in region ${data.region} for this project`,
      );
    }

    return resourceRepository.create(projectId, data);
  }

  async updateResource(resourceId: string, projectId: string, data: UpdateResourceInput) {
    const resource = await resourceRepository.findById(resourceId, projectId);
    if (!resource) throw new NotFoundError('Resource');
    return resourceRepository.update(resourceId, data);
  }

  async deleteResource(resourceId: string, projectId: string) {
    const resource = await resourceRepository.findById(resourceId, projectId);
    if (!resource) throw new NotFoundError('Resource');
    return resourceRepository.softDelete(resourceId);
  }
}

export const resourceService = new ResourceService();
