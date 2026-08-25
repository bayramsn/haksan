import { AppError } from '../../shared/utils/errors';

export class MetaConfigurationError extends AppError {
  constructor(message = 'Meta entegrasyonu sunucuda yapılandırılmamış') {
    super('META_NOT_CONFIGURED', message, 503);
  }
}

export class MetaUpstreamError extends AppError {
  constructor(message = 'Meta servisi isteği tamamlanamadı', statusCode = 502) {
    super('META_UPSTREAM_ERROR', message, statusCode);
  }
}
