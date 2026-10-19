// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ComposeMailDialog } from './ComposeMailDialog';

const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), remove: vi.fn(), error: vi.fn(), success: vi.fn(),
  send: vi.fn(), ready: false,
  templates: [{ id: 'mail-1', title: 'Teklif', body: 'Merhaba **teklif**', scope: 'mail' }],
  offers: [
    { id: 'q1', quoteNo: 'CNC-001', revision: 1, companyId: 'c1', salesCaseId: 's1', productName: 'Torna', amount: 100, currency: 'EUR', status: 'Sent', date: '2026-10-01' },
    { id: 'q2', quoteNo: 'CNC-002', revision: 1, salesCaseId: 's1', productName: 'Freze', amount: 200, currency: 'EUR', status: 'Draft', date: '2026-10-05' },
    { id: 'q3', quoteNo: 'CNC-003', revision: 1, companyId: 'other', salesCaseId: 's2', amount: 300, currency: 'EUR', status: 'Sent', date: '2026-10-06' },
    { id: 'q4', quoteNo: 'CNC-004', revision: 1, companyId: 'c1', salesCaseId: 's1', amount: 400, currency: 'EUR', status: 'Cancelled', date: '2026-10-07' },
  ],
}));
vi.mock('../../lib/store', () => ({ useStore: () => ({
  noteTemplates: mocks.templates, addNoteTemplate: mocks.create, updateNoteTemplate: mocks.update, deleteNoteTemplate: mocks.remove,
  offers: mocks.offers, cases: [{ id: 's1', customerId: 'c1' }], closedCases: [], customers: [], users: [], contacts: [], products: [],
}) }));
vi.mock('../../lib/print', () => ({
  loadQuotePrintData: async ({ offer }: any) => ({ firma: 'Acme', quoteNo: offer.quoteNo }),
  quoteDoc: (data: any) => data,
  printAssetBase: () => '',
  buildMailDocumentHtml: async (doc: any) => `<p>${doc.quoteNo}</p>`,
  quoteFilename: (data: any) => data.quoteNo,
}));
vi.mock('../../lib/companyNormalizer', () => ({ normalizeCompany: (company: any) => company }));
vi.mock('../../lib/contactServerData', () => ({ loadAllCompanyContacts: async () => ({ data: [], total: 0 }) }));
vi.mock('../../../lib/services', () => ({ companyService: { get: async (id: string) => ({ id, name: 'Acme' }) }, fileService: {}, mailService: { send: mocks.send, account: async () => ({ featureEnabled: true, configured: mocks.ready, status: 'active', email: 'sales@example.com', signature: '' }), recipients: async () => ({ contacts: [], colleagues: [] }) } }));
vi.mock('./CatalogLibraryDialog', () => ({ CatalogLibraryDialog: () => null }));
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock('lucide-react', () => ({ AlertTriangle: () => null, BookmarkPlus: () => null, CheckCircle2: () => null, Loader2: () => null, LockKeyhole: () => null, Mail: () => null, Paperclip: () => null, Pencil: () => null, Send: () => null, Settings2: () => null, Trash2: () => null, Upload: () => null, X: () => null }));
// Native UI substitutes isolate saved-template actions from Radix portal/React versions.
vi.mock('../ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock('../ui/alert-dialog', () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div role="alertdialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  AlertDialogCancel: () => <button>Vazgeç</button>,
  AlertDialogAction: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));
vi.mock('../ui/select', () => ({
  Select: ({ children, value, onValueChange, disabled }: any) => <select aria-label="Şablon seçimi" value={value} onChange={(event) => onValueChange(event.target.value)} disabled={disabled}><option value="" />{children}</select>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: () => null, SelectValue: () => null,
}));
vi.mock('../ui/button', () => ({ Button: ({ children, variant: _variant, size: _size, ...props }: any) => <button {...props}>{children}</button> }));
vi.mock('../ui/input', () => ({ Input: (props: any) => <input {...props} /> }));
vi.mock('../ui/label', () => ({ Label: (props: any) => <label {...props} /> }));
vi.mock('../ui/multi-select', () => ({ MultiSelect: () => null }));
vi.mock('./MailBodyEditor', () => ({ MailBodyEditor: ({ value, onChange, disabled }: any) => <textarea aria-label="Mesaj" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} /> }));
const recipient = { email: 'customer@example.com', subject: 'Konu', body: 'Yeni mesaj' };
const open = () => render(<ComposeMailDialog recipient={recipient} onOpenChange={() => {}} />);
const selectTemplate = () => fireEvent.change(screen.getByRole('option', { name: /^Teklif$/ }).parentElement!, { target: { value: 'mail-1' } });

