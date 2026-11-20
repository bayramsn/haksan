// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { baseModelOptionSpecs, isRequiredConfigurationSet, isConfigurableProduct, selectedOptionsMatchCatalog, optionSnapshot, ProductConfigurationOptionsEditor, QuoteConfigurationOptions } from './ProductConfigurationOptions';
import { productService } from '../../../lib/services';
vi.mock('../../../lib/services', () => ({ productService: { options: vi.fn(), addOptionSet: vi.fn(), updateOptionSet: vi.fn(), archiveOptionSet: vi.fn(), addOptionValue: vi.fn(), updateOptionValue: vi.fn(), archiveOptionValue: vi.fn() } }));
const sets = [{ id: 'table-set', name: 'Tabla ölçüsü', configurationKind: 'table' as const, values: [{ id: 'f4020', value: '4000 × 2000 mm', sourceModelCode: 'F4020', priceDelta: '1500', currencyCode: 'USD' }] }];
const base = { familyCode: 'F', series: 'F' as const, productTypeCode: 'FIBER_LAZER_KESIM' as const, sourceModelCodes: ['F3015', 'F4020'] };
beforeEach(() => { cleanup(); vi.clearAllMocks(); vi.mocked(productService.options).mockResolvedValue(sets); });
describe('lazer baz model seçenekleri', () => {
  it('seçilen ölçünün kimlik, etiket ve fiyatını teklif anlık kaydına aktarır', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<QuoteConfigurationOptions productId="base" selected={[]} disabled={false} onChange={onChange} />);
    const select = await screen.findByLabelText('Tabla ölçüsü');
    fireEvent.change(select, { target: { value: 'f4020' } });
    expect(onChange).toHaveBeenCalledWith(sets, [{ optionSetId: 'table-set', optionValueId: 'f4020', name: 'Tabla ölçüsü', value: '4000 × 2000 mm', priceDelta: '1500', currencyCode: 'USD' }]);
  });
  it('kullanıcı özel ölçüyü ve ek fiyatını baz karta ekleyebilir', async () => {
    render(<ProductConfigurationOptionsEditor productId="base" base={base} currency="USD" />);
    await screen.findByText('Seçenek ekle');
    const labels = screen.getAllByLabelText('Tabla ölçüsü seçenek adı');
    const prices = screen.getAllByLabelText('Tabla ölçüsü ek fiyat');
    fireEvent.change(labels[1], { target: { value: '5000 × 2500 mm' } });
    fireEvent.change(prices[1], { target: { value: '3000' } });
    fireEvent.click(screen.getByText('Seçenek ekle'));
    await waitFor(() => expect(productService.addOptionValue).toHaveBeenCalledWith('table-set', { value: '5000 × 2500 mm', priceDelta: '3000', currencyCode: 'USD', sourceModelCode: null }));
  });
  it('fiyat boşken veya negatifken kaydetmez, ücretsiz seçeneği açık sıfırla kaydeder', async () => {
    render(<ProductConfigurationOptionsEditor productId="base" base={base} currency="EUR" />);
    const labels = await screen.findAllByLabelText('Tabla ölçüsü seçenek adı');
    fireEvent.change(labels[1], { target: { value: 'Özel tabla' } });
    const button = screen.getByRole('button', { name: 'Seçenek ekle' }) as HTMLButtonElement;
    const price = screen.getAllByLabelText('Tabla ölçüsü ek fiyat')[1];
    expect(button.disabled).toBe(true);
    fireEvent.change(price, { target: { value: '-10' } });
    expect(button.disabled).toBe(true);
    fireEvent.change(price, { target: { value: '0' } });
    fireEvent.click(button);
    await waitFor(() => expect(productService.addOptionValue).toHaveBeenCalledWith('table-set', expect.objectContaining({ priceDelta: '0', currencyCode: 'EUR' })));
  });
  it('yeni kabin seçeneğinde açık kabini kendiliğinden seçmez', async () => {
    vi.mocked(productService.options).mockResolvedValue([{ id: 'cabin-set', name: 'Kabin', configurationKind: 'cabin', values: [] }]);
    render(<ProductConfigurationOptionsEditor productId="base" base={base} currency="USD" />);
    fireEvent.change(await screen.findByLabelText('Kabin seçenek adı'), { target: { value: 'Kapalı kabin' } });
    fireEvent.change(screen.getByLabelText('Kabin ek fiyat'), { target: { value: '0' } });
    const button = screen.getByRole('button', { name: 'Seçenek ekle' }) as HTMLButtonElement;
    expect((screen.getByLabelText('Kabin kabin') as HTMLSelectElement).value).toBe('');
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Kabin kabin'), { target: { value: 'closed' } });
    fireEvent.click(button);
    await waitFor(() => expect(productService.addOptionValue).toHaveBeenCalledWith('cabin-set', expect.objectContaining({ cabinType: 'closed', priceDelta: '0' })));
  });
  it('güç seçeneği için geçerli kW ve kullanıcı fiyatı ister', async () => {
    vi.mocked(productService.options).mockResolvedValue([{ id: 'power-set', name: 'Güç', configurationKind: 'power', values: [] }]);
    render(<ProductConfigurationOptionsEditor productId="base" base={base} currency="USD" />);
    fireEvent.change(await screen.findByLabelText('Güç seçenek adı'), { target: { value: '6 kW' } });
    fireEvent.change(screen.getByLabelText('Güç ek fiyat'), { target: { value: '500' } });
    const button = screen.getByRole('button', { name: 'Seçenek ekle' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Güç kW'), { target: { value: '1001' } });
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Güç kW'), { target: { value: '6' } });
    fireEvent.click(button);
    await waitFor(() => expect(productService.addOptionValue).toHaveBeenCalledWith('power-set', expect.objectContaining({ powerKw: 6, priceDelta: '500', currencyCode: 'USD' })));
  });
  it('bir grupta seçim değişince önceki ölçüyü aynı grupta tutmaz', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<QuoteConfigurationOptions productId="base" selected={[{ optionSetId: 'table-set', optionValueId: 'old', name: 'Tabla ölçüsü', value: 'Eski ölçü', priceDelta: '0', currencyCode: 'USD' }]} disabled={false} onChange={onChange} />);
    fireEvent.change(await screen.findByLabelText('Tabla ölçüsü'), { target: { value: 'f4020' } });
    expect(onChange.mock.calls[0][1]).toHaveLength(1);
    expect(onChange.mock.calls[0][1][0].optionValueId).toBe('f4020');
  });
  it('başka seçim değişince mevcut katalog fiyatını anlık kayda alır', async () => {
    const power = { id: 'power-set', name: 'Güç', configurationKind: 'power' as const, values: [{ id: 'power-6', value: '6 kW', powerKw: 6, priceDelta: '800', currencyCode: 'USD' }] };
    vi.mocked(productService.options).mockResolvedValue([...sets, power]);
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<QuoteConfigurationOptions productId="base" selected={[{ optionSetId: 'table-set', optionValueId: 'f4020', name: 'Tabla ölçüsü', value: '4000 × 2000 mm', priceDelta: '100', currencyCode: 'USD' }]} disabled={false} onChange={onChange} />);
    fireEvent.change(await screen.findByLabelText('Güç'), { target: { value: 'power-6' } });
    expect(onChange.mock.calls[0][1][0].priceDelta).toBe('1500');
  });

  it('seçimden sonra fiyat değişmesi halinde eski fiyat satırının kaydına izin vermez', () => {
    const draft = optionSnapshot(sets[0], sets[0].values[0]);
    const current = [{ ...sets[0], values: [{ ...sets[0].values[0], priceDelta: '2000' }] }];
    expect(selectedOptionsMatchCatalog(current, [draft])).toBe(false);
    expect(selectedOptionsMatchCatalog(current, [optionSnapshot(current[0], current[0].values[0])])).toBe(true);
  });
  it('pasife alınan seçenek ve değişen etiket veya para birimi yeniden seçim gerektirir', () => {
    const draft = optionSnapshot(sets[0], sets[0].values[0]);
    expect(selectedOptionsMatchCatalog([], [draft])).toBe(false);
    expect(selectedOptionsMatchCatalog([{ ...sets[0], name: 'Yeni grup adı' }], [draft])).toBe(false);
    expect(selectedOptionsMatchCatalog([{ ...sets[0], values: [{ ...sets[0].values[0], currencyCode: 'EUR' }] }], [draft])).toBe(false);
    expect(selectedOptionsMatchCatalog([{ ...sets[0], values: [{ ...sets[0].values[0], value: 'Başka ölçü' }] }], [draft])).toBe(false);
    expect(selectedOptionsMatchCatalog([{ ...sets[0], values: [{ ...sets[0].values[0], priceDelta: '1500.0000' }] }], [draft])).toBe(true);
  });

});

