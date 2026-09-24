import type { Permission } from '../../config/constants';

/** The payload stored inside the JWT. Never includes sensitive fields. */
export interface JwtPayload {
  sub: string;      // user ID
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  permissions: Permission[];
  iat?: number;
  exp?: number;
}

/** Populated on request after JWT verification. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  permissions: Permission[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: AuthenticatedUser;
}
