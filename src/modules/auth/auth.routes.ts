import { FastifyInstance } from 'fastify';
import { authController } from './auth.controller';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/auth/login', authController.showLogin.bind(authController));
  app.post('/auth/login', authController.handleLogin.bind(authController));
  app.post('/auth/logout', authController.handleLogout.bind(authController));
  app.get('/auth/change-password', authController.showChangePassword.bind(authController));
  app.post('/auth/change-password', authController.handleChangePassword.bind(authController));
}
