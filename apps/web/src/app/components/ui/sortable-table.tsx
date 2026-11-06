import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableHead } from "./table";
import { cn } from "./utils";

/**
 * Listelerde kolon başlığına tıklayarak sıralama. Metin TR A-Z (sayı içeren
 * metinde "MV-850" < "MV-1050"), sayı ve tarih büyüklüğe göre. Boş değer
 * yön ne olursa olsun en sona düşer. Tıklama aynı kolonda yönü çevirir.
 */
export type SortDir = "asc" | "desc";
export type SortState<K extends string = string> = { key: K; dir: SortDir } | null;
export type SortValue = string | number | Date | boolean | null | undefined;

const isEmpty = (v: SortValue) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "") ||
  (typeof v === "number" && Number.isNaN(v)) || (v instanceof Date && Number.isNaN(v.getTime()));

export function compareSortValues(a: SortValue, b: SortValue, dir: SortDir): number {
  const aEmpty = isEmpty(a);
  const bEmpty = isEmpty(b);
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  const num = (v: SortValue) => (v instanceof Date ? v.getTime() : typeof v === "boolean" ? Number(v) : v);
  const av = num(a);
  const bv = num(b);
  const diff = typeof av === "number" && typeof bv === "number"
    ? av - bv
    : String(av).trim().localeCompare(String(bv).trim(), "tr", { numeric: true, sensitivity: "base" });
  return dir === "asc" ? diff : -diff;
}

export const nextSort = <K extends string>(current: SortState<K>, key: K): SortState<K> =>
  current?.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };

/**
 * İstemci tarafı liste sıralaması. `accessors` kolon anahtarından satırdaki
 * sıralanacak değere eşler; `initial` ilk açılış sırasıdır (null = gelen sıra).
 */
export function useSortableRows<T, K extends string>(
  rows: readonly T[],
  accessors: Record<K, (row: T) => SortValue>,
  initial: SortState<NoInfer<K>> = null,
) {
  const [sort, setSort] = React.useState<SortState<K>>(initial);
  // Memo yok: accessor'lar satır dışı state'e (hedef, servis sayısı...) bakabiliyor,
  // memo o değişimi kaçırıp eski sırayı gösterirdi. Anahtar satır başına bir kez hesaplanır.
  let sorted = rows as T[];
  if (sort) {
    const pick = accessors[sort.key];
    sorted = rows
      .map((row) => [pick(row), row] as const)
      .sort((a, b) => compareSortValues(a[0], b[0], sort.dir))
      .map(([, row]) => row);
  }
  const toggle = React.useCallback((key: K) => setSort((s) => nextSort(s, key)), []);
  return { sorted, sort, setSort, toggle };
}

type SortableTableHeadProps<K extends string> = Omit<React.ComponentProps<"th">, "onClick"> & {
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
};

/** Tıklanabilir kolon başlığı; aktif yön ok simgesiyle ve aria-sort ile gösterilir. */
export function SortableTableHead<K extends string>({ sortKey, sort, onSort, className, children, ...props }: SortableTableHeadProps<K>) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={className}
      {...props}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-[inherit] hover:text-foreground focus-visible:outline-none focus-visible:underline",
          active && "text-foreground",
        )}
      >
        {children}
        <Icon className={cn("size-3 shrink-0", !active && "opacity-50")} aria-hidden />
      </button>
    </TableHead>
  );
}
