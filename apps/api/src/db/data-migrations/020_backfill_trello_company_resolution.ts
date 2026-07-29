import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { DbClient } from '../client';
import { schema } from '../client';
import { extractTrelloCompanyCandidate } from '../../shared/utils/trello-company-resolution';

const stripLegacyTrelloMetadata = (description?: string | null) =>
  (description ?? '')
    .replace(
      /\n\n(?:Trello panosu|Trello listesi|Etiketler|Üyeler|Trello kart kimliği|Trello bağlantısı):[\s\S]*$/u,
      ''
    )
    .trim();

/**
 * İlk Trello CSV sürümü pano/üye/URL değerlerini lead firma/kontak/irtibat
 * alanlarında tutuyordu. Audit kaydıyla kesin olarak Trello importu olduğu
 * belirlenen fırsatları harici kaynak alanlarına taşır; fırsatları silmez veya
 * otomatik bir firmaya bağlamaz.
 */
export async function up(db: DbClient): Promise<void> {
  const auditRows = await db
    .select({
      resourceId: schema.auditLogs.resourceId,
      newValues: schema.auditLogs.newValues,
    })
    .from(schema.auditLogs)
    .where(
      and(
        eq(schema.auditLogs.action, 'opportunity.trello_imported'),
        eq(schema.auditLogs.resourceType, 'opportunity'),
        isNotNull(schema.auditLogs.resourceId)
      )
    )
    .orderBy(desc(schema.auditLogs.createdAt));

  const auditByOpportunity = new Map<string, Record<string, unknown>>();
  for (const row of auditRows) {
    if (!row.resourceId || auditByOpportunity.has(row.resourceId)) continue;
    auditByOpportunity.set(row.resourceId, (row.newValues ?? {}) as Record<string, unknown>);
  }
  const ids = Array.from(auditByOpportunity.keys()).filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  );
  if (!ids.length) {
    console.log('[data-migrate] 020_backfill_trello_company_resolution: Trello import kaydı yok.');
    return;
  }

  const rows = await db
    .select({
      id: schema.opportunities.id,
      title: schema.opportunities.title,
      description: schema.opportunities.description,
      leadContactName: schema.opportunities.leadContactName,
      leadCompanyTitle: schema.opportunities.leadCompanyTitle,
      leadContactValue: schema.opportunities.leadContactValue,
      externalSource: schema.opportunities.externalSource,
      externalKey: schema.opportunities.externalKey,
    })
    .from(schema.opportunities)
    .where(inArray(schema.opportunities.id, ids));

  const existingKeys = await db
    .select({ key: schema.opportunities.externalKey })
    .from(schema.opportunities)
    .where(eq(schema.opportunities.externalSource, 'trello'));
  const usedKeys = new Set(existingKeys.map((row) => row.key).filter((key): key is string => Boolean(key)));
  let migrated = 0;

  for (const row of rows) {
    if (row.externalSource === 'trello' && row.externalKey) continue;
    const audit = auditByOpportunity.get(row.id) ?? {};
    const cardId = typeof audit.trelloCardId === 'string' ? audit.trelloCardId.trim() : '';
    const cardUrl = typeof audit.trelloCardUrl === 'string' ? audit.trelloCardUrl.trim() : '';
    const rawKey = cardId
      ? `trello:${cardId}`
      : row.leadContactValue?.startsWith('trello:')
        ? row.leadContactValue.trim()
        : cardUrl
          ? `trello:url:${cardUrl}`
          : `legacy:${row.id}`;
    const externalKey = usedKeys.has(rawKey) ? `${rawKey}#${row.id}`.slice(0, 320) : rawKey.slice(0, 320);
    usedKeys.add(externalKey);
    const cleanedDescription = stripLegacyTrelloMetadata(row.description);
    const candidate = extractTrelloCompanyCandidate(row.title, cleanedDescription);

    await db
      .update(schema.opportunities)
      .set({
        description: cleanedDescription || null,
        leadContactName: null,
        leadCompanyTitle: null,
        leadContactValue: null,
        externalSource: 'trello',
        externalKey,
        externalUrl: cardUrl || (row.leadContactValue?.startsWith('http') ? row.leadContactValue : null),
        externalMetadata: {
          boardName: audit.trelloBoard ?? row.leadCompanyTitle ?? null,
          listName: audit.trelloList ?? null,
          legacyMember: row.leadContactName ?? null,
          rawDescription: row.description ?? null,
          candidate,
          backfilled: true,
        },
      })
      .where(eq(schema.opportunities.id, row.id));
    migrated += 1;
  }

  console.log(`[data-migrate] 020_backfill_trello_company_resolution: ${migrated} Trello kartı temizlendi.`);
}
