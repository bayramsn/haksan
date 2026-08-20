import { describe, expect, it } from 'vitest';
import {
  isNavigationAreaEnabled,
  navigationVisibilityKeyFor,
  NAVIGATION_GROUPS,
  NAVIGATION_VISIBILITY_KEYS,
} from './navigation';

describe('navigation visibility catalog', () => {
  it('keeps every visibility key in exactly one settings group', () => {
    const groupedKeys = NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => item.key));

    expect(new Set(groupedKeys).size).toBe(groupedKeys.length);
    expect([...groupedKeys].sort()).toEqual([...NAVIGATION_VISIBILITY_KEYS].sort());
  });

  it('removes hidden areas and their internal aliases from application flows', () => {
    expect(isNavigationAreaEnabled('offers', ['offers'])).toBe(false);
    expect(isNavigationAreaEnabled('contracts', ['documents'])).toBe(false);
    expect(isNavigationAreaEnabled('deliveries', ['installations'])).toBe(false);
    expect(isNavigationAreaEnabled('settings', NAVIGATION_VISIBILITY_KEYS)).toBe(true);
  });

  it('maps legacy workflow routes to their configurable areas', () => {
    expect(navigationVisibilityKeyFor('kanban')).toBe('sales-cases');
    expect(navigationVisibilityKeyFor('proformas')).toBe('documents');
    expect(navigationVisibilityKeyFor('reports')).toBeNull();
  });
});
