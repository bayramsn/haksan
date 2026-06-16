import { useEffect, useMemo, useState, type ReactNode } from "react";
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
} from "lucide-react";

type ChatMessage = {
  id: string;
  from: "user" | "assistant";
  text: string;
  actions?: AssistantReply["actions"];
  results?: SearchResult[];
};

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

  return (
    <>
      <Button
        type="button"
        className="fixed bottom-5 right-5 z-40 h-11 gap-2 rounded-full border border-primary/15 bg-primary px-4 text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
        onClick={() => setOpen(true)}
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
          <section className="absolute bottom-4 right-4 top-4 flex w-[min(420px,calc(100vw-1rem))] flex-col overflow-hidden rounded-lg border border-border/70 bg-white shadow-2xl pointer-events-auto">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">Operasyon Asistanı</div>
                  <div className="truncate text-[11px] text-muted-foreground">API'siz komut ve takip</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
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
