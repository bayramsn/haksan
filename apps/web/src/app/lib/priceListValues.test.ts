import { expect, it } from 'vitest';
import { parsePriceInput, formatPrice } from './priceListValues';
it('preserves decimal prices and understands Turkish amounts',()=>{expect(parsePriceInput('123.45')).toBe(123.45);expect(parsePriceInput('1.234,50')).toBe(1234.5);expect(parsePriceInput('0')).toBe(0);expect(parsePriceInput('')).toBeNull();expect(parsePriceInput('-1')).toBeNull();});
it('shows explicit zero and keeps missing prices empty',()=>{expect(formatPrice(0,'TRY')).toBe('0 TL');expect(formatPrice(null,'USD')).toBe('—');});
