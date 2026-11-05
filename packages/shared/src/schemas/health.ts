import { z } from 'zod';

export const serviceStatusSchema = z.enum(['up', 'down']);

export const healthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  environment: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
  services: z.object({
    api: z.object({ status: serviceStatusSchema }),
    database: z.object({
      status: serviceStatusSchema,
      latencyMs: z.number().nonnegative().nullable(),
    }),
  }),
});

export type ServiceStatus = z.infer<typeof serviceStatusSchema>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;
