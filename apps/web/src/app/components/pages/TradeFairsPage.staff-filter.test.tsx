// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TradeFairsPage } from "./TradeFairsPage";
import { tradeFairService } from "../../../lib/services";

const state = vi.hoisted(() => ({ exportParams: {} as any }));
vi.mock("../ui/ExportExcelButton", () => ({ ExportExcelButton: ({ params }: any) => { state.exportParams = params; return null; } }));
vi.mock("../ui/combobox", () => ({ Combobox: ({ options, value, onChange, ariaLabel }: any) => <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> }));
vi.mock("../../lib/store", () => ({ useStore: () => ({ products: [] }) }));
vi.mock("../../../lib/auth", () => ({ useAuth: () => ({ user: { id: "staff-a" }, hasPermission: () => false, hasRole: () => false }) }));
vi.mock("../../../lib/services", () => ({ tradeFairService: { photos: vi.fn().mockResolvedValue([]), list: vi.fn(), summary: vi.fn(), staff: vi.fn() }, fileService: {} }));
// Monorepo ikon paketinin React sürümünü bu davranış testinden bağımsız tut.
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  return Object.fromEntries(Object.keys(actual).map((name) => [name, () => null]));
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tradeFairService.summary).mockResolvedValue({ fairs: [{ name: "Maktek", total: 2, lastAt: "2026-10-21" }], byUser: [
    { userId: "staff-a", fullName: "Ayşe Yılmaz", meetings: 1, people: 2 },
    { userId: "staff-b", fullName: "Mehmet Kaya", meetings: 1, people: 1 },
  ] });
  vi.mocked(tradeFairService.staff).mockResolvedValue([]);
  vi.mocked(tradeFairService.list).mockImplementation(async (params) => {
    const records = [
      { id: "a", companyName: "Ankara Makine", contactName: "Ali Demir", metByUserId: "staff-a", metByName: "Ayşe Yılmaz", province: "Ankara", visitorCount: 2 },
      { id: "b", companyName: "İzmir Metal", contactName: "Ece Yıldız", metByUserId: "staff-b", metByName: "Mehmet Kaya", province: "İzmir", visitorCount: 1 },
    ].filter((row) => (!params?.metByUserId || row.metByUserId === params.metByUserId) && (!params?.province || row.province === params.province));
    return { data: records, meta: { total: records.length } } as Awaited<ReturnType<typeof tradeFairService.list>>;
  });
});
afterEach(cleanup);

describe("Fuar çalışan filtresi", () => {
  it("çalışana basıldığında firma ve yetkililerini filtreler; temizleyince tüm kayıtları getirir", async () => {
    render(<TradeFairsPage />);
    await screen.findByText("İzmir Metal");
    fireEvent.click(screen.getByRole("button", { name: "Ayşe Yılmaz görüşmelerini filtrele" }));
    await screen.findByText("Ankara Makine");
    expect(screen.queryByText("İzmir Metal")).toBeNull();
    expect(screen.getByText("Ali Demir")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ayşe Yılmaz görüşmelerini filtrele" }).getAttribute("aria-pressed")).toBe("true");
    expect(tradeFairService.list).toHaveBeenLastCalledWith(expect.objectContaining({ metByUserId: "staff-a", page: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Kişi filtresini kaldır" }));
    await screen.findByText("İzmir Metal");
    expect(screen.queryByRole("button", { name: "Kişi filtresini kaldır" })).toBeNull();
  });

  it("başka çalışana ve aynı karta tekrar basınca filtreyi değiştirip kaldırır", async () => {
    render(<TradeFairsPage />);
    await screen.findByText("Ankara Makine");
    fireEvent.click(screen.getByRole("button", { name: "Ayşe Yılmaz görüşmelerini filtrele" }));
    await waitFor(() => expect(tradeFairService.list).toHaveBeenLastCalledWith(expect.objectContaining({ metByUserId: "staff-a" })));
    fireEvent.click(screen.getByRole("button", { name: "Mehmet Kaya görüşmelerini filtrele" }));
    await screen.findByText("İzmir Metal");
    expect(screen.queryByText("Ankara Makine")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mehmet Kaya görüşmelerini filtrele" }));
    await screen.findByText("Ankara Makine");
  });
});


it("şehir ve kişi filtresini listede ve Excel indirmesinde birlikte kullanır", async () => {
  render(<TradeFairsPage />);
  await screen.findByText("İzmir Metal");
  const city = screen.getByLabelText("Fuar şehri") as HTMLSelectElement;
  expect(city.options).toHaveLength(82);
  fireEvent.change(city, { target: { value: "Ankara" } });
  await screen.findByText("Ankara Makine");
  expect(screen.queryByText("İzmir Metal")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Ayşe Yılmaz görüşmelerini filtrele" }));
  await waitFor(() => expect(tradeFairService.list).toHaveBeenLastCalledWith(expect.objectContaining({ province: "Ankara", metByUserId: "staff-a" })));
  expect(state.exportParams).toEqual(expect.objectContaining({ province: "Ankara", metByUserId: "staff-a" }));
});
