// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpportunityProcessCenter } from "./OpportunityProcessCenter";
import type { SalesCase } from "../../lib/mock";
const state = vi.hoisted(() => ({ changeStage: vi.fn() }));
vi.mock("../../../lib/services", () => ({ opportunityService: { get: vi.fn(), changeQualificationStage: state.changeStage } }));
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(Object.keys(actual).map((key) => [key, () => <svg aria-hidden="true" />]));
});
vi.mock("../ui/dialog", () => ({
  Dialog: ({ open, children }: any) => open ? <>{children}</> : null,
  DialogContent: ({ children }: any) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("all-stage requirement popup", () => {
  it.each(["lead", "c", "b", "a", "a_plus"])("shows missing checks instead of advancing from %s", (stage) => {
    const blocker = { key: "subject", label: "Konu girildi", complete: false, actionKey: "edit_subject", qualificationStage: "lead" };
    const detail = { processReadiness: { currentQualificationStage: stage, currentOperationStage: "sales", closed: false, checks: [blocker], targets: [
      { axis: "qualification", code: stage, direction: "current", selectable: false, canTransition: false, blockers: [] },
      { axis: "qualification", code: stage === "lead" ? "c" : "win", direction: "forward", selectable: true, canTransition: false, blockers: [blocker] },
    ] } };
    render(<OpportunityProcessCenter salesCase={{ id: "opp", qualificationStage: stage } as SalesCase} canUpdate detail={detail as never} loading={false} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Eksikleri tamamla" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Konu girildi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tamamla" })).toBeInTheDocument();
    expect(state.changeStage).not.toHaveBeenCalled();
  });
});
