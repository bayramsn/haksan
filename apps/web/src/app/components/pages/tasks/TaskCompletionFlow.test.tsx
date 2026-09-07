// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tasksService, type TaskDetailDTO } from "../../../../lib/services";
import { TasksPage } from "./TasksPage";
import { TaskRecordSection } from "./TaskRecordSection";

vi.mock("../../../../lib/auth", () => ({ useAuth: () => ({ user: { id: "user-1" }, hasPermission: () => true }) }));
vi.mock("../../../../lib/services", () => ({ tasksService: { list: vi.fn(), counts: vi.fn(), summary: vi.fn(), assignees: vi.fn(), get: vi.fn(), update: vi.fn(), create: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("lucide-react", () => {
  const Icon = () => <svg aria-hidden="true" />;
  return { Filter: Icon, Plus: Icon, Search: Icon, Users: Icon, CheckCircle2: Icon, ExternalLink: Icon, MessageSquareText: Icon, Pencil: Icon, RotateCcw: Icon, Send: Icon, Trash2: Icon, XCircle: Icon };
});
vi.mock("../../ui/dialog", () => ({
  Dialog: ({ open, children }: any) => open ? <>{children}</> : null,
  DialogContent: ({ children }: any) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: any) => <header>{children}</header>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <footer>{children}</footer>,
}));
vi.mock("../../ui/sheet", () => ({
  Sheet: ({ open, children }: any) => open ? <>{children}</> : null,
  SheetContent: ({ children }: any) => <div role="region" aria-label="Görev detayı">{children}</div>,
  SheetHeader: ({ children }: any) => <header>{children}</header>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
  SheetDescription: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("../../ui/checkbox", () => ({ Checkbox: ({ onCheckedChange, ...props }: any) => <input type="checkbox" onChange={onCheckedChange} {...props} /> }));
vi.mock("../../ui/label", () => ({ Label: ({ children, ...props }: any) => <label {...props}>{children}</label> }));
vi.mock("../../ui/separator", () => ({ Separator: () => <hr /> }));
vi.mock("../../shared/RemoteCompanyCombobox", () => ({ RemoteCompanyCombobox: () => <span /> }));
vi.mock("../../shared/RemoteContactCombobox", () => ({ RemoteContactCombobox: () => <span /> }));

let task: TaskDetailDTO;
beforeEach(() => {
  vi.clearAllMocks();
  task = {
    id: "task-1", title: "Teklif için ara", description: "Önceden yazılmış açıklama",
    status: "todo", priority: "normal", assignedToUserId: "user-1", assignee: { id: "user-1", fullName: "Satış Temsilcisi" },
    dueAt: null, remindBeforeMinutes: null, companyId: null, contactId: null, opportunityId: null,
    quoteId: null, serviceTicketId: null, completedAt: null, overdue: false, createdAt: "2026-09-07T08:00:00Z", events: [],
  } as unknown as TaskDetailDTO;
  vi.mocked(tasksService.list).mockImplementation(async () => ({ data: [{ ...task }], meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }));
  vi.mocked(tasksService.get).mockImplementation(async () => ({ ...task }));
  vi.mocked(tasksService.counts).mockResolvedValue({ all: 1, mine: 1, today: 0, overdue: 0, upcoming: 0, completed: 0, history: 0 });
  vi.mocked(tasksService.summary).mockResolvedValue([]);
  vi.mocked(tasksService.assignees).mockResolvedValue([]);
  vi.mocked(tasksService.update).mockImplementation(async (_id, body) => {
    task = { ...task, ...body, status: body.status ?? task.status } as TaskDetailDTO;
    if (body.status === "done") {
      task.completedAt = "2026-09-07T09:00:00Z";
      task.events = [{ id: "event-1", eventType: "completed", summary: `Görev tamamlandı: ${body.completionNote}`, createdAt: task.completedAt, actor: { id: "user-1", fullName: "Satış Temsilcisi" } }];
    }
    return { ...task };
  });
});
afterEach(cleanup);

describe.each(["Görev listesi", "Kayıt görevleri"])("%s completion flow", (surface) => {
  const show = () => render(surface === "Görev listesi" ? <TasksPage /> : <TaskRecordSection relation={{ companyId: "company-1" }} />);

  it("opens the note dialog from the checkbox without prematurely completing", async () => {
    show();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Görevi tamamla" }));
    expect(tasksService.update).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Notu kaydet ve tamamla" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Tamamlama notu (zorunlu)" }), { target: { value: "Müşteri arandı" } });
    fireEvent.click(screen.getByRole("button", { name: "Notu kaydet ve tamamla" }));
    await waitFor(() => expect(tasksService.update).toHaveBeenCalledWith("task-1", { status: "done", completionNote: "Müşteri arandı" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "Görevi tekrar aç" })).toBeChecked();
  });

  it("requires a note when editing status and refreshes the open detail after saving", async () => {
    show();
    fireEvent.click(await screen.findByText("Teklif için ara"));
    fireEvent.click(await screen.findByRole("button", { name: "Düzenle" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByRole("combobox", { name: "Durum" }), { target: { value: "done" } });
    expect(dialog.getByRole("button", { name: "Kaydet" })).toBeDisabled();
    fireEvent.change(dialog.getByRole("textbox", { name: "Tamamlama notu (zorunlu)" }), { target: { value: "Teklif kabul edildi" } });
    fireEvent.click(dialog.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const detail = within(screen.getByRole("region", { name: "Görev detayı" }));
    expect(await detail.findByText("Görev tamamlandı: Teklif kabul edildi")).toBeInTheDocument();
    expect(detail.getByRole("button", { name: "Tekrar Aç" })).toBeInTheDocument();
    expect(tasksService.update).toHaveBeenCalledWith("task-1", expect.objectContaining({ status: "done", completionNote: "Teklif kabul edildi" }));
  });
});

it("opens the dashboard's requested task view", async () => {
  render(<TasksPage initialQuery="view:overdue" />);
  await waitFor(() => expect(tasksService.list).toHaveBeenLastCalledWith(expect.objectContaining({ view: "overdue" })));
});

it("opens completed dashboard tasks as filtered history", async () => {
  render(<TasksPage initialQuery="view:completed" />);
  await waitFor(() => expect(tasksService.list).toHaveBeenLastCalledWith(expect.objectContaining({ view: "history", status: "done" })));
});
