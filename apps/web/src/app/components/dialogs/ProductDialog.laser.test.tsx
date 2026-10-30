// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLaserProfile, LASER_MODELS } from '@haksan/shared';
import type { Product } from '../../lib/mock';
import { ProductDialog } from './CreateDialogs';
import { productService } from '../../../lib/services';
import { laserProfilesService } from '../../../lib/services/laser-profiles.service';

const state = vi.hoisted(() => ({
  lookupRows: {} as Record<string, any[]>,
  products: [] as Product[], updateProduct: vi.fn(), addProduct: vi.fn(),
  user: { tenantId: 'tenant-1', divisions: [{ id: 'sac-1', code: 'sac_isleme' }] },
}));
vi.mock('../../lib/store', () => ({ useStore: () => state }));
vi.mock('../../../lib/auth', () => ({ useAuth: () => ({ user: state.user, activeDivision: 'sac-1', hasRole: () => true, hasPermission: () => true }) }));
vi.mock('../../../lib/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/services')>();
  return { ...actual, productService: { ...actual.productService, listBrands: vi.fn(async () => [{ id: 'aore-1', name: 'HEXLASER', technicalCatalogCode: 'AORE_LASER' }]), specTemplates: vi.fn(async () => []), options: vi.fn(async () => [{ id: 'table-set', name: 'Tabla ölçüsü', configurationKind: 'table', values: [{ id: 'table-3015', value: '3000 × 1500 mm', sourceModelCode: 'F3015', priceDelta: '1000', currencyCode: 'USD' }] }]), updateOptionValue: vi.fn(async () => ({})), addOptionValue: vi.fn(async () => ({})) }, lookupService: { ...actual.lookupService, byName: vi.fn(async (name: string) => state.lookupRows[name] ?? []) } };
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
  Select: ({ children, value, onValueChange, ...props }: any) => <select {...props} value={value} onChange={event => onValueChange?.(event.target.value)}>{children}</select>,
  SelectContent: ({ children }: any) => <>{children}</>, SelectValue: () => null,
  SelectTrigger: () => null,
  SelectGroup: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectLabel: () => null,
}));
vi.mock('../ui/combobox', () => ({ Combobox: ({ value, onChange, options }: any) => <select aria-label="Ürün markası" value={value} onChange={event => onChange?.(event.target.value)}>{options?.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> }));
vi.mock('../ui/label', () => ({ Label: ({ children, ...props }: any) => <label {...props}>{children}</label> }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  state.lookupRows = {};
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } });
  state.updateProduct.mockResolvedValue(undefined);
  state.addProduct.mockResolvedValue({ id: 'new-base' });
  vi.mocked(laserProfilesService.options).mockResolvedValue({ models: [...LASER_MODELS], cabinOptions: ['open', 'closed'], powerOptions: [1.5, 2, 3, 6, 12, 20, 30] });
  vi.mocked(laserProfilesService.resolve).mockImplementation(async (_scope, selection) => resolveLaserProfile(selection));
  const technicalConfiguration = resolveLaserProfile({ productTypeCode: 'FIBER_LAZER_KESIM', series: 'F', cabinType: 'open', powerKw: 6, sourceModelCode: 'F3015' });
  state.products = [{ id: 'p1', brand: 'HEXLASER', brandId: 'aore-1', model: 'COMMERCIAL-001', modelName: 'F lazer', series: 'F', productGroupCode: 'SAC_ISLEME', productGroup: 'Sac İşleme', categoryCode: 'TEZGAH', category: 'Tezgah', subcategoryCode: 'LAZER_KESIM', subcategory: 'Sac Lazer Kesim', productTypeCode: 'FIBER_LAZER_KESIM', type: 'Sac Lazer Kesim', shortDescription: 'HEXLASER F lazer', description: '', imageUrl: '', controlPanel: '', currency: 'USD', listPrice: 1, specs: technicalConfiguration.specs, technicalConfiguration, standardEquipment: [], optionalEquipment: [], status: 'active' }];
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('product card laser integration', () => {
  it('edits managed option prices without replacing the saved profile or commercial code', async () => {
    const saved = state.products[0].technicalConfiguration;
    render(<ProductDialog mode="edit" product={state.products[0]} open onOpenChange={() => {}} />);
    expect(screen.queryByLabelText('5. Rezonatör gücü')).not.toBeInTheDocument();
    const prices = await screen.findAllByLabelText('Tabla ölçüsü ek fiyat');
    fireEvent.change(prices[0], { target: { value: '1750' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(productService.updateOptionValue).toHaveBeenCalledWith('table-3015', expect.objectContaining({ priceDelta: '1750', sourceModelCode: 'F3015' })));
    fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));
    await waitFor(() => expect(state.updateProduct).toHaveBeenCalledTimes(1));
    expect(state.updateProduct.mock.calls[0][1]).toMatchObject({ model: 'COMMERCIAL-001', technicalConfiguration: saved });
    expect(laserProfilesService.resolve).not.toHaveBeenCalled();
  });

  it('creates a series base card without requiring table, cabin or power selections', async () => {
    state.lookupRows = {
      'product-groups': [{ id: 'group-sac', code: 'SAC_ISLEME', name: 'Sac İşleme', divisionId: 'sac-1' }],
      'product-categories': [{ id: 'category-machine', code: 'TEZGAH', name: 'Sac İşleme Tezgahları', divisionId: 'sac-1', productGroupId: 'group-sac' }],
      'product-subcategories': [{ id: 'sub-laser', code: 'LAZER_KESIM', name: 'Lazer Kesim', divisionId: 'sac-1', categoryId: 'category-machine' }],
      'product-types': [{ id: 'type-laser', code: 'FIBER_LAZER_KESIM', name: 'Sac Fiber Lazer', divisionId: 'sac-1', subcategoryId: 'sub-laser' }],
    };
    render(<ProductDialog mode="create" open onOpenChange={() => {}} />);
    await screen.findByRole('option', { name: 'Sac İşleme Tezgahları' });
    fireEvent.change(screen.getByLabelText('1. Ürün Grubu'), { target: { value: 'SAC_ISLEME' } });
    fireEvent.change(screen.getByLabelText('2. Ürün Kategorisi'), { target: { value: 'TEZGAH' } });
    fireEvent.change(await screen.findByLabelText('3. Ürün Alt Kategorisi'), { target: { value: 'LAZER_KESIM' } });
    fireEvent.change(screen.getByLabelText('4. Ürün Tipi'), { target: { value: 'FIBER_LAZER_KESIM' } });
    await screen.findByText(/Baz modeli kaydedin/);
    await waitFor(() => expect(screen.getByLabelText('Ürün markası').querySelector('option[value="HEXLASER"]')).not.toBeNull());
    fireEvent.change(screen.getByLabelText('Ürün markası'), { target: { value: 'HEXLASER' } });
    fireEvent.change(screen.getByLabelText('Ürün serisi'), { target: { value: 'F' } });
    fireEvent.change(screen.getByLabelText('7. Ürün Adı'), { target: { value: 'HEXLASER F Serisi' } });
    fireEvent.change(screen.getByLabelText('Ürün modeli'), { target: { value: 'F Serisi' } });
    expect(screen.queryByLabelText('5. Rezonatör gücü')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Oluştur' }));
    await waitFor(() => expect(state.addProduct).toHaveBeenCalledTimes(1));
    expect(state.addProduct.mock.calls[0][0]).toMatchObject({ series: 'F', model: 'F Serisi', productTypeCode: 'FIBER_LAZER_KESIM', technicalConfiguration: null, specs: [] });
    expect(laserProfilesService.resolve).not.toHaveBeenCalled();
  });
});


describe('imported unconfigured laser product', () => {
  it('preserves source specifications when saving without starting a new selection', async () => {
    state.products[0] = { ...state.products[0], technicalConfiguration: null };
    render(<ProductDialog mode="edit" product={state.products[0]} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));
    await waitFor(() => expect(state.updateProduct).toHaveBeenCalledTimes(1));
    const payload = state.updateProduct.mock.calls[0][1];
    expect(payload.technicalConfiguration).toBeNull();
    expect(payload.specs.find((spec: { key: string }) => spec.key === 'Makine Ağırlığı')?.value).toBe('2420');
  });

  it('adds a custom size and price without clearing imported source specifications', async () => {
    state.products[0] = { ...state.products[0], technicalConfiguration: null };
    render(<ProductDialog mode="edit" product={state.products[0]} open onOpenChange={() => {}} />);
    const labels = await screen.findAllByLabelText('Tabla ölçüsü seçenek adı');
    fireEvent.change(labels[1], { target: { value: '5000 × 2500 mm' } });
    fireEvent.change(screen.getAllByLabelText('Tabla ölçüsü ek fiyat')[1], { target: { value: '2500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Seçenek ekle' }));
    await waitFor(() => expect(productService.addOptionValue).toHaveBeenCalledWith('table-set', expect.objectContaining({ value: '5000 × 2500 mm', priceDelta: '2500', sourceModelCode: null })));
    fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));
    await waitFor(() => expect(state.updateProduct).toHaveBeenCalledTimes(1));
    expect(state.updateProduct.mock.calls[0][1].specs.find((spec: { key: string }) => spec.key === 'Makine Ağırlığı')?.value).toBe('2420');
  });
});


