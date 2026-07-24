import { ReactNode, useRef } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Button } from "./ui/button";
import { Activity, ChevronLeft, ChevronRight, MoveHorizontal, Plus } from "lucide-react";

const ITEM_TYPE = "kanban-card";

export type KanbanColumn<T> = {
  key: string;
  title: string;
  dot?: string;
  items: T[];
  footer?: ReactNode;
};

type Props<T extends { id: string }> = {
  columns: KanbanColumn<T>[];
  onMove: (cardId: string, fromColKey: string, toColKey: string) => void | Promise<void>;
  renderCard: (item: T, dragging: boolean) => ReactNode;
  onAddInColumn?: (colKey: string) => void;
  columnWidth?: number;
  fit?: boolean;
};

export function KanbanBoard<T extends { id: string }>({
  columns, onMove, renderCard, onAddInColumn, columnWidth = 280,
}: Props<T>) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollBy = (amount: number) => scrollerRef.current?.scrollBy({ left: amount, behavior: "smooth" });

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="relative min-w-0">
        <div className="absolute right-1 top-1 z-10 flex items-center gap-1 rounded-lg border border-border/70 bg-card/95 p-1 shadow-sm backdrop-blur">
          <span className="hidden items-center gap-1 px-1.5 font-data text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground xl:inline-flex"><MoveHorizontal className="size-3" /> Akış</span>
          <Button variant="ghost" size="icon" className="size-7" title="Sola kaydır" onClick={() => scrollBy(-420)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" title="Sağa kaydır" onClick={() => scrollBy(420)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div
          ref={scrollerRef}
          className="min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-xl pb-3 pr-16 snap-x snap-mandatory lg:snap-none"
          onDragOver={(e) => {
            // Auto-scroll when dragging near edges
            const el = scrollerRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const threshold = 120;
            if (e.clientX > rect.right - threshold) {
              el.scrollBy({ left: 15, behavior: "auto" });
            } else if (e.clientX < rect.left + threshold) {
              el.scrollBy({ left: -15, behavior: "auto" });
            }
          }}
        >
          <div className="flex w-max min-w-full gap-3 pb-2">
          {columns.map((col) => (
            <Column
              key={col.key}
              col={col}
              width={columnWidth}
              onMove={onMove}
              renderCard={renderCard}
              onAdd={onAddInColumn}
            />
          ))}
          </div>
        </div>
      </div>
    </DndProvider>
  );
}

function Column<T extends { id: string }>({
  col, width, onMove, renderCard, onAdd,
}: {
  col: KanbanColumn<T>;
  width: number;
  onMove: (id: string, from: string, to: string) => void | Promise<void>;
  renderCard: (item: T, dragging: boolean) => ReactNode;
  onAdd?: (k: string) => void;
}) {
  const [{ isOver, canDrop }, dropRef] = useDrop<{ id: string; from: string }, void, { isOver: boolean; canDrop: boolean }>(
    () => ({
      accept: ITEM_TYPE,
      drop: (it) => {
        if (it.from !== col.key) void onMove(it.id, it.from, col.key);
      },
      canDrop: (it) => it.from !== col.key,
      collect: (m) => ({ isOver: m.isOver(), canDrop: m.canDrop() }),
    }),
    [col.key, col.items.length, onMove]
  );

  // Trello benzeri kolon: gri panel, başlıkta renkli nokta + sayaç rozeti,
  // kartlar kolon içinde dikey kaydırılır, altta "Kart ekle" butonu;
  // sürükleme hedefi halka ve bırakma alanı ile vurgulanır.
  return (
    <div
      ref={dropRef as any}
      data-kanban-column
      style={{ width: col.items.length === 0 ? Math.min(width, 220) : width }}
      className={`shrink-0 snap-center flex max-h-[calc(100dvh-240px)] flex-col self-start overflow-hidden rounded-xl border shadow-xs transition-all ${
        isOver && canDrop ? "border-primary/30 bg-primary/5 ring-2 ring-primary/35 ring-inset" : "border-border/60 bg-[#eef1f5]"
      }`}
    >
      <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 border-b border-border/50 bg-[#f5f7fa]/95 px-3 py-2.5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          {col.dot && <span className={`size-2.5 rounded-full shrink-0 ${col.dot}`} />}
          <span className="truncate font-display text-[15px] font-semibold leading-none tracking-tight text-foreground/85">{col.title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {col.items.length >= 50 && <span className="hidden items-center gap-1 rounded-full bg-warning-soft px-1.5 py-0.5 font-data text-[8px] font-semibold uppercase tracking-wide text-warning sm:inline-flex"><Activity className="size-2.5" /> Yoğun</span>}
          <span className="shrink-0 rounded-full border border-border/60 bg-white px-2 py-0.5 font-data text-[10px] font-semibold tabular-nums text-muted-foreground shadow-xs">
            {col.items.length}
          </span>
        </div>
      </div>
      <div className="min-h-[120px] flex-1 space-y-2 overflow-y-auto whitespace-normal px-2 pb-1 pt-0.5">
        {col.items.map((item) => (
          <DraggableCard key={item.id} id={item.id} from={col.key}>
            {(dragging) => renderCard(item, dragging)}
          </DraggableCard>
        ))}
        {col.items.length === 0 && (
          <div className={`rounded-lg border-2 border-dashed py-8 text-center text-[11px] transition-colors ${
            isOver && canDrop ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
          }`}>
            {isOver && canDrop ? "Buraya bırak" : "Kart yok"}
          </div>
        )}
        {col.items.length > 0 && isOver && canDrop && (
          <div className="rounded-lg border-2 border-dashed border-primary bg-primary/5 py-4 text-center text-[11px] text-primary">
            Buraya bırak
          </div>
        )}
      </div>
      {onAdd && (
        <div className="px-2 pb-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start gap-1.5 rounded-lg px-2 text-[12px] text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            onClick={() => onAdd(col.key)}
          >
            <Plus className="size-3.5" /> Kart ekle
          </Button>
        </div>
      )}
      {col.footer && (
        <div className="rounded-b-xl border-t border-border/60 px-3 py-1.5 text-[11px] tabular-nums text-muted-foreground">
          {col.footer}
        </div>
      )}
    </div>
  );
}

function DraggableCard({
  id, from, children,
}: { id: string; from: string; children: (dragging: boolean) => ReactNode }) {
  const [{ isDragging }, dragRef] = useDrag(
    () => ({
      type: ITEM_TYPE,
      item: { id, from },
      collect: (m) => ({ isDragging: m.isDragging() }),
    }),
    [id, from]
  );
  return (
    <div
      ref={dragRef as any}
      style={{ opacity: isDragging ? 0.4 : 1, cursor: "grab" }}
      className={isDragging ? "rotate-1 scale-[1.02] shadow-lg" : ""}
    >
      {children(isDragging)}
    </div>
  );
}
