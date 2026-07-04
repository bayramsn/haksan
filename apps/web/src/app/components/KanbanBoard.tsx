import { ReactNode, useRef } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Button } from "./ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

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
        <div className="absolute right-1 top-1 z-10 flex items-center gap-1 rounded-md border border-border/60 bg-white/90 p-1 shadow-sm backdrop-blur">
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

  // Trello benzeri kolon: düz gri zemin, kompakt başlık, kartlar kolon içinde
  // dikey kaydırılır; sürükleme hedefi halka ile vurgulanır.
  return (
    <div
      ref={dropRef as any}
      style={{ width }}
      className={`shrink-0 snap-center flex max-h-[calc(100dvh-240px)] flex-col self-start rounded-xl transition-shadow ${
        isOver && canDrop ? "bg-primary/10 ring-2 ring-primary/50" : "bg-slate-200/70"
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {col.dot && <span className={`size-2 rounded-full shrink-0 ${col.dot}`} />}
          <span className="truncate text-[13px] font-semibold tracking-tight text-foreground/80">{col.title}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{col.items.length}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {onAdd && (
            <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:bg-black/5" onClick={() => onAdd(col.key)}>
              <Plus className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-[120px] flex-1 space-y-2 overflow-y-auto whitespace-normal px-2 pb-2 pt-1">
        {col.items.map((item) => (
          <DraggableCard key={item.id} id={item.id} from={col.key}>
            {(dragging) => renderCard(item, dragging)}
          </DraggableCard>
        ))}
        {col.items.length === 0 && (
          <div className={`rounded-lg border border-dashed py-8 text-center text-[11px] transition-colors ${
            isOver && canDrop ? "border-primary bg-primary/5 text-primary" : "border-slate-300 text-muted-foreground"
          }`}>
            {isOver && canDrop ? "Buraya bırak" : "Kart yok"}
          </div>
        )}
      </div>
      {col.footer && (
        <div className="rounded-b-xl border-t border-black/5 px-3 py-1.5 text-[11px] tabular-nums text-muted-foreground">
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
      className={isDragging ? "rotate-2 scale-[1.02]" : ""}
    >
      {children(isDragging)}
    </div>
  );
}
