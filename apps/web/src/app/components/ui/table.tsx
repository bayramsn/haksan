"use client";

import * as React from "react";

import { cn } from "./utils";

export type { TableSort, TableSortDirection, TableSortType, TableSortValue } from "./tableSorting";
import { compareTableValues, type TableSort, type TableSortType, type TableSortValue } from "./tableSorting";

type HeaderDefinition = { index: number; key: string; type: TableSortType };
type TableContextValue = { sort: TableSort | null; columns: HeaderDefinition[]; manual: boolean; change: (column: HeaderDefinition) => void };
const TableSortContext = React.createContext<TableContextValue | null>(null);
type TableProps = React.ComponentProps<"table"> & {
  sort?: TableSort | null;
  defaultSort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
  /** Server/paginated callers sort their complete dataset before supplying rows. */
  manualSorting?: boolean;
  sortable?: boolean;
};

function elementProps(node: React.ReactNode): Record<string, any> | null {
  return React.isValidElement(node) ? node.props as Record<string, any> : null;
}
function flattened(nodes: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(nodes).flatMap((node) => React.isValidElement(node) && node.type === React.Fragment ? flattened(elementProps(node)?.children) : [node]);
}
type SortValueComponent = { getSortValue?: (props: Record<string, unknown>) => string | number | null | undefined };
/** A display component can expose a pure value without executing its render/hooks. */
function declaredSortValue(node: React.ReactNode): TableSortValue {
  if (!React.isValidElement(node) || (typeof node.type !== "function" && typeof node.type !== "object")) return undefined;
  const resolver = (node.type as unknown as SortValueComponent).getSortValue;
  if (typeof resolver !== "function") return undefined;
  const value = resolver(node.props as Record<string, unknown>);
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value)) || value === null ? value : undefined;
}
function singleDeclaredValue(node: React.ReactNode): TableSortValue {
  const direct = declaredSortValue(node);
  if (direct !== undefined) return direct;
  const props = elementProps(node);
  if (!props || props.children == null) return undefined;
  const children = React.Children.toArray(props.children);
  if (children.length !== 1) return undefined;
  return singleDeclaredValue(children[0]);
}

function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).filter(Boolean).join(" ");
  const declared = declaredSortValue(node);
  if (declared !== undefined) return declared == null ? "" : String(declared);
  const props = elementProps(node);
  if (!props || props["aria-hidden"] === true || props["aria-hidden"] === "true") return "";
  if (props.children != null) return textOf(props.children);
  // Display components such as StatusBadge often expose their content as a prop.
  return String(props.label ?? props.status ?? props.name ?? props.title ?? props.value ?? "");
}
function headerDefinitions(children: React.ReactNode): HeaderDefinition[] {
  const header = flattened(children).find((node) => React.isValidElement(node) && (node.type === TableHeader || node.type === "thead"));
  const row = flattened(elementProps(header)?.children).find((node) => React.isValidElement(node) && (node.type === TableRow || node.type === "tr"));
  return flattened(elementProps(row)?.children).map((node, index) => {
    const props = elementProps(node);
    return { index, key: props?.sortKey ?? String(index), type: props?.sortType ?? "auto" };
  });
}
function Table({ className, children, sort, defaultSort, onSortChange, manualSorting = false, sortable = true, ...props }: TableProps) {
  const [localSort, setLocalSort] = React.useState<TableSort | null>(defaultSort ?? null);
  const current = sort !== undefined ? sort : localSort;
  const columns = headerDefinitions(children);
  const context: TableContextValue | null = sortable ? {
    sort: current, columns, manual: manualSorting,
    change: (column) => {
      const next: TableSort = { key: column.key, direction: current?.key === column.key && current.direction === "asc" ? "desc" : "asc" };
      if (sort === undefined) setLocalSort(next);
      onSortChange?.(next);
    },
  } : null;
  return (
    <TableSortContext.Provider value={context}>
      <div data-slot="table-container" className="relative w-full overflow-x-auto">
        <table data-slot="table" className={cn("w-full caption-bottom text-[13px]", className)} {...props}>{children}</table>
      </div>
    </TableSortContext.Provider>
  );
}

function TableHeader({ className, children, ...props }: React.ComponentProps<"thead">) {
  const rows = flattened(children).map((row) => {
    if (!React.isValidElement(row)) return row;
    const cells = flattened(elementProps(row)?.children).map((cell, index) => React.isValidElement(cell) && cell.type === TableHead
      ? React.cloneElement(cell as React.ReactElement<TableHeadProps>, { sortIndex: index }) : cell);
    return React.cloneElement(row as React.ReactElement<{ children: React.ReactNode }>, {}, cells);
  });
  return <thead data-slot="table-header" className={cn("bg-muted/35 [&_tr]:border-b [&_tr]:border-border/80", className)} {...props}>{rows}</thead>;
}

