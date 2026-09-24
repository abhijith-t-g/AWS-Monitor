import { prisma } from '../../infrastructure/database/prisma';
import type { CreateProjectInput, UpdateProjectInput } from './project.schema';
import type { Prisma } from '@prisma/client';

export class ProjectRepository {
  async findAll(options: { page: number; pageSize: number; search?: string }) {
    const where: Prisma.ProjectWhereInput = {
      active: true,
      ...(options.search
        ? {
            OR: [
              { name: { contains: options.search } },
              { description: { contains: options.search } },
            ],
          }
        : {}),
    };

    const [total, projects] = await prisma.$transaction([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        include: {
          _count: { select: { resources: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      }),
    ]);

    return { total, projects };
  }

  async findById(id: string) {
    return prisma.project.findUnique({
      where: { id },
      include: {
        resources: {
          where: { active: true },
          orderBy: { name: 'asc' },
        },
        _count: { select: { resources: true } },
      },
    });
  }

  async create(data: CreateProjectInput) {
    return prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        awsAccountId: data.awsAccountId || null,
      },
    });
  }

  async update(id: string, data: UpdateProjectInput) {
    return prisma.project.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.awsAccountId !== undefined && { awsAccountId: data.awsAccountId || null }),
      },
    });
  }

  async softDelete(id: string) {
    return prisma.project.update({
      where: { id },
      data: { active: false },
    });
  }
}

export const projectRepository = new ProjectRepository();
