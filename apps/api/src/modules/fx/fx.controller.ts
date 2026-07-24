import { Controller, Get } from '@nestjs/common';
import { Public } from '../../shared/security/auth.guard';
import { FxService } from './fx.service';

/**
 * Günlük döviz kuru proxy'si — genel/baz para birimi USD.
 *
 * Kurlar sunucu tarafında çekilir (tarayıcıdaki CORS sorununu by-pass eder),
 * gün içinde in-memory önbelleğe alınır. Birincil kaynak frankfurter.app (ECB),
 * yedek kaynak open.er-api.com. İkisi de başarısız olursa son bilinen ya da
 * fallback değer döner — endpoint asla hata fırlatmaz.
 */
@Controller('fx')
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Public()
  @Get('rates')
  rates() {
    return this.fx.rates();
  }
}
