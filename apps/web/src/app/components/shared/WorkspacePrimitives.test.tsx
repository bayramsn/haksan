// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorState, LoadingState, PartialState, SuccessState } from "./VisualStates";
import {
  DataViewFrame,
  FilterBar,
  FormSection,
  KpiStrip,
  PageLayout,
  PageToolbar,
  ResponsiveRecordView,
  StickyActionBar,
} from "./WorkspacePrimitives";

vi.mock("lucide-react", () => {
  const Icon = ({ "aria-hidden": ariaHidden }: { "aria-hidden"?: boolean | "true" | "false" }) => (
    <svg aria-hidden={ariaHidden ?? true} />
  );
  return {
    AlertTriangle: Icon,
    CheckCircle2: Icon,
    RefreshCw: Icon,
    WifiOff: Icon,
  };
});

describe("ortak çalışma alanı kalıpları", () => {
  it("sayfa, araç çubuğu, filtre, KPI ve veri alanlarını erişilebilir adlarla sunar", () => {
    render(
      <PageLayout data-testid="page-layout">
        <PageToolbar
          primary={<FilterBar><button type="button">Aktif kayıtlar</button></FilterBar>}
          secondary={<button type="button">Dışa aktar</button>}
        />
        <KpiStrip><div>Toplam 24</div></KpiStrip>
        <DataViewFrame label="Firma listesi"><div>Firma satırı</div></DataViewFrame>
      </PageLayout>,
    );

    expect(screen.getByTestId("page-layout")).toHaveClass("ui-page-layout");
    expect(screen.getByRole("region", { name: "Sayfa araçları" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Filtreler" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Özet göstergeler" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Firma listesi" })).toBeInTheDocument();
  });

  it("masaüstü ve mobil kayıt görünümlerini aynı veri kaynağı için birlikte render eder", () => {
    render(<ResponsiveRecordView desktop={<div>Masaüstü tablo</div>} mobile={<div>Mobil kayıt satırı</div>} />);

    expect(screen.getByText("Masaüstü tablo").parentElement).toHaveClass("hidden", "md:block");
    expect(screen.getByText("Mobil kayıt satırı").parentElement).toHaveClass("md:hidden");
  });

  it("form bölümü ve sabit işlem çubuğunun başlıklarını korur", () => {
    render(
      <FormSection title="Firma bilgileri" description="Zorunlu alanlar değişmedi.">
        <label>Firma adı<input /></label>
        <StickyActionBar><button type="button">Kaydet</button></StickyActionBar>
      </FormSection>,
    );

    expect(screen.getByRole("heading", { name: "Firma bilgileri" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Kayıt işlemleri" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeInTheDocument();
  });
});

describe("ortak veri durumları", () => {
  it("hata ve kısmi veri durumlarında tekrar dene aksiyonunu çalıştırır", () => {
    const retry = vi.fn();
    const { rerender } = render(<ErrorState action={{ label: "Yeniden dene", onClick: retry }} />);

    fireEvent.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(<PartialState action={{ label: "Eksik bölümü yenile", onClick: retry }} />);
    fireEvent.click(screen.getByRole("button", { name: "Eksik bölümü yenile" }));
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it("başarı ve yüklenme durumlarını yardımcı teknolojilere bildirir", () => {
    const { rerender } = render(<SuccessState title="Kayıt tamamlandı" />);
    expect(screen.getByText("Kayıt tamamlandı").closest("section")).toHaveAttribute("aria-live", "polite");

    rerender(<LoadingState label="Firmalar hazırlanıyor" rows={3} />);
    expect(screen.getByLabelText("Firmalar hazırlanıyor")).toHaveAttribute("aria-busy", "true");
  });
});
