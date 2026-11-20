// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ExportExcelButton } from "./ExportExcelButton";
const state = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../../lib/downloadExport", () => ({ downloadExport: state.get, downloadExportPost: state.post }));
vi.mock("../../../lib/auth", () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock("lucide-react", () => ({ Download: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("exports exactly the filtered opportunity IDs through POST", async () => {
  render(<ExportExcelButton path="/exports/opportunities/selected" filename="firsatlar.xlsx" body={{ ids: ["one", "two"] }} />);
  fireEvent.click(screen.getByRole("button", { name: "Excel İndir" }));
  await waitFor(() => expect(state.post).toHaveBeenCalledWith("/exports/opportunities/selected", "firsatlar.xlsx", { ids: ["one", "two"] }));
  expect(state.get).not.toHaveBeenCalled();
});
it("exports fairs using all active query filters", async () => {
  const params = { fairName: "Maktek", q: "lazer", metByUserId: "staff", province: "Ankara" };
  render(<ExportExcelButton path="/exports/trade-fairs" filename="fuar.xlsx" params={params} />);
  fireEvent.click(screen.getByRole("button", { name: "Excel İndir" }));
  await waitFor(() => expect(state.get).toHaveBeenCalledWith("/exports/trade-fairs", "fuar.xlsx", params));
  expect(state.post).not.toHaveBeenCalled();
});
