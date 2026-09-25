import { FastifyInstance } from 'fastify';
import { authController } from './auth.controller';
import { requireAuth, requireCsrf } from '../../middleware/auth.middleware';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/auth/login', authController.showLogin.bind(authController));
  app.post('/auth/login', { preHandler: [requireCsrf] }, authController.handleLogin.bind(authController));
  app.post('/auth/logout', { preHandler: [requireCsrf] }, authController.handleLogout.bind(authController));
  app.get('/auth/change-password', { preHandler: [requireAuth] }, authController.showChangePassword.bind(authController));
  app.post('/auth/change-password', { preHandler: [requireAuth, requireCsrf] }, authController.handleChangePassword.bind(authController));
}

