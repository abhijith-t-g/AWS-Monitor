import { prisma } from '../../infrastructure/database/prisma';
import { authService } from '../auth/auth.service';
import { ConflictError, NotFoundError } from '../../shared/errors';
import type { CreateUserInput, UpdateUserInput } from './user.schema';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  roleId: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true } },
} as const;

export class UserService {
  async listUsers(page = 1, pageSize = 25) {
    const [total, users] = await prisma.$transaction([
      prisma.user.count(),
      prisma.user.findMany({
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, users, totalPages: Math.ceil(total / pageSize) };
  }

  async getUser(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundError('User');
    return user;
  }

  async createUser(data: CreateUserInput) {
    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) throw new ConflictError('A user with this email already exists');

    const role = await prisma.role.findUnique({ where: { id: data.roleId } });
    if (!role) throw new NotFoundError('Role');

    const passwordHash = await authService.hashPassword(data.password);

    return prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash,
        roleId: data.roleId,
      },
      select: USER_SELECT,
    });
  }

  async updateUser(id: string, data: UpdateUserInput) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User');

    if (data.roleId) {
      const role = await prisma.role.findUnique({ where: { id: data.roleId } });
      if (!role) throw new NotFoundError('Role');
    }

    return prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.roleId !== undefined && { roleId: data.roleId }),
        ...(data.active !== undefined && { active: data.active }),
      },
      select: USER_SELECT,
    });
  }

  async listRoles() {
    return prisma.role.findMany({
      include: {
        rolePermissions: {
          include: { permission: true },
        },
        _count: { select: { users: true } },
      },
    });
  }
}

export const userService = new UserService();
