import { ReactNode, useRef } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Button } from "./ui/button";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus } from "lucide-react";

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
          className="min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-xl pb-3 pr-16"
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
    [col.key, col.items.length]
  );

  return (
    <div
      ref={dropRef as any}
      style={{ width }}
      className={`shrink-0 flex flex-col rounded-xl border transition-colors ${
        isOver && canDrop ? "border-primary bg-primary/5" : "border-border/60 bg-muted/30"
      }`}
    >
      <div className="px-3 py-2.5 border-b border-border/60 bg-white rounded-t-xl flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {col.dot && <span className={`size-2 rounded-full shrink-0 ${col.dot}`} />}
          <span className="text-[13px] tracking-tight truncate">{col.title}</span>
          <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 text-[10px] rounded-full bg-muted text-foreground/70 shrink-0">
            {col.items.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {onAdd && (
            <Button variant="ghost" size="icon" className="size-6" onClick={() => onAdd(col.key)}>
              <Plus className="size-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-6">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </div>
      </div>
      {col.footer && (
        <div className="px-3 py-1.5 border-b border-border/60 bg-white/60 text-[11px] text-muted-foreground tabular-nums">
          {col.footer}
        </div>
      )}
      <div className="p-2 space-y-2 min-h-[200px] whitespace-normal">
        {col.items.map((item) => (
          <DraggableCard key={item.id} id={item.id} from={col.key}>
            {(dragging) => renderCard(item, dragging)}
          </DraggableCard>
        ))}
        {col.items.length === 0 && (
          <div className={`text-[11px] text-center py-8 border border-dashed rounded-md transition-colors ${
            isOver && canDrop ? "border-primary text-primary bg-primary/5" : "border-border/60 text-muted-foreground"
          }`}>
            {isOver && canDrop ? "Buraya bırak" : "Kart yok"}
          </div>
        )}
      </div>
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
      className={isDragging ? "rotate-1" : ""}
    >
      {children(isDragging)}
    </div>
  );
}
