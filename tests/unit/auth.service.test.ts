import { describe, it, expect, vi } from 'vitest';
import { AuthService } from '../../src/modules/auth/auth.service';

// Unit tests for auth service — no real DB needed
vi.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('AuthService', () => {
  const authService = new AuthService();

  describe('login', () => {
    it('throws AuthenticationError for non-existent user', async () => {
      const { prisma } = await import('../../src/infrastructure/database/prisma');
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(
        authService.login({ email: 'nobody@test.com', password: 'password' })
      ).rejects.toThrow('Invalid email or password');
    });
  });

  describe('hashPassword', () => {
    it('returns a valid argon2 hash', async () => {
      const hash = await authService.hashPassword('TestPassword@123');
      expect(hash).toMatch(/^\$argon2id\$/);
    });
  });

  describe('verifyToken', () => {
    it('throws AuthenticationError for invalid token', async () => {
      await expect(
        authService.verifyToken('invalid.token.here')
      ).rejects.toThrow('Invalid or expired session');
    });
  });
});
