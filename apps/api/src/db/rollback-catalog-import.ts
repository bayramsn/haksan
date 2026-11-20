/** Read-only preview by default; rollback refuses rows edited after import. */
import { getDb, closeDb } from './client';
import { rollbackCatalogImport } from './catalog-import-journal';
import { rollbackHexlaser2026 } from './import-hexlaser-2026';
const tenantId=process.argv.find(arg=>arg.startsWith('--tenant='))?.slice(9);
if(!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId))throw new Error('--tenant=<uuid> required');
const run=process.argv.includes('--hex2026')?rollbackHexlaser2026:rollbackCatalogImport;
run(getDb(),tenantId,process.argv.includes('--execute')).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error instanceof Error?error.message:'Rollback failed');process.exitCode=1;}).finally(closeDb);
