// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SalesCasesPage } from './SalesCases';

const fixtures = vi.hoisted(() => ({ rows: Array.from({ length: 15 }, (_, index) => ({
  id: `case-${index}`, customerId: `company-${index}`, leadCompanyTitle: `Firma ${index}`,
  qualificationStage: 'lead', stage: 'lead', currency: 'USD', estimatedAmount: 1500 - index * 100,
  createdAt: `2026-11-${String(15 - index).padStart(2, '0')}`, quantity: 1,
  requestedProduct: 'Tezgah', requestedModel: 'Model',
})) }));
vi.mock('../../lib/store', () => ({ useStore: () => ({
  cases: fixtures.rows, closedCases: [], customers: [], users: [], activities: [], offers: [], products: [],
}) }));
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ hasPermission: () => false, hasRole: () => false }) }));
vi.mock('../../lib/companyServerData', () => ({ useCompanyCardDetails: () => ({ data: {} }) }));
vi.mock('./QualificationKanban', () => ({ QualificationKanban: () => null }));
vi.mock('../ui/ExportExcelButton', () => ({ ExportExcelButton: () => null }));
afterEach(cleanup);

const rowIds = () => within(screen.getByRole('table')).getAllByRole('row')
  .slice(1).map((row) => row.textContent?.match(/#CASE-\d+/)?.[0]).filter(Boolean);

describe('opportunity sorting before pagination', () => {
  it('brings amounts outside the current page into the global ascending and descending order', () => {
    render(<SalesCasesPage onSelect={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    expect(rowIds()).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Tutar: artan sırala' }));
    expect(rowIds()).toHaveLength(12);
    expect(rowIds()[0]).toBe('#CASE-14');
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tutar: azalan sırala' }));
    expect(rowIds()[0]).toBe('#CASE-0');
  });
  it('sorts opening dates chronologically before selecting page rows', () => {
    render(<SalesCasesPage onSelect={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Açılış: artan sırala' }));
    expect(rowIds()[0]).toBe('#CASE-14');
    fireEvent.click(screen.getByRole('button', { name: 'Açılış: azalan sırala' }));
    expect(rowIds()[0]).toBe('#CASE-0');
  });
});
