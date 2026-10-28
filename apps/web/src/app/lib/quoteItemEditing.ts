/** Keep saved line IDs so archived products and quoted option snapshots remain editable. */
export async function persistQuoteItems(
  quoteId: string,
  items: Array<{ itemId?: string; [key: string]: unknown }>,
  service: { get: (id: string) => Promise<any>; updateItem: (id: string, itemId: string, body: any) => Promise<any>; addItem: (id: string, body: any) => Promise<any>; deleteItem: (id: string, itemId: string) => Promise<any> },
) {
  const existing = await service.get(quoteId);
  const retainedIds = new Set(items.map(item => item.itemId).filter(Boolean));
  for (let index = 0; index < items.length; index++) {
    const { itemId, ...body } = items[index];
    if (itemId) await service.updateItem(quoteId, itemId, { ...body, sortOrder: index });
    else await service.addItem(quoteId, { ...body, sortOrder: index });
  }
  for (const item of existing.items ?? []) {
    if (!retainedIds.has(item.id)) await service.deleteItem(quoteId, item.id);
  }
}
