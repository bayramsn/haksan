import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { laserSelectionSchema, laserSpecSchema } from '@haksan/shared';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { LaserProfilesService } from './laser-profiles.service';

const optionsSchema = z.object({ divisionId: z.string().uuid(), brandId: z.string().uuid().optional() });
const scopeSchema = optionsSchema.extend({ brandId: z.string().uuid() });
const resolveSchema = z.intersection(scopeSchema, z.preprocess(
  (value) => value && typeof value === 'object' ? { ...value, powerKw: Number((value as Record<string, unknown>).powerKw) } : value,
  laserSelectionSchema,
));
const saveSchema = scopeSchema.extend({ selection: laserSelectionSchema, specs: z.array(laserSpecSchema).max(150) });

@UseGuards(AuthGuard, PermissionsGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller()
export class LaserProfilesController {
  constructor(private readonly service: LaserProfilesService) {}

  @RequirePermissions('products.read')
  @Get('laser-profiles/options')
  options(@Query(new ZodValidationPipe(optionsSchema)) query: z.infer<typeof optionsSchema>, @CurrentUser() actor: AuthContext) {
    return this.service.options(query, actor);
  }

  @RequirePermissions('products.read')
  @Get('laser-profiles/resolve')
  resolve(@Query(new ZodValidationPipe(resolveSchema)) query: z.infer<typeof resolveSchema>, @CurrentUser() actor: AuthContext) {
    return this.service.resolve(query, laserSelectionSchema.parse(query), actor);
  }

  @RequirePermissions('products.update')
  @Put('admin/laser-profiles')
  save(@Body(new ZodValidationPipe(saveSchema)) body: z.infer<typeof saveSchema>, @CurrentUser() actor: AuthContext) {
    return this.service.save(body, body.selection, body.specs, actor);
  }
}
