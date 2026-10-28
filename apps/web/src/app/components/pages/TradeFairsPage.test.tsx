// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tradeFairFollowUpSchema, tradeFairContactUpdateSchema } from "@haksan/shared";
import { TradeFairsPage, tradeFairRowColor } from "./TradeFairsPage";

const { update, list, links, toastError } = vi.hoisted(() => ({ update: vi.fn(), list: vi.fn(), links: vi.fn(), toastError: vi.fn() }));
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Icon = () => <svg aria-hidden="true" />;
  return Object.fromEntries(Object.keys(actual).map((name) => [name, Icon]));
});
vi.mock("../ui/label", () => ({ Label: ({ children, ...props }: any) => <label {...props}>{children}</label> }));
vi.mock("../ui/combobox", () => ({ Combobox: () => <span /> }));
vi.mock("../../lib/store", () => ({ useStore: () => ({ products: [] }) }));
vi.mock("../../../lib/auth", () => ({ useAuth: () => ({ user: { id: "staff" }, hasPermission: () => true, hasRole: () => false }) }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock("../../../lib/services", () => ({ fileService: { links }, tradeFairService: {
  list, update, summary: vi.fn().mockResolvedValue({ fairs: [], byUser: [] }), staff: vi.fn().mockResolvedValue([]),
} }));
vi.mock("../ui/dialog", () => ({
  Dialog: ({ children, open }: any) => open ? <>{children}</> : null,
  DialogContent: ({ children }: any) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));
vi.mock("../ui/checkbox", () => ({ Checkbox: ({ checked, onCheckedChange, ...props }: any) =>
  <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} {...props} /> }));
vi.mock("../ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => <div><select aria-label="Görüşme yolu" value={value} onChange={(e) => onValueChange(e.target.value)}><option value="" /><option value="phone">Telefon</option></select>{children}</div>,
  SelectTrigger: () => null, SelectContent: () => null, SelectItem: () => null, SelectValue: () => null,
}));
const empty = { contacted: false, contactMethod: null, contactDate: null, contactNotes: null, offerSent: false, customerConverted: false };
const row = { ...empty, id: "record", fairName: "WIN", companyName: "Test Firma", contactName: "Ali", visitorCount: 1 };
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Fuar görüşme takibi", () => {
  it("loads attachments after page one while retaining the selected fair contact", async () => {
    list.mockResolvedValue({ data: [row], meta: { total: 1 } });
    links.mockImplementation(async (query) => ({
      data: [{ id: `link-${query.page}`, file: { id: `file-${query.page}`, originalFilename: `ek-${query.page}.pdf`, mimeType: 'application/pdf' } }],
      meta: { page: query.page, pageSize: 100, total: 2, totalPages: 2 },
    }));
    render(<TradeFairsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Test Firma kaydını düzenle' }));
    expect(await screen.findByRole('button', { name: 'ek-2.pdf' })).toBeInTheDocument();
    expect(links).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'record', page: 2, pageSize: 100 }));
  });
  it("requires complete meeting details and rejects impossible dates and unknown methods", () => {
    expect(tradeFairFollowUpSchema.safeParse({ ...empty, contacted: true }).success).toBe(false);
    const valid = { ...empty, contacted: true, contactMethod: "phone", contactDate: "2026-10-08", contactNotes: "İlgileniyor" };
    expect(tradeFairFollowUpSchema.safeParse(valid).success).toBe(true);
    expect(tradeFairFollowUpSchema.safeParse({ ...valid, contactDate: "2026-02-30" }).success).toBe(false);
    expect(tradeFairFollowUpSchema.safeParse({ ...valid, contactMethod: "unknown" }).success).toBe(false);
    expect(tradeFairFollowUpSchema.safeParse({ ...valid, contactNotes: "   " }).success).toBe(false);
    expect(tradeFairContactUpdateSchema.parse({ offerSent: true })).toEqual({ offerSent: true });
  });
  it("prioritizes green over yellow and resets to neutral when flags are cleared", () => {
    expect(tradeFairRowColor(empty)).toBe("");
    expect(tradeFairRowColor({ ...empty, contacted: true })).toContain("yellow");
    expect(tradeFairRowColor({ ...empty, contacted: true, offerSent: true })).toContain("green");
    expect(tradeFairRowColor({ ...empty, customerConverted: true })).toContain("green");
  });
  it("opens details from the checkbox, cancels without saving, and persists details on save", async () => {
    list.mockResolvedValue({ data: [row], meta: { total: 1 } });
    update.mockResolvedValue(row);
    render(<TradeFairsPage />);
    const checkbox = await screen.findByRole("checkbox", { name: "Test Firma görüşüldü" });
    fireEvent.click(checkbox);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(update).not.toHaveBeenCalled();
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.change(within(screen.getByRole("dialog")).getByRole("combobox", { name: "Görüşme yolu" }), { target: { value: "phone" } });
    fireEvent.change(screen.getByLabelText(/Görüşme tarihi/), { target: { value: "2026-10-08" } });
    fireEvent.change(screen.getByLabelText(/Görüşme notu/), { target: { value: "Teklif talep etti" } });
    fireEvent.click(screen.getByLabelText("Fuar teklifi iletildi"));
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("record", {
      contacted: true, contactMethod: "phone", contactDate: "2026-10-08", contactNotes: "Teklif talep etti", offerSent: true, customerConverted: false,
    }));
  });
  it("edits a green status without forcing a meeting or losing its status", async () => {
    list.mockResolvedValue({ data: [{ ...row, offerSent: true }], meta: { total: 1 } });
    update.mockResolvedValue(row);
    render(<TradeFairsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Takibi düzenle" }));
    expect(within(screen.getByRole("dialog")).getByRole("checkbox", { name: "Görüşüldü" })).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Müşteriye dönüştü"));
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("record", expect.objectContaining({ contacted: false, offerSent: true, customerConverted: true })));
  });
  it("keeps the dialog open and reports a failed save", async () => {
    list.mockResolvedValue({ data: [{ ...row, contacted: true, contactMethod: "phone", contactDate: "2026-10-08", contactNotes: "Arandı" }], meta: { total: 1 } });
    update.mockRejectedValue(new Error("Tekrar deneyin"));
    render(<TradeFairsPage />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Test Firma görüşüldü" }));
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