beforeEach(() => { vi.clearAllMocks(); mocks.ready = false; });
afterEach(cleanup);

describe('Mail template CRUD', () => {
  it('sends the generated technical document with selected catalog IDs only after Send', async () => {
    mocks.ready = true;
    mocks.send.mockResolvedValue({});
    const pdf = vi.fn().mockResolvedValue({ html: '<p>Teknik bilgiler</p>', filename: 'teknik.pdf' });
    render(<ComposeMailDialog recipient={{ ...recipient, productDocument: { id: 'product-1', pdf }, initialAttachments: [{ fileId: 'catalog-1', name: 'Genel katalog.pdf', size: 100 }] }} onOpenChange={() => {}} />);
    await waitFor(() => expect((screen.getByRole('button', { name: 'E-postayı gönder' }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText('Genel katalog.pdf')).toBeTruthy();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(pdf).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'E-postayı gönder' }));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ productDocument: { id: 'product-1', pdf: { html: '<p>Teknik bilgiler</p>', filename: 'teknik.pdf' } }, fileIds: ['catalog-1'] })));
  });
  it('lists the company quotes and sends every selected quote in one mail', async () => {
    mocks.ready = true;
    mocks.send.mockResolvedValue({});
    const document = vi.fn().mockResolvedValue({ html: '<p>logolu</p>', filename: 'CNC-001.pdf' });
    render(<ComposeMailDialog recipient={{ ...recipient, companyId: 'c1', quoteId: 'q1', document }} onOpenChange={() => {}} />);
    await waitFor(() => expect((screen.getByRole('button', { name: 'E-postayı gönder' }) as HTMLButtonElement).disabled).toBe(false));
    // q2 firmaya fırsat üzerinden bağlı; başka firmanın ve iptal edilmiş teklif listelenmez.
    expect(screen.queryByText('CNC-003')).toBeNull();
    expect(screen.queryByText('CNC-004')).toBeNull();
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.map((box) => box.checked)).toEqual([false, true]); // tarihe göre yeni üstte: CNC-002, CNC-001
    fireEvent.click(boxes[0]);
    fireEvent.click(screen.getByRole('button', { name: 'E-postayı gönder' }));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
    expect(mocks.send.mock.calls[0][0]).toMatchObject({
      quotes: [
        { id: 'q1', document: { html: '<p>logolu</p>', filename: 'CNC-001.pdf' } },
        { id: 'q2', document: { html: '<p>CNC-002</p>', filename: 'CNC-002.pdf' } },
      ],
    });
    expect(mocks.send.mock.calls[0][0].quoteId).toBeUndefined();
  });
  it('creates a reusable template and keeps bold markers', async () => {
    mocks.create.mockResolvedValue({ id: 'mail-2' });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Şablon ekle' }));
    fireEvent.change(screen.getByLabelText('Şablon adı'), { target: { value: 'Yeni teklif' } });
    fireEvent.change(screen.getByLabelText('Mesaj'), { target: { value: '**Yeni** mesaj' } });
    fireEvent.click(screen.getByRole('button', { name: /^Kaydet$/ }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ title: 'Yeni teklif', body: '**Yeni** mesaj', scope: 'mail' }));
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('updates the selected template instead of creating a duplicate', async () => {
    mocks.update.mockResolvedValue({ id: 'mail-1' });
    open(); selectTemplate();
    fireEvent.change(screen.getByLabelText('Mesaj'), { target: { value: 'Düzenlenen **mesaj**' } });
    fireEvent.click(screen.getByRole('button', { name: /^Düzenle$/ }));
    fireEvent.change(screen.getByLabelText('Şablon adı'), { target: { value: 'Düzenlenen teklif' } });
    fireEvent.click(screen.getByRole('button', { name: /^Güncelle$/ }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('mail-1', { title: 'Düzenlenen teklif', body: 'Düzenlenen **mesaj**' }));
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('requires confirmation to delete and preserves current message', async () => {
    mocks.remove.mockResolvedValue(undefined);
    open(); selectTemplate();
    fireEvent.click(screen.getByRole('button', { name: /^Sil$/ }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Şablonu\ sil$/ }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mocks.remove).toHaveBeenCalledWith('mail-1');
    expect((screen.getByLabelText('Mesaj') as HTMLTextAreaElement).value).toBe('Merhaba **teklif**');
  });
  it('keeps failed deletion open for retry and reports the error', async () => {
    mocks.remove.mockRejectedValue(new Error('Yetki gerekli'));
    open(); selectTemplate();
    fireEvent.click(screen.getByRole('button', { name: /^Sil$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Şablonu\ sil$/ }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Şablon silinemedi', { description: 'Yetki gerekli' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Şablonu sil' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
