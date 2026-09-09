// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLaserProfile, LASER_MODELS } from '@haksan/shared';
import type { Product } from '../../lib/mock';
import { ProductDialog } from './CreateDialogs';
import { toast } from 'sonner';
import { laserProfilesService } from '../../../lib/services/laser-profiles.service';

const state = vi.hoisted(() => ({
  products: [] as Product[], updateProduct: vi.fn(), addProduct: vi.fn(),
  user: { tenantId: 'tenant-1', divisions: [{ id: 'sac-1', code: 'sac_isleme' }] },
}));
vi.mock('../../lib/store', () => ({ useStore: () => state }));
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: state.user, activeDivision: 'sac-1', hasRole: () => true, hasPermission: () => true }) }));
vi.mock('../../../lib/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/services')>();
  return { ...actual, productService: { ...actual.productService, listBrands: vi.fn(async () => [{ id: 'aore-1', name: 'HEXLASER', technicalCatalogCode: 'AORE_LASER' }]), specTemplates: vi.fn(async () => []) }, lookupService: { ...actual.lookupService, byName: vi.fn(async () => []) } };
});
vi.mock('../../../lib/services/laser-profiles.service', () => ({ laserProfilesService: { options: vi.fn(), resolve: vi.fn() } }));
vi.mock('../shared/RemoteCompanyCombobox', () => ({ RemoteCompanyCombobox: () => <div /> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Icon = () => <svg aria-hidden="true" />;
  return { ...actual, ...Object.fromEntries(Object.keys(actual).filter((name) => /^[A-Z]/.test(name)).map((name) => [name, Icon])) };
});
// The workspace contains separate React versions for native and web. Keep the
// unrelated Radix shell out of this integration test; the laser editor is real.
vi.mock('../ui/dialog', () => ({
  Dialog: ({ open, children }: any) => open ? <>{children}</> : null,
  DialogContent: ({ children }: any) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: any) => <header>{children}</header>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <footer>{children}</footer>,
  DialogTrigger: ({ children }: any) => <>{children}</>,
}));
vi.mock('../ui/select', () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: () => null, SelectValue: () => null,
  SelectTrigger: ({ children }: any) => <span>{children}</span>,
  SelectGroup: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <span>{children}</span>,
  SelectLabel: ({ children }: any) => <span>{children}</span>,
}));
vi.mock('../ui/combobox', () => ({ Combobox: ({ value }: any) => <span>{value}</span> }));
vi.mock('../ui/label', () => ({ Label: ({ children, ...props }: any) => <label {...props}>{children}</label> }));

