import { z } from 'zod';
/** Non-laser bases keep distinct machine bodies; only explicitly verified alternatives are grouped. */
export const baseModelConfigurationSchema = z.object({
  kind: z.literal('universal'),
  baseModelCode: z.string().min(1).max(128),
  sourceModelCodes: z.array(z.string().min(1).max(128)).min(1),
  variableSpecKeys: z.array(z.string().max(255)),
  sourceRevision: z.string().min(1).max(128),
  configurations: z.array(z.object({
    sourceModelCode: z.string().min(1).max(128),
    sourceProductId: z.string().uuid(),
    sourceUrl: z.string().url().optional(),
    specs: z.array(z.object({ key: z.string(), value: z.string(), unit: z.string() })),
  })),
});
export type BaseModelConfiguration = z.infer<typeof baseModelConfigurationSchema>;
