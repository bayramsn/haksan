// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SalesCasesPage } from "./SalesCases";

const state = vi.hoisted(() => ({ details: {} as Record<string, any>, closed: [] as any[], hydrate: vi.fn() }));
const cases = [
  { id: "ankara", customerId: "ankara-company", leadCompanyTitle: "Makina Kaydı 1", qualificationStage: "lead", stage: "lead", currency: "USD", estimatedAmount: 100, createdAt: "2026-10-01" },
  { id: "izmir", customerId: "izmir-company", leadCompanyTitle: "Makina Kaydı 2", qualificationStage: "lead", stage: "lead", currency: "USD", estimatedAmount: 100, createdAt: "2026-10-01" },
];
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Icon = () => <svg aria-hidden="true" />;
  return Object.fromEntries(Object.keys(actual).map((name) => [name, Icon]));
});
vi.mock("../../lib/store", () => ({ useStore: () => ({
  cases, closedCases: state.closed, customers: [], users: [], activities: [], offers: [], products: [],
}) }));
vi.mock("../../../lib/auth", () => ({ useAuth: () => ({ hasPermission: () => false, hasRole: () => false }) }));
vi.mock("../../lib/companyServerData", () => ({ useCompanyCardDetails: (ids: string[]) => {
  state.hydrate(ids); return { data: state.details };
} }));
vi.mock("./QualificationKanban", () => ({ QualificationKanban: ({ items }: any) => <div data-testid="kanban-ids">{items.map((item: any) => item.id).join(",")}</div> }));
afterEach(() => { cleanup(); state.details = {}; state.closed = []; vi.clearAllMocks(); });

describe("opportunity list address hydration", () => {
  it("keeps the province selection when switching to closed opportunities", () => {
    state.closed = cases.map((item) => ({ ...item, id: `${item.id}-closed`, qualificationStage: "win" }));
    state.details = {
      "ankara-company": { id: "ankara-company", name: "Başkent Makina", city: "Ankara" },
      "izmir-company": { id: "izmir-company", name: "Ege Makina", city: "İzmir" },
    };
    render(<SalesCasesPage onSelect={() => {}} />);
    fireEvent.change(screen.getByRole("combobox", { name: "İl filtresi" }), { target: { value: "Ankara" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Geçmiş (2)" }), { button: 0, ctrlKey: false });
    expect(screen.getByText("Başkent Makina")).toBeInTheDocument();
    expect(screen.queryByText("Ege Makina")).not.toBeInTheDocument();
  });
  it("offers all 81 provinces and filters the list and Kanban by company address", () => {
    state.details = {
      "ankara-company": { id: "ankara-company", name: "Başkent Makina", city: " ANKARA " },
      "izmir-company": { id: "izmir-company", name: "Ege Makina", city: "IZMIR" },
    };
    const { rerender } = render(<SalesCasesPage onSelect={() => {}} />);
    const filter = screen.getByRole("combobox", { name: "İl filtresi" });
    expect(filter.querySelectorAll("option")).toHaveLength(82);
    fireEvent.change(filter, { target: { value: "İzmir" } });
    expect(screen.queryByText("Başkent Makina")).not.toBeInTheDocument();
    expect(screen.getByText("Ege Makina")).toBeInTheDocument();
    rerender(<SalesCasesPage onSelect={() => {}} initialView="kanban" />);
    expect(screen.getByTestId("kanban-ids")).toHaveTextContent(/^izmir$/);
    fireEvent.change(filter, { target: { value: "all" } });
    expect(screen.getByTestId("kanban-ids")).toHaveTextContent("ankara,izmir");
  });
  it("finds a company by its address city after scoped company details arrive", () => {
    const { rerender } = render(<SalesCasesPage onSelect={() => {}} />);
    fireEvent.change(screen.getByLabelText("Fırsatlarda ara"), { target: { value: "ankara" } });
    expect(screen.queryByText("Makina Kaydı 1")).not.toBeInTheDocument();
    // Opportunity names deliberately do not contain a city: only the address can match.
    state.details = {
      "ankara-company": { id: "ankara-company", name: "Başkent Makina", city: "Ankara", district: "Çankaya" },
      "izmir-company": { id: "izmir-company", name: "Ege Makina", city: "İzmir" },
    };
    rerender(<SalesCasesPage onSelect={() => {}} />);
    expect(state.hydrate).toHaveBeenCalledWith(["ankara-company", "izmir-company"]);
    expect(screen.getByText("Başkent Makina")).toBeInTheDocument();
    expect(screen.queryByText("Ege Makina")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Fırsatlarda ara"), { target: { value: "cankaya" } });
    expect(screen.getByText("Başkent Makina")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Fırsatlarda ara"), { target: { value: "izmir" } });
    expect(screen.queryByText("Başkent Makina")).not.toBeInTheDocument();
    expect(screen.getByText("Ege Makina")).toBeInTheDocument();
  });
});
