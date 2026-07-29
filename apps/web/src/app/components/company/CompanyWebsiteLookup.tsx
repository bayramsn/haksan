import { useState } from "react";
import type { CompanyWebsiteLookupResult } from "@haksan/shared";
import { AlertTriangle, ExternalLink, Globe2, Loader2, Mail, MapPin, Phone, SearchCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { companyService } from "../../../lib/services";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

type Props = {
  query: string;
  website?: string;
  address?: string;
  city?: string;
  district?: string;
  country?: string;
  onApply: (suggestion: CompanyWebsiteLookupResult["suggestion"]) => void;
};

const confidenceMeta = {
  high: { label: "Güçlü eşleşme", className: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  medium: { label: "Kontrol edilmeli", className: "border-amber-300 bg-amber-50 text-amber-800" },
  low: { label: "Zayıf eşleşme", className: "border-rose-300 bg-rose-50 text-rose-800" },
} as const;

export function CompanyWebsiteLookup({ query, website, address, city, district, country, onApply }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompanyWebsiteLookupResult | null>(null);

  const lookup = async () => {
    if (query.trim().length < 2) {
      toast.error("Önce firma ünvanını yazın");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const response = await companyService.websiteLookup({
        q: query.trim(),
        website: website?.trim() || undefined,
        address: address?.trim() || undefined,
        city: city?.trim() || undefined,
        district: district?.trim() || undefined,
        country: country?.trim() || undefined,
      });
      setResult(response);
      toast.success("Resmî site incelendi", { description: `${response.confidenceScore}/100 eşleşme puanı` });
    } catch (error: any) {
      toast.error("Resmî site bilgisi bulunamadı", {
        description: error?.message ?? "Web sitesini yazıp tekrar deneyin.",
      });
    } finally {
      setLoading(false);
    }
  };

  const suggestionRows = result ? [
    { icon: MapPin, label: "Adres", value: result.suggestion.address },
    { icon: Phone, label: "Telefon", value: result.suggestion.phone },
    { icon: Mail, label: "E-posta", value: result.suggestion.email },
  ].filter((row) => row.value) : [];

  return (
    <div className="col-span-2 rounded-lg border border-sky-200/80 bg-gradient-to-br from-sky-50/80 via-background to-background p-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5 rounded-md border border-sky-200 bg-white p-2 text-sky-700 shadow-sm">
            <Globe2 className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">Resmî site doğrulaması</div>
            <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
              Firma adıyla siteyi bulur; iletişim sayfasındaki önerileri kaydetmeden önce size gösterir.
            </div>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5 border-sky-300 bg-white" onClick={lookup} disabled={loading || query.trim().length < 2}>
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <SearchCheck className="size-3.5" />}
          {loading ? "Site inceleniyor" : "Siteden bilgileri bul"}
        </Button>
      </div>

      {!website?.trim() && (
        <div className="mt-2 pl-10 text-[11px] text-muted-foreground">
          Web sitesi boşsa önce doğrulanmış firma/harita kaydındaki resmî site aranır.
        </div>
      )}

      {result && (
        <div className="mt-3 border-l-2 border-sky-300 pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="size-4 text-sky-700" />
            <span className="text-sm font-medium">{result.siteName || query}</span>
            <Badge variant="outline" className={confidenceMeta[result.confidence].className}>
              {confidenceMeta[result.confidence].label} · {result.confidenceScore}/100
            </Badge>
          </div>
          <a href={result.officialWebsite} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-sky-700 underline-offset-2 hover:underline">
            {result.officialWebsite}
            <ExternalLink className="size-3 shrink-0" />
          </a>
          {result.sourceUrls.length > 1 && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {result.sourceUrls.slice(1).map((sourceUrl, index) => (
                <a key={sourceUrl} href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-sky-700 hover:underline">
                  Kaynak sayfa {index + 2}<ExternalLink className="size-2.5" />
                </a>
              ))}
            </div>
          )}
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{result.matchReason}</p>

          {suggestionRows.length > 0 && (
            <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
              {suggestionRows.map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-md border border-border/70 bg-background/90 px-2.5 py-2">
                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Icon className="size-3" /> {label}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-foreground">{value}</div>
                </div>
              ))}
            </div>
          )}

          {result.suggestion.latitude != null && result.suggestion.longitude != null && (
            <div className="mt-2 text-xs text-emerald-800">
              Eşleşen konum: {result.suggestion.latitude.toFixed(5)}, {result.suggestion.longitude.toFixed(5)}
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="mt-2 space-y-1 rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-2 text-[11px] text-amber-900">
              {result.warnings.map((warning) => (
                <div key={warning} className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[11px] text-muted-foreground">Dolu alanlar korunur; önerileri kaydetmeden önce düzenleyebilirsiniz.</div>
            <Button type="button" size="sm" onClick={() => onApply(result.suggestion)}>
              Önerileri forma uygula
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
