import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth, requirePermission } from '../../middleware/auth.middleware';
import { PERMISSIONS } from '../../config/constants';
import { userService } from './user.service';
import { createUserSchema, updateUserSchema } from './user.schema';
import { prisma } from '../../infrastructure/database/prisma';
import { ValidationError } from '../../shared/errors';

export async function userRoutes(app: FastifyInstance): Promise<void> {
  const canRead = requirePermission(PERMISSIONS.USERS_READ);
  const canWrite = requirePermission(PERMISSIONS.USERS_WRITE);

  // ── Users ──────────────────────────────────────────────────────────────────

  app.get('/users', { preHandler: [requireAuth, canRead] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const page = parseInt(query['page'] ?? '1', 10);
    const { users, total, totalPages } = await userService.listUsers(page);
    return reply.view('users/index.ejs', {
      title: 'Users',
      users,
      total,
      page,
      totalPages,
      user: request.user,
    });
  });

  app.get('/users/new', { preHandler: [requireAuth, canWrite] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const roles = await userService.listRoles();
    return reply.view('users/form.ejs', {
      title: 'Create User',
      editUser: null,
      roles,
      errors: null,
      user: request.user,
    });
  });

  app.post('/users', { preHandler: [requireAuth, canWrite] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = createUserSchema.safeParse(request.body);
    if (!parseResult.success) {
      const roles = await userService.listRoles();
      return reply.status(400).view('users/form.ejs', {
        title: 'Create User',
        editUser: null,
        roles,
        errors: parseResult.error.flatten().fieldErrors,
        user: request.user,
      });
    }

    const newUser = await userService.createUser(parseResult.data);

    await prisma.auditLog.create({
      data: {
        userId: request.user!.id,
        action: 'user.create',
        target: 'User',
        targetId: newUser.id,
        metadata: { email: newUser.email },
        ipAddress: request.ip,
      },
    });

    return reply.redirect('/users');
  });

  app.get('/users/:userId', { preHandler: [requireAuth, canRead] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    const editUser = await userService.getUser(userId);
    const roles = await userService.listRoles();
    return reply.view('users/form.ejs', {
      title: `Edit ${editUser.name}`,
      editUser,
      roles,
      errors: null,
      user: request.user,
    });
  });

  app.post('/users/:userId', { preHandler: [requireAuth, canWrite] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    const parseResult = updateUserSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Invalid user data', parseResult.error.flatten().fieldErrors);
    }

    await userService.updateUser(userId, parseResult.data);

    await prisma.auditLog.create({
      data: {
        userId: request.user!.id,
        action: 'user.update',
        target: 'User',
        targetId: userId,
        ipAddress: request.ip,
      },
    });

    return reply.redirect('/users');
  });

  // ── Roles ──────────────────────────────────────────────────────────────────

  app.get('/roles', { preHandler: [requireAuth, requirePermission(PERMISSIONS.ROLES_READ)] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const roles = await userService.listRoles();
    return reply.view('users/roles.ejs', {
      title: 'Roles & Permissions',
      roles,
      user: request.user,
    });
  });
}
