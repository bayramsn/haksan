/** Load references omitted from the public catalog without adding them to new-line choices. */
export async function hydrateQuoteProductReferences<T extends { id: string }>(
  catalog: readonly T[],
  items: readonly { productModelId?: string | null }[],
  load: (id: string) => Promise<T>,
): Promise<T[]> {
  const visibleIds = new Set(catalog.map((product) => product.id));
  const missingIds = [...new Set(items.map((item) => item.productModelId)
    .filter((id): id is string => typeof id === "string" && id.length > 0 && !visibleIds.has(id)))];
  return Promise.all(missingIds.map((id) => load(id)));
}

/** Only the product already selected on this line is added to its catalog choices. */
export function quoteLineCatalog<T extends { id: string }>(catalog: readonly T[], selected?: T): readonly T[] {
  return selected && !catalog.some((product) => product.id === selected.id) ? [...catalog, selected] : catalog;
}