describe('CRM configured laser taxonomy', () => {
  it('keeps the configured CRM parent chain unchanged while managing optional prices', async () => {
    state.lookupRows = {
      'product-groups': [{ id: 'group-sac', code: 'SAC_ISLEME', name: 'Sac İşleme', divisionId: 'sac-1' }],
      'product-categories': [{ id: 'category-machine', code: 'TEZGAH', name: 'Tezgah', divisionId: 'sac-1', productGroupId: 'group-sac' }],
      'product-subcategories': [{ id: 'sub-laser', code: 'LAZER_KESIM', name: 'Sac Lazer Kesim', divisionId: 'sac-1', categoryId: 'category-machine' }],
      'product-types': [{ id: 'type-laser', code: 'FIBER_LAZER_KESIM', name: 'Sac Lazer Kesim', divisionId: 'sac-1', subcategoryId: 'sub-laser' }],
    };
    state.products[0] = { ...state.products[0], technicalConfiguration: null };
    render(<ProductDialog mode="edit" product={state.products[0]} open onOpenChange={() => {}} />);
    await screen.findByText('Seçenek ekle');
    expect(screen.queryByLabelText('5. Rezonatör gücü')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));
    await waitFor(() => expect(state.updateProduct).toHaveBeenCalledTimes(1));
    expect(state.updateProduct.mock.calls[0][1]).toMatchObject({ subcategoryCode: 'LAZER_KESIM', productTypeCode: 'FIBER_LAZER_KESIM', technicalConfiguration: null });
  }, 15_000);
});


