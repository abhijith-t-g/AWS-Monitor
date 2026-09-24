import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  awsAccountId: z.string().regex(/^\d{12}$/, 'AWS Account ID must be 12 digits').optional().or(z.literal('')),
});

export const updateProjectSchema = createProjectSchema.partial();

export const projectIdSchema = z.object({
  projectId: z.string().uuid(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
