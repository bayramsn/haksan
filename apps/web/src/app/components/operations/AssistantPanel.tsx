import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { useStore } from "../../lib/store";
import {
  answerAssistant,
  buildAlerts,
  buildManagementInsights,
  buildWorkItems,
  type AssistantReply,
  type OperationAction,
  type SearchResult,
} from "../../lib/operations";
import {
  Bot,
  ChevronDown,
  MessageSquareText,
  Search,
  Send,
  Sparkles,
  X,
  AlertTriangle,
  Clock,
  GripVertical,
} from "lucide-react";

type ChatMessage = {
  id: string;
  from: "user" | "assistant";
  text: string;
  actions?: AssistantReply["actions"];
  results?: SearchResult[];
};

type FloatingPosition = { x: number; y: number };
type DragTarget = "launcher" | "panel";

const ASSISTANT_LAUNCHER_POSITION_KEY = "haksan.assistant.launcherPosition";
const ASSISTANT_PANEL_POSITION_KEY = "haksan.assistant.panelPosition";
const VIEWPORT_GAP = 16;
const LAUNCHER_FALLBACK = { width: 132, height: 44 };
const PANEL_FALLBACK = { width: 420, height: 720 };

function viewportSize() {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function defaultLauncherPosition(): FloatingPosition {
  const viewport = viewportSize();
  return {
    x: Math.max(VIEWPORT_GAP, viewport.width - LAUNCHER_FALLBACK.width - 20),
    y: Math.max(VIEWPORT_GAP, viewport.height - LAUNCHER_FALLBACK.height - 20),
  };
}

function defaultPanelPosition(): FloatingPosition {
  const viewport = viewportSize();
  const width = Math.min(PANEL_FALLBACK.width, viewport.width - VIEWPORT_GAP * 2);
  const height = Math.min(PANEL_FALLBACK.height, viewport.height - VIEWPORT_GAP * 2);
  return {
    x: Math.max(VIEWPORT_GAP, viewport.width - width - VIEWPORT_GAP),
    y: Math.max(VIEWPORT_GAP, viewport.height - height - VIEWPORT_GAP),
  };
}

function readStoredPosition(key: string, fallback: FloatingPosition): FloatingPosition {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null") as Partial<FloatingPosition> | null;
    if (typeof parsed?.x === "number" && typeof parsed?.y === "number") return parsed as FloatingPosition;
  } catch {
    // Ignore invalid stored coordinates.
  }
  return fallback;
}

function clampPosition(position: FloatingPosition, width: number, height: number): FloatingPosition {
  const viewport = viewportSize();
  return {
    x: Math.min(Math.max(VIEWPORT_GAP, position.x), Math.max(VIEWPORT_GAP, viewport.width - width - VIEWPORT_GAP)),
    y: Math.min(Math.max(VIEWPORT_GAP, position.y), Math.max(VIEWPORT_GAP, viewport.height - height - VIEWPORT_GAP)),
  };
}

