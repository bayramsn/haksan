import { z } from 'zod';

// UUIDs are flexible across providers (Postgres gen_random_uuid, MySQL UUID(), SQLite text)
export const uuidSchema = z.string().uuid();
export const idSchema = z.string().min(1).max(64);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sortBy: z.string().max(64).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type DateRange = z.infer<typeof dateRangeSchema>;

export const moneySchema = z.coerce.number().nonnegative().multipleOf(0.0001);
export const percentSchema = z.coerce.number().min(0).max(100).multipleOf(0.01);

export const phoneSchema = z.string().min(5).max(32).regex(/^[+0-9 ()\-]*$/, 'Geçersiz telefon');
export const emailSchema = z.string().email().max(255);
export const urlSchema = z.string().url().max(512);
