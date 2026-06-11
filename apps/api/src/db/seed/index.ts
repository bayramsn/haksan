import { seedLookups } from './lookups';
import { seedDemo } from './demo';
import { closeDb } from '../client';

async function main() {
  console.log('[seed] lookups …');
  await seedLookups();
  console.log('[seed] demo …');
  await seedDemo();
  await closeDb();
  console.log('[seed] all done.');
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
