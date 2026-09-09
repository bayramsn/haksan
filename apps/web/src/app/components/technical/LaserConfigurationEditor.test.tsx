// @vitest-environment jsdom
import { useState, type LabelHTMLAttributes } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LASER_MODELS, resolveLaserProfile, type LaserSelection, type LaserTechnicalConfiguration } from '@haksan/shared';
import { LaserConfigurationEditor } from './LaserConfigurationEditor';
import { laserProfilesService } from '../../../lib/services/laser-profiles.service';
import { laserDraftKey } from './laser-editor-state';

vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: { tenantId: 'tenant-1' } }) }));
vi.mock('../../../lib/services/laser-profiles.service', () => ({ laserProfilesService: { options: vi.fn(), resolve: vi.fn() } }));
// Radix/lucide are externalized against the mobile workspace's React in Vitest.
// Use native equivalents here; these tests exercise selection and request state.
vi.mock('../ui/label', () => ({ Label: (props: LabelHTMLAttributes<HTMLLabelElement>) => <label {...props} /> }));
vi.mock('lucide-react', () => ({ AlertCircle: () => null, ArrowUp: () => null, ArrowDown: () => null, Plus: () => null, Trash2: () => null, FileSpreadsheet: () => null, Loader2: () => null, RotateCcw: () => null }));

