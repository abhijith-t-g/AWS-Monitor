import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import {
  ADMIN_PERMISSIONS,
  OPERATOR_PERMISSIONS,
  VIEWER_PERMISSIONS,
  ROLES,
  PERMISSIONS,
} from '../src/config/constants';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Permissions ─────────────────────────────────────────────────────────────
  const allPermissionNames = Object.values(PERMISSIONS);
  for (const name of allPermissionNames) {
    await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name, description: name },
    });
  }
  console.log(`✅ Created ${allPermissionNames.length} permissions`);

  // ── Roles ──────────────────────────────────────────────────────────────────
  const adminRole = await prisma.role.upsert({
    where: { name: ROLES.ADMIN },
    update: {},
    create: { name: ROLES.ADMIN, description: 'Full system access' },
  });

  const operatorRole = await prisma.role.upsert({
    where: { name: ROLES.OPERATOR },
    update: {},
    create: { name: ROLES.OPERATOR, description: 'Can manage resources and generate reports' },
  });

  const viewerRole = await prisma.role.upsert({
    where: { name: ROLES.VIEWER },
    update: {},
    create: { name: ROLES.VIEWER, description: 'Read-only access' },
  });

  // ── Role Permissions ────────────────────────────────────────────────────────
  async function assignPermissions(roleId: string, permissions: string[]) {
    const perms = await prisma.permission.findMany({ where: { name: { in: permissions } } });
    for (const perm of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: perm.id } },
        update: {},
        create: { roleId, permissionId: perm.id },
      });
    }
  }

  await assignPermissions(adminRole.id, ADMIN_PERMISSIONS);
  await assignPermissions(operatorRole.id, OPERATOR_PERMISSIONS);
  await assignPermissions(viewerRole.id, VIEWER_PERMISSIONS);
  console.log('✅ Role permissions assigned');

  // ── Default Admin User ──────────────────────────────────────────────────────
  const adminEmail = process.env['SEED_ADMIN_EMAIL'] ?? 'admin@example.com';
  const adminPassword = process.env['SEED_ADMIN_PASSWORD'] ?? 'Admin@123456!';

  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 2,
  });

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'System Administrator',
      email: adminEmail,
      passwordHash,
      roleId: adminRole.id,
    },
  });

  console.log(`✅ Admin user: ${adminUser.email}`);
  if (adminPassword === 'Admin@123456!') {
    console.warn('⚠️  Using default admin password! Set SEED_ADMIN_PASSWORD in production.');
  }

  console.log('🎉 Database seed complete');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
