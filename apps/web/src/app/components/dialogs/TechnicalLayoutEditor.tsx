import type { TechnicalImportLayout } from '@haksan/shared';
import type { TechnicalImportPreview } from '../../../lib/services';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export function excelColumnName(index: number): string {
  let result = '';
  for (let current = index + 1; current > 0; current = Math.floor((current - 1) / 26)) result = String.fromCharCode(65 + (current - 1) % 26) + result;
  return result;
}

export function TechnicalLayoutEditor({ sheets, value, onChange, disabled, dirty, onApply }: {
  sheets: NonNullable<TechnicalImportPreview['sourceSheets']>;
  value: TechnicalImportLayout;
  onChange: (value: TechnicalImportLayout) => void;
  disabled: boolean;
  dirty: boolean;
  onApply: () => void;
}) {
  const sheet = sheets.find((item) => item.name === value.sheetName);
  const heading = sheet?.sampleRows[Math.max(0, value.firstDataRow - 2)] ?? [];
  const columns = Array.from({ length: sheet?.columnCount ?? 0 }, (_, index) => ({ index, label: `${excelColumnName(index)}${heading[index] ? ` — ${heading[index].slice(0, 60)}` : ''}` }));
  const selectClass = 'h-9 w-full rounded border border-slate-300 bg-white px-2 text-xs disabled:bg-slate-100';
  return <details className="border-b border-slate-200 bg-slate-50 px-5 py-3" open={dirty || undefined}>
    <summary className="cursor-pointer text-xs font-semibold text-slate-800">Dosya düzeni · {value.sheetName} · Değer/model: {excelColumnName(value.valueColumn)}{dirty ? ' · Değişiklikler henüz uygulanmadı' : ''}</summary>
    <p className="my-2 text-xs text-slate-600">Yatay model tablosunda aktaracağınız modelin sütununu seçin. Her aktarım tek sayfa ve tek değer sütununu kullanır.</p>
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <label className="space-y-1 text-xs">Çalışma sayfası<select className={selectClass} value={value.sheetName} disabled={disabled} onChange={(event) => { const next = sheets.find((item) => item.name === event.target.value); if (next) onChange(next.suggestedLayout); }}>{sheets.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
      <label className="space-y-1 text-xs">İlk veri satırı<Input type="number" min={1} max={2000} className="h-9 bg-white text-xs" value={value.firstDataRow} disabled={disabled} onChange={(event) => onChange({ ...value, firstDataRow: Math.max(1, Math.min(2000, Number(event.target.value) || 1)) })} /></label>
      {([['keyColumn', 'Teknik alan'], ['valueColumn', 'Değer / model'], ['sectionColumn', 'Teknik grup'], ['unitColumn', 'Birim']] as const).map(([key, label]) => <label key={key} className="space-y-1 text-xs">{label}<select className={selectClass} disabled={disabled} value={value[key] ?? ''} onChange={(event) => onChange({ ...value, [key]: event.target.value === '' ? null : Number(event.target.value) })}>
        {(key === 'sectionColumn' || key === 'unitColumn') && <option value="">Sütun yok</option>}{columns.map((column) => <option key={column.index} value={column.index}>{column.label}</option>)}
      </select></label>)}
    </div>
    <div className="mt-3 flex justify-end"><Button size="sm" variant="outline" disabled={disabled || !dirty} onClick={onApply}>Eşlemeyi uygula ve yeniden incele</Button></div>
    <div className="mt-3 max-h-40 overflow-auto rounded border border-slate-200"><table className="w-full text-left text-xs"><caption className="sr-only">Kaynak dosyadaki ilk 30 satır</caption><thead><tr><th className="bg-slate-100 p-1.5">Satır</th>{columns.map((column) => <th className="bg-slate-100 p-1.5" key={column.index}>{excelColumnName(column.index)}</th>)}</tr></thead><tbody>{sheet?.sampleRows.map((row, index) => <tr key={index} className={index + 1 < value.firstDataRow ? 'text-slate-400' : 'bg-white'}><th className="p-1.5">{index + 1}</th>{columns.map((column) => <td className="max-w-52 truncate border-t p-1.5" key={column.index} title={row[column.index]}>{row[column.index]}</td>)}</tr>)}</tbody></table></div>
  </details>;
}
