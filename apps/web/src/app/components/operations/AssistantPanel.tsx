import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { AssistantOperationAction, AssistantSource, AssistantSuggestedAction, AssistantSuggestion } from "@haksan/shared";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { useStore } from "../../lib/store";
import { assistantService } from "../../../lib/services";
import {
  answerAssistant,
  buildAlerts,
  buildManagementInsights,
  buildWorkItems,
  type AssistantReply,
  type OperationAction,
  type OperationFocus,
  type OperationNav,
  type OperationSeverity,
  type SearchResult,
} from "../../lib/operations";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock,
  GripVertical,
  Loader2,
  MessageSquareText,
  Phone,
  Route,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";

type PanelTab = "today" | "risks" | "calls" | "chat" | "actions";

type PanelAction = {
  label: string;
  operationAction?: OperationAction;
  suggestionId?: string;
  assistantAction?: AssistantSuggestedAction;
};

type ChatMessage = {
  id: string;
  from: "user" | "assistant";
  text: string;
  actions?: PanelAction[];
  results?: SearchResult[];
};

type FloatingPosition = { x: number; y: number };
type DragTarget = "launcher" | "panel";

const ASSISTANT_LAUNCHER_POSITION_KEY = "haksan.assistant.launcherPosition";
const ASSISTANT_PANEL_POSITION_KEY = "haksan.assistant.panelPosition";
const VIEWPORT_GAP = 16;
const LAUNCHER_FALLBACK = { width: 132, height: 44 };
const PANEL_FALLBACK = { width: 460, height: 740 };

const TABS: Array<{ id: PanelTab; label: string }> = [
  { id: "today", label: "Bugün" },
  { id: "risks", label: "Riskler" },
  { id: "calls", label: "Çağrılar" },
  { id: "chat", label: "AI Sohbet" },
  { id: "actions", label: "Aksiyonlar" },
];

const NAVS = new Set<OperationNav>([
  "dashboard",
  "call-assistant",
  "customers",
  "contacts",
  "sales-cases",
  "kanban",
  "sales-map",
  "offers",
  "proformas",
  "contracts",
  "documents",
  "payments",
  "sales-price-list",
  "products",
  "stock",
  "purchase-orders",
  "shipments",
  "installations",
  "deliveries",
  "machines",
  "service-requests",
  "service-kanban",
  "service-price-list",
  "reports",
  "users",
  "roles",
  "departments",
  "settings",
]);

const FOCUSES = new Set<OperationFocus>([
  "open",
  "overdue",
  "upcoming",
  "paid",
  "pending",
  "reserved",
  "available",
  "low",
  "sla",
  "late",
  "scheduled",
  "shipments",
  "delivered",
  "expired",
  "won",
  "lost",
  "today",
]);

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

function toOperationAction(action?: AssistantOperationAction): OperationAction | undefined {
  if (!action) return undefined;
  if (action.kind === "customer" && typeof action.customerId === "string") return { kind: "customer", customerId: action.customerId };
  if (action.kind === "salesCase" && typeof action.salesCaseId === "string") return { kind: "salesCase", salesCaseId: action.salesCaseId };
  if (action.kind === "navigate" && typeof action.nav === "string" && NAVS.has(action.nav as OperationNav)) {
    return {
      kind: "navigate",
      nav: action.nav as OperationNav,
      focus: typeof action.focus === "string" && FOCUSES.has(action.focus as OperationFocus) ? (action.focus as OperationFocus) : undefined,
      query: typeof action.query === "string" ? action.query : undefined,
    };
  }
  return undefined;
}

function sourceAction(source: AssistantSource): OperationAction {
  const query = source.label ?? source.id;
  if (source.type === "company") return { kind: "navigate", nav: "customers", query };
  if (source.type === "quote") return { kind: "navigate", nav: "offers", query };
  if (source.type === "inventory_item") return { kind: "navigate", nav: "stock", query };
  if (source.type === "receivable") return { kind: "navigate", nav: "payments", focus: "overdue", query };
  if (source.type === "service_ticket") return { kind: "navigate", nav: "service-requests", query };
  if (source.type === "shipment") return { kind: "navigate", nav: "shipments", query };
  if (source.type === "opportunity") return { kind: "salesCase", salesCaseId: source.id };
  return { kind: "navigate", nav: "dashboard", query };
}

function sourceToResult(source: AssistantSource): SearchResult {
  return {
    id: `${source.type}:${source.id}`,
    type: source.type,
    title: source.label || source.id,
    subtitle: "CRM kaynağı",
    badge: "AI",
    keywords: `${source.type} ${source.label ?? ""}`,
    action: sourceAction(source),
  };
}

