/**
 * Static registry of data migrations, in apply order.
 *
 * A static list (rather than fs scanning + dynamic import) keeps the runner
 * working identically under tsx (dev) and compiled node (prod), and makes the
 * apply order explicit and reviewable.
 */
import type { DbClient } from '../client';
import { up as syncRolePermissions } from './001_sync_role_permissions';
import { up as backfillDivisionIsolation } from './002_backfill_division_isolation';
import { up as syncLookups } from './003_sync_lookups';
import { up as standardizeCncProductSpecs } from './004_standardize_cnc_product_specs';
import { up as fillCncSpecDefaults } from './005_fill_cnc_spec_defaults';
import { up as setMt210TechnicalSpecs } from './006_set_mt210_1000_technical_specs';
import { up as standardizeRemainingCncSpecs } from './007_standardize_remaining_cnc_specs';
import { up as standardizeRemainingCncAliasSpecs } from './008_standardize_remaining_cnc_alias_specs';
import { up as forceRemainingCncDefaultSpecs } from './009_force_remaining_cnc_default_specs';
import { up as cleanupRemainingCncAliasSpecs } from './010_cleanup_remaining_cnc_alias_specs';
import { up as syncDocDeletePermissions } from './011_sync_doc_delete_permissions';
import { up as resyncLookupsSpecGroups } from './012_resync_lookups_spec_groups';
import { up as scopeProductLookupDefaults } from './013_scope_product_lookup_defaults';
import { up as syncFilePermissions } from './014_sync_file_permissions';
import { up as seedFilePermissionCatalog } from './015_seed_file_permission_catalog';
import { up as syncStockVisibilityPermissions } from './016_sync_stock_visibility_permissions';
import { up as dedupeProductGroupLookups } from './017_dedupe_product_group_lookups';
import { up as linkProductTaxonomy } from './018_link_product_taxonomy';
import { up as uppercaseCompanyContactNames } from './019_uppercase_company_contact_names';
import { up as backfillTrelloCompanyResolution } from './020_backfill_trello_company_resolution';

export interface DataMigration {
  id: string;
  up: (db: DbClient) => Promise<void>;
}

export const dataMigrations: DataMigration[] = [
  { id: '001_sync_role_permissions', up: syncRolePermissions },
  { id: '002_backfill_division_isolation', up: backfillDivisionIsolation },
  { id: '003_sync_lookups', up: syncLookups },
  { id: '004_standardize_cnc_product_specs', up: standardizeCncProductSpecs },
  { id: '005_fill_cnc_spec_defaults', up: fillCncSpecDefaults },
  { id: '006_set_mt210_1000_technical_specs', up: setMt210TechnicalSpecs },
  { id: '007_standardize_remaining_cnc_specs', up: standardizeRemainingCncSpecs },
  { id: '008_standardize_remaining_cnc_alias_specs', up: standardizeRemainingCncAliasSpecs },
  { id: '009_force_remaining_cnc_default_specs', up: forceRemainingCncDefaultSpecs },
  { id: '010_cleanup_remaining_cnc_alias_specs', up: cleanupRemainingCncAliasSpecs },
  { id: '011_sync_doc_delete_permissions', up: syncDocDeletePermissions },
  { id: '012_resync_lookups_spec_groups', up: resyncLookupsSpecGroups },
  { id: '013_scope_product_lookup_defaults', up: scopeProductLookupDefaults },
  { id: '014_sync_file_permissions', up: syncFilePermissions },
  { id: '015_seed_file_permission_catalog', up: seedFilePermissionCatalog },
  { id: '016_sync_stock_visibility_permissions', up: syncStockVisibilityPermissions },
  { id: '017_dedupe_product_group_lookups', up: dedupeProductGroupLookups },
  { id: '018_link_product_taxonomy', up: linkProductTaxonomy },
  { id: '019_uppercase_company_contact_names', up: uppercaseCompanyContactNames },
  { id: '020_backfill_trello_company_resolution', up: backfillTrelloCompanyResolution },
];
