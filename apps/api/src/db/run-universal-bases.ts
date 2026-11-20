/** CLI: default read-only preview; --apply writes, --rollback restores only unchanged/import-owned rows. */
import { getDb, closeDb } from './client';
import { importUniversalBases, rollbackUniversalBases } from './import-universal-bases';
async function main(){
 const tenantId=process.env.CATALOG_TENANT_ID,userId=process.env.CATALOG_USER_ID;
 if(!tenantId||!userId)throw new Error('CATALOG_TENANT_ID and CATALOG_USER_ID required');
 const apply=process.argv.includes('--apply');
 console.log(JSON.stringify(process.argv.includes('--rollback')?await rollbackUniversalBases(getDb(),tenantId,apply):await importUniversalBases(getDb(),tenantId,userId,apply),null,2));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;}).finally(closeDb);
