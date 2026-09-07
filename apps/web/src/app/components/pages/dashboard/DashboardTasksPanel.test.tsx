// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskCounts, TaskDTO } from "../../../../lib/services";
import { tasksService } from "../../../../lib/services";
import { DashboardTasksPanel } from "./DashboardTasksPanel";

const auth = vi.hoisted(() => ({
  user: { id: "user-1", tenantId: "tenant-1" },
  activeDivision: "division-1",
  activeDepartment: "department-1",
  permissions: ["tasks.read", "tasks.manage"],
}));

vi.mock("../../../../lib/auth", () => ({
  useAuth: () => ({ ...auth, hasPermission: (permission: string) => auth.permissions.includes(permission) }),
}));
vi.mock("../../../../lib/services", () => ({ tasksService: { counts: vi.fn(), list: vi.fn(), summary: vi.fn() } }));
vi.mock("lucide-react", () => ({
  ArrowUpRight: () => <svg aria-hidden="true" />,
  ListTodo: () => <svg aria-hidden="true" />,
}));

const counts: TaskCounts = { all: 30, mine: 7, today: 4, overdue: 3, upcoming: 9, completed: 10, history: 11 };
const task: TaskDTO = {
  id: "task-1", title: "Bakım sonucunu müşteriye ilet", description: null,
  status: "todo", priority: "high", assignedToUserId: "user-1", createdBy: "user-2",
  dueAt: null, remindBeforeMinutes: null, companyId: null, contactId: null,
  opportunityId: null, quoteId: null, serviceTicketId: null, completedAt: null,
  createdAt: "2026-09-01T08:00:00.000Z", overdue: false, assignee: null,
  company: null, contact: null, opportunity: null, quote: null, serviceTicket: null,
};
const list = (tasks: TaskDTO[]) => ({ data: tasks, meta: { page: 1, pageSize: 5, total: tasks.length, totalPages: 1 } });
let client: QueryClient;

function mount(onAction = vi.fn()) {
  return {
    ...render(<DashboardTasksPanel onAction={onAction} />, {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    }),
    onAction,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: "user-1", tenantId: "tenant-1" };
  auth.activeDivision = "division-1";
  auth.activeDepartment = "department-1";
  auth.permissions = ["tasks.read", "tasks.manage"];
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.mocked(tasksService.counts).mockResolvedValue(counts);
  vi.mocked(tasksService.list).mockResolvedValue(list([task]));
  vi.mocked(tasksService.summary).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  client.clear();
});

