import { useEffect, useState } from "react";
import type { CompanyOsmSearchResult } from "@haksan/shared";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "../ui/utils";
import { companyService } from "../../../lib/services";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { toast } from "sonner";

const MATCH_QUALITY = {
  exact: { label: "Bina/firma eşleşmesi", className: "bg-emerald-50 text-emerald-700" },
  street: { label: "Sokak/cadde düzeyi", className: "bg-blue-50 text-blue-700" },
  area: { label: "İlçe/şehir yaklaşık", className: "bg-amber-50 text-amber-700" },
} as const;

type OsmCompanySearchProps = {
  query: string;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  country?: string | null;
  buttonLabel?: string;
  className?: string;
  onSelect: (result: CompanyOsmSearchResult) => void | Promise<void>;
  onManualPick?: () => void;
};

export function OsmCompanySearch({
  query,
  address,
  city,
  district,
  country,
  buttonLabel = "OSM'de ara",
  className,
  onSelect,
  onManualPick,
}: OsmCompanySearchProps) {
  const [term, setTerm] = useState(query);
  const [results, setResults] = useState<CompanyOsmSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);

  useEffect(() => {
    setTerm((current) => (current.trim() ? current : query));
  }, [query]);

  const runSearch = async () => {
    const q = (term.trim() || query.trim()).slice(0, 160);
    if (q.length < 2) {
      toast.error("Arama için en az 2 karakter girin");
      return;
    }
    setLoading(true);
    setSelectedId(null);
    setSearchStatus(null);
    try {
      const rows = await companyService.osmSearch({
        q,
        address: address?.trim() || undefined,
        city: city?.trim() || undefined,
        district: district?.trim() || undefined,
        country: country?.trim() || undefined,
      });
      setResults(rows);
      if (rows.length === 0) {
        setSearchStatus("OSM'de eşleşme bulunamadı. Adresi kontrol edin veya haritadan pin seçin.");
        toast.info("OpenStreetMap sonucu bulunamadı", {
          description: onManualPick ? "Adres bilgisi yoksa haritadan pin seçebilirsiniz." : undefined,
        });
      } else {
        const exactCount = rows.filter((row) => row.matchQuality === "exact").length;
        setSearchStatus(
          exactCount > 0
            ? `${rows.length} sonuç bulundu; ${exactCount} sonuç bina/firma düzeyinde eşleşti.`
            : `${rows.length} yaklaşık sonuç bulundu. Tam konum için haritadan firma girişini seçin.`
        );
      }
    } catch (err: any) {
      setResults([]);
      setSearchStatus(err?.message ?? "OpenStreetMap araması şu anda tamamlanamadı.");
      toast.error("OpenStreetMap araması başarısız", { description: err?.message ?? "Lütfen tekrar deneyin." });
    } finally {
      setLoading(false);
    }
  };

  const selectResult = async (result: CompanyOsmSearchResult) => {
    setSelectedId(result.id);
    await onSelect(result);
  };

  return (
    <div className={cn("rounded-md border border-border/60 bg-muted/10 p-3", className)}>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            className="h-9 bg-background pl-9"
            placeholder="Firma adını OpenStreetMap'te ara"
            aria-label="OpenStreetMap firma araması"
            maxLength={160}
          />
        </div>
        <Button type="submit" variant="outline" className="h-9 gap-1.5" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
          {buttonLabel}
        </Button>
        {onManualPick && (
          <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={onManualPick}>
            <Crosshair className="size-4" />
            Haritadan seç
          </Button>
        )}
      </form>

      {searchStatus && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground" role="status" aria-live="polite">
          {searchStatus}
        </p>
      )}

      {results.length > 0 && (
        <div className="mt-3 divide-y divide-border/60 overflow-hidden rounded-md border border-border/60 bg-background">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => void selectResult(result)}
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/35"
            >
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <MapPin className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{result.displayName}</span>
                <span className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${MATCH_QUALITY[result.matchQuality].className}`}>
                  {MATCH_QUALITY[result.matchQuality].label} · %{result.matchScore}
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{result.matchReason}</span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {result.latitude.toFixed(5)}, {result.longitude.toFixed(5)}
                  {selectedId === result.id ? " · seçildi" : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 text-[11px] text-muted-foreground">© OpenStreetMap contributors</div>
    </div>
  );
}