describe('base card fixed technical information', () => {
  it.each(['laser', 'universal'] as const)('shows and saves fixed fields beside options for a %s base without adding variable template fields', async (kind) => {
    const fixedSpecs = [{ key: 'Makine Ağırlığı', value: '2150', unit: 'kg' }];
    const base = state.products[0];
    state.products[0] = {
      ...base,
      technicalConfiguration: null,
      specs: fixedSpecs,
      ...(kind === 'laser' ? {
        laserBaseConfiguration: { familyCode: 'F', productTypeCode: 'FIBER_LAZER_KESIM', sourceModelCodes: ['F3015'], series: 'F', sourceRevision: 'hexlaser-2026-v1' },
      } : {
        productTypeCode: 'HM_UNIVERSAL_UNIVERSAL_TORNA',
        type: 'Üniversal Torna',
        productGroupCode: 'UNIVERSAL',
        productGroup: 'Üniversal',
        baseModelConfiguration: { kind: 'universal', baseModelCode: 'CD 6241', sourceModelCodes: ['CD 6241/1000'], variableSpecKeys: ['Puntalar Arası Mesafe'], sourceRevision: 'test', configurations: [{ sourceProductId: '11111111-1111-4111-8111-111111111111', sourceModelCode: 'CD 6241/1000', specs: [{ key: 'Puntalar Arası Mesafe', value: '1000', unit: 'mm' }] }] },
      }),
    };
    render(<ProductDialog mode="edit" product={state.products[0]} open onOpenChange={() => {}} />);
    await screen.findAllByLabelText('Tabla ölçüsü seçenek adı');
    const weight = screen.getByLabelText('Makine Ağırlığı değeri');
    expect(weight).toHaveValue('2150');
    expect(screen.queryByRole('button', { name: 'Sabit listeyi tamamla' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Puntalar Arası Mesafe değeri')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Kesme Alanı değeri')).not.toBeInTheDocument();
    fireEvent.change(weight, { target: { value: '2200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));
    await waitFor(() => expect(state.updateProduct).toHaveBeenCalledTimes(1));
    expect(state.updateProduct.mock.calls[0][1].specs).toEqual([expect.objectContaining({ key: 'Makine Ağırlığı', value: '2200' })]);
    expect(laserProfilesService.resolve).not.toHaveBeenCalled();
  });
});
