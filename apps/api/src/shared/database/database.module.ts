import { Global, Module } from '@nestjs/common';
import { getDb } from '../../db/client';
import { createContextualDatabase } from '../../db/transaction-context';

export const DB = 'DB_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: () => createContextualDatabase(getDb()),
    },
  ],
  exports: [DB],
})
export class DatabaseModule {}
