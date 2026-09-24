import { z } from 'zod';
import { ResourceType } from '@prisma/client';

export const createResourceSchema = z.object({
  awsResourceId: z.string().min(1, 'AWS Resource ID is required').max(256),
  resourceType: z.nativeEnum(ResourceType),
  region: z.string().min(1, 'Region is required').max(50),
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
});

export const updateResourceSchema = createResourceSchema.partial().omit({ awsResourceId: true, resourceType: true });

export const resourceIdSchema = z.object({
  projectId: z.string().uuid(),
  resourceId: z.string().uuid(),
});

export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
