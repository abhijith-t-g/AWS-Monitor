import { prisma } from '../../infrastructure/database/prisma';
import type { CreateResourceInput, UpdateResourceInput } from './resource.schema';
import type { Prisma } from '@prisma/client';

export class ResourceRepository {
  async findByProject(projectId: string) {
    return prisma.aWSResource.findMany({
      where: { projectId, active: true },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { metricSnapshots: true } },
      },
    });
  }

  async findById(id: string, projectId?: string) {
    return prisma.aWSResource.findFirst({
      where: {
        id,
        active: true,
        ...(projectId ? { projectId } : {}),
      },
      include: {
        project: { select: { id: true, name: true } },
      },
    });
  }

  async findAllActive() {
    return prisma.aWSResource.findMany({
      where: { active: true, project: { active: true } },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async create(projectId: string, data: CreateResourceInput) {
    return prisma.aWSResource.create({
      data: {
        projectId,
        awsResourceId: data.awsResourceId,
        resourceType: data.resourceType,
        region: data.region,
        name: data.name,
        description: data.description,
      },
    });
  }

  async update(id: string, data: UpdateResourceInput) {
    const updateData: Prisma.AWSResourceUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.region !== undefined) updateData.region = data.region;
    if (data.description !== undefined) updateData.description = data.description;

    return prisma.aWSResource.update({ where: { id }, data: updateData });
  }

  async softDelete(id: string) {
    return prisma.aWSResource.update({
      where: { id },
      data: { active: false },
    });
  }
}

export const resourceRepository = new ResourceRepository();
