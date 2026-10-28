// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { financeService } from '../../../../lib/services';
import { CustomerBalancesPage } from './CustomerBalancesPage';

vi.mock('lucide-react', () => ({ Wallet: () => <svg />, Search: () => <svg />, Download: () => <svg />, FileText: () => <svg />, Building2: () => <svg />, CalendarClock: () => <svg />, CircleDollarSign: () => <svg /> }));
vi.mock('../../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'user', tenantId: 'tenant' }, activeDivision: 'division', activeDepartment: 'sales' }) }));
vi.mock('../../../../lib/services', () => ({ financeService: { customerBalances: vi.fn(), companyStatement: vi.fn() } }));
vi.mock('../../shared/EmptyState', () => ({ EmptyState: ({ title }: any) => <p>{title}</p> }));
vi.mock('../../ui/ExportExcelButton', () => ({ ExportExcelButton: () => null }));
vi.mock('../../../../lib/downloadExport', () => ({ exportService: {} }));
vi.mock('../../ui/dialog', () => ({
  Dialog: ({ open, children, onOpenChange }: any) => open ? <section>{children}<button onClick={() => onOpenChange(false)}>Ekstreyi kapat</button></section> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>, DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>, DialogDescription: ({ children }: any) => <p>{children}</p>,
}));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients.length = 0; vi.resetAllMocks(); });
const row = (id: string) => ({ companyId: id, companyName: `Firma ${id}`, primaryCurrency: 'USD', currencies: [], borc: 0, net: 0, nearestDueDate: null });
function show() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client); return render(<QueryClientProvider client={client}><CustomerBalancesPage /></QueryClientProvider>); }
const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

describe('cari rapor ve ekstre hata/yanıt ayrımı', () => {
  it('liste hatası boş liste olarak sunulmaz ve tekrar denenebilir', async () => {
    vi.mocked(financeService.customerBalances).mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce([row('A')]);
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cari rapor yüklenemedi');
    expect(screen.queryByText('Kayıt bulunamadı')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findByText('Firma A')).toBeInTheDocument();
  });
  it('önceki firmanın geciken ekstresi seçili firmayı değiştiremez', async () => {
    const a = deferred();
    vi.mocked(financeService.customerBalances).mockResolvedValue([row('A'), row('B')]);
    vi.mocked(financeService.companyStatement).mockImplementation((id: string) => id === 'A' ? a.promise : Promise.resolve([{ id: 'b-line', date: '2026-10-28', description: 'B hareketi', debit: 20, credit: 0, balance: 20, currencyCode: 'USD' }]) as any);
    show();
    fireEvent.click(await screen.findByText('Firma A'));
    expect(await screen.findByRole('status')).toHaveTextContent('Ekstre yükleniyor');
    fireEvent.click(screen.getByRole('button', { name: 'Ekstreyi kapat' }));
    fireEvent.click(screen.getByText('Firma B'));
    expect(await screen.findByText('B hareketi')).toBeInTheDocument();
    await act(async () => a.resolve([{ id: 'a-line', date: '2026-10-28', description: 'A hareketi', debit: 10, credit: 0, balance: 10, currencyCode: 'USD' }]));
    expect(screen.queryByText('A hareketi')).not.toBeInTheDocument();
    expect(screen.getByText('B hareketi')).toBeInTheDocument();
  });
  it('ekstre hatası başarılı boş hareket sonucu veya toplam gibi gösterilmez', async () => {
    vi.mocked(financeService.customerBalances).mockResolvedValue([row('A')]);
    vi.mocked(financeService.companyStatement).mockRejectedValue(Error('offline'));
    show(); fireEvent.click(await screen.findByText('Firma A'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Ekstre yüklenemedi'));
    expect(screen.queryByText('Bu firma için hareket bulunamadı.')).not.toBeInTheDocument();
    expect(screen.queryByText('USD Cari Hesap')).not.toBeInTheDocument();
  });
});
