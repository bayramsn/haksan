import { PipeTransform, Injectable } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { ValidationError } from './errors';

// Covers the supported 10,000-ID bulk actions and 5,000-event imports while
// rejecting oversized collections before Zod can allocate per-item issues.
function checkValidationBudget(value: unknown): void {
  const pending = [{ value, depth: 0 }];
  let remaining = 250_000;
  while (pending.length) {
    const current = pending.pop()!;
    if (--remaining < 0 || current.depth > 64) {
      throw new ValidationError('İstek içeriği doğrulama sınırını aşıyor');
    }
    if (!current.value || typeof current.value !== 'object') continue;
    const entries = Array.isArray(current.value) ? current.value : Object.values(current.value);
    if (entries.length > 10_000 || pending.length + entries.length > remaining) {
      throw new ValidationError('İstek içeriği doğrulama sınırını aşıyor');
    }
    for (const entry of entries) pending.push({ value: entry, depth: current.depth + 1 });
  }
}

/**
 * Nest pipe that runs a Zod schema against the incoming value.
 * Usage:
 *
 *   @Body(new ZodValidationPipe(loginSchema)) body: LoginInput
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    checkValidationBudget(value);
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.length ? issue.path.join('.') : '_';
        fieldErrors[key] ??= [];
        fieldErrors[key].push(issue.message);
      }
      // Kullanıcı hangi alanın neden reddedildiğini mesajda görsün (ilk 4 alan).
      const summary = Object.entries(fieldErrors)
        .slice(0, 4)
        .map(([field, messages]) => `${field}: ${messages[0]}`)
        .join('; ');
      throw new ValidationError(summary ? `Doğrulama hatası — ${summary}` : 'Doğrulama hatası', { fieldErrors });
    }
    return result.data;
  }
}

export function zod<T>(schema: ZodSchema<T>) {
  return new ZodValidationPipe(schema);
}
