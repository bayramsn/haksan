// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tradeFairService } from '../../../lib/services';
import { TradeFairPhotoGallery } from './TradeFairPhotoGallery';

vi.mock('../../../lib/services', () => ({ tradeFairService: { photos: vi.fn() } }));
vi.mock('lucide-react', () => ({
  ChevronLeft: () => null,
  ChevronRight: () => null,
  Images: () => null,
  Loader2: () => null,
}));
vi.mock('../../lib/signedFileCache', () => ({
  getSignedFile: vi.fn(async (fileId: string) => ({ url: `https://example.com/${fileId}.png`, filename: `${fileId}.png`, mimeType: 'image/png', fetchedAt: Date.now() })),
}));
vi.mock('../ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

const photos = Array.from({ length: 25 }, (_, i) => ({
  fileId: `file-${i + 1}`,
  filename: `photo-${i + 1}.png`,
  mimeType: 'image/png',
  createdAt: '2026-10-05T07:00:00Z',
  contactId: 'contact-1',
  fairName: 'WIN Eurasia',
  companyName: 'Anadolu Kalıp',
  contactName: 'Ayşe Demir',
}));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('Fuar fotoğraf galerisi', () => {
  it('loads the next page while browsing the last open photo', async () => {
    vi.mocked(tradeFairService.photos).mockImplementation(async (params) => ({
      data: params?.page === 2 ? photos.slice(24) : photos.slice(0, 24),
      meta: { page: params?.page ?? 1, pageSize: 24, total: 25, totalPages: 2 },
    }));
    render(<TradeFairPhotoGallery fairName="WIN Eurasia" q="" refreshKey={0} />);
    fireEvent.click(await screen.findByRole('button', { name: /photo-24\.png fotoğrafını aç/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('24 / 25')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sonraki fotoğraf' }));
    await waitFor(() => expect(within(dialog).getByText('25 / 25')).toBeInTheDocument());
    expect(within(dialog).getByText('photo-25.png')).toBeInTheDocument();
    expect(tradeFairService.photos).toHaveBeenCalledWith(expect.objectContaining({ fairName: 'WIN Eurasia', page: 2, pageSize: 24 }));
  });

  it('retries the failed next page without duplicating the first page', async () => {
    let secondPageAttempts = 0;
    vi.mocked(tradeFairService.photos).mockImplementation(async (params) => {
      if (params?.page === 2 && ++secondPageAttempts === 1) throw new Error('temporary failure');
      return {
        data: params?.page === 2 ? photos.slice(24) : photos.slice(0, 24),
        meta: { page: params?.page ?? 1, pageSize: 24, total: 25, totalPages: 2 },
      };
    });
    render(<TradeFairPhotoGallery q="" refreshKey={0} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Daha fazla yükle' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));
    await screen.findByRole('button', { name: /photo-25\.png fotoğrafını aç/ });
    expect(screen.getAllByRole('button', { name: /fotoğrafını aç/ })).toHaveLength(25);
    expect(secondPageAttempts).toBe(2);
  });
});
