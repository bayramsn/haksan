import { z } from 'zod';

/**
 * Fiber lazer kesim makinesi fiyat listelerinin maliyet formülü (USD):
 *   matrah  = FOB + görünüm + navlun (konteyner başına toplanır)
 *   maliyet = matrah × (1 + gümrük oranı) + sabit giderler
 *   liste   = maliyet × (1 + liste kârı), son = maliyet × (1 + son kâr); tam dolara yuvarlanır.
 */
export const laserCostFormulaSchema = z.object({
  appearanceUsd: z.number().finite().min(0).max(1_000_000),
  freight20Usd: z.number().finite().min(0).max(1_000_000),
  freight40Usd: z.number().finite().min(0).max(1_000_000),
  dutyRate: z.number().finite().min(0).max(5),
  fixedUsd: z.number().finite().min(0).max(1_000_000),
  listMarkup: z.number().finite().min(0).max(10),
  cashMarkup: z.number().finite().min(0).max(10),
}).strict();
export type LaserCostFormula = z.infer<typeof laserCostFormulaSchema>;

export const LASER_PRICE_LIST_PRESETS = [
  {
    code: 'LAZER-CIF-IST',
    name: 'Fiber Lazer Kesim – CIF İstanbul Gümrük Teslim',
    // sabit: kurulum 1.000 + antrepo/vinç 1.000 + ek 1.000
    formula: { appearanceUsd: 600, freight20Usd: 4000, freight40Usd: 7000, dutyRate: 0, fixedUsd: 3000, listMarkup: 0.3, cashMarkup: 0.25 },
  },
  {
    code: 'LAZER-MILLI-IST',
    name: 'Fiber Lazer Kesim – Millileştirilmiş Antrepo Teslim İstanbul',
    // sabit: TSE/TAREKS 500 + kurulum 1.000 + antrepo/vinç 1.500 + ek 1.000
    formula: { appearanceUsd: 600, freight20Usd: 4000, freight40Usd: 7000, dutyRate: 0.25, fixedUsd: 4000, listMarkup: 0.3, cashMarkup: 0.25 },
  },
] as const satisfies ReadonlyArray<{ code: string; name: string; formula: LaserCostFormula }>;
export type LaserPriceListCode = (typeof LASER_PRICE_LIST_PRESETS)[number]['code'];

export const laserPriceListRecalculateSchema = z.object({
  code: z.enum(['LAZER-CIF-IST', 'LAZER-MILLI-IST']),
  formula: laserCostFormulaSchema,
  apply: z.boolean(),
}).strict();
export type LaserPriceListRecalculateInput = z.infer<typeof laserPriceListRecalculateSchema>;

/** Yalnız kesim makineleri listelenir; HW el kaynağı ayrı ürün ailesidir. */
export const isLaserCuttingConfiguration = (sourceModelCode: string) => !/^HW-/i.test(sourceModelCode);

/** "40HC+20GP", "3*40HC+1*20GP" gibi ifadelerin navlunu; tanınmayan ya da boşsa null. */
export function laserContainerFreight(container: string | null | undefined, formula: LaserCostFormula): number | null {
  if (!container?.trim()) return null;
  let total = 0;
  for (const part of container.split('+')) {
    const match = part.trim().toUpperCase().match(/^(?:(\d+)\s*[*X×]\s*)?(20GP|20HQ|40HC|40HQ)$/);
    if (!match) return null;
    total += Number(match[1] ?? 1) * (match[2]!.startsWith('20') ? formula.freight20Usd : formula.freight40Usd);
  }
  return total;
}

export interface LaserListPrice { freight: number; duty: number; cost: number; listPrice: number; cashPrice: number }

export function laserListPrice(fobUsd: number | null, container: string | null | undefined, formula: LaserCostFormula): LaserListPrice | null {
  const freight = laserContainerFreight(container, formula);
  if (fobUsd === null || !Number.isFinite(fobUsd) || fobUsd <= 0 || freight === null) return null;
  const base = fobUsd + formula.appearanceUsd + freight;
  const duty = base * formula.dutyRate;
  const cost = base + duty + formula.fixedUsd;
  return {
    freight,
    duty: Math.round(duty),
    cost: Math.round(cost),
    listPrice: Math.round(cost * (1 + formula.listMarkup)),
    cashPrice: Math.round(cost * (1 + formula.cashMarkup)),
  };
}
