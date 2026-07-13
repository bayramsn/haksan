/**
 * Departmanlar arası stok/makine görünürlüğü: rol matrisine eklenen
 * sales→customer_devices.read ve finance→inventory/customer_devices/products.read
 * izinlerini mevcut tenant'lara senkronlar (fiyat listeleri kapsam dışı).
 */
import type { DbClient } from '../client';
import { up as syncRolePermissions } from './001_sync_role_permissions';

export async function up(db: DbClient): Promise<void> {
  await syncRolePermissions(db);
}
