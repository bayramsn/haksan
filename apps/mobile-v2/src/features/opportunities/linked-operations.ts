/** Operations endpoints paginate globally; never stop at the first 50 records. */
export async function loadLinkedOperations<T extends { opportunityId?: string | null }>(
  opportunityId: string,
  loadPage: (page: number) => Promise<{ data: T[]; meta: { totalPages: number } }>,
): Promise<T[]> {
  const linked: T[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await loadPage(page);
    linked.push(...result.data.filter((row) => row.opportunityId === opportunityId));
    totalPages = result.meta.totalPages;
    page += 1;
  } while (page <= totalPages);
  return linked;
}