describe("DashboardTasksPanel", () => {
  it("gerçek görev ve toplamları gösterir, kayıt ve filtre bağlantılarını açar", async () => {
    const { onAction } = mount();
    fireEvent.click(await screen.findByRole("button", { name: /Bakım sonucunu müşteriye ilet/ }));
    expect(onAction).toHaveBeenLastCalledWith({ kind: "navigate", nav: "tasks", query: "task:task-1" });
    expect(tasksService.list).toHaveBeenCalledWith({ view: "mine", sortBy: "dueAt", sortDir: "asc", pageSize: 5 });
    expect(screen.getByRole("button", { name: "Bana atanan açık 7" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toplam görev 30" })).toBeInTheDocument();
    expect(screen.getByText(/seçili bölümde görebildiğiniz ekip görevlerini kapsar/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Geciken 3" }));
    expect(onAction).toHaveBeenLastCalledWith({ kind: "navigate", nav: "tasks", query: "view:overdue" });
    fireEvent.click(screen.getByRole("button", { name: "Tüm görevler" }));
    expect(onAction).toHaveBeenLastCalledWith({ kind: "navigate", nav: "tasks", query: "view:all" });
    fireEvent.click(screen.getByRole("button", { name: "Tamamlanan 10" }));
    expect(onAction).toHaveBeenLastCalledWith({ kind: "navigate", nav: "tasks", query: "view:completed" });
  });

  it("görev okuma yetkisi yoksa paneli göstermez ve istek atmaz", () => {
    auth.permissions = [];
    mount();
    expect(screen.queryByRole("region", { name: "Görev takibi" })).not.toBeInTheDocument();
    expect(tasksService.counts).not.toHaveBeenCalled();
    expect(tasksService.list).not.toHaveBeenCalled();
    expect(tasksService.summary).not.toHaveBeenCalled();
  });

  it("yöneticiye açık veya gecikmiş işi olan kişileri gecikme önceliğiyle gösterir", async () => {
    vi.mocked(tasksService.summary).mockResolvedValue([
      { userId: "user-2", fullName: "Ayşe Kaya", open: 8, overdue: 1, completed: 12 },
      { userId: "user-3", fullName: "Mehmet Demir", open: 4, overdue: 3, completed: 9 },
      { userId: "user-4", fullName: "Deniz Yılmaz", open: 0, overdue: 0, completed: 20 },
      { userId: "user-5", fullName: "Ece Aydın", open: 2, overdue: 0, completed: 6 },
    ]);
    mount();
    const table = await screen.findByRole("table", { name: "Ekip görev durumu" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(within(rows[1]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Mehmet Demir", "4", "3", "9"]);
    expect(within(rows[2]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Ayşe Kaya", "8", "1", "12"]);
    expect(within(rows[3]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Ece Aydın", "2", "0", "6"]);
    expect(screen.queryByText("Deniz Yılmaz")).not.toBeInTheDocument();
    expect(tasksService.summary).toHaveBeenCalledTimes(1);
  });

  it("yönetim yetkisi olmayınca ekip özeti istemez veya göstermez", async () => {
    auth.permissions = ["tasks.read"];
    mount();
    await screen.findByRole("button", { name: /Bakım sonucunu müşteriye ilet/ });
    expect(tasksService.summary).not.toHaveBeenCalled();
    expect(screen.queryByText("Ekip görev durumu")).not.toBeInTheDocument();
  });

  it("yükleme ile kişisel boş durumu ayırır ve ekip sayımlarını korur", async () => {
    let resolveList!: (result: ReturnType<typeof list>) => void;
    vi.mocked(tasksService.list).mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve; }));
    auth.permissions = ["tasks.read"];
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Görevler yükleniyor");
    expect(screen.queryByText("Size atanmış açık görev yok.")).not.toBeInTheDocument();
    resolveList(list([]));
    expect(await screen.findByText("Size atanmış açık görev yok.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Geciken 3" })).toBeInTheDocument();
    expect(screen.getByText(/size atanan veya sizin oluşturduğunuz görevleri kapsar/)).toBeInTheDocument();
  });

  it("hata durumunu boş göstermeden yeniden denemeye izin verir", async () => {
    vi.mocked(tasksService.list).mockRejectedValueOnce(new Error("Sunucu hatası"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Görev takibi yüklenemedi");
    expect(screen.queryByText("Size atanmış açık görev yok.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(await screen.findByRole("button", { name: /Bakım sonucunu müşteriye ilet/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("bölüm, departman veya kullanıcı değiştiğinde veriyi yeniden yükler", async () => {
    const { rerender, onAction } = mount();
    await screen.findByRole("button", { name: /Bakım sonucunu müşteriye ilet/ });
    for (const change of [
      () => { auth.activeDivision = "division-2"; },
      () => { auth.activeDepartment = "department-2"; },
      () => { auth.user = { id: "user-2", tenantId: "tenant-1" }; },
    ]) {
      const calls = vi.mocked(tasksService.list).mock.calls.length;
      change();
      rerender(<DashboardTasksPanel onAction={onAction} />);
      await waitFor(() => expect(tasksService.list).toHaveBeenCalledTimes(calls + 1));
    }
  });

  it("görev tamamlandıktan sonra panele dönüldüğünde liste ve sayımları yeniler", async () => {
    const first = mount();
    await screen.findByRole("button", { name: /Bakım sonucunu müşteriye ilet/ });
    first.unmount();
    vi.mocked(tasksService.list).mockResolvedValue(list([]));
    vi.mocked(tasksService.counts).mockResolvedValue({ ...counts, mine: 0 });
    mount();
    expect(await screen.findByText("Size atanmış açık görev yok.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bana atanan açık 0" })).toBeInTheDocument();
  });
});
