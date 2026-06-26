import { z } from 'zod';

export const noteTemplateCreateSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(12000),
  scope: z.string().max(32).default('quote'),
});
export type NoteTemplateCreateInput = z.infer<typeof noteTemplateCreateSchema>;

export const noteTemplateUpdateSchema = noteTemplateCreateSchema.partial().refine(
  (value) => value.title !== undefined || value.body !== undefined || value.scope !== undefined,
  'En az bir alan gönderilmelidir',
);
export type NoteTemplateUpdateInput = z.infer<typeof noteTemplateUpdateSchema>;

export const noteTemplateListQuerySchema = z.object({
  scope: z.string().max(32).optional(),
});
export type NoteTemplateListQuery = z.infer<typeof noteTemplateListQuerySchema>;
