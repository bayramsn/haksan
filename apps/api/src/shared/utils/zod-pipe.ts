import { PipeTransform, Injectable } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { ValidationError } from './errors';

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
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.length ? issue.path.join('.') : '_';
        fieldErrors[key] ??= [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError('Doğrulama hatası', { fieldErrors });
    }
    return result.data;
  }
}

export function zod<T>(schema: ZodSchema<T>) {
  return new ZodValidationPipe(schema);
}
