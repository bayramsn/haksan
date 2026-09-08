// @vitest-environment jsdom
import { useState, type HTMLAttributes, type LabelHTMLAttributes, type ReactNode } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLaserProfile, type LaserTechnicalConfiguration } from '@haksan/shared';
import { productService } from '../../../../lib/services';
import { laserProfilesService } from '../../../../lib/services/laser-profiles.service';
import { LaserProfilesPanel } from './LaserProfilesPanel';

vi.mock('../../../../lib/auth', () => ({ useAuth: () => ({ user: { tenantId: 'tenant-1' }, hasRole: () => true }) }));
vi.mock('../../../../lib/services', () => ({ productService: { listBrands: vi.fn() } }));
vi.mock('../../../../lib/services/laser-profiles.service', () => ({ laserProfilesService: { save: vi.fn(), resolve: vi.fn(), previewImport: vi.fn(), commitImport: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('lucide-react', () => ({ FileSpreadsheet: () => null, Save: () => null, Upload: () => null }));
vi.mock('../../ui/label', () => ({ Label: (props: LabelHTMLAttributes<HTMLLabelElement>) => <label {...props} /> }));
// Portal primitives are replaced by native containers; the editor has its own
// interaction tests. This suite exercises the settings save/import lifecycle.
vi.mock('../../ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div role="dialog">{children}</div> : null,
  DialogContent: (props: HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  DialogHeader: (props: HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  DialogTitle: (props: HTMLAttributes<HTMLHeadingElement>) => <h2 {...props} />,
  DialogDescription: (props: HTMLAttributes<HTMLParagraphElement>) => <p {...props} />,
}));
vi.mock('../../technical/LaserConfigurationEditor', () => ({
  LaserConfigurationEditor: ({ onChange }: { onChange: (value: LaserTechnicalConfiguration) => void }) => {
    const [selected, setSelected] = useState(false);
    return <button type="button" onClick={() => { onChange(resolveLaserProfile({ productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', cabinType: 'open', powerKw: 6, sourceModelCode: 'F3015' })); setSelected(true); }}>{selected ? 'Profil seçildi' : 'Test profilini seç'}</button>;
  },
}));

describe('LaserProfilesPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { removeItem: vi.fn() });
    vi.mocked(productService.listBrands).mockResolvedValue([{ id: 'brand-1', code: 'AORE', name: 'AORE' }, { id: 'brand-2', name: 'Diğer Marka' }]);
    vi.mocked(laserProfilesService.save).mockImplementation(async (_scope, selection) => resolveLaserProfile(selection));
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

  it('saves the selected combination in its brand and division scope', async () => {
    const user = userEvent.setup();
    render(<LaserProfilesPanel divisionId="division-1" />);
    await waitFor(() => expect((screen.getByLabelText('Marka') as HTMLSelectElement).value).toBe('brand-1'));
    expect(screen.queryByRole('option', { name: 'Diğer Marka' })).toBeNull();
    await user.click(screen.getByText('Test profilini seç'));
    await user.click(screen.getByRole('button', { name: 'Profili kaydet' }));
    await waitFor(() => expect(laserProfilesService.save).toHaveBeenCalledWith({ divisionId: 'division-1', brandId: 'brand-1' }, expect.objectContaining({ sourceModelCode: 'F3015', cabinType: 'open', powerKw: 6 }), expect.arrayContaining([expect.objectContaining({ key: 'Makine Ağırlığı', value: '2150' })])));
    expect(localStorage.removeItem).toHaveBeenCalledWith(expect.stringContaining('tenant-1'));
  });

  it('previews a workbook and commits the same server preview token', async () => {
    const user = userEvent.setup();
    const profile = resolveLaserProfile({ productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', cabinType: 'open', powerKw: 6, sourceModelCode: 'F3015' });
    vi.mocked(laserProfilesService.previewImport).mockResolvedValue({ importToken: 'preview-token', file: { name: 'AORE.xlsx' }, laserProfiles: [profile], summary: { total: 1, ready: 1 }, issues: [] });
    vi.mocked(laserProfilesService.commitImport).mockResolvedValue({ ok: true, created: 1, updated: 0, imported: 1 });
    render(<LaserProfilesPanel divisionId="division-1" />);
    await waitFor(() => expect((screen.getByLabelText('Marka') as HTMLSelectElement).value).toBe('brand-1'));
    await user.click(screen.getByRole('button', { name: "Excel'den profil aktar" }));
    await user.upload(screen.getByLabelText('Teknik parametre dosyası (.xlsx)'), new File(['fake workbook content'], 'AORE.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    await user.click(screen.getByRole('button', { name: 'Önizlemeyi oluştur' }));
    await screen.findByText(/1 profil hazır/);
    expect(within(screen.getByRole('dialog')).getByText('Makine Ağırlığı')).toBeTruthy();
    expect(within(screen.getByRole('dialog')).getByText('2150 kg')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '1 profili kaydet' }));
    await waitFor(() => expect(laserProfilesService.commitImport).toHaveBeenCalledWith({ divisionId: 'division-1', brandId: 'brand-1' }, expect.objectContaining({ importToken: 'preview-token', laserProfiles: [profile] })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
