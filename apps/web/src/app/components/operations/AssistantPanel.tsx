import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { AssistantApprovalCard, AssistantBriefingResponse, AssistantInboxItem, AssistantMode, AssistantOperationAction, AssistantSource, AssistantSuggestedAction, AssistantSuggestion } from "@haksan/shared";
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
  CircleDollarSign,
  Factory,
  GripVertical,
  Inbox,
  Loader2,
  MessageSquareText,
  Phone,
  Route,
  Search,
  Send,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";

type PanelTab = "today" | "inbox" | "risks" | "calls" | "chat" | "actions";

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
  approvals?: AssistantApprovalCard[];
};

type FloatingPosition = { x: number; y: number };
type DragTarget = "launcher" | "panel";

const ASSISTANT_LAUNCHER_POSITION_KEY = "haksan.assistant.launcherPosition";
const ASSISTANT_PANEL_POSITION_KEY = "haksan.assistant.panelPosition";
const VIEWPORT_GAP = 16;
const LAUNCHER_FALLBACK = { width: 132, height: 44 };
const PANEL_FALLBACK = { width: 460, height: 740 };

const TABS: Array<{ id: PanelTab; label: string }> = [
  { id: "today", label: "Sekreter" },
  { id: "inbox", label: "Gelen" },
  { id: "risks", label: "Riskler" },
  { id: "calls", label: "Çağrılar" },
  { id: "chat", label: "AI Sohbet" },
  { id: "actions", label: "Aksiyonlar" },
];