function severityTone(severity: OperationSeverity | AssistantSuggestion["severity"]) {
  if (severity === "critical") return "border-red-200 bg-red-50 text-red-700";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (severity === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

function payloadSuggestionId(action: AssistantSuggestedAction): string | undefined {
  const value = action.payload?.assistantSuggestionId;
  return typeof value === "string" ? value : undefined;
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
  const [activeTab, setActiveTab] = useState<PanelTab>("today");
  const [input, setInput] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);
  const [suggestions, setSuggestions] = useState<AssistantSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
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

  const visibleLocalActions = useCallback(
    (actions?: AssistantReply["actions"]): PanelAction[] =>
      (actions ?? [])
        .filter((item) => !canUseAction || canUseAction(item.action))
        .map((item) => ({ label: item.label, operationAction: item.action })),
    [canUseAction]
  );

  const initialMessage = useMemo<ChatMessage>(
    () => ({
      id: "initial",
      from: "assistant",
      text: `${workItems.length} iş takipte. ${management.risks.length} yönetim riski, ${management.opportunities.length} fırsat ve ${alerts.length} aktif uyarı var.`,
      actions: visibleLocalActions([
        { label: "Yönetim özeti", action: { kind: "navigate", nav: "reports" } },
        { label: "Bugün ne var?", action: { kind: "navigate", nav: "dashboard", focus: "today" } },
        { label: "Geciken ödemeler", action: { kind: "navigate", nav: "payments", focus: "overdue" } },
        { label: "Servis gecikmeleri", action: { kind: "navigate", nav: "service-requests", focus: "late" } },
        { label: "Çağrı Asistanı", action: { kind: "navigate", nav: "call-assistant" } },
      ]),
    }),
    [alerts.length, management.opportunities.length, management.risks.length, visibleLocalActions, workItems.length]
  );
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);

  const refreshSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    setSuggestionError(null);
    try {
      const rows = await assistantService.suggestions();
      setSuggestions(rows);
    } catch (err) {
      setSuggestionError(err instanceof Error ? err.message : "Asistan önerileri alınamadı");
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshSuggestions();
    const id = window.setInterval(() => void refreshSuggestions(), 30_000);
    return () => window.clearInterval(id);
  }, [open, refreshSuggestions]);

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

  const riskSuggestions = useMemo(
    () => suggestions.filter((item) => item.severity === "critical" || item.severity === "warning"),
    [suggestions]
  );
  const callSuggestions = useMemo(() => suggestions.filter((item) => item.category === "call"), [suggestions]);
  const todaySuggestions = useMemo(() => suggestions.slice(0, 10), [suggestions]);
  const tabSuggestions = activeTab === "risks" ? riskSuggestions : activeTab === "calls" ? callSuggestions : activeTab === "actions" ? suggestions : todaySuggestions;
  const badgeCount = Math.max(alerts.length, riskSuggestions.length + callSuggestions.length);

  const canRunOperation = (action?: OperationAction) => !!action && (!canUseAction || canUseAction(action));

  const runAction = (action: OperationAction) => {
    onAction(action);
    setOpen(false);
  };

  const executeAssistantAction = async (suggestionId: string, action: AssistantSuggestedAction) => {
    const operationAction = toOperationAction(action.operationAction);
    if (operationAction && !action.requiresConfirmation) {
      runAction(operationAction);
      return;
    }
    const confirmed = !action.requiresConfirmation || window.confirm(`${action.label} işlemini onaylıyor musunuz?`);
    if (!confirmed) return;
    const response = await assistantService.executeAction(suggestionId, {
      action: action.kind,
      payload: action.payload,
      confirm: true,
    });
    if (response.previewRequired) {
      const secondConfirm = window.confirm(response.message);
      if (!secondConfirm) return;
      await assistantService.executeAction(suggestionId, {
        action: action.kind,
        payload: action.payload,
        confirm: true,
      });
    }
    await refreshSuggestions();
    if (response.operationAction) {
      const next = toOperationAction(response.operationAction);
      if (next && canRunOperation(next)) runAction(next);
    }
  };

  const runPanelAction = (item: PanelAction) => {
    if (item.suggestionId && item.assistantAction) {
      void executeAssistantAction(item.suggestionId, item.assistantAction);
      return;
    }
    if (item.operationAction) runAction(item.operationAction);
  };

  const submit = async (value = input) => {
    const text = value.trim();
    if (!text || loadingChat) return;
    setActiveTab("chat");
    setInput("");
    setLoadingChat(true);
    const userMessage: ChatMessage = { id: `u-${Date.now()}`, from: "user", text };
    setMessages((current) => [...current, userMessage]);
    try {
      const response = await assistantService.chat({ message: text, context: { page: activeTab } });
      const backendActions: PanelAction[] = response.actions
        .map((action): PanelAction | null => {
          const suggestionId = payloadSuggestionId(action);
          const operationAction = toOperationAction(action.operationAction);
          if (!suggestionId && !operationAction) return null;
          return {
            label: action.label,
            operationAction,
            suggestionId,
            assistantAction: suggestionId ? action : undefined,
          };
        })
        .filter((item): item is PanelAction => !!item)
        .filter((item) => !item.operationAction || canRunOperation(item.operationAction));
      const results = response.sources.map(sourceToResult).filter((result) => canRunOperation(result.action));
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          from: "assistant",
          text: response.text,
          actions: backendActions,
          results,
        },
      ]);
      await refreshSuggestions();
    } catch {
      const reply = answerAssistant(text, store, { pendingCallCount: callSuggestions.length });
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          from: "assistant",
          text: reply.text,
          actions: visibleLocalActions(reply.actions),
          results: canUseAction ? reply.results?.filter((r) => canUseAction(r.action)) : reply.results,
        },
      ]);
    } finally {
      setLoadingChat(false);
    }
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
        {badgeCount > 0 && (
          <span className="ml-0.5 grid min-w-5 place-items-center rounded-full bg-white px-1.5 text-[10px] text-primary">
            {badgeCount}
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
            className="absolute flex h-[min(740px,calc(100dvh-2rem))] w-[min(460px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border/70 bg-white shadow-2xl pointer-events-auto"
            style={{ left: panelPosition.x, top: panelPosition.y }}
          >
            <div
              className="flex touch-none cursor-move select-none items-center justify-between gap-3 border-b border-border/60 px-4 py-3"
              onPointerDown={(event) => beginDrag("panel", event)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <div className="flex min-w-0 items-center gap-2">
                <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                <div className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">CRM Asistanı</div>
                  <div className="truncate text-[11px] text-muted-foreground">Sohbet, çağrı ve aksiyon önerileri</div>
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

            <div className="grid grid-cols-3 gap-2 border-b border-border/60 bg-muted/20 p-3">
              <Metric icon={<Clock className="size-3.5" />} label="Bugün" value={todaySuggestions.length || workItems.length} />
              <Metric icon={<AlertTriangle className="size-3.5" />} label="Risk" value={riskSuggestions.length || management.risks.length} tone="text-red-600" />
              <Metric icon={<Phone className="size-3.5" />} label="Çağrı" value={callSuggestions.length} tone="text-sky-600" />
            </div>

            <div className="flex gap-1 overflow-x-auto border-b border-border/60 px-3 py-2">
              {TABS.map((tab) => (
                <Button
                  key={tab.id}
                  type="button"
                  size="sm"
                  variant={activeTab === tab.id ? "default" : "ghost"}
                  className="h-8 shrink-0 px-2.5 text-xs"
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f7f8] p-3">
              {activeTab === "chat" ? (
                <ChatView messages={messages} loading={loadingChat} runPanelAction={runPanelAction} runAction={runAction} />
              ) : (
                <SuggestionView
                  tab={activeTab}
                  suggestions={tabSuggestions}
                  loading={loadingSuggestions}
                  error={suggestionError}
                  refreshSuggestions={refreshSuggestions}
                  executeAssistantAction={executeAssistantAction}
                  canRunOperation={canRunOperation}
                  runAction={runAction}
                />
              )}
            </div>

            <div className="border-t border-border/60 bg-white p-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {["Bugün kime dönmeliyim?", "Riskler", "Arayanlar", "VM-2 stokta var mı?", "Geciken ödemeler", "Açık servisler"].map((item) => (
                  <Button key={item} type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void submit(item)}>
                    {item}
                  </Button>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <div className="relative min-w-0 flex-1">
                  <MessageSquareText className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="CRM'e sor..."
                    className="h-10 pl-9"
                    disabled={loadingChat}
                  />
                </div>
                <Button type="submit" size="icon" className="size-10" disabled={loadingChat}>
                  {loadingChat ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </form>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function ChatView({
  messages,
  loading,
  runPanelAction,
  runAction,
}: {
  messages: ChatMessage[];
  loading: boolean;
  runPanelAction: (item: PanelAction) => void;
  runAction: (action: OperationAction) => void;
}) {
  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div key={message.id} className={message.from === "user" ? "ml-10" : "mr-4"}>
          <div
            className={`rounded-lg border px-3 py-2 text-sm shadow-sm ${
              message.from === "user" ? "border-primary/20 bg-primary text-primary-foreground" : "border-border/60 bg-white"
            }`}
          >
            <div className="whitespace-pre-wrap leading-relaxed">{message.text}</div>
            {message.actions && message.actions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {message.actions.map((item) => (
                  <Button
                    key={`${message.id}-${item.label}`}
                    type="button"
                    size="sm"
                    variant={message.from === "user" ? "secondary" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => runPanelAction(item)}
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
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {result.type}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
      {loading && (
        <div className="mr-4 rounded-lg border border-border/60 bg-white px-3 py-2 text-sm shadow-sm">
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Yanıt hazırlanıyor
          </span>
        </div>
      )}
    </div>
  );
}

function SuggestionView({
  tab,
  suggestions,
  loading,
  error,
  refreshSuggestions,
  executeAssistantAction,
  canRunOperation,
  runAction,
}: {
  tab: PanelTab;
  suggestions: AssistantSuggestion[];
  loading: boolean;
  error: string | null;
  refreshSuggestions: () => Promise<void>;
  executeAssistantAction: (suggestionId: string, action: AssistantSuggestedAction) => Promise<void>;
  canRunOperation: (action?: OperationAction) => boolean;
  runAction: (action: OperationAction) => void;
}) {
  if (loading && suggestions.length === 0) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Öneriler yükleniyor
        </span>
      </div>
    );
  }
  if (error && suggestions.length === 0) {
    return (
      <div className="space-y-3 rounded-lg border border-border/60 bg-white p-4 text-sm">
        <div className="font-medium">Öneriler alınamadı</div>
        <div className="text-muted-foreground">{error}</div>
        <Button size="sm" variant="outline" onClick={() => void refreshSuggestions()}>
          Tekrar Dene
        </Button>
      </div>
    );
  }
  if (suggestions.length === 0) {
    return (
      <div className="grid h-full place-items-center rounded-lg border border-dashed border-border/70 bg-white p-6 text-center text-sm text-muted-foreground">
        {tab === "calls" ? "Bekleyen çağrı önerisi yok." : tab === "risks" ? "Görünür kritik risk yok." : "Bekleyen asistan aksiyonu yok."}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {suggestions.map((suggestion) => (
        <SuggestionCard
          key={suggestion.id}
          suggestion={suggestion}
          executeAssistantAction={executeAssistantAction}
          canRunOperation={canRunOperation}
          runAction={runAction}
        />
      ))}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  executeAssistantAction,
  canRunOperation,
  runAction,
}: {
  suggestion: AssistantSuggestion;
  executeAssistantAction: (suggestionId: string, action: AssistantSuggestedAction) => Promise<void>;
  canRunOperation: (action?: OperationAction) => boolean;
  runAction: (action: OperationAction) => void;
}) {
  const visibleActions = suggestion.actions.filter((action) => {
    const operation = toOperationAction(action.operationAction);
    return !operation || canRunOperation(operation);
  });
  return (
    <div className="rounded-lg border border-border/60 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="outline" className={`h-5 shrink-0 px-1.5 text-[10px] ${severityTone(suggestion.severity)}`}>
              {suggestion.severity === "critical" ? "Kritik" : suggestion.severity === "warning" ? "Risk" : suggestion.category}
            </Badge>
            <div className="truncate text-sm font-medium">{suggestion.title}</div>
          </div>
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{suggestion.description}</div>
          {suggestion.meta && <div className="mt-1 truncate text-[11px] text-muted-foreground">{suggestion.meta}</div>}
        </div>
        {suggestion.category === "call" ? <Phone className="size-4 shrink-0 text-sky-600" /> : <Route className="size-4 shrink-0 text-muted-foreground" />}
      </div>
      {visibleActions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {visibleActions.map((action) => {
            const operation = toOperationAction(action.operationAction);
            const icon = action.kind === "dismiss" ? <X className="size-3" /> : action.requiresConfirmation ? <CheckCircle2 className="size-3" /> : <Route className="size-3" />;
            return (
              <Button
                key={action.id}
                type="button"
                size="sm"
                variant={action.kind === "dismiss" ? "ghost" : "outline"}
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => {
                  if (operation && !action.requiresConfirmation) runAction(operation);
                  else void executeAssistantAction(suggestion.id, action);
                }}
              >
                {icon}
                {action.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
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
