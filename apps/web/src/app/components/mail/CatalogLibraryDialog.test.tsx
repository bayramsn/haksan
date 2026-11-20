// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CatalogLibraryDialog } from './CatalogLibraryDialog';

const mocks = vi.hoisted(() => ({ links: vi.fn(), signedUpload: vi.fn(), uploadBinary: vi.fn(), link: vi.fn(), error: vi.fn() }));
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { tenantId: 'tenant-1' }, hasPermission: () => true, hasRole: () => false }) }));
vi.mock('../../../lib/services', () => ({ fileService: mocks }));
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock('lucide-react', () => ({ BookOpen: () => null, Download: () => null, Loader2: () => null, Search: () => null, Upload: () => null }));
vi.mock('../ui/button', () => ({ Button: ({ children, variant: _variant, size: _size, ...props }: any) => <button {...props}>{children}</button> }));
vi.mock('../ui/input', () => ({ Input: (props: any) => <input {...props} /> }));
vi.mock('../ui/dialog', () => ({
  Dialog: ({ open, children }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));
const row = (id: string, name: string) => ({ file: { id, originalFilename: name, sizeBytes: 100 } });
beforeEach(() => { vi.clearAllMocks(); mocks.links.mockResolvedValue({ data: [], meta: { totalPages: 1 } }); });
afterEach(cleanup);

it('loads every catalog page in the tenant library and selects the matching catalog', async () => {
  mocks.links.mockResolvedValueOnce({ data: [row('1', 'CNC.pdf')], meta: { totalPages: 2 } })
    .mockResolvedValueOnce({ data: [row('2', 'HEX.pdf')], meta: { totalPages: 2 } });
  const onSelect = vi.fn();
  render(<CatalogLibraryDialog open onOpenChange={() => {}} onSelect={onSelect} />);
  await screen.findByText('HEX.pdf');
  expect(mocks.links).toHaveBeenLastCalledWith({ entityType: 'catalog', entityId: 'tenant-1', page: 2, pageSize: 100 });
  expect(mocks.links).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByLabelText('Katalog ara'), { target: { value: 'hex' } });
  expect(screen.queryByText('CNC.pdf')).toBeNull();
  fireEvent.click(screen.getByText('Mail Ekine Ekle'));
  expect(onSelect).toHaveBeenCalledWith({ fileId: '2', name: 'HEX.pdf', size: 100 });
});

it('uploads PDF to the library then links it, while rejecting other files before upload', async () => {
  mocks.signedUpload.mockResolvedValue({ fileId: 'new-file' });
  render(<CatalogLibraryDialog open onOpenChange={() => {}} onSelect={() => {}} />);
  await screen.findByText('Henüz katalog yüklenmemiş.');
  const input = screen.getByLabelText('Katalog PDF yükle');
  fireEvent.change(input, { target: { files: [new File(['bad'], 'program.exe')] } });
  expect(mocks.signedUpload).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalled();
  const pdf = new File(['%PDF-1.4'], 'Genel.pdf', { type: 'application/pdf' });
  fireEvent.change(input, { target: { files: [pdf] } });
  await waitFor(() => expect(mocks.link).toHaveBeenCalledWith({ fileId: 'new-file', entityType: 'catalog', entityId: 'tenant-1', documentTypeCode: 'other' }));
  expect(mocks.signedUpload).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'erp-quote-documents', entityId: 'tenant-1', mimeType: 'application/pdf' }));
  expect(mocks.uploadBinary).toHaveBeenCalledWith({ fileId: 'new-file' }, pdf, 'application/pdf');
});
