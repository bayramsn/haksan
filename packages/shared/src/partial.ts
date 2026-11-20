import { z } from 'zod';

type OptionalShape<T extends z.ZodRawShape> = {
  [K in keyof T]: z.ZodOptional<z.ZodNonOptional<T[K]>>;
};

/** PATCH omission must not apply create-schema defaults (Zod 3 behavior). */
export function partialWithoutDefaults<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [key, z.optional(z.nonoptional(field))]),
  ) as OptionalShape<T>;
  return schema.extend(shape);
}
