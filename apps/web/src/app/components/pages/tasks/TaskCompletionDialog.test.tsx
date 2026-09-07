// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tasksService, type TaskDTO } from "../../../../lib/services";
import { TaskCompletionDialog } from "./TaskCompletionDialog";

vi.mock("../../../../lib/services", () => ({ tasksService: { update: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
// Test içerik ve kullanıcı akışını sınar; portal/focus yönetimi Radix'e aittir.
vi.mock("../../ui/dialog", () => ({
  Dialog: ({ open, children }: any) => open ? <>{children}</> : null,
  DialogContent: ({ children }: any) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: any) => <header>{children}</header>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <footer>{children}</footer>,
}));
vi.mock("../../ui/label", () => ({ Label: ({ children, ...props }: any) => <label {...props}>{children}</label> }));

const task = { id: "task-1", title: "Müşteriyi ara", status: "todo" } as TaskDTO;

describe("TaskCompletionDialog", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("does not complete before a nonblank note is entered and saves the trimmed result", async () => {
    const updated = { ...task, status: "done", events: [] };
    vi.mocked(tasksService.update).mockResolvedValue(updated as any);
    const onCompleted = vi.fn();
    const onOpenChange = vi.fn();
    render(<TaskCompletionDialog task={task} onCompleted={onCompleted} onOpenChange={onOpenChange} />);
    const submit = screen.getByRole("button", { name: "Notu kaydet ve tamamla" });
    const field = screen.getByRole("textbox", { name: "Tamamlama notu (zorunlu)" });
    expect(submit).toBeDisabled();
    fireEvent.change(field, { target: { value: " \n\t " } });
    fireEvent.submit(submit.closest("form")!);
    expect(submit).toBeDisabled();
    expect(tasksService.update).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: " Müşteri arandı, teklif gönderildi. " } });
    fireEvent.click(submit);
    await waitFor(() => expect(onCompleted).toHaveBeenCalledWith(updated));
    expect(tasksService.update).toHaveBeenCalledWith("task-1", { status: "done", completionNote: "Müşteri arandı, teklif gönderildi." });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the note and task open when saving fails, then allows retry", async () => {
    vi.mocked(tasksService.update).mockRejectedValueOnce(new Error("Bağlantı kurulamadı"));
    const onCompleted = vi.fn();
    const onOpenChange = vi.fn();
    render(<TaskCompletionDialog task={task} onCompleted={onCompleted} onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Fiyat listesi gönderildi" } });
    fireEvent.click(screen.getByRole("button", { name: "Notu kaydet ve tamamla" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Bağlantı kurulamadı");
    expect(screen.getByRole("textbox")).toHaveValue("Fiyat listesi gönderildi");
    expect(onCompleted).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Notu kaydet ve tamamla" })).toBeEnabled();
  });

  it("cancels without changing the task and clears the note for another task", () => {
    const onOpenChange = vi.fn();
    const props = { onOpenChange, onCompleted: vi.fn() };
    const view = render(<TaskCompletionDialog task={task} {...props} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Taslak not" } });
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(tasksService.update).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    view.rerender(<TaskCompletionDialog task={{ ...task, id: "task-2" }} {...props} />);
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Notu kaydet ve tamamla" })).toBeDisabled();
  });
});
