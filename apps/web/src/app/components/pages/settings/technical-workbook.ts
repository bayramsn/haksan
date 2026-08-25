/** Teknik çalışma sayfasının Excel benzeri hücre işlemleri. */

/** Yapıştırmanın sütun sırası; ekrandaki C-D-E kolonlarıyla aynı. */
export const WORKBOOK_COLUMNS = ["specKey", "defaultValue", "unit"] as const;
export type WorkbookColumn = (typeof WORKBOOK_COLUMNS)[number];

/** Excel/Sheets panosu: satırlar satır sonu, hücreler sekme ile ayrılır. */
export function parseClipboardMatrix(text: string) {
  return text.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((line) => line.split("\t"));
}

/**
 * Panodaki bloğu, yapıştırılan hücreyi sol üst köşe kabul ederek yazar. Blok
 * sayfadan uzunsa eksik satırlar `makeRow` ile üretilir. Tek hücrelik
 * yapıştırmada `null` döner; tarayıcının kendi davranışı bozulmasın.
 */
export function applyPastedBlock<T extends Record<WorkbookColumn, string>>(
  rows: T[],
  anchorIndex: number,
  anchorColumn: WorkbookColumn,
  text: string,
  makeRow: () => T,
): T[] | null {
  if (anchorIndex < 0) return null;
  const matrix = parseClipboardMatrix(text);
  if (matrix.length === 1 && matrix[0].length <= 1) return null;

  const firstColumn = WORKBOOK_COLUMNS.indexOf(anchorColumn);
  const next = [...rows];
  matrix.forEach((cells, offset) => {
    const index = anchorIndex + offset;
    const patch: Partial<Record<WorkbookColumn, string>> = {};
    cells.forEach((cell, cellIndex) => {
      const column = WORKBOOK_COLUMNS[firstColumn + cellIndex];
      if (column) patch[column] = cell.trim();
    });
    next[index] = { ...(next[index] ?? makeRow()), ...patch };
  });
  return next;
}