describe('üniversal baz model seçenekleri', () => {
  const universal = { kind: 'universal' as const, baseModelCode: 'CU500', sourceRevision: 'universal-v1', sourceModelCodes: ['CU500/1000', 'CU500/1500'], variableSpecKeys: ['Puntalar arası'], configurations: [{ sourceModelCode: 'CU500/1500', sourceProductId: '11111111-1111-4111-8111-111111111111', specs: [{ key: 'Puntalar arası', value: '1500', unit: 'mm' }] }] };
  const lengths = [{ id: 'length', name: 'Puntalar arası', configurationKind: null, values: [{ id: 'long', value: '1500 mm', sourceModelCode: 'CU500/1500', priceDelta: '0', currencyCode: 'USD' }] }];
  it('üniversal kart için kaynak modeli seçtirir ve lazer kontrollerini göstermez', async () => {
    vi.mocked(productService.options).mockResolvedValue(lengths);
    render(<ProductConfigurationOptionsEditor productId="universal" genericBase={universal} currency="USD" />);
    const inputs = await screen.findAllByLabelText('Puntalar arası kaynak model');
    expect(screen.queryByRole('option', { name: 'Lazer gücü' })).toBeNull();
    fireEvent.change(screen.getAllByLabelText('Puntalar arası seçenek adı')[1], { target: { value: '1500 mm' } });
    fireEvent.change(inputs[1], { target: { value: 'CU500/1500' } });
    fireEvent.change(screen.getAllByLabelText('Puntalar arası ek fiyat')[1], { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Seçenek ekle' }));
    await waitFor(() => expect(productService.addOptionValue).toHaveBeenCalledWith('length', expect.objectContaining({ sourceModelCode: 'CU500/1500', priceDelta: '100' })));
    expect(isConfigurableProduct({ baseModelConfiguration: universal })).toBe(true);
  });
  it('kaynak seçimi yalnız birden fazla konfigürasyonlu baz kartta zorunludur', () => {
    expect(isRequiredConfigurationSet(lengths[0], universal)).toBe(false);
    const multiple = { ...universal, configurations: [...universal.configurations, { ...universal.configurations[0], sourceModelCode: 'CU500/1000' }] };
    expect(isRequiredConfigurationSet(lengths[0], multiple)).toBe(true);
    expect(isRequiredConfigurationSet({ ...lengths[0], values: [{ ...lengths[0].values[0], sourceModelCode: null }] }, multiple)).toBe(false);
  });
  it('değişken teknik bilgi seçilen kaynaktan gelir ve seçim kaldırıldığında eski değer kalmaz', () => {
    const fixed = [{ key: 'Puntalar arası', value: '1000', unit: 'mm' }, { key: 'Gövde', value: 'Döküm' }];
    const selected = [optionSnapshot(lengths[0], lengths[0].values[0])];
    expect(baseModelOptionSpecs(universal, lengths, selected, fixed)).toEqual([{ key: 'Gövde', value: 'Döküm' }, { key: 'Puntalar arası', value: '1500 mm' }]);
    expect(baseModelOptionSpecs(universal, lengths, [], fixed)).toEqual([{ key: 'Gövde', value: 'Döküm' }]);
    const other = { id: 'other', name: 'Başka', configurationKind: null, values: [{ id: 'short', value: '1000 mm', sourceModelCode: 'CU500/1000', priceDelta: '0', currencyCode: 'USD' }] };
    expect(() => baseModelOptionSpecs(universal, [...lengths, other], [...selected, optionSnapshot(other, other.values[0])], fixed)).toThrow();
  });
});
