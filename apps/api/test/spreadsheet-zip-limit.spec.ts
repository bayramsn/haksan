/**
 * Zip bombası: küçük sıkıştırılmış dosya açılınca tavanı aşıyorsa ExcelJS'e hiç verilmeden reddedilir.
 * Zip, beyan ettiği boyutla birlikte elle kurulur; koruma beyana değil gerçek açılan veriye bakmalı.
 */
import { deflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { assertXlsxWithinLimit, loadXlsxWorkbook, readSpreadsheetMatrix } from '../src/shared/utils/spreadsheet-import';

function zipOf(name: string, content: Buffer, declaredSize = content.length): Buffer {
  const data = deflateRawSync(content);
  const file = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(declaredSize, 22); local.writeUInt16LE(file.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20); central.writeUInt32LE(declaredSize, 24); central.writeUInt16LE(file.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = local.length + file.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + file.length, 12); end.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, file, data, central, file, end]);
}

describe('Excel zip bombası sınırı', () => {
  const bomb = Buffer.alloc(30 * 1024 * 1024);

  it('açılınca tavanı aşan dosyayı, boyutu küçük beyan edilse de reddeder', () => {
    const zip = zipOf('xl/worksheets/sheet1.xml', bomb, 100);
    expect(zip.length).toBeLessThan(100 * 1024);
    expect(() => assertXlsxWithinLimit(zip, 20 * 1024 * 1024)).toThrow('izin verilen boyutu aşıyor');
  });

  it('içe aktarma okuyucusu da bombayı ExcelJS\'e vermeden düşürür', async () => {
    const fileBase64 = zipOf('xl/worksheets/sheet1.xml', bomb).toString('base64');
    await expect(readSpreadsheetMatrix('liste.xlsx', fileBase64, { maxUncompressedBytes: 20 * 1024 * 1024 })).rejects.toThrow('izin verilen boyutu aşıyor');
  });

  it('aynı veriye işaret eden ikinci girdiyi (örtüşme) açmadan reddeder', () => {
    const one = zipOf('a.xml', Buffer.from('x'));
    // Merkez dizin girdisini çoğalt: ikisi de aynı yerel başlığa işaret eder.
    const cdStart = one.readUInt32LE(one.length - 22 + 16);
    const cd = one.subarray(cdStart, one.length - 22);
    const end = Buffer.from(one.subarray(one.length - 22));
    end.writeUInt16LE(2, 8); end.writeUInt16LE(2, 10); end.writeUInt32LE(cd.length * 2, 12);
    const twice = Buffer.concat([one.subarray(0, cdStart), cd, cd, end]);
    expect(() => assertXlsxWithinLimit(twice)).toThrow('okunamadı');
  });

  it('bozuk zip ve gerçek .xlsx ayrımı', async () => {
    expect(() => assertXlsxWithinLimit(Buffer.from('PK not really a zip'))).toThrow('okunamadı');
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Liste').addRows([['E-posta'], ['a@example.com']]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const loaded = await loadXlsxWorkbook(buffer);
    expect(loaded.worksheets[0].getCell('A2').value).toBe('a@example.com');
  });
});
