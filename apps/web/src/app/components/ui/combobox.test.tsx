// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Combobox } from './combobox';

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
const options = [{ value: 'sac', label: 'Sac İşleme', hint: 'Lazer ve abkant' }, { value: 'urfa', label: 'Şanlıurfa', hint: 'Güneydoğu bölgesi' }];
const trigger = () => screen.getByRole('combobox', { name: 'Bölüm' });
function open() { fireEvent.click(trigger()); return screen.getByPlaceholderText('Bölüm ara'); }

describe('Combobox gerçek portal ve arama davranışı', () => {
  it('Türkçe arama ile gerçek seçenek kimliğini seçer', async () => {
    const onChange = vi.fn();
    render(<Combobox options={options} value="" onChange={onChange} ariaLabel="Bölüm" searchPlaceholder="Bölüm ara" />);
    fireEvent.change(open(), { target: { value: 'sanli' } });
    fireEvent.click(await screen.findByRole('option', { name: /Şanlıurfa/ }));
    expect(onChange).toHaveBeenCalledWith('urfa');
    await waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('false'));
  });

  it('önbellekte seçenek varken de veri hatası ve yeniden denemeyi gösterir', () => {
    const retry = vi.fn();
    render(<Combobox options={options} value="sac" onChange={() => {}} ariaLabel="Bölüm" searchPlaceholder="Bölüm ara" loadError="Bölümler alınamadı" onRetry={retry} />);
    open();
    expect(screen.getByRole('alert').textContent).toContain('Bölümler alınamadı');
    fireEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('yükleme ve hata sırasında yeni değer önermez, başarılı aramadan sonra önerir', async () => {
    const props = { options: [], value: '', onChange: vi.fn(), onCreate: vi.fn(), ariaLabel: 'Bölüm', searchPlaceholder: 'Bölüm ara' };
    const view = render(<Combobox {...props} loading />);
    fireEvent.change(open(), { target: { value: 'Yeni bölüm' } });
    expect(screen.queryByRole('option', { name: /ekle/ })).toBeNull();
    view.rerender(<Combobox {...props} loadError="Liste alınamadı" />);
    expect(screen.queryByRole('option', { name: /ekle/ })).toBeNull();
    view.rerender(<Combobox {...props} />);
    fireEvent.click(await screen.findByRole('option', { name: /Yeni bölüm.*ekle/ }));
    expect(props.onCreate).toHaveBeenCalledWith('Yeni bölüm');
  });

  it('kapatıp yeniden açınca önceki arama filtresini temizler', async () => {
    render(<Combobox options={options} value="" onChange={() => {}} ariaLabel="Bölüm" searchPlaceholder="Bölüm ara" />);
    fireEvent.change(open(), { target: { value: 'Lazer' } });
    fireEvent.click(trigger());
    await waitFor(() => expect(trigger().getAttribute('aria-expanded')).toBe('false'));
    expect((open() as HTMLInputElement).value).toBe('');
  });
});
