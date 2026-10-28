// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RemoteCompanyCombobox } from './RemoteCompanyCombobox';
import { RemoteContactCombobox } from './RemoteContactCombobox';
const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'u', tenantId: 't' }, activeDivision: 'first', activeDepartment: 'd' },
  companies: vi.fn(), company: vi.fn(), contacts: vi.fn(), contact: vi.fn(),
}));
vi.mock('../../../lib/auth', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../../lib/services', () => ({ companyService: { list: mocks.companies, get: mocks.company }, contactService: { list: mocks.contacts, get: mocks.contact } }));
// Lightweight presentation doubles leave the real TanStack pagination/debounce hooks under test.
vi.mock('../ui/popover', () => ({ Popover: ({ children }: any) => children, PopoverTrigger: ({ children }: any) => children, PopoverContent: ({ children }: any) => children }));
vi.mock('../ui/command', () => ({
  Command: ({ children }: any) => <div>{children}</div>, CommandList: ({ children }: any) => <div>{children}</div>,
  CommandGroup: ({ children }: any) => <div>{children}</div>, CommandEmpty: () => null,
  CommandInput: ({ onValueChange, ...props }: any) => <input {...props} onChange={(event) => onValueChange(event.target.value)} />,
  CommandItem: ({ children, onSelect }: any) => <button onClick={onSelect}>{children}</button>,
}));
const page = (data: any[], current = 1, totalPages = 1) => ({ data, meta: { page: current, pageSize: 25, total: data.length || 0, totalPages } });
function setup(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: any) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(element, { wrapper });
}
beforeEach(() => { vi.clearAllMocks(); mocks.auth.activeDivision = 'first'; });
afterEach(cleanup);
describe('remote option query behavior', () => {
  it('removes old scope companies while the new scope is loading', async () => {
    mocks.companies.mockResolvedValueOnce(page([{ id: 'old', legalTitle: 'Old scope company' }])).mockImplementationOnce(() => new Promise(() => {}));
    const view = setup(<RemoteCompanyCombobox onValueChange={() => {}} />);
    await screen.findByText('Old scope company');
    mocks.auth.activeDivision = 'second';
    view.rerender(<RemoteCompanyCombobox onValueChange={() => {}} />);
    await waitFor(() => expect(mocks.companies).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Old scope company')).toBeNull();
  });

  it('loads remaining relation pages without re-requesting exhausted types', async () => {
    mocks.companies.mockImplementation(async (query: any) => page([{ id: `${query.relationTypeCode}-${query.page}`, legalTitle: `${query.relationTypeCode} page ${query.page}` }], query.page, query.relationTypeCode === 'customer' ? 2 : 1));
    setup(<RemoteCompanyCombobox relationTypeCodes={['customer', 'supplier']} onValueChange={() => {}} />);
    fireEvent.click(await screen.findByText('Daha fazla firma yükle'));
    await screen.findByText('customer page 2');
    expect(mocks.companies).toHaveBeenCalledTimes(3);
    expect(mocks.companies.mock.calls[2][0]).toMatchObject({ page: 2, relationTypeCode: 'customer' });
    expect(screen.queryByText('Daha fazla firma yükle')).toBeNull();
  });

  it('withholds creation until debounced search succeeds and all pages are checked', async () => {
    let finish: (value: any) => void = () => {};
    mocks.companies.mockResolvedValueOnce(page([])).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    setup(<RemoteCompanyCombobox onValueChange={() => {}} onCreate={() => {}} />);
    await waitFor(() => expect(mocks.companies).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByPlaceholderText('Firma adı, no veya vergi no ara…'), { target: { value: 'Existing' } });
    expect(screen.queryByText('“Existing” adıyla yeni firma oluştur')).toBeNull();
    await waitFor(() => expect(mocks.companies).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('“Existing” adıyla yeni firma oluştur')).toBeNull();
    finish(page([{ id: 'exists', legalTitle: 'Existing' }]));
    await screen.findByText('Existing');
    expect(screen.queryByText('“Existing” adıyla yeni firma oluştur')).toBeNull();
  });

  it('shows contact errors independently of the none row and retries successfully', async () => {
    mocks.contacts.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page([{ id: 'contact', fullName: 'Ayşe', companyId: 'c' }]));
    setup(<RemoteContactCombobox companyId="c" onValueChange={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Kontak listesi alınamadı'));
    expect(screen.getByText('Belirtilmedi')).toBeTruthy();
    fireEvent.click(screen.getByText('Yeniden dene'));
    await screen.findByText('Ayşe');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('loads contact pages while retaining earlier options', async () => {
    mocks.contacts.mockResolvedValueOnce(page([{ id: 'a', fullName: 'First' }], 1, 2)).mockResolvedValueOnce(page([{ id: 'b', fullName: 'Second' }], 2, 2));
    setup(<RemoteContactCombobox companyId="c" onValueChange={() => {}} />);
    fireEvent.click(await screen.findByText('Daha fazla kontak yükle'));
    await screen.findByText('Second');
    expect(screen.getByText('First')).toBeTruthy();
    expect(mocks.contacts.mock.calls[1][0]).toMatchObject({ page: 2, companyId: 'c' });
  });
});