const selection: LaserSelection = { productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', cabinType: 'open', powerKw: 6, sourceModelCode: 'F3015' };
function Harness({ initial, selectionOnly, onChange = () => {} }: { selectionOnly?: boolean; initial?: LaserTechnicalConfiguration; onChange?: (profile: LaserTechnicalConfiguration | null) => void }) {
  const [value, setValue] = useState<LaserTechnicalConfiguration | null>(initial ?? null);
  return <LaserConfigurationEditor selectionOnly={selectionOnly} divisionId="division-1" brandId="aore-1" draftScope="settings" value={value} onChange={(profile) => { setValue(profile); onChange(profile); }} />;
}
async function choose6kw() {
  const user = userEvent.setup();
  await screen.findByRole('option', { name: 'F Serisi' });
  await user.selectOptions(screen.getByLabelText('3. Ürün serisi tipi'), 'F');
  await user.selectOptions(screen.getByLabelText('4. Kabin tipi'), 'open');
  await user.selectOptions(screen.getByLabelText('5. Rezonatör gücü'), '6');
  await waitFor(() => expect((screen.getByLabelText('6. Tabla ölçüsü') as HTMLSelectElement).disabled).toBe(false));
  await user.selectOptions(screen.getByLabelText('6. Tabla ölçüsü'), 'F3015');
  return user;
}

describe('LaserConfigurationEditor', () => {
  beforeEach(() => {
    const entries = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value); },
      removeItem: (key: string) => { entries.delete(key); },
      clear: () => entries.clear(),
    });
    vi.mocked(laserProfilesService.options).mockResolvedValue({ models: [...LASER_MODELS], cabinOptions: ['open', 'closed'], powerOptions: [1.5, 2, 3, 6, 12, 20, 30] });
    vi.mocked(laserProfilesService.resolve).mockImplementation(async (_scope, selected) => resolveLaserProfile(selected));
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

  it('changes 6 to 12 kW without carrying values and restores each combination draft', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const user = await choose6kw();
    const weight = await screen.findByLabelText('Makine Ağırlığı') as HTMLInputElement;
    expect(weight.value).toBe('2150');
    await user.clear(weight);
    await user.type(weight, '2222');
    await user.selectOptions(screen.getByLabelText('5. Rezonatör gücü'), '12');
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByLabelText('Makine Ağırlığı')).toBeNull();
    expect((screen.getByLabelText('6. Tabla ölçüsü') as HTMLSelectElement).value).toBe('');
    await user.selectOptions(screen.getByLabelText('6. Tabla ölçüsü'), 'F3015');
    expect((await screen.findByLabelText('Makine Ağırlığı') as HTMLInputElement).value).toBe('3150');
    expect((screen.getByLabelText('Tabla Yük Kapasitesi') as HTMLInputElement).value).toBe('1500');
    await user.selectOptions(screen.getByLabelText('5. Rezonatör gücü'), '6');
    await user.selectOptions(screen.getByLabelText('6. Tabla ölçüsü'), 'F3015');
    expect((await screen.findByLabelText('Makine Ağırlığı') as HTMLInputElement).value).toBe('2222');
    await user.click(screen.getByRole('button', { name: 'Makine Ağırlığı kaynak değerine dön' }));
    expect((screen.getByLabelText('Makine Ağırlığı') as HTMLInputElement).value).toBe('2150');
  }, 15_000);

  it('classifies PG3015 by closed cabin, table size and 1.5 kW transformer profile', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'PG Serisi' });
    await user.selectOptions(screen.getByLabelText('3. Ürün serisi tipi'), 'PG');
    await user.selectOptions(screen.getByLabelText('4. Kabin tipi'), 'closed');
    await user.selectOptions(screen.getByLabelText('5. Rezonatör gücü'), '1.5');
    const modelSelect = screen.getByLabelText('6. Tabla ölçüsü') as HTMLSelectElement;
    await waitFor(() => expect(modelSelect.disabled).toBe(false));
    expect(screen.getByRole('option', { name: /PG3015 — 3050 × 1530 mm/ })).toBeTruthy();
    await user.selectOptions(modelSelect, 'PG3015');
    expect((await screen.findByLabelText('Toplam Güç Gereksinimi') as HTMLInputElement).value).toBe('17.5');
    expect((screen.getByLabelText('Trafo Kapasitesi') as HTMLInputElement).value).toBe('30');
    expect((screen.getByLabelText('Trafo Kapasitesi birimi') as HTMLInputElement).value).toBe('kVA');
  });

  it('ignores a delayed response for an earlier combination', async () => {
    let finishOld!: (profile: LaserTechnicalConfiguration) => void;
    vi.mocked(laserProfilesService.resolve).mockImplementation((_scope, selected) => selected.powerKw === 6
      ? new Promise((resolve) => { finishOld = resolve; })
      : Promise.resolve(resolveLaserProfile(selected)));
    render(<Harness />);
    const user = await choose6kw();
    await user.selectOptions(screen.getByLabelText('5. Rezonatör gücü'), '12');
    await user.selectOptions(screen.getByLabelText('6. Tabla ölçüsü'), 'F3015');
    expect((await screen.findByLabelText('Makine Ağırlığı') as HTMLInputElement).value).toBe('3150');
    await act(async () => { finishOld(resolveLaserProfile(selection)); });
    expect((screen.getByLabelText('Makine Ağırlığı') as HTMLInputElement).value).toBe('3150');
  });

  it('preserves an existing snapshot without resolving current catalog values', async () => {
    const initial = resolveLaserProfile(selection);
    initial.specs = initial.specs.map((spec) => spec.key === 'Makine Ağırlığı' ? { ...spec, value: 'snapshot-weight' } : spec);
    localStorage.setItem(laserDraftKey({ tenantId: 'tenant-1', divisionId: 'division-1', brandId: 'aore-1', draftScope: 'settings' }, selection), JSON.stringify(resolveLaserProfile(selection)));
    render(<Harness initial={initial} />);
    await waitFor(() => expect(laserProfilesService.options).toHaveBeenCalled());
    expect((screen.getByLabelText('Makine Ağırlığı') as HTMLInputElement).value).toBe('snapshot-weight');
    expect(laserProfilesService.resolve).not.toHaveBeenCalled();
  });

  it('offers TG 30 kW with manual entry and the cutting area cabin explanation', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('2. Ürün alt kategorisi'), 'BORU_LAZER_KESIM');
    await user.selectOptions(screen.getByLabelText('3. Ürün serisi tipi'), 'TG');
    expect(screen.getByText('Kesim bölgesi koruması; boru besleme alanını kapsamaz.')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('4. Kabin tipi'), 'closed');
    await user.selectOptions(screen.getByLabelText('5. Rezonatör gücü'), '30');
    await user.selectOptions(screen.getByLabelText('6. Model ve boru kapasitesi'), 'TG6020');
    const weight = await screen.findByLabelText('Makine Ağırlığı') as HTMLInputElement;
    expect(weight.value).toBe('');
    await user.type(weight, '5000');
    expect(weight.value).toBe('5000');
    expect(screen.getByText(/Seçilen güç için kaynak doğrulaması eksik/)).toBeTruthy();
  });


  it('lets the user add, rename, group, reorder and remove fields and preserves the complete draft', async () => {
    const onChange = vi.fn();
    render(<Harness initial={resolveLaserProfile(selection)} onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Alan ekle' }));
    const profile = onChange.mock.calls.at(-1)![0] as LaserTechnicalConfiguration;
    const name = screen.getByLabelText(`${profile.specs.length}. alan adı`);
    fireEvent.change(name, { target: { value: 'Özel ölçü' } });
    fireEvent.change(screen.getByLabelText('Özel ölçü'), { target: { value: '125' } });
    fireEvent.change(screen.getByLabelText('Özel ölçü birimi'), { target: { value: 'cm' } });
    fireEvent.change(screen.getByLabelText('Özel ölçü grubu'), { target: { value: 'OZEL' } });
    await user.click(screen.getByRole('button', { name: 'Özel ölçü yukarı taşı' }));
    const moved = onChange.mock.calls.at(-1)![0] as LaserTechnicalConfiguration;
    expect(moved.specs.at(-2)).toMatchObject({ key: 'Özel ölçü', value: '125', unit: 'cm', groupCode: 'OZEL', isManual: true });
    await user.click(screen.getByRole('button', { name: 'Makine Ağırlığı kaldır' }));
    expect(screen.queryByLabelText('Makine Ağırlığı')).toBeNull();
    const draft = JSON.parse(localStorage.getItem(laserDraftKey({ tenantId: 'tenant-1', divisionId: 'division-1', brandId: 'aore-1', draftScope: 'settings' }, selection))!);
    expect(draft.specs.some((spec: { key: string }) => spec.key === 'Makine Ağırlığı')).toBe(false);
    expect(draft.specs.find((spec: { key: string }) => spec.key === 'Özel ölçü')).toMatchObject({ value: '125', unit: 'cm', groupCode: 'OZEL' });
    expect((screen.getByRole('button', { name: 'Lazer Gücü kaldır' }) as HTMLButtonElement).disabled).toBe(true);
  }, 15_000);

  it('renders only the ordered selection flow when the common workbook owns field editing', async () => {
    render(<Harness initial={resolveLaserProfile(selection)} selectionOnly />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'S Serisi' })).toBeTruthy());
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByLabelText('Makine Ağırlığı')).toBeNull();
    expect((screen.getByLabelText('5. Rezonatör gücü') as HTMLSelectElement).value).toBe('6');
  });

  it('resets the value and unit together when returning to the source', async () => {
    const initial = resolveLaserProfile(selection);
    initial.specs = initial.specs.map((spec) => spec.key === 'Makine Ağırlığı' ? { ...spec, value: '2.2', unit: 'ton', sourceValue: '2150', sourceUnit: 'kg', isManual: true } : spec);
    const onChange = vi.fn();
    render(<Harness initial={initial} onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Makine Ağırlığı kaynak değerine dön' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ specs: expect.arrayContaining([expect.objectContaining({ key: 'Makine Ağırlığı', value: '2150', unit: 'kg', isManual: false })]) }));
    expect((screen.getByLabelText('Makine Ağırlığı') as HTMLInputElement).value).toBe('2150');
  });
});
