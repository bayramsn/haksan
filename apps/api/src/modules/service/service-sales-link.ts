import { and, eq, isNull } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { opportunities } from '../../db/schema/crm';
import { customerDevices } from '../../db/schema/inventory';

/**
 * Servis kaydının bağlandığı satış: makinenin satıldığı fırsat.
 * Servis kaydı açan her yol (elle, şikayetten dönüşüm, bakım otomasyonu) bunu
 * kullanır; cihaz yoksa, satışı silinmişse ya da satış başka firmanınsa null döner.
 */
export async function opportunityIdForDevice(
  db: DbClient,
  tenantId: string,
  customerDeviceId: string | null | undefined,
): Promise<string | null> {
  if (!customerDeviceId) return null;
  const [row] = await db
    .select({ id: opportunities.id })
    .from(customerDevices)
    .innerJoin(
      opportunities,
      and(
        eq(opportunities.id, customerDevices.opportunityId),
        eq(opportunities.tenantId, tenantId),
        // Makine el değiştirdiyse eski alıcının satışı yeni sahibin servisine bağlanmaz.
        eq(opportunities.companyId, customerDevices.companyId),
        isNull(opportunities.deletedAt),
      ),
    )
    .where(and(eq(customerDevices.id, customerDeviceId), eq(customerDevices.tenantId, tenantId), isNull(customerDevices.deletedAt)))
    .limit(1);
  return row?.id ?? null;
}
