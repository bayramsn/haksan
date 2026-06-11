import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { STORAGE_PROVIDER } from './storage.types';
import { S3StorageProvider } from './s3-storage.provider';
import { SupabaseStorageProvider } from './supabase-storage.provider';
import { loadEnv } from '../../config/env';

@Global()
@Module({
  providers: [
    S3StorageProvider,
    SupabaseStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [S3StorageProvider, SupabaseStorageProvider],
      useFactory: (s3: S3StorageProvider, supa: SupabaseStorageProvider) => {
        const env = loadEnv();
        return env.S3_PROVIDER === 'supabase' ? supa : s3;
      },
    },
    StorageService,
  ],
  exports: [StorageService, STORAGE_PROVIDER],
})
export class StorageModule {}
