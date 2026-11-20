import { expect, it } from 'vitest';
import { importedCurrencyCode, importedVatRate, importedCellValue } from '../src/modules/products/product-import-values';
it('normalizes TL and fractional Excel VAT without changing ordinary percentages',()=>{
 expect(importedCurrencyCode(' tl ')).toBe('TRY'); expect(importedCurrencyCode('EUR')).toBe('EUR');
 expect([0.01,0.1,0.2,1,10,20,0,undefined].map(importedVatRate)).toEqual([1,10,20,1,10,20,0,20]);
});
it('preserves formatted identifier zeroes without formatting numeric prices or VAT',()=>{
 expect(importedCellValue(123,'000000',String)).toBe('000123');
 expect(importedCellValue('00123','General',String)).toBe('00123');
 expect(importedCellValue(0.2,'0%',String)).toBe('0.2');
 expect(importedCellValue(123.45,'#,##0.00',String)).toBe('123.45');
});
