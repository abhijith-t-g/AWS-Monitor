import { z } from 'zod';

export const createReportSchema = z.object({
  name: z.string().min(1).max(200),
  projectId: z.string().uuid().optional(),
  resourceIds: z.array(z.string().uuid()).min(1, 'Select at least one resource'),
  startDate: z.string().pipe(z.coerce.date()),
  endDate: z.string().pipe(z.coerce.date()),
  includeMetrics: z
    .array(z.enum(['cpu', 'memory', 'disk', 'network']))
    .min(1, 'Select at least one metric'),
}).refine((d) => d.endDate > d.startDate, {
  message: 'End date must be after start date',
  path: ['endDate'],
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

export interface ReportParameters {
  resourceIds: string[];
  startDate: string;
  endDate: string;
  includeMetrics: string[];
  projectId?: string;
}
