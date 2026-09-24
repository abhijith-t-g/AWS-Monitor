import { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from './auth.service';
import { loginSchema, changePasswordSchema } from './auth.schema';
import { prisma } from '../../infrastructure/database/prisma';
import { requireAuth } from '../../middleware/auth.middleware';
import { ValidationError } from '../../shared/errors';

const COOKIE_NAME = 'auth_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 8 * 60 * 60, // 8 hours
};

export class AuthController {
  async showLogin(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    // If already authenticated, redirect to dashboard
    const token = request.cookies?.[COOKIE_NAME];
    if (token) {
      try {
        await authService.verifyToken(token);
        return reply.redirect('/dashboard');
      } catch {
        // Token invalid — show login
      }
    }

    const query = request.query as Record<string, string>;
    return reply.view('auth/login.ejs', {
      title: 'Sign In',
      error: null,
      redirect: query['redirect'] ?? '/dashboard',
      hideLayout: true,
    });
  }

  async handleLogin(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).view('auth/login.ejs', {
        title: 'Sign In',
        error: 'Invalid email or password format',
        redirect: '/dashboard',
        hideLayout: true,
      });
    }

    try {
      const { token, user } = await authService.login(parseResult.data);

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'user.login',
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          metadata: { email: user.email },
        },
      });

      return reply
        .cookie(COOKIE_NAME, token, COOKIE_OPTIONS)
        .redirect((request.body as Record<string, string>)['redirect'] ?? '/dashboard');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Login failed';
      return reply.status(401).view('auth/login.ejs', {
        title: 'Sign In',
        error: message,
        redirect: '/dashboard',
        hideLayout: true,
      });
    }
  }

  async handleLogout(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    if (request.user) {
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'user.logout',
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        },
      });
    }

    return reply.clearCookie(COOKIE_NAME, { path: '/' }).redirect('/auth/login');
  }

  async showChangePassword(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    await requireAuth(request, reply);
    return reply.view('auth/change-password.ejs', {
      title: 'Change Password',
      error: null,
      success: null,
    });
  }

  async handleChangePassword(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    await requireAuth(request, reply);

    const parseResult = changePasswordSchema.safeParse(request.body);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten().fieldErrors;
      const firstError = Object.values(errors).flat()[0] ?? 'Validation failed';
      return reply.view('auth/change-password.ejs', {
        title: 'Change Password',
        error: firstError,
        success: null,
      });
    }

    try {
      await authService.changePassword(request.user!.id, parseResult.data);

      await prisma.auditLog.create({
        data: {
          userId: request.user!.id,
          action: 'user.change_password',
          ipAddress: request.ip,
        },
      });

      return reply.view('auth/change-password.ejs', {
        title: 'Change Password',
        error: null,
        success: 'Password changed successfully',
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.view('auth/change-password.ejs', {
          title: 'Change Password',
          error: err.message,
          success: null,
        });
      }
      throw err;
    }
  }
}

export const authController = new AuthController();
