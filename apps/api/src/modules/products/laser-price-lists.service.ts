import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
  LASER_PRICE_LIST_PRESETS,
  isLaserCuttingConfiguration,
  laserListPrice,
  type LaserCostFormula,
  type LaserPriceListRecalculateInput,
} from '@haksan/shared';
import type { DbClient } from '../../db/client';
import { currencies, priceListConfigurationItems, priceLists, productConfigurationPrices, productModels } from '../../db/schema';
import { DB } from '../../shared/database/database.module';
import { AuditService } from '../../shared/database/audit.service';
import { ForbiddenError, NotFoundError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type { ExportRow } from '../../shared/utils/excel-export';

const PRESET_CODES = LASER_PRICE_LIST_PRESETS.map((preset) => preset.code);
const canViewCost = (actor: AuthContext) => actor.roles.includes('super_admin') || actor.permissions.has('product_costs.view');

/**
 * Fiber lazer kesim makinelerinin CIF / millileştirilmiş fiyat listeleri: baz kart
 * model × güç maliyetinden (FOB) formülle üretilir, `price_list_configuration_items`'ta
 * saklanır. Maliyet ve formül yalnız `product_costs.view` sahibine döner.
 */
@Injectable()
export class LaserPriceListsService {
  constructor(@Inject(DB) private readonly db: DbClient, private readonly audit: AuditService) {}

  private async configurations(tenantId: string) {
    const rows = await this.db.select({
      id: productConfigurationPrices.id,
      productModelId: productConfigurationPrices.productModelId,
      productName: productModels.fullName,
      sourceModelCode: productConfigurationPrices.sourceModelCode,
      powerKw: productConfigurationPrices.powerKw,
      container: productConfigurationPrices.container,
      costPrice: productConfigurationPrices.costPrice,
      costCurrencyCode: currencies.code,
    }).from(productConfigurationPrices)
      .innerJoin(productModels, eq(productModels.id, productConfigurationPrices.productModelId))
      .leftJoin(currencies, eq(currencies.id, productConfigurationPrices.costCurrencyId))
      .where(and(eq(productConfigurationPrices.tenantId, tenantId), isNull(productConfigurationPrices.deletedAt), isNull(productModels.deletedAt)))
      .orderBy(asc(productModels.series), asc(productConfigurationPrices.sourceModelCode), asc(productConfigurationPrices.powerKw));
    return rows
      .filter((row) => isLaserCuttingConfiguration(row.sourceModelCode))
      .map((row) => ({ ...row, powerKw: Number(row.powerKw), fob: row.costPrice !== null && row.costCurrencyCode === 'USD' ? Number(row.costPrice) : null }));
  }

  private async savedLists(tenantId: string) {
    const lists = await this.db.select().from(priceLists)
      .where(and(eq(priceLists.tenantId, tenantId), inArray(priceLists.code, PRESET_CODES), isNull(priceLists.deletedAt), eq(priceLists.isActive, true)));
    const items = lists.length
      ? await this.db.select().from(priceListConfigurationItems).where(and(eq(priceListConfigurationItems.tenantId, tenantId), inArray(priceListConfigurationItems.priceListId, lists.map((list) => list.id))))
      : [];
    return { lists, items };
  }

  async list(actor: AuthContext) {
    const showCost = canViewCost(actor);
    const [rows, { lists, items }] = await Promise.all([this.configurations(actor.tenantId), this.savedLists(actor.tenantId)]);
    return {
      canViewCost: showCost,
      lists: LASER_PRICE_LIST_PRESETS.map((preset) => {
        const saved = lists.find((list) => list.code === preset.code);
        const formula: LaserCostFormula = saved?.costFormula ?? preset.formula;
        const prices = new Map(items.filter((item) => item.priceListId === saved?.id).map((item) => [item.configurationPriceId, item]));
        return {
          code: preset.code,
          name: saved?.name ?? preset.name,
          updatedAt: saved?.updatedAt ?? null,
          ...(showCost ? { formula } : {}),
          rows: rows.map((row) => {
            const price = prices.get(row.id);
            return {
              configurationPriceId: row.id,
              productModelId: row.productModelId,
              productName: row.productName,
              sourceModelCode: row.sourceModelCode,
              powerKw: row.powerKw,
              listPrice: price ? Number(price.listPrice) : null,
              cashPrice: price ? Number(price.cashPrice) : null,
              ...(showCost ? { container: row.container, fob: row.fob, cost: laserListPrice(row.fob, row.container, formula)?.cost ?? null } : {}),
            };
          }),
        };
      }),
    };
  }

  /** Önizleme (`apply: false`) ya da kaydetme: listenin tüm satırları formülle baştan üretilir. */
  async recalculate(input: LaserPriceListRecalculateInput, actor: AuthContext) {
    if (!canViewCost(actor)) throw new ForbiddenError('Listeyi maliyetten hesaplamak için ürün maliyetlerini görme yetkisi gerekir');
    const preset = LASER_PRICE_LIST_PRESETS.find((entry) => entry.code === input.code)!;
    const [rows, { lists, items }] = await Promise.all([this.configurations(actor.tenantId), this.savedLists(actor.tenantId)]);
    const saved = lists.find((list) => list.code === input.code);
    const previous = new Map(items.filter((item) => item.priceListId === saved?.id).map((item) => [item.configurationPriceId, item]));
    const evaluated = rows.map((row) => ({
      price: laserListPrice(row.fob, row.container, input.formula),
      old: previous.get(row.id),
      base: { configurationPriceId: row.id, productName: row.productName, sourceModelCode: row.sourceModelCode, powerKw: row.powerKw, container: row.container, fob: row.fob },
    }));
    const priced = evaluated.flatMap(({ price, old, base }) => (price
      ? [{ ...base, ...price, previousListPrice: old ? Number(old.listPrice) : null, previousCashPrice: old ? Number(old.cashPrice) : null }]
      : []));
    const skipped = evaluated.flatMap(({ price, base }) => (price
      ? []
      : [{ ...base, reason: base.fob === null ? 'USD maliyet yok' : 'Konteyner bilgisi yok ya da tanınmıyor' }]));
    if (!input.apply) return { code: input.code, applied: false, rows: priced, skipped };

    const [usd] = await this.db.select({ id: currencies.id }).from(currencies).where(eq(currencies.code, 'USD')).limit(1);
    if (!usd) throw new NotFoundError('USD para birimi');
    const listId = await this.db.transaction(async (tx) => {
      const [list] = await tx.insert(priceLists)
        .values({ tenantId: actor.tenantId, code: preset.code, name: preset.name, currencyId: usd.id, costFormula: input.formula })
        .onConflictDoUpdate({ target: [priceLists.tenantId, priceLists.code], set: { name: preset.name, costFormula: input.formula, currencyId: usd.id, deletedAt: null, isActive: true, updatedAt: new Date() } })
        .returning({ id: priceLists.id });
      await tx.delete(priceListConfigurationItems).where(and(eq(priceListConfigurationItems.priceListId, list!.id), eq(priceListConfigurationItems.tenantId, actor.tenantId)));
      if (priced.length) {
        await tx.insert(priceListConfigurationItems).values(priced.map((row) => ({
          tenantId: actor.tenantId, priceListId: list!.id, configurationPriceId: row.configurationPriceId,
          listPrice: String(row.listPrice), cashPrice: String(row.cashPrice),
        })));
      }
      return list!.id;
    });
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'price_list.laser.recalculated',
      resourceType: 'price_list',
      resourceId: listId,
      oldValues: saved?.costFormula ? { formula: saved.costFormula } : undefined,
      newValues: { code: preset.code, formula: input.formula, priced: priced.length, skipped: skipped.length },
    });
    return { code: input.code, applied: true, rows: priced, skipped };
  }

  /** Müşteriye gidecek liste: yalnız model, güç, liste ve son fiyat; maliyet kalemleri yok. */
  async exportRows(code: string, actor: AuthContext): Promise<{ name: string; rows: ExportRow[] }> {
    const preset = LASER_PRICE_LIST_PRESETS.find((entry) => entry.code === code);
    if (!preset) throw new NotFoundError('Fiyat listesi');
    const { lists } = await this.list(actor);
    const list = lists.find((entry) => entry.code === code)!;
    return {
      // Excel sayfa adı 31 karakterle sınırlı; kısa ad.
      name: code === 'LAZER-CIF-IST' ? 'CIF İstanbul Gümrük Teslim' : 'Millileştirilmiş Antrepo Teslim',
      rows: list.rows.filter((row) => row.listPrice !== null).map((row) => ({
        'Ürün': row.productName,
        'Model': row.sourceModelCode,
        'Lazer Gücü (kW)': row.powerKw,
        'Liste Fiyatı (USD)': row.listPrice,
        'Son Fiyat (USD)': row.cashPrice,
      })),
    };
  }

  /** Teklif: baz kartın model × güç satırlarının liste fiyatları. */
  async pricesForProduct(productId: string, tenantId: string) {
    const { lists, items } = await this.savedLists(tenantId);
    if (!items.length) return [];
    const configurationIds = await this.db.select({ id: productConfigurationPrices.id }).from(productConfigurationPrices)
      .where(and(eq(productConfigurationPrices.productModelId, productId), eq(productConfigurationPrices.tenantId, tenantId), isNull(productConfigurationPrices.deletedAt)));
    const ids = new Set(configurationIds.map((row) => row.id));
    return items.filter((item) => ids.has(item.configurationPriceId)).map((item) => {
      const list = lists.find((entry) => entry.id === item.priceListId)!;
      return { configurationPriceId: item.configurationPriceId, code: list.code, name: list.name, listPrice: Number(item.listPrice), cashPrice: Number(item.cashPrice) };
    });
  }
}