function firstRow(node: React.ReactNode): React.ReactNode {
  if (!React.isValidElement(node)) return null;
  if (node.type === TableRow || node.type === "tr") return node;
  if (node.type === React.Fragment) return flattened(elementProps(node)?.children).find((child) => React.isValidElement(child) && (child.type === TableRow || child.type === "tr")) ?? null;
  return null;
}
function rowValue(node: React.ReactNode, index: number): { sortable: boolean; value: TableSortValue } {
  const row = firstRow(node);
  if (!row) return { sortable: false, value: null };
  const props = elementProps(row)!;
  if (props["data-sortable"] === false || props["data-sortable"] === "false") return { sortable: false, value: null };
  const cells = flattened(props.children);
  // Empty states, pagination and section/subtotal rows stay anchored between groups.
  if (cells.some((cell) => Number(elementProps(cell)?.colSpan ?? 1) > 1)) return { sortable: false, value: null };
  if (props.sortValues && index in props.sortValues) return { sortable: true, value: props.sortValues[index] };
  const cell = cells[index];
  const cellProps = elementProps(cell);
  if (!cellProps) return { sortable: true, value: textOf(cell) };
  const explicit = cellProps["data-sort-value"] !== undefined ? cellProps["data-sort-value"] : cellProps.sortValue !== undefined ? cellProps.sortValue : cellProps.value;
  const declared = singleDeclaredValue(cell);
  return { sortable: true, value: explicit !== undefined ? explicit : declared !== undefined ? declared : textOf(cellProps.children) || textOf(cell) };
}

function bodyUnits(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap((node) => {
    if (!React.isValidElement(node) || node.type !== React.Fragment) return [node];
    const parts = React.Children.toArray(elementProps(node)?.children);
    const rows = parts.map(firstRow).filter(Boolean);
    const firstCells = flattened(elementProps(rows[0])?.children);
    const firstIsRecord = firstCells.length > 0 && firstCells.every((cell) => Number(elementProps(cell)?.colSpan ?? 1) === 1);
    const hasDetail = rows.slice(1).some((row) => flattened(elementProps(row)?.children).some((cell) => Number(elementProps(cell)?.colSpan ?? 1) > 1));
    // A master row and its expandable detail travel as one keyed unit. A wrapper
    // fragment around a list is transparent so all records remain sortable.
    return firstIsRecord && hasDetail ? [node] : bodyUnits(elementProps(node)?.children);
  });
}

function TableBody({ className, children, ...props }: React.ComponentProps<"tbody">) {
  const context = React.useContext(TableSortContext);
  const column = context?.columns.find((item) => item.key === context.sort?.key);
  let ordered = bodyUnits(children);
  if (context?.sort && column && !context.manual) {
    const sort = context.sort;
    const result: React.ReactNode[] = [];
    let segment: { node: React.ReactNode; value: TableSortValue; source: number }[] = [];
    const flush = () => {
      segment.sort((a, b) => compareTableValues(a.value, b.value, sort.direction, column.type) || a.source - b.source);
      result.push(...segment.map((item) => item.node));
      segment = [];
    };
    ordered.forEach((node, source) => {
      const cell = rowValue(node, column.index);
      if (cell.sortable) segment.push({ node, value: cell.value, source });
      else { flush(); result.push(node); }
    });
    flush(); ordered = result;
  }
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props}>{ordered}</tbody>;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

type TableRowProps = React.ComponentProps<"tr"> & { sortValues?: TableSortValue[] };
function TableRow({ className, sortValues: _sortValues, ...props }: TableRowProps) {
  return <tr data-slot="table-row" className={cn("group/row hover:bg-primary/[0.035] data-[state=selected]:bg-primary/[0.065] border-b border-border/70 transition-colors", className)} {...props} />;
}

type TableHeadProps = React.ComponentProps<"th"> & { sortKey?: string; sortType?: TableSortType; sortable?: boolean; sortIndex?: number };
function TableHead({ className, children, sortKey, sortType, sortable = true, sortIndex, ...props }: TableHeadProps) {
  const context = React.useContext(TableSortContext);
  const definition = context?.columns.find((column) => column.index === sortIndex);
  const label = textOf(children).trim();
  const actionColumn = /^(?:işlem(?:ler)?|aksiyon(?:lar)?|eylem(?:ler)?|seç(?:im)?|actions?)$/u.test(label.toLocaleLowerCase("tr-TR"));
  const canSort = !!context && !!definition && sortable && !actionColumn && !!label && Number(props.colSpan ?? 1) === 1 && props["aria-sort"] === undefined && !props.onClick;
  const active = definition && context?.sort?.key === definition.key;
  const direction = active ? context?.sort?.direction : undefined;
  const activate = () => { if (definition) context?.change({ ...definition, key: sortKey ?? definition.key, type: sortType ?? definition.type }); };
  return (
    <th data-slot="table-head" className={cn("h-10 whitespace-nowrap px-3 text-left align-middle text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground transition-[height,padding] [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]", className)} aria-sort={canSort ? direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none" : props["aria-sort"]} {...props} onClick={canSort ? (event) => { if (!(event.target as HTMLElement).closest("button, input, select, a, [role=checkbox], [role=combobox]")) activate(); } : props.onClick}>
      {canSort ? <span className="inline-flex max-w-full items-center gap-1.5"><span>{children}</span><button type="button" className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "text-primary")} aria-label={`${label}: ${direction === "asc" ? "azalan" : "artan"} sırala`} title={direction === "asc" ? "Azalan sırala (Z–A / büyükten küçüğe)" : "Artan sırala (A–Z / küçükten büyüğe)"} onClick={(event) => { event.stopPropagation(); activate(); }}><svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={direction === "asc" ? "M8 13V3m-4 4 4-4 4 4" : direction === "desc" ? "M8 3v10m-4-4 4 4 4-4" : "M5 13V3m-3 3 3-3 3 3m3-3v10m-3-3 3 3 3-3"} /></svg></button></span> : children}
    </th>
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-11 px-3 py-2 align-middle whitespace-nowrap transition-[height,padding] [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