beforeEach(() => {
  vi.clearAllMocks();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } });
  state.updateProduct.mockResolvedValue(undefined);
  vi.mocked(laserProfilesService.options).mockResolvedValue({ models: [...LASER_MODELS], cabinOptions: ['open', 'closed'], powerOptions: [3, 6, 12, 20, 30] });
  vi.mocked(laserProfilesService.resolve).mockImplementation(async (_scope, selection) => resolveLaserProfile(selection));
  const technicalConfiguration = resolveLaserProfile({ productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', cabinType: 'open', powerKw: 6, sourceModelCode: 'F3015' });
  state.products = [{ id: 'p1', brand: 'HEXLASER', brandId: 'aore-1', model: 'COMMERCIAL-001', modelName: 'F lazer', series: 'F', productGroupCode: 'SAC_ISLEME', productGroup: 'Sac İşleme', categoryCode: 'TEZGAH', category: 'Tezgah', subcategoryCode: 'LAZER_KESIM', subcategory: 'Sac Lazer Kesim', productTypeCode: 'FIBER_LAZER_KESIM', type: 'Sac Lazer Kesim', shortDescription: 'HEXLASER F lazer', description: '', imageUrl: '', controlPanel: '', currency: 'USD', listPrice: 1, specs: technicalConfiguration.specs, technicalConfiguration, standardEquipment: [], optionalEquipment: [], status: 'active' }];
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('product card laser integration', () => {
  it('reopens saved selections, replaces the profile on power change, and saves manual values with the unchanged commercial code', async () => {
    render(<ProductDialog mode="edit" product={state.products[0]} open onOpenChange={() => {}} />);
    expect(screen.getByLabelText('5. Rezonatör gücü')).toHaveValue('6');
    expect(screen.getByLabelText('Makine Ağırlığı')).toHaveValue('2150');
    fireEvent.change(screen.getByLabelText('5. Rezonatör gücü'), { target: { value: '12' } });
    expect(screen.queryByLabelText('Makine Ağırlığı')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('6. Tabla ölçüsü')).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('6. Tabla ölçüsü'), { target: { value: 'F3015' } });
    await waitFor(() => expect(screen.getByLabelText('Makine Ağırlığı')).toHaveValue('3150'));
    fireEvent.change(screen.getByLabelText('Makine Ağırlığı'), { target: { value: '3200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));
    await waitFor(() => expect(state.updateProduct).toHaveBeenCalledTimes(1));
    const [id, payload] = state.updateProduct.mock.calls[0];
    expect(id).toBe('p1');
    expect(payload.model).toBe('COMMERCIAL-001');
    expect(payload.technicalConfiguration.selection).toMatchObject({ powerKw: 12, sourceModelCode: 'F3015' });
    expect(payload.technicalConfiguration.specs.find((spec: { key: string }) => spec.key === 'Makine Ağırlığı')).toMatchObject({ value: '3200', sourceValue: '3150', isManual: true });
    expect(payload.specs.find((spec: { key: string }) => spec.key === 'Tabla Yük Kapasitesi')?.value).toBe('1500');
  }, 15_000);

  it('moves a sheet laser to TG and saves unsupported 30 kW with manual fields under the tube subcategory', async () => {
    render(<ProductDialog mode="edit" product={state.products[0]} open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('2. Ürün alt kategorisi'), { target: { value: 'BORU_LAZER_KESIM' } });
    await screen.findByRole('option', { name: 'TG Serisi' });
    fireEvent.change(screen.getByLabelText('3. Ürün serisi tipi'), { target: { value: 'TG' } });
    fireEvent.change(screen.getByLabelText('4. Kabin tipi'), { target: { value: 'closed' } });
    fireEvent.change(screen.getByLabelText('5. Rezonatör gücü'), { target: { value: '30' } });
    await waitFor(() => expect(screen.getByLabelText('6. Model ve boru kapasitesi')).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('6. Model ve boru kapasitesi'), { target: { value: 'TG6012' } });
    await waitFor(() => expect(screen.getByLabelText('Makine Ağırlığı')).toHaveValue(''));
    fireEvent.change(screen.getByLabelText('Makine Ağırlığı'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));
    await waitFor(() => expect(state.updateProduct).toHaveBeenCalledTimes(1));
    const payload = state.updateProduct.mock.calls[0][1];
    expect(payload.productTypeCode).toBe('BORU_LAZER_KESIM');
    expect(payload.subcategoryCode).toBe('BORU_PROFIL_LAZER_KESIM');
    expect(payload.technicalConfiguration.selection).toMatchObject({ series: 'TG', powerKw: 30, sourceModelCode: 'TG6012' });
    expect(payload.technicalConfiguration.supportedPower).toBe(false);
    expect(payload.specs.find((spec: { key: string }) => spec.key === 'Makine Ağırlığı')?.value).toBe('5000');
  }, 15_000);
});


describe('imported unconfigured laser product', () => {
  it('preserves source specifications when saving without starting a new selection', async () => {
    state.products[0] = { ...state.products[0], technicalConfiguration: null };
    render(<ProductDialog mode="edit" product={state.products[0]} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));
    await waitFor(() => expect(state.updateProduct).toHaveBeenCalledTimes(1));
    const payload = state.updateProduct.mock.calls[0][1];
    expect(payload.technicalConfiguration).toBeNull();
    expect(payload.specs.find((spec: { key: string }) => spec.key === 'Makine Ağırlığı')?.value).toBe('2150');
  });

  it('blocks an incomplete selection from replacing imported specifications with an empty list', async () => {
    state.products[0] = { ...state.products[0], technicalConfiguration: null };
    render(<ProductDialog mode="edit" product={state.products[0]} open onOpenChange={() => {}} />);
    await screen.findByRole('option', { name: 'F Serisi' });
    fireEvent.change(screen.getByLabelText('3. Ürün serisi tipi'), { target: { value: 'F' } });
    fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));
    expect(state.updateProduct).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Lazer teknik bilgi seçimlerini tamamlayın', expect.any(Object));
  });
});
