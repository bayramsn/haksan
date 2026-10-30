import type { OpportunityListQuery } from './endpoints';

/** Board pages and infinite lists have different cache shapes. Keep both under
 * the same invalidation prefix, but never let a picker consume a board page. */
export const opportunityKeys = {
  all: ['opportunities'] as const,
  list: (query: OpportunityListQuery) => ['opportunities', 'list', query] as const,
  board: (query: OpportunityListQuery) => ['opportunities', 'board', query] as const,
  detail: (id: string) => ['opportunities', 'detail', id] as const,
};