export function AssistantPanel({
  onAction,
  canUseAction,
}: {
  onAction: (action: OperationAction) => void;
  canUseAction?: (action: OperationAction) => boolean;
}) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const skipLauncherClickRef = useRef(false);
  const dragRef = useRef<{
    target: DragTarget;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [launcherPosition, setLauncherPosition] = useState<FloatingPosition>(() =>
    readStoredPosition(ASSISTANT_LAUNCHER_POSITION_KEY, defaultLauncherPosition())
  );
  const [panelPosition, setPanelPosition] = useState<FloatingPosition>(() =>
    readStoredPosition(ASSISTANT_PANEL_POSITION_KEY, defaultPanelPosition())
  );
  const workItems = useMemo(() => buildWorkItems(store), [store]);
  const alerts = useMemo(() => buildAlerts(store), [store]);
  const management = useMemo(() => buildManagementInsights(store), [store]);
  const initialMessage = useMemo<ChatMessage>(() => ({
    id: "initial",
    from: "assistant",
    text: `${workItems.length} iş takipte. ${management.risks.length} yönetim riski, ${management.opportunities.length} fırsat ve ${alerts.length} aktif uyarı var.`,
    actions: [
      { label: "Yönetim özeti", action: { kind: "navigate", nav: "reports" } },
      { label: "Bugün ne var?", action: { kind: "navigate", nav: "dashboard", focus: "today" } },
      { label: "Geciken ödemeler", action: { kind: "navigate", nav: "payments", focus: "overdue" } },
      { label: "Servis gecikmeleri", action: { kind: "navigate", nav: "service-requests", focus: "late" } },
    ],
  }), [alerts.length, management.opportunities.length, management.risks.length, workItems.length]);
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);

  useEffect(() => {
    setMessages((current) => (current.length === 1 && current[0]?.id === "initial" ? [initialMessage] : current));
  }, [initialMessage]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ASSISTANT_LAUNCHER_POSITION_KEY, JSON.stringify(launcherPosition));
    } catch {
      // localStorage may be unavailable in private sessions.
    }
  }, [launcherPosition]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ASSISTANT_PANEL_POSITION_KEY, JSON.stringify(panelPosition));
    } catch {
      // localStorage may be unavailable in private sessions.
    }
  }, [panelPosition]);

  useEffect(() => {
    const onResize = () => {
      const launcherWidth = launcherRef.current?.offsetWidth ?? LAUNCHER_FALLBACK.width;
      const launcherHeight = launcherRef.current?.offsetHeight ?? LAUNCHER_FALLBACK.height;
      const panelWidth = panelRef.current?.offsetWidth ?? Math.min(PANEL_FALLBACK.width, viewportSize().width - VIEWPORT_GAP * 2);
      const panelHeight = panelRef.current?.offsetHeight ?? Math.min(PANEL_FALLBACK.height, viewportSize().height - VIEWPORT_GAP * 2);
      setLauncherPosition((current) => clampPosition(current, launcherWidth, launcherHeight));
      setPanelPosition((current) => clampPosition(current, panelWidth, panelHeight));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const visibleActions = (actions?: AssistantReply["actions"]) =>
    (actions ?? []).filter((item) => !canUseAction || canUseAction(item.action));

  const submit = (value = input) => {
    const text = value.trim();
    if (!text) return;
    const reply = answerAssistant(text, store);
    setMessages((current) => [
      ...current,
      { id: `u-${Date.now()}`, from: "user", text },
      {
        id: `a-${Date.now()}`,
        from: "assistant",
        text: reply.text,
        actions: visibleActions(reply.actions),
        results: canUseAction ? reply.results?.filter((r) => canUseAction(r.action)) : reply.results,
      },
    ]);
    setInput("");
  };

  const runAction = (action: OperationAction) => {
    onAction(action);
    setOpen(false);
  };

  const beginDrag = (target: DragTarget, event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      target,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width =
      drag.target === "launcher"
        ? launcherRef.current?.offsetWidth ?? LAUNCHER_FALLBACK.width
        : panelRef.current?.offsetWidth ?? Math.min(PANEL_FALLBACK.width, viewportSize().width - VIEWPORT_GAP * 2);
    const height =
      drag.target === "launcher"
        ? launcherRef.current?.offsetHeight ?? LAUNCHER_FALLBACK.height
        : panelRef.current?.offsetHeight ?? Math.min(PANEL_FALLBACK.height, viewportSize().height - VIEWPORT_GAP * 2);
    const next = clampPosition({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY }, width, height);
    if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) {
      drag.moved = true;
      if (drag.target === "launcher") skipLauncherClickRef.current = true;
    }
    if (drag.target === "launcher") setLauncherPosition(next);
    else setPanelPosition(next);
  };

  const endDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    window.setTimeout(() => {
      skipLauncherClickRef.current = false;
    }, 0);
  };

  return (
    <>
      <Button
        ref={launcherRef}
        type="button"
        className="fixed z-40 h-11 touch-none gap-2 rounded-full border border-primary/15 bg-primary px-4 text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
        style={{ left: launcherPosition.x, top: launcherPosition.y }}
        onPointerDown={(event) => beginDrag("launcher", event)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => {
          if (skipLauncherClickRef.current) return;
          setOpen(true);
        }}
      >
        <Bot className="size-4" />
        Asistan
        {alerts.length > 0 && (
          <span className="ml-0.5 grid min-w-5 place-items-center rounded-full bg-white px-1.5 text-[10px] text-primary">
            {alerts.length}
          </span>
        )}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <button
            type="button"
            aria-label="Asistanı kapat"
            className="absolute inset-0 bg-black/15 pointer-events-auto"
            onClick={() => setOpen(false)}
          />
          <section
            ref={panelRef}
            className="absolute flex h-[min(720px,calc(100dvh-2rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border/70 bg-white shadow-2xl pointer-events-auto"
            style={{ left: panelPosition.x, top: panelPosition.y }}
          >
            <div
              className="flex touch-none cursor-move select-none items-center justify-between gap-3 border-b border-border/60 px-4 py-3"
              onPointerDown={(event) => beginDrag("panel", event)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <div className="flex items-center gap-2 min-w-0">
                <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                <div className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">Operasyon Asistanı</div>
                  <div className="truncate text-[11px] text-muted-foreground">API'siz komut ve takip</div>
                </div>
              </div>
              <div className="flex items-center gap-1" onPointerDown={(event) => event.stopPropagation()}>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setMessages([initialMessage])}>
                  <ChevronDown className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setOpen(false)}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-b border-border/60 bg-muted/20 p-3">
              <Metric icon={<Clock className="size-3.5" />} label="İş" value={workItems.length} />
              <Metric icon={<AlertTriangle className="size-3.5" />} label="Risk" value={management.risks.length} tone="text-red-600" />
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#f7f7f8] p-3">
              {messages.map((message) => (
                <div key={message.id} className={message.from === "user" ? "ml-10" : "mr-4"}>
                  <div
                    className={`rounded-lg border px-3 py-2 text-sm shadow-sm ${
                      message.from === "user"
                        ? "border-primary/20 bg-primary text-primary-foreground"
                        : "border-border/60 bg-white"
                    }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">{message.text}</div>
                    {message.actions && message.actions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {message.actions.map((item) => (
                          <Button
                            key={item.label}
                            type="button"
                            size="sm"
                            variant={message.from === "user" ? "secondary" : "outline"}
                            className="h-7 px-2 text-xs"
                            onClick={() => runAction(item.action)}
                          >
                            {item.label}
                          </Button>
                        ))}
                      </div>
                    )}
                    {message.results && message.results.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {message.results.map((result) => (
                          <button
                            key={result.id}
                            type="button"
                            onClick={() => runAction(result.action)}
                            className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/25 px-2 py-1.5 text-left hover:bg-muted"
                          >
                            <Search className="size-3.5 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium">{result.title}</span>
                              <span className="block truncate text-[11px] text-muted-foreground">{result.subtitle}</span>
                            </span>
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{result.type}</Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border/60 bg-white p-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {["Yönetim özeti", "Riskler", "Fırsatlar", "Bugün ne var?", "MV-1050 ara", "Geciken ödemeler", "Servis gecikmeleri", "Stok riski", "Teklif dönüşümü", "Harita"].map((item) => (
                  <Button key={item} type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => submit(item)}>
                    {item}
                  </Button>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <div className="relative min-w-0 flex-1">
                  <MessageSquareText className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Komut veya arama..."
                    className="h-10 pl-9"
                  />
                </div>
                <Button type="submit" size="icon" className="size-10">
                  <Send className="size-4" />
                </Button>
              </form>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Metric({ icon, label, value, tone = "text-primary" }: { icon: ReactNode; label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-white px-2.5 py-2 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className={tone}>{icon}</span>
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
