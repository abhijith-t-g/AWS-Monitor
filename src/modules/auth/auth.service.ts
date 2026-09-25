import argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '../../infrastructure/database/prisma';
import { env } from '../../config/env';
import {
  AuthenticationError,
  ValidationError,
  NotFoundError,
} from '../../shared/errors';
import type { LoginInput, ChangePasswordInput } from './auth.schema';
import type { AuthenticatedUser, JwtPayload, LoginResult } from './auth.types';
import type { Permission } from '../../config/constants';

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

// Argon2id parameters — chosen to be secure yet fit within ~100ms on modest hardware
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,  // 64 MB
  timeCost: 3,
  parallelism: 2,
} as const;

export class AuthService {
  async login(input: LoginInput): Promise<LoginResult> {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    // Use constant-time comparison even when user does not exist (timing attack mitigation)
    const dummyHash =
      '$argon2id$v=19$m=65536,t=3,p=2$FF4VnOyBP5uPSwkX5Pig/Q$y/KteeKFodavuaYJMvupU++7w1zOsg7lXhtKRnQUoQY';
    const hashToVerify = user ? user.passwordHash : dummyHash;

    let valid = false;
    try {
      valid = await argon2.verify(hashToVerify, input.password);
    } catch {
      valid = false;
    }

    if (!user || !valid || !user.active) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Update last login timestamp (fire and forget)
    void prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const permissions = user.role.rolePermissions.map(
      (rp: { permission: { name: string } }) => rp.permission.name as Permission,
    );

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleName: user.role.name,
      permissions,
    };

    const token = await this.signJwt(authenticatedUser);

    return { token, user: authenticatedUser };
  }

  async verifyToken(token: string): Promise<AuthenticatedUser> {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      const jwtPayload = payload as unknown as JwtPayload;

      return {
        id: jwtPayload.sub,
        email: jwtPayload.email,
        name: jwtPayload.name,
        roleId: jwtPayload.roleId,
        roleName: jwtPayload.roleName,
        permissions: jwtPayload.permissions,
      };
    } catch {
      throw new AuthenticationError('Invalid or expired session');
    }
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    const valid = await argon2.verify(user.passwordHash, input.currentPassword);
    if (!valid) {
      throw new ValidationError('Current password is incorrect');
    }

    const newHash = await argon2.hash(input.newPassword, ARGON2_OPTIONS);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  private async signJwt(user: AuthenticatedUser): Promise<string> {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleName: user.roleName,
      permissions: user.permissions,
    };

    return new SignJWT(payload as Record<string, unknown>)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(env.JWT_EXPIRES_IN)
      .sign(JWT_SECRET);
  }
}

export const authService = new AuthService();
