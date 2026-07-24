import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import * as Sentry from '@sentry/node';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { incUnhandledException } from '../observability/metrics';
import { redactRequestPath } from '../observability/redact-request-path';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
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
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      (exception as { code?: string }).code === '42P01'
    ) {
      status = 503;
      body = {
        error: {
          code: 'SCHEMA_OUT_OF_DATE',
          message: 'Veritabanı şeması güncel değil. Sistem yöneticisine başvurun.',
        },
      };
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      typeof (exception as any).statusCode === 'number' &&
      (exception as any).statusCode >= 400 &&
      (exception as any).statusCode < 600
    ) {
      // Fastify-kaynaklı hatalar (örn. boş JSON gövdesi → FST_ERR_CTP_EMPTY_JSON_BODY).
      // Bunlar AppError/HttpException değil ama doğru HTTP status'u taşır; 500'e
      // düşürmek yerine o status'la döndür.
      const fe = exception as { statusCode: number; code?: string; message?: string };
      status = fe.statusCode;
      body = {
        error: {
          code: typeof fe.code === 'string' ? fe.code : 'HTTP_ERROR',
          message: fe.message ?? 'İstek işlenemedi.',
        },
      };
    }

    // Correlation + auth context so 4xx/5xx logs can be tied to a single request
    // and the acting tenant/user/session during incident triage.
    const context = {
      requestId: req.requestId,
      path: redactRequestPath(req.url),
      method: req.method,
      status,
      errorCode: body.error.code,
      tenantId: req.auth?.tenantId,
      userId: req.auth?.userId,
      sessionId: req.auth?.sessionId,
    };

    // Destek ekibi tarayıcıdaki hata ile sunucu/Sentry kaydını tek değerle
    // eşleştirebilsin. Stack trace veya iç sistem ayrıntısı açığa çıkarılmaz.
    if (req.requestId) body.error.requestId = req.requestId;

    if (status >= 500) {
      incUnhandledException(body.error.code);
      // No-op unless Sentry is initialized (SENTRY_DSN set). Tags/extras carry
      // the same correlation context used in logs.
      Sentry.captureException(exception, {
        tags: { code: body.error.code, method: req.method },
        extra: { ...context },
      });
      logger.error({ err: exception, ...context }, 'Unhandled exception');
    } else {
      logger.warn(
        { ...(body.error.details ? { details: body.error.details } : {}), ...context },
        'Request error'
      );
    }

    res.status(status).send(body);
  }
}
