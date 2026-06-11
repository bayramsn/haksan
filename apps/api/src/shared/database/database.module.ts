import { Global, Module } from '@nestjs/common';
import { getDb } from '../../db/client';

export const DB = 'DB_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: () => getDb(),
    },
  ],
  exports: [DB],
})
export class DatabaseModule {}
