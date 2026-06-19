import { sql } from 'drizzle-orm';
import type { DbClient } from '../client';

export async function up(db: DbClient): Promise<void> {
  await db.execute(sql`
    INSERT INTO permissions (code, name, resource, action)
    VALUES ('divisions.view_all', 'Bölümler - tümünü gör', 'divisions', 'view_all')
    ON CONFLICT (code) DO NOTHING;

    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r
    CROSS JOIN permissions p
    WHERE p.code = 'divisions.view_all'
      AND r.code IN ('super_admin', 'admin')
    ON CONFLICT DO NOTHING;

    WITH defs(code, name, sort_order) AS (
      VALUES
        ('cnc', 'CNC', 1),
        ('universal', 'Üniversal', 2),
        ('sac_isleme', 'Sac İşleme', 3)
    )
    INSERT INTO divisions (tenant_id, code, name, sort_order)
    SELECT t.id, defs.code, defs.name, defs.sort_order
    FROM tenants t
    CROSS JOIN defs
    ON CONFLICT (tenant_id, code) DO NOTHING;
  `);

  await db.execute(sql`
    INSERT INTO company_divisions (tenant_id, company_id, division_id)
    SELECT c.tenant_id, c.id, d.id
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE cg.code IN ('cnc', 'universal', 'sac_isleme')
    ON CONFLICT DO NOTHING;

    INSERT INTO contact_companies (tenant_id, contact_id, company_id, is_primary)
    SELECT c.tenant_id, c.id, c.company_id, true
    FROM contacts c
    WHERE c.company_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  `);

  // NOT: Postgres'te UPDATE ... FROM hedef tabloyu (örn. "a") FROM içindeki bir
  // JOIN ON koşulundan referans alamaz ("invalid reference to FROM-clause entry").
  // İlişkili kayıttan (fırsat/teklif/sipariş…) tercih edilen bölümü çekerken bu
  // yüzden korelasyonlu alt sorgu kullanıyoruz; company_group fallback'i d.id'dir.
  await db.execute(sql`
    UPDATE opportunities o
    SET division_id = d.id
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE o.division_id IS NULL
      AND o.company_id = c.id
      AND o.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');

    UPDATE leads l
    SET division_id = d.id
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE l.division_id IS NULL
      AND l.company_id = c.id
      AND l.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');

    UPDATE sales_activities a
    SET division_id = COALESCE((SELECT o.division_id FROM opportunities o WHERE o.id = a.opportunity_id), d.id)
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE a.division_id IS NULL
      AND a.company_id = c.id
      AND a.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');

    UPDATE visits v
    SET division_id = COALESCE((SELECT o.division_id FROM opportunities o WHERE o.id = v.opportunity_id), d.id)
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE v.division_id IS NULL
      AND v.company_id = c.id
      AND v.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');

    UPDATE calls ca
    SET division_id = COALESCE((SELECT o.division_id FROM opportunities o WHERE o.id = ca.opportunity_id), d.id)
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE ca.division_id IS NULL
      AND ca.company_id = c.id
      AND ca.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');
  `);

  await db.execute(sql`
    UPDATE quotes q
    SET division_id = COALESCE((SELECT o.division_id FROM opportunities o WHERE o.id = q.opportunity_id), d.id)
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE q.division_id IS NULL
      AND q.company_id = c.id
      AND q.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');

    UPDATE quote_items qi
    SET division_id = q.division_id
    FROM quotes q
    WHERE qi.division_id IS NULL
      AND qi.quote_id = q.id
      AND q.division_id IS NOT NULL;

    UPDATE proformas p
    SET division_id = q.division_id
    FROM quotes q
    WHERE p.division_id IS NULL
      AND p.quote_id = q.id
      AND q.division_id IS NOT NULL;

    UPDATE contracts c
    SET division_id = q.division_id
    FROM quotes q
    WHERE c.division_id IS NULL
      AND c.quote_id = q.id
      AND q.division_id IS NOT NULL;

    UPDATE commercial_invoices ci
    SET division_id = q.division_id
    FROM quotes q
    WHERE ci.division_id IS NULL
      AND ci.quote_id = q.id
      AND q.division_id IS NOT NULL;
  `);

  await db.execute(sql`
    UPDATE sales_orders so
    SET division_id = COALESCE(
      (SELECT q.division_id FROM quotes q WHERE q.id = so.quote_id),
      (SELECT o.division_id FROM opportunities o WHERE o.id = so.opportunity_id),
      d.id
    )
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE so.division_id IS NULL
      AND so.company_id = c.id
      AND so.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');

    UPDATE purchase_orders po
    SET division_id = d.id
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE po.division_id IS NULL
      AND po.supplier_company_id = c.id
      AND po.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');
  `);

  await db.execute(sql`
    UPDATE accounting_invoices ai
    SET division_id = COALESCE(
      (SELECT q.division_id FROM quotes q WHERE q.id = ai.quote_id),
      (SELECT so.division_id FROM sales_orders so WHERE so.id = ai.sales_order_id),
      d.id
    )
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE ai.division_id IS NULL
      AND ai.company_id = c.id
      AND ai.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');

    UPDATE receivables r
    SET division_id = COALESCE(
      (SELECT q.division_id FROM quotes q WHERE q.id = r.quote_id),
      (SELECT ai.division_id FROM accounting_invoices ai WHERE ai.id = r.accounting_invoice_id),
      d.id
    )
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE r.division_id IS NULL
      AND r.company_id = c.id
      AND r.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');

    UPDATE payables p
    SET division_id = COALESCE(
      (SELECT ai.division_id FROM accounting_invoices ai WHERE ai.id = p.accounting_invoice_id),
      d.id
    )
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE p.division_id IS NULL
      AND p.company_id = c.id
      AND p.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');

    UPDATE payments p
    SET division_id = COALESCE(
      (SELECT r.division_id FROM receivables r WHERE r.id = p.receivable_id),
      (SELECT py.division_id FROM payables py WHERE py.id = p.payable_id),
      (SELECT ai.division_id FROM accounting_invoices ai WHERE ai.id = p.accounting_invoice_id),
      d.id
    )
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE p.division_id IS NULL
      AND p.company_id = c.id
      AND p.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');
  `);

  await db.execute(sql`
    UPDATE inventory_items ii
    SET division_id = d.id
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE ii.division_id IS NULL
      AND ii.reserved_company_id = c.id
      AND ii.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');

    UPDATE inventory_movements im
    SET division_id = ii.division_id
    FROM inventory_items ii
    WHERE im.division_id IS NULL
      AND im.inventory_item_id = ii.id
      AND ii.division_id IS NOT NULL;

    UPDATE customer_devices cd
    SET division_id = COALESCE(
      (SELECT o.division_id FROM opportunities o WHERE o.id = cd.opportunity_id),
      (SELECT q.division_id FROM quotes q WHERE q.id = cd.quote_id),
      (SELECT ii.division_id FROM inventory_items ii WHERE ii.id = cd.inventory_item_id),
      d.id
    )
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE cd.division_id IS NULL
      AND cd.company_id = c.id
      AND cd.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');
  `);

  await db.execute(sql`
    UPDATE installation_jobs ij
    SET division_id = COALESCE(
      (SELECT o.division_id FROM opportunities o WHERE o.id = ij.opportunity_id),
      (SELECT q.division_id FROM quotes q WHERE q.id = ij.quote_id),
      (SELECT cd.division_id FROM customer_devices cd WHERE cd.id = ij.customer_device_id),
      d.id
    )
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE ij.division_id IS NULL
      AND ij.company_id = c.id
      AND ij.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');

    UPDATE service_tickets st
    SET division_id = COALESCE(
      (SELECT cd.division_id FROM customer_devices cd WHERE cd.id = st.customer_device_id),
      d.id
    )
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE st.division_id IS NULL
      AND st.company_id = c.id
      AND st.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');

    UPDATE shipments s
    SET division_id = COALESCE(
      (SELECT so.division_id FROM sales_orders so WHERE so.id = s.sales_order_id),
      (SELECT q.division_id FROM quotes q WHERE q.id = s.quote_id),
      (SELECT o.division_id FROM opportunities o WHERE o.id = s.opportunity_id),
      d.id
    )
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE s.division_id IS NULL
      AND s.company_id = c.id
      AND s.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');

    UPDATE deliveries de
    SET division_id = COALESCE(
      (SELECT so.division_id FROM sales_orders so WHERE so.id = de.sales_order_id),
      (SELECT s.division_id FROM shipments s WHERE s.id = de.shipment_id),
      (SELECT o.division_id FROM opportunities o WHERE o.id = de.opportunity_id),
      d.id
    )
    FROM companies c
    JOIN company_groups cg ON cg.id = c.company_group_id
    JOIN divisions d ON d.tenant_id = c.tenant_id AND d.code = cg.code
    WHERE de.division_id IS NULL
      AND de.company_id = c.id
      AND de.tenant_id = c.tenant_id
      AND cg.code IN ('cnc', 'universal', 'sac_isleme');
  `);

  console.log('[data-migrate] 002_backfill_division_isolation: seeded divisions and backfilled portfolio/commercial division ids.');
}
