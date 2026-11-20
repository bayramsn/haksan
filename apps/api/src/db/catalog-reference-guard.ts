import { sql } from 'drizzle-orm';
import type { DbClient } from './client';
/** Every inbound FK matters, including SET NULL and CASCADE. Only journal-owned children may be removed. */
export async function guardCatalogReferences(db: DbClient, table: string, id: string, journal: Array<{ table: string; id: string }>) {
 const refs=await db.execute(sql`SELECT ns.nspname AS schema,child.relname AS child,att.attname AS column FROM pg_constraint fk JOIN pg_class child ON child.oid=fk.conrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace JOIN pg_attribute att ON att.attrelid=child.oid AND att.attnum=fk.conkey[1] WHERE fk.contype='f' AND fk.confrelid=to_regclass(${table}) AND array_length(fk.conkey,1)=1`);
 for(const ref of refs.rows as Array<{schema:string;child:string;column:string}>){
  const rows=await db.execute(sql`SELECT to_jsonb(t)->>'id' AS id FROM ${sql.identifier(ref.schema)}.${sql.identifier(ref.child)} t WHERE ${sql.identifier(ref.column)}=${id}::uuid`);
  if(rows.rows.some(row=>!journal.some(entry=>entry.table===ref.child && entry.id===row.id)))throw new Error(`Rollback blocked by new reference: ${ref.child}/${id}`);
 }
}
