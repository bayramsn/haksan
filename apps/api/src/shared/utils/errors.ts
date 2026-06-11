/**
 * Application error taxonomy. Mapped to HTTP status codes by the global filter.
 * Never expose internal details (stack traces, sql) to the response — that's
 * the filter's job (see app/filters/all-exceptions.filter.ts).
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Yetkisiz') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Erişim reddedildi') {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} bulunamadı`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, 409, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 422, details);
  }
}

export class LockedError extends AppError {
  constructor(message: string, retryAfterSeconds?: number) {
    super('LOCKED', message, 423, retryAfterSeconds ? { retryAfterSeconds } : undefined);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Çok fazla istek, lütfen bekleyin') {
    super('RATE_LIMITED', message, 429);
  }
}
