export type TradeFairExportFormat = 'xlsx' | 'pdf';
type Filters = {
  fairName?: string;
  q?: string;
  divisionId?: string;
  metByUserId?: string;
  province?: string;
  district?: string;
};

/** Web TradeFairsPage listParams; sayfalama yerine sunucudaki tüm eşleşmeler indirilir. */
export function tradeFairExportRequest(format: TradeFairExportFormat, filters: Filters) {
  const { fairName, q, divisionId, metByUserId, province, district } = filters;
  return {
    path: '/trade-fairs/export',
    filename: `fuar-gorusmeleri.${format}`,
    query: { fairName, q, divisionId, metByUserId, province, district: province ? district : undefined, format },
  };
}
