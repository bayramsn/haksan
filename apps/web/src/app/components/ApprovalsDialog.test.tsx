// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApprovalsDialog } from './ApprovalsDialog';

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../lib/services', () => ({ accessRequestService: { list, approve: vi.fn(), reject: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('lucide-react', () => {
  const Icon = () => <svg aria-hidden="true" />;
  return { Building2: Icon, Check: Icon, Loader2: Icon, X: Icon };
});
vi.mock('./ui/dialog', () => ({
  Dialog: ({ children, onOpenChange }: any) => <div><button onClick={() => onOpenChange(true)}>Talepleri aç</button>{children}</div>, DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <p>{children}</p>, DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: any) => <>{children}</>,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('shows pending requests after page one and retains the pending status filter', async () => {
  list.mockImplementation(async (query) => ({
    data: [{ id: `request-${query.page}`, company: { legalTitle: query.page === 2 ? 'Son sayfadaki firma' : 'İlk firma' } }],
    meta: { page: query.page, pageSize: 100, total: 2, totalPages: 2 },
  }));
  render(<ApprovalsDialog trigger={<button>Aç</button>} />);
  fireEvent.click(screen.getByRole('button', { name: 'Talepleri aç' }));
  expect(await screen.findByText('Son sayfadaki firma')).toBeInTheDocument();
  expect(list).toHaveBeenCalledWith({ page: 2, pageSize: 100, status: 'pending' });
});
