import type { LoggerService } from '@nestjs/common';
import type { Logger } from 'pino';
import { logger } from '../utils/logger';

/** Routes Nest framework logs through the same structured/redacted Pino sink. */
export class StructuredNestLogger implements LoggerService {
  constructor(private readonly sink: Logger = logger) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('trace', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(
    level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace',
    message: unknown,
    optionalParams: unknown[]
  ): void {
    const context = [...optionalParams].reverse().find((value) => typeof value === 'string');
    const error = message instanceof Error
      ? message
      : optionalParams.find((value): value is Error => value instanceof Error);
    const payload: Record<string, unknown> = {
      component: 'nest',
      ...(context ? { context } : {}),
      ...(error ? { err: error } : {}),
      ...(typeof message === 'object' && message !== null && !(message instanceof Error)
        ? { data: message }
        : {}),
    };
    const text = typeof message === 'string' ? message : error?.message ?? 'Nest framework event';
    this.sink[level](payload, text);
  }
}
