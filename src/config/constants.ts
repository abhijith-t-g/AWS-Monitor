// Application-wide constants

export const PERMISSIONS = {
  // Projects
  PROJECTS_READ: 'projects:read',
  PROJECTS_WRITE: 'projects:write',
  PROJECTS_DELETE: 'projects:delete',

  // Resources
  RESOURCES_READ: 'resources:read',
  RESOURCES_WRITE: 'resources:write',
  RESOURCES_DELETE: 'resources:delete',

  // Metrics
  METRICS_READ: 'metrics:read',

  // Reports
  REPORTS_READ: 'reports:read',
  REPORTS_GENERATE: 'reports:generate',

  // Users
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_DELETE: 'users:delete',

  // Roles
  ROLES_READ: 'roles:read',
  ROLES_WRITE: 'roles:write',

  // System
  SYSTEM_VIEW: 'system:view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLES = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
} as const;

// Admin has all permissions
export const ADMIN_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

// Operator can read/write projects, resources, metrics; generate reports; view system
export const OPERATOR_PERMISSIONS: Permission[] = [
  PERMISSIONS.PROJECTS_READ,
  PERMISSIONS.PROJECTS_WRITE,
  PERMISSIONS.RESOURCES_READ,
  PERMISSIONS.RESOURCES_WRITE,
  PERMISSIONS.METRICS_READ,
  PERMISSIONS.REPORTS_READ,
  PERMISSIONS.REPORTS_GENERATE,
  PERMISSIONS.SYSTEM_VIEW,
];

// Viewer can only read
export const VIEWER_PERMISSIONS: Permission[] = [
  PERMISSIONS.PROJECTS_READ,
  PERMISSIONS.RESOURCES_READ,
  PERMISSIONS.METRICS_READ,
  PERMISSIONS.REPORTS_READ,
];

// BullMQ Queue names
export const QUEUE_NAMES = {
  METRICS: 'metrics',
  REPORTS: 'reports',
} as const;

// BullMQ Job names
export const JOB_NAMES = {
  COLLECT_ALL_METRICS: 'collect-all-metrics',
  COLLECT_PROJECT_METRICS: 'collect-project-metrics',
  COLLECT_RESOURCE_METRICS: 'collect-resource-metrics',
  GENERATE_REPORT: 'generate-report',
} as const;

// Pagination
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// Metric chart defaults
export const METRIC_CHART_DEFAULT_HOURS = 24;
export const METRIC_CHART_MAX_HOURS = 720; // 30 days

// AWS CloudWatch metric namespaces
export const CW_NAMESPACE_EC2 = 'AWS/EC2';
export const CW_NAMESPACE_CW_AGENT = 'CWAgent'; // CloudWatch Agent metrics (RAM, disk)
