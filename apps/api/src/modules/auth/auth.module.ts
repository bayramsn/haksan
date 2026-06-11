import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtTokenService } from '../../shared/security/jwt.service';
import { AuditService } from '../../shared/database/audit.service';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard } from '../../shared/security/permissions.guard';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtTokenService, AuditService, AuthGuard, PermissionsGuard],
  exports: [AuthService, JwtTokenService, AuthGuard, PermissionsGuard],
})
export class AuthModule {}