const NAVS = new Set<OperationNav>([
  "dashboard",
  "calendar",
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
  if (source.type === "contact") return { kind: "navigate", nav: "contacts", query };
  if (source.type === "quote") return { kind: "navigate", nav: "offers", query };
  if (source.type === "inventory_item") return { kind: "navigate", nav: "stock", query };
  if (source.type === "product_model") return { kind: "navigate", nav: "products", query };
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
  pageContext,
  activeDivisionId,
}: {
  onAction: (action: OperationAction) => void;
  canUseAction?: (action: OperationAction) => boolean;
  pageContext?: string;
  activeDivisionId?: string | null;
}) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("today");
  const [input, setInput] = useState("");
  const [assistantMode, setAssistantMode] = useState<AssistantMode>("prepare");
  const [loadingChat, setLoadingChat] = useState(false);
  const [suggestions, setSuggestions] = useState<AssistantSuggestion[]>([]);
  const [briefing, setBriefing] = useState<AssistantBriefingResponse | null>(null);
  const [approvals, setApprovals] = useState<AssistantApprovalCard[]>([]);
  const [inboxItems, setInboxItems] = useState<AssistantInboxItem[]>([]);
  const [inboxBusyId, setInboxBusyId] = useState<string | null>(null);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [suggestionApproval, setSuggestionApproval] = useState<{ suggestionId: string; action: AssistantSuggestedAction } | null>(null);
  const [suggestionApprovalBusy, setSuggestionApprovalBusy] = useState(false);
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
      const [dailyBriefing, pendingApprovals, pendingInbox] = await Promise.all([
        assistantService.briefing(),
        assistantService.approvals(),
        assistantService.inbox(),
      ]);
      const byId = new Map<string, AssistantSuggestion>();
      for (const lane of dailyBriefing.lanes) {
        for (const item of lane.items) byId.set(item.id, item);
      }
      setBriefing(dailyBriefing);
      setSuggestions([...byId.values()]);
      setApprovals(pendingApprovals);
      setInboxItems(pendingInbox);
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
  const inboxAttentionCount = inboxItems.filter((item) => item.status === "new" || item.priority === "critical").length;
  const badgeCount = Math.max(alerts.length, riskSuggestions.length + callSuggestions.length + approvals.length + inboxAttentionCount + (suggestionApproval ? 1 : 0));

  const canRunOperation = (action?: OperationAction) => !!action && (!canUseAction || canUseAction(action));

  const runAction = (action: OperationAction) => {
    onAction(action);
    setOpen(false);
  };

  const executeAssistantAction = async (suggestionId: string, action: AssistantSuggestedAction, confirmed = false) => {
    const operationAction = toOperationAction(action.operationAction);
    if (operationAction && !action.requiresConfirmation) {
      runAction(operationAction);
      return;
    }
    if (action.requiresConfirmation && !confirmed) {
      setSuggestionApproval({ suggestionId, action });
      setActiveTab("actions");
      return;
    }
    setSuggestionApprovalBusy(true);
    try {
      const response = await assistantService.executeAction(suggestionId, {
        action: action.kind,
        payload: action.payload,
        confirm: true,
      });
      if (response.previewRequired) {
        setSuggestionApproval({ suggestionId, action });
        return;
      }
      setSuggestionApproval(null);
      await refreshSuggestions();
      if (response.operationAction) {
        const next = toOperationAction(response.operationAction);
        if (next && canRunOperation(next)) runAction(next);
      }
    } finally {
      setSuggestionApprovalBusy(false);
    }
  };

  const decideApproval = async (card: AssistantApprovalCard, confirm: boolean) => {
    if (approvalBusyId) return;
    setApprovalBusyId(card.id);
    try {
      const response = await assistantService.decideApproval(card.id, confirm);
      setApprovals((current) => current.filter((item) => item.id !== card.id));
      setMessages((current) => [
        ...current.map((message) => ({
          ...message,
          approvals: message.approvals?.map((item) => (item.id === card.id ? { ...item, status: response.status } : item)),
        })),
        { id: `approval-${Date.now()}`, from: "assistant", text: response.message },
      ]);
      await refreshSuggestions();
      const next = toOperationAction(response.operationAction);
      if (response.ok && next && canRunOperation(next)) runAction(next);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `approval-error-${Date.now()}`,
          from: "assistant",
          text: error instanceof Error ? error.message : "Onay işlemi tamamlanamadı.",
        },
      ]);
      await refreshSuggestions();
    } finally {
      setApprovalBusyId(null);
    }
  };

  const updateInboxItem = async (item: AssistantInboxItem, status: "in_progress" | "resolved") => {
    if (inboxBusyId) return;
    setInboxBusyId(item.id);
    try {
      const updated = await assistantService.updateInbox(item.id, { status });
      setInboxItems((current) => status === "resolved" ? current.filter((row) => row.id !== item.id) : current.map((row) => row.id === item.id ? updated : row));
      await refreshSuggestions();
    } finally {
      setInboxBusyId(null);
    }
  };

  const prepareInboxReply = async (item: AssistantInboxItem) => {
    if (inboxBusyId) return;
    setInboxBusyId(item.id);
    try {
      const approval = await assistantService.prepareInboxReply(item.id);
      setApprovals((current) => [approval, ...current.filter((card) => card.id !== approval.id)]);
      setActiveTab("actions");
    } finally {
      setInboxBusyId(null);
    }
  };

  const capturePhoneNote = async (note: { senderName?: string; senderPhone?: string; subject?: string; body: string }) => {
    if (inboxBusyId) return;
    setInboxBusyId("capture");
    try {
      await assistantService.captureInbox({ channel: "phone_note", provider: "manual", ...note });
      await refreshSuggestions();
    } finally {
      setInboxBusyId(null);
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
      const response = await assistantService.chat({
        message: text,
        mode: assistantMode,
        context: {
          page: pageContext ?? activeTab,
          activeDivisionId: activeDivisionId && activeDivisionId !== "all" ? activeDivisionId : undefined,
        },
      });
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
          approvals: response.approvals,
        },
      ]);
      if (response.approvals.length > 0) {
        setApprovals((current) => {
          const byId = new Map(current.map((item) => [item.id, item]));
          for (const approval of response.approvals) byId.set(approval.id, approval);
          return [...byId.values()];
        });
      }
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

  const compactLauncher = viewportSize().width < 640;

  return (
    <>
      <Button
        ref={launcherRef}
        type="button"
        className="fixed z-40 h-11 touch-none gap-2 rounded-full border border-primary/15 bg-primary px-3 text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 sm:px-4"
        style={compactLauncher ? { right: VIEWPORT_GAP, bottom: VIEWPORT_GAP } : { left: launcherPosition.x, top: launcherPosition.y }}
        onPointerDown={compactLauncher ? undefined : (event) => beginDrag("launcher", event)}
        onPointerMove={compactLauncher ? undefined : moveDrag}
        onPointerUp={compactLauncher ? undefined : endDrag}
        onPointerCancel={compactLauncher ? undefined : endDrag}
        aria-label="Asistanı aç"
        onClick={() => {
          if (skipLauncherClickRef.current) return;
          setOpen(true);
        }}
      >
        <Bot className="size-4" />
        <span className="hidden sm:inline">Asistan</span>
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
              className="flex touch-none cursor-move select-none items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-4 py-3 text-white"
              onPointerDown={(event) => beginDrag("panel", event)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <div className="flex min-w-0 items-center gap-2">
                <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                <div className="grid size-9 place-items-center rounded-md border border-sky-400/30 bg-sky-400/10 text-sky-300">
                  <Factory className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium tracking-wide">SEKRETER MERKEZİ</div>
                  <div className="truncate text-[11px] text-slate-400">Günlük iş emri ve onay hattı</div>
                </div>
              </div>
              <div className="flex items-center gap-1" onPointerDown={(event) => event.stopPropagation()}>
                <Button variant="ghost" size="icon" className="size-8 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => setMessages([initialMessage])}>
                  <ChevronDown className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-8 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => setOpen(false)}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 border-b border-border/60 bg-slate-50 p-3">
              <Metric icon={<Clock className="size-3.5" />} label="İş" value={briefing?.metrics.total ?? todaySuggestions.length ?? workItems.length} />
              <Metric icon={<AlertTriangle className="size-3.5" />} label="Kritik" value={briefing?.metrics.critical ?? riskSuggestions.length} tone="text-red-600" />
              <Metric icon={<Phone className="size-3.5" />} label="Çağrı" value={briefing?.metrics.calls ?? callSuggestions.length} tone="text-sky-600" />
              <Metric icon={<TrendingUp className="size-3.5" />} label="Fırsat" value={briefing?.management.openPipelineCount ?? 0} tone="text-emerald-600" />
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

            <div className="min-h-0 flex-1 overflow-y-auto bg-canvas p-3">
              {activeTab === "chat" ? (
                <ChatView
                  messages={messages}
                  loading={loadingChat}
                  runPanelAction={runPanelAction}
                  runAction={runAction}
                  decideApproval={decideApproval}
                  approvalBusyId={approvalBusyId}
                />
              ) : activeTab === "inbox" ? (
                <InboxView
                  items={inboxItems}
                  loading={loadingSuggestions}
                  error={suggestionError}
                  busyId={inboxBusyId}
                  runAction={runAction}
                  onStart={(item) => void updateInboxItem(item, "in_progress")}
                  onResolve={(item) => void updateInboxItem(item, "resolved")}
                  onPrepareReply={(item) => void prepareInboxReply(item)}
                  onCapturePhoneNote={capturePhoneNote}
                  refresh={refreshSuggestions}
                />
              ) : activeTab === "actions" ? (
                <ApprovalView
                  approvals={approvals}
                  suggestionApproval={suggestionApproval}
                  suggestionBusy={suggestionApprovalBusy}
                  approvalBusyId={approvalBusyId}
                  decideApproval={decideApproval}
                  confirmSuggestion={async () => {
                    if (!suggestionApproval) return;
                    await executeAssistantAction(suggestionApproval.suggestionId, suggestionApproval.action, true);
                  }}
                  cancelSuggestion={() => setSuggestionApproval(null)}
                />
              ) : activeTab === "today" ? (
                <BriefingView
                  briefing={briefing}
                  loading={loadingSuggestions}
                  error={suggestionError}
                  refreshSuggestions={refreshSuggestions}
                  executeAssistantAction={executeAssistantAction}
                  canRunOperation={canRunOperation}
                  runAction={runAction}
                />
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
              <div className="mb-2 grid grid-cols-3 rounded-md border border-slate-200 bg-slate-50 p-1" aria-label="Asistan çalışma modu">
                {([
                  { id: "ask", label: "Sor", title: "Yalnız bilgi getirir; kayıt değiştirmez." },
                  { id: "prepare", label: "Hazırla", title: "Taslak ve onay kartı hazırlar." },
                  { id: "execute", label: "Uygula", title: "Onayınızdan sonra işlemi çalıştırır." },
                ] as Array<{ id: AssistantMode; label: string; title: string }>).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    title={mode.title}
                    aria-pressed={assistantMode === mode.id}
                    className={`rounded px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      assistantMode === mode.id ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-950"
                    }`}
                    onClick={() => setAssistantMode(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(briefing?.quickPrompts ?? ["Bugün kime dönmeliyim?", "Riskler", "Arayanlar", "Geciken ödemeler", "Açık servisler"]).map((item) => (
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
                    placeholder={assistantMode === "ask" ? "CRM'e sor..." : assistantMode === "prepare" ? "Bir iş taslağı hazırla..." : "Onaylı bir işlem başlat..."}
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

function InboxView({
  items,
  loading,
  error,
  busyId,
  runAction,
  onStart,
  onResolve,
  onPrepareReply,
  onCapturePhoneNote,
  refresh,
}: {
  items: AssistantInboxItem[];
  loading: boolean;
  error: string | null;
  busyId: string | null;
  runAction: (action: OperationAction) => void;
  onStart: (item: AssistantInboxItem) => void;
  onResolve: (item: AssistantInboxItem) => void;
  onPrepareReply: (item: AssistantInboxItem) => void;
  onCapturePhoneNote: (note: { senderName?: string; senderPhone?: string; subject?: string; body: string }) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureName, setCaptureName] = useState("");
  const [capturePhone, setCapturePhone] = useState("");
  const [captureSubject, setCaptureSubject] = useState("");
  const [captureBody, setCaptureBody] = useState("");
  const submitCapture = async () => {
    const body = captureBody.trim();
    if (!body || busyId) return;
    await onCapturePhoneNote({
      senderName: captureName.trim() || undefined,
      senderPhone: capturePhone.trim() || undefined,
      subject: captureSubject.trim() || undefined,
      body,
    });
    setCaptureName("");
    setCapturePhone("");
    setCaptureSubject("");
    setCaptureBody("");
    setCaptureOpen(false);
  };
  if (loading && items.length === 0) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground"><span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Gelen ileti kuyruğu hazırlanıyor</span></div>;
  }
  if (error && items.length === 0) {
    return (
      <div className="space-y-3 rounded-lg border border-border/60 bg-white p-4 text-sm">
        <div className="font-medium">Gelen kutusu alınamadı</div>
        <div className="text-muted-foreground">{error}</div>
        <Button size="sm" variant="outline" onClick={() => void refresh()}>Tekrar Dene</Button>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-white">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em]">Tek gelen kutusu</div>
          <div className="text-[11px] text-slate-400">Eşleştirildi · sınıflandırıldı · takipte</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800" onClick={() => setCaptureOpen((value) => !value)}>
            Telefon Notu
          </button>
          <Badge className="bg-sky-400 text-slate-950 hover:bg-sky-400">{items.length}</Badge>
        </div>
      </div>
      {captureOpen && (
        <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/50 p-3">
          <div className="text-xs font-semibold text-sky-900">Hızlı telefon notu</div>
          <div className="grid grid-cols-2 gap-2">
            <Input value={captureName} onChange={(event) => setCaptureName(event.target.value)} placeholder="Arayan kişi" className="h-8 text-xs" maxLength={255} />
            <Input value={capturePhone} onChange={(event) => setCapturePhone(event.target.value)} placeholder="Telefon" className="h-8 text-xs" maxLength={64} />
          </div>
          <Input value={captureSubject} onChange={(event) => setCaptureSubject(event.target.value)} placeholder="Konu" className="h-8 text-xs" maxLength={255} />
          <textarea
            value={captureBody}
            onChange={(event) => setCaptureBody(event.target.value)}
            placeholder="Görüşme notu ve istenen aksiyon..."
            rows={3}
            maxLength={10_000}
            className="w-full resize-none rounded-md border border-input bg-white px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCaptureOpen(false)}>Vazgeç</Button>
            <Button type="button" size="sm" className="h-7 text-xs" disabled={!captureBody.trim() || busyId === "capture"} onClick={() => void submitCapture()}>
              {busyId === "capture" ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}Kaydet ve Sınıflandır
            </Button>
          </div>
        </div>
      )}
      {items.length === 0 && !captureOpen && (
        <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-border/70 bg-white p-6 text-center">
          <div>
            <Inbox className="mx-auto size-6 text-emerald-600" />
            <div className="mt-2 text-sm font-medium">Gelen kutusu temiz</div>
            <div className="mt-1 text-xs text-muted-foreground">Takip veya yanıt bekleyen ileti bulunmuyor.</div>
          </div>
        </div>
      )}
      {items.map((item) => {
        const busy = busyId === item.id;
        const overdue = item.dueAt ? new Date(item.dueAt).getTime() < Date.now() : false;
        const priorityClass = item.priority === "critical"
          ? "border-red-300 bg-red-50 text-red-700"
          : item.priority === "high"
            ? "border-amber-300 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-slate-50 text-slate-600";
        return (
          <article key={item.id} className={`rounded-lg border bg-white p-3 shadow-sm ${item.priority === "critical" ? "border-red-200" : "border-border/60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${priorityClass}`}>{inboxPriorityLabel(item.priority)}</Badge>
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{inboxCategoryLabel(item.category)}</Badge>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{inboxChannelLabel(item.channel)}</span>
                </div>
                <h3 className="mt-1.5 truncate text-sm font-semibold">{item.subject || item.senderName || "Konu belirtilmedi"}</h3>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
              <Inbox className="size-4 shrink-0 text-sky-600" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>{item.senderName || item.senderEmail || item.senderPhone || "Gönderen bilinmiyor"}</span>
              {item.companyName && (
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => runAction({ kind: "navigate", nav: "customers", query: item.companyName ?? undefined })}>
                  {item.companyName}
                </button>
              )}
              <span className={overdue ? "font-medium text-red-600" : ""}>{overdue ? "SLA gecikti" : formatInboxDue(item.dueAt)}</span>
            </div>
            {item.draftReply && item.channel === "email" && (
              <div className="mt-2 rounded-md border border-sky-100 bg-sky-50/60 px-2.5 py-2 text-[11px] leading-relaxed text-slate-700">
                <div className="mb-1 font-semibold text-sky-800">Hazır yanıt taslağı</div>
                <div className="line-clamp-3 whitespace-pre-wrap">{item.draftReply}</div>
              </div>
            )}
            <div className="mt-3 flex flex-wrap justify-end gap-1.5">
              {item.status === "new" && (
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onStart(item)}>İşleme Al</Button>
              )}
              {item.channel === "email" && item.senderEmail && item.draftReply && (
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={busy} onClick={() => onPrepareReply(item)}>
                  <ShieldCheck className="size-3" />Yanıtı Onaya Gönder
                </Button>
              )}
              <Button type="button" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={busy} onClick={() => onResolve(item)}>
                {busy ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}Çözüldü
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function inboxPriorityLabel(priority: AssistantInboxItem["priority"]) {
  return priority === "critical" ? "Kritik" : priority === "high" ? "Yüksek" : priority === "low" ? "Düşük" : "Normal";
}

function inboxCategoryLabel(category: AssistantInboxItem["category"]) {
  return category === "sales" ? "Satış" : category === "service" ? "Servis" : category === "shipment" ? "Sevkiyat" : category === "finance" ? "Finans" : "Genel";
}

function inboxChannelLabel(channel: AssistantInboxItem["channel"]) {
  return channel === "email" ? "E-posta" : channel === "whatsapp" ? "WhatsApp" : channel === "web_form" ? "Web Formu" : channel === "phone_note" ? "Telefon" : "CRM";
}

function formatInboxDue(value: string | null) {
  if (!value) return "Takip tarihi yok";
  return `SLA ${new Date(value).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`;
}

function ChatView({
  messages,
  loading,
  runPanelAction,
  runAction,
  decideApproval,
  approvalBusyId,
}: {
  messages: ChatMessage[];
  loading: boolean;
  runPanelAction: (item: PanelAction) => void;
  runAction: (action: OperationAction) => void;
  decideApproval: (card: AssistantApprovalCard, confirm: boolean) => Promise<void>;
  approvalBusyId: string | null;
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
            {message.approvals && message.approvals.length > 0 && (
              <div className="mt-3 space-y-2">
                {message.approvals.map((approval) => (
                  <ApprovalCard
                    key={approval.id}
                    card={approval}
                    busy={approvalBusyId === approval.id}
                    onConfirm={() => void decideApproval(approval, true)}
                    onCancel={() => void decideApproval(approval, false)}
                  />
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

function ApprovalView({
  approvals,
  suggestionApproval,
  suggestionBusy,
  approvalBusyId,
  decideApproval,
  confirmSuggestion,
  cancelSuggestion,
}: {
  approvals: AssistantApprovalCard[];
  suggestionApproval: { suggestionId: string; action: AssistantSuggestedAction } | null;
  suggestionBusy: boolean;
  approvalBusyId: string | null;
  decideApproval: (card: AssistantApprovalCard, confirm: boolean) => Promise<void>;
  confirmSuggestion: () => Promise<void>;
  cancelSuggestion: () => void;
}) {
  if (!suggestionApproval && approvals.length === 0) {
    return (
      <div className="grid h-full place-items-center rounded-lg border border-dashed border-border/70 bg-white p-6 text-center text-sm text-muted-foreground">
        Bekleyen onay kartı yok.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {suggestionApproval && (
        <SuggestionApprovalCard
          action={suggestionApproval.action}
          busy={suggestionBusy}
          onConfirm={() => void confirmSuggestion()}
          onCancel={cancelSuggestion}
        />
      )}
      {approvals.map((approval) => (
        <ApprovalCard
          key={approval.id}
          card={approval}
          busy={approvalBusyId === approval.id}
          onConfirm={() => void decideApproval(approval, true)}
          onCancel={() => void decideApproval(approval, false)}
        />
      ))}
    </div>
  );
}

function ApprovalCard({
  card,
  busy,
  onConfirm,
  onCancel,
}: {
  card: AssistantApprovalCard;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const pending = card.status === "pending";
  const statusLabel: Record<AssistantApprovalCard["status"], string> = {
    pending: "Onay bekliyor",
    executed: "Tamamlandı",
    cancelled: "İptal edildi",
    failed: "Başarısız",
    expired: "Süresi doldu",
  };
  return (
    <div className={`rounded-lg border bg-white p-3 shadow-sm ${card.impact === "high" ? "border-amber-300" : "border-primary/20"}`}>
      <div className="flex items-start gap-2">
        <div className={`grid size-8 shrink-0 place-items-center rounded-md ${card.impact === "high" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
          {card.impact === "high" ? <AlertTriangle className="size-4" /> : <ShieldCheck className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium">{card.title}</div>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{statusLabel[card.status]}</Badge>
          </div>
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.description}</div>
        </div>
      </div>
      {card.fields.length > 0 && (
        <dl className="mt-3 divide-y divide-border/50 rounded-md border border-border/60 bg-muted/15 px-2.5">
          {card.fields.map((item, index) => (
            <div key={`${card.id}-${item.label}-${index}`} className="grid grid-cols-[92px_1fr] gap-2 py-1.5 text-xs">
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="break-words font-medium text-foreground">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {pending && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" className="h-8" disabled={busy} onClick={onCancel}>
            Vazgeç
          </Button>
          <Button type="button" size="sm" className="h-8 gap-1.5" disabled={busy} onClick={onConfirm}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            Onayla ve Çalıştır
          </Button>
        </div>
      )}
    </div>
  );
}

function SuggestionApprovalCard({
  action,
  busy,
  onConfirm,
  onCancel,
}: {
  action: AssistantSuggestedAction;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const hiddenKeys = new Set(["assistantSuggestionId", "companyId", "contactId", "opportunityId"]);
  const fields = Object.entries(action.payload ?? {})
    .filter(([key, value]) => !hiddenKeys.has(key) && value !== undefined && value !== null && value !== "")
    .slice(0, 8)
    .map(([key, value]) => ({ label: approvalFieldLabel(key), value: String(value) }));
  return (
    <div className="rounded-lg border border-primary/20 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><ShieldCheck className="size-4" /></div>
        <div>
          <div className="text-sm font-medium">{action.label}</div>
          <div className="mt-1 text-xs text-muted-foreground">Bu CRM işlemi yalnız onayınızdan sonra çalıştırılacak.</div>
        </div>
      </div>
      {fields.length > 0 && (
        <dl className="mt-3 divide-y divide-border/50 rounded-md border border-border/60 bg-muted/15 px-2.5">
          {fields.map((field) => (
            <div key={field.label} className="grid grid-cols-[92px_1fr] gap-2 py-1.5 text-xs">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="break-words font-medium">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" className="h-8" disabled={busy} onClick={onCancel}>Vazgeç</Button>
        <Button type="button" size="sm" className="h-8 gap-1.5" disabled={busy} onClick={onConfirm}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
          Onayla ve Çalıştır
        </Button>
      </div>
    </div>
  );
}

function approvalFieldLabel(key: string) {
  const labels: Record<string, string> = {
    subject: "Konu",
    description: "Açıklama",
    notes: "Not",
    companyName: "Firma",
    activityTypeCode: "Aktivite",
  };
  return labels[key] ?? key;
}

function BriefingView({
  briefing,
  loading,
  error,
  refreshSuggestions,
  executeAssistantAction,
  canRunOperation,
  runAction,
}: {
  briefing: AssistantBriefingResponse | null;
  loading: boolean;
  error: string | null;
  refreshSuggestions: () => Promise<void>;
  executeAssistantAction: (suggestionId: string, action: AssistantSuggestedAction) => Promise<void>;
  canRunOperation: (action?: OperationAction) => boolean;
  runAction: (action: OperationAction) => void;
}) {
  if (loading && !briefing) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground"><span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" />İş emri hattı hazırlanıyor</span></div>;
  }
  if (error && !briefing) {
    return (
      <div className="space-y-3 rounded-lg border border-border/60 bg-white p-4 text-sm">
        <div className="font-medium">Günlük özet alınamadı</div>
        <div className="text-muted-foreground">{error}</div>
        <Button size="sm" variant="outline" onClick={() => void refreshSuggestions()}>Tekrar Dene</Button>
      </div>
    );
  }
  if (!briefing) return null;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-white shadow-sm">
        <div className="border-l-4 border-sky-400 px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">{new Date(briefing.generatedAt).toLocaleString("tr-TR")}</div>
          <div className="mt-1 text-base font-semibold">{briefing.headline}</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">{briefing.summary}</p>
        </div>
        <div className="grid grid-cols-3 border-t border-slate-800 bg-slate-900/70 text-center">
          <div className="border-r border-slate-800 px-2 py-2"><div className="text-[10px] text-slate-400">Açık Fırsat</div><div className="text-sm font-semibold tabular-nums">{briefing.management.openPipelineCount}</div></div>
          <div className="border-r border-slate-800 px-2 py-2"><div className="text-[10px] text-slate-400">Pipeline</div><div className="text-sm font-semibold tabular-nums">{new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(briefing.management.openPipelineValue)}</div></div>
          <div className="px-2 py-2"><div className="text-[10px] text-slate-400">Onay</div><div className="text-sm font-semibold tabular-nums">Aktif</div></div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Metric icon={<CircleDollarSign className="size-3.5" />} label="Tahsilat" value={briefing.management.overdueReceivables} tone="text-amber-600" />
        <Metric icon={<ShieldCheck className="size-3.5" />} label="Servis" value={briefing.management.openServiceItems} tone="text-violet-600" />
        <Metric icon={<Route className="size-3.5" />} label="Sevkiyat" value={briefing.management.pendingShipments} tone="text-sky-600" />
      </div>

      <div className="space-y-3">
        {briefing.lanes.map((lane, laneIndex) => (
          <section key={lane.id} className="relative pl-5">
            <div className={`absolute bottom-0 left-[7px] top-0 w-px ${laneIndex === briefing.lanes.length - 1 ? "bg-gradient-to-b from-slate-300 to-transparent" : "bg-slate-300"}`} />
            <div className={`absolute left-0 top-1.5 size-[15px] rounded-full border-4 border-canvas ${lane.tone === "critical" ? "bg-red-500" : lane.tone === "warning" ? "bg-amber-500" : "bg-sky-500"}`} />
            <div className="mb-2 flex items-end justify-between gap-2">
              <div><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">{lane.label}</h3><p className="text-[11px] text-muted-foreground">{lane.description}</p></div>
              <Badge variant="secondary" className="h-5 text-[10px] tabular-nums">{lane.items.length}</Badge>
            </div>
            {lane.items.length ? (
              <div className="space-y-2">
                {lane.items.map((suggestion) => <SuggestionCard key={suggestion.id} suggestion={suggestion} executeAssistantAction={executeAssistantAction} canRunOperation={canRunOperation} runAction={runAction} />)}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border/70 bg-white px-3 py-2 text-xs text-muted-foreground">Bu hatta bekleyen iş yok.</div>
            )}
          </section>
        ))}
      </div>
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
