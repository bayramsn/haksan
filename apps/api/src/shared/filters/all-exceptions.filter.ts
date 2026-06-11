import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();

    let status = 500;
    let body: ErrorBody = {
      error: { code: 'INTERNAL_ERROR', message: 'Sunucu hatası, lütfen tekrar deneyin.' },
    };

    if (exception instanceof AppError) {
      status = exception.statusCode;
      body = {
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      body = {
        error: {
          code: typeof resp === 'object' && resp && 'code' in resp ? String((resp as any).code) : 'HTTP_ERROR',
          message:
            typeof resp === 'string'
              ? resp
              : typeof resp === 'object' && resp && 'message' in resp
                ? String((resp as any).message)
                : exception.message,
        },
      };
    }

    if (status >= 500) {
      logger.error({ err: exception, path: req.url, method: req.method }, 'Unhandled exception');
    } else {
      logger.warn({ status, code: body.error.code, path: req.url, method: req.method }, 'Request error');
    }

    res.status(status).send(body);
  }
}
