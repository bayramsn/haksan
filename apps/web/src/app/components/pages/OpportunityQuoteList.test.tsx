// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Offer } from "../../lib/mock";
import { OpportunityQuoteList, sortOpportunityOffers } from "./OpportunityQuoteList";

vi.mock("lucide-react", () => {
  const Icon = () => <svg aria-hidden="true" />;
  return {
    AlertTriangle: Icon,
    CheckCircle2: Icon,
    ChevronRight: Icon,
    Clock: Icon,
    FileText: Icon,
    XCircle: Icon,
  };
});

const offer = (patch: Partial<Offer> = {}): Offer => ({
  id: "quote-1",
  salesCaseId: "opportunity-1",
  quoteNo: "TKL-2026-101",
  revision: 1,
  date: "2026-08-14",
  amount: 125_000,
  currency: "EUR",
  status: "Draft",
  note: "",
  ...patch,
});

describe("OpportunityQuoteList", () => {
  it("en yeni revizyonu önce gösterir", () => {
    const sorted = sortOpportunityOffers([
      offer({ id: "r1", revision: 1 }),
      offer({ id: "r3", revision: 3 }),
      offer({ id: "r2", revision: 2 }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["r3", "r2", "r1"]);
  });

  it("teklif özetlerini gösterir ve seçilen teklifin detayını açar", () => {
    const onOpenOffer = vi.fn();
    render(
      <OpportunityQuoteList
        offers={[
          offer(),
          offer({ id: "quote-2", quoteNo: "TKL-2026-102", revision: 2, amount: 140_500, status: "Sent" }),
        ]}
        onOpenOffer={onOpenOffer}
      />,
    );

    expect(screen.getByRole("list", { name: "Fırsata bağlı teklifler" })).toBeInTheDocument();
    expect(screen.getByText("TKL-2026-101")).toBeInTheDocument();
    expect(screen.getByText("TKL-2026-102")).toBeInTheDocument();
    expect(screen.getByText("Gönderildi")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /TKL-2026-102.*görüntüle/ }));
    expect(onOpenOffer).toHaveBeenCalledWith("quote-2");
  });
});
