import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { Search, LocateFixed, Navigation, Phone, Building2, MapPin, AlertCircle, Crosshair, X, RotateCcw, Route as RouteIcon, Plus, Check } from "lucide-react";
import { Customer, FirmType } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { coordsForCity, haversineKm, openDirections, centroidForProvince, PROVINCE_NAMES, TURKEY_CENTER, type LatLng } from "../../lib/geo";
import { usePersistentState } from "../../lib/persist";
import { companyService } from "../../../lib/services";
import { OsmCompanySearch } from "../company/OsmCompanySearch";
import { toast } from "sonner";
import type { CompanyOsmSearchResult } from "@haksan/shared";

const FIRM_TYPE_LABEL: Record<FirmType, string> = {
  customer: "Müşteri",
  supplier_customer: "Tedarikçi + Müşteri",
  supplier: "Tedarikçi",
  competitor: "Rakip",
};

// Firma tipine göre pin rengi (haritada hızlı ayırt etmek için).
const FIRM_TYPE_COLOR: Record<FirmType, string> = {
  customer: "#2563eb",
  supplier_customer: "#7c3aed",
  supplier: "#d97706",
  competitor: "#e11d48",
};

type GeoMeta = { source: "gps" | "province" | "manual_pin"; accuracy?: number; updatedAt: string };
type FirmLocationOverrides = Record<string, LatLng>;
type SelectionMode = null | { type: "user" } | { type: "firm"; customerId: string };
type FirmLocationQuality = "exact" | "street" | "area" | "fallback";
type MappedFirm = Customer & { pos: LatLng; distanceKm: number | null; locationQuality: FirmLocationQuality };

const EXACT_LOCATION_SOURCES = new Set(["manual", "verified", "osm_exact"]);
const isExactLocationSource = (source?: string | null) => EXACT_LOCATION_SOURCES.has(source ?? "");
const locationQualityFor = (source?: string | null): FirmLocationQuality => {
  if (isExactLocationSource(source)) return "exact";
  if (source === "osm_street") return "street";
  if (source === "osm_area") return "area";
  return "fallback";
};
const locationBadge = (quality: FirmLocationQuality) => {
  if (quality === "exact") return { label: "Doğrulanmış tam pin", className: "bg-emerald-50 text-emerald-700" };
  if (quality === "street") return { label: "Sokak/cadde yaklaşık", className: "bg-blue-50 text-blue-700" };
  if (quality === "area") return { label: "İlçe/şehir yaklaşık", className: "bg-amber-50 text-amber-700" };
  return { label: "Şehir/ilçe merkezi", className: "bg-amber-50 text-amber-700" };
};

const nowIso = () => new Date().toISOString();
const formatAccuracy = (accuracy?: number) => {
  if (!accuracy || !Number.isFinite(accuracy)) return "";
  return accuracy < 1000 ? `${Math.round(accuracy)} m doğruluk` : `${(accuracy / 1000).toFixed(1)} km doğruluk`;
};
const sourceLabel = (source?: GeoMeta["source"]) => {
  if (source === "gps") return "GPS";
  if (source === "province") return "İl merkezi";
  if (source === "manual_pin") return "Haritadan seçildi";
  return "Konum";
};

// Damla biçimli renkli pin (Leaflet'in varsayılan görsel ikonlarını kullanmadan).
const pinIcon = (color: string, selected = false) =>
  L.divIcon({
    className: "",
    html: `<span style="display:block;width:${selected ? 26 : 22}px;height:${selected ? 26 : 22}px;transform:rotate(45deg);border-radius:50% 50% 50% 0;background:${color};border:${selected ? 3 : 2}px solid #fff;box-shadow:${selected ? `0 0 0 5px ${color}33,0 4px 12px rgba(0,0,0,.4)` : "0 1px 4px rgba(0,0,0,.35)"}"></span>`,
    iconSize: selected ? [26, 26] : [22, 22],
    iconAnchor: selected ? [13, 26] : [11, 22],
    popupAnchor: [0, -20],
  });

const userIcon = L.divIcon({
  className: "",
  html: `<span style="display:block;width:18px;height:18px;border-radius:50%;background:#059669;border:3px solid #fff;box-shadow:0 0 0 6px rgba(5,150,105,.25)"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Odaklanılan firmaya uçar ve seçiliyse popup'ı açar.
function FirmMarker({
  firm,
  focused,
  selected,
  onOpened,
  onSelect,
  onEditPin,
  onResetPin,
}: {
  firm: MappedFirm;
  focused: boolean;
  selected: boolean;
  onOpened: () => void;
  onSelect: (id: string) => void;
  onEditPin: (id: string) => void;
  onResetPin: (id: string) => void;
}) {
  const ref = useRef<L.Marker>(null);
  const map = useMap();
  const badge = locationBadge(firm.locationQuality);
  useEffect(() => {
    if (focused && ref.current) {
      map.flyTo([firm.pos.lat, firm.pos.lng], Math.max(map.getZoom(), 10), { duration: 0.6 });
      ref.current.openPopup();
      onOpened();
    }
  }, [focused, firm.pos.lat, firm.pos.lng, map, onOpened]);

  return (
    <Marker
      ref={ref}
      position={[firm.pos.lat, firm.pos.lng]}
      icon={pinIcon(FIRM_TYPE_COLOR[firm.firmType], selected)}
      eventHandlers={{ click: () => onSelect(firm.id) }}
    >
      <Popup>
        <div className="min-w-[180px] space-y-1.5">
          <div className="font-semibold leading-tight">{firm.name}</div>
          <div className="text-xs text-muted-foreground">
            {FIRM_TYPE_LABEL[firm.firmType]} · {[firm.district, firm.city].filter(Boolean).join(", ") || "—"}
          </div>
          <div className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${badge.className}`}>
            {badge.label}
          </div>
          {firm.distanceKm != null && (
            <div className="text-xs">Yaklaşık <b>{firm.distanceKm.toFixed(0)} km</b> uzaklıkta</div>
          )}
          {firm.phone && <div className="text-xs flex items-center gap-1"><Phone className="size-3" />{firm.phone}</div>}
          <div className="mt-1 flex flex-wrap gap-1.5">
            <button
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
              onClick={() => openDirections([firm.address, firm.district, firm.city])}
            >
              <Navigation className="size-3" /> Yol tarifi
            </button>
            <button
              className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium hover:bg-muted"
              onClick={() => onEditPin(firm.id)}
            >
              <Crosshair className="size-3" /> Pin düzelt
            </button>
            {firm.locationQuality === "exact" && (
              <button
                className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium hover:bg-muted"
                onClick={() => onResetPin(firm.id)}
              >
                <RotateCcw className="size-3" /> Sıfırla
              </button>
            )}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

function MapSelectionHandler({ mode, onPick }: { mode: SelectionMode; onPick: (pos: LatLng) => void }) {
  useMapEvents({
    click(event) {
      if (!mode) return;
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

// Kullanıcı konumu alındığında haritayı oraya taşır.
function RecenterOnUser({ user }: { user: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (user) map.flyTo([user.lat, user.lng], 9, { duration: 0.8 });
  }, [user, map]);
  return null;
}

type GeoStatus = "idle" | "loading" | "prompt" | "granted" | "denied" | "timeout" | "unavailable" | "unsupported" | "insecure" | "manual_pin" | "province";

const GEO_MESSAGES: Partial<Record<GeoStatus, string>> = {
  prompt: "Tarayıcı konum izni soracak. GPS ile konumumu bul düğmesine basınca izin penceresi açılır.",
  granted: "Konum izni açık. GPS ile konumunuzu yenileyebilir veya haritadan manuel nokta seçebilirsiniz.",
  denied: "Konum izni reddedildi. Adres çubuğundaki konum simgesinden izin verip tekrar deneyin veya haritadan konum seçin.",
  timeout: "Konum alınamadı (zaman aşımı). Tekrar deneyin ya da aşağıdan ilinizi seçin.",
  unavailable: "Konum alınamadı. İşletim sistemi konum servisini açın ya da aşağıdan ilinizi seçin.",
  unsupported: "Tarayıcınız konum servisini desteklemiyor. Aşağıdan ilinizi seçin.",
  insecure: "Konum yalnızca https veya localhost üzerinde çalışır. Uygulamayı localhost'tan açın ya da aşağıdan ilinizi seçin.",
  manual_pin: "Konum haritadan seçildi. Yakınlık hesapları bu noktaya göre yapılır.",
  province: "Konum il merkezi olarak ayarlandı. Mesafeler yaklaşık hesaplanır.",
};

export function SalesMapPage({ initialQuery }: { initialQuery?: string }) {
  const { customers, refresh } = useStore();
  const [q, setQ] = usePersistentState("salesmap.q", "");
  const [firmType, setFirmType] = usePersistentState<"all" | FirmType>("salesmap.firmType", "all");
  const [radius, setRadius] = usePersistentState<"all" | "50" | "100" | "250" | "500">("salesmap.radius", "all");
  const [userPos, setUserPos] = usePersistentState<LatLng | null>("salesmap.userPos", null);
  const [manualProvince, setManualProvince] = usePersistentState<string>("salesmap.province", "");
  const [geoMeta, setGeoMeta] = usePersistentState<GeoMeta | null>("salesmap.geoMeta", null);
  const [firmCoords, setFirmCoords] = usePersistentState<FirmLocationOverrides>("salesmap.firmCoords", {});
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const [osmSearchFirmId, setOsmSearchFirmId] = useState<string | null>(null);
  const [tileLoadFailed, setTileLoadFailed] = useState(false);
  const [route, setRoute] = usePersistentState<string[]>("salesmap.route", []);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleRouteStop = (id: string) =>
    setRoute((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  useEffect(() => {
    if (initialQuery) setQ(initialQuery);
  }, [initialQuery, setQ]);

  useEffect(() => {
    let active = true;
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((permission) => {
        const sync = () => {
          if (!active) return;
          if (permission.state === "denied") setGeoStatus("denied");
          if (permission.state === "prompt") setGeoStatus((current) => current === "idle" ? "prompt" : current);
          if (permission.state === "granted") setGeoStatus((current) => current === "idle" || current === "prompt" ? "granted" : current);
        };
        sync();
        permission.onchange = sync;
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Manuel il seçimi — GPS gerektirmeyen, her zaman çalışan konum çapası.
  const selectProvince = (name: string) => {
    const c = centroidForProvince(name);
    if (!c) return;
    if (watchdog.current) clearTimeout(watchdog.current);
    setManualProvince(name);
    setUserPos(c);
    setGeoMeta({ source: "province", updatedAt: nowIso() });
    setGeoStatus("province");
    setSelectionMode(null);
  };

  const handleMapPick = (pos: LatLng) => {
    if (!selectionMode) return;
    if (selectionMode.type === "user") {
      if (watchdog.current) clearTimeout(watchdog.current);
      setUserPos(pos);
      setManualProvince("");
      setGeoMeta({ source: "manual_pin", updatedAt: nowIso() });
      setGeoStatus("manual_pin");
      setSelectionMode(null);
      return;
    }
    const customerId = selectionMode.customerId;
    // İyimser yerel yazım + kalıcı DB kaydı
    setFirmCoords((current) => ({ ...current, [customerId]: pos }));
    setFocusedId(customerId);
    setSelectionMode(null);
    companyService
      .setLocation(customerId, { latitude: pos.lat, longitude: pos.lng, source: "manual" })
      .then(() => {
        toast.success("Firma konumu kaydedildi");
        void refresh();
      })
      .catch((err: any) => {
        toast.error("Konum kaydedilemedi", { description: err?.message ?? "Pin yalnızca bu tarayıcıda kaldı." });
      });
  };

  const resetFirmPin = (customerId: string) => {
    setFirmCoords((current) => {
      const next = { ...current };
      delete next[customerId];
      return next;
    });
    setFocusedId(customerId);
    setSelectionMode(null);
    companyService
      .setLocation(customerId, { latitude: null, longitude: null })
      .then(() => {
        toast.success("Firma konumu yaklaşık merkeze döndü");
        void refresh();
      })
      .catch((err: any) => {
        toast.error("Konum sıfırlanamadı", { description: err?.message });
      });
  };

  const applyOsmLocation = async (customer: Customer, result: CompanyOsmSearchResult) => {
    setFocusedId(customer.id);
    try {
      const source = result.matchQuality === "exact"
        ? "osm_exact"
        : result.matchQuality === "street"
          ? "osm_street"
          : "osm_area";
      await companyService.setLocation(customer.id, {
        latitude: result.latitude,
        longitude: result.longitude,
        source,
      });
      toast.success(
        result.matchQuality === "exact" ? "Doğrulanmış OpenStreetMap konumu kaydedildi" : "Yaklaşık OpenStreetMap konumu kaydedildi",
        { description: result.matchQuality === "exact" ? customer.name : `${customer.name} · Tam pin için haritadan firma girişini seçin.` }
      );
      setOsmSearchFirmId(null);
      await refresh();
    } catch (err: any) {
      toast.error("Konum kaydedilemedi", { description: err?.message ?? "Lütfen tekrar deneyin." });
    }
  };

  const clearUserLocation = () => {
    if (watchdog.current) clearTimeout(watchdog.current);
    setUserPos(null);
    setManualProvince("");
    setGeoMeta(null);
    setRadius("all");
    setSelectionMode(null);
    setGeoStatus("idle");
  };

  const locate = () => {
    setSelectionMode(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("unsupported");
      return;
    }
    // Geolocation API güvenli bağlam (https / localhost) gerektirir; LAN IP'de sessizce engellenir.
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setGeoStatus("insecure");
      return;
    }
    setGeoStatus("loading");
    let settled = false;
    const finish = (status: GeoStatus) => {
      if (settled) return;
      settled = true;
      if (watchdog.current) clearTimeout(watchdog.current);
      setGeoStatus(status);
    };
    const onOk = (p: GeolocationPosition) => {
      if (settled) return;
      settled = true;
      if (watchdog.current) clearTimeout(watchdog.current);
      setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude });
      setManualProvince(""); // GPS konumu manuel il seçimini geçersiz kılar
      setGeoMeta({ source: "gps", accuracy: p.coords.accuracy, updatedAt: nowIso() });
      setGeoStatus("granted");
    };
    const fail = (err: GeolocationPositionError) =>
      finish(err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable");
    // Bazı tarayıcı/OS kombinasyonlarında callback hiç dönmeyebilir → bekçi zamanlayıcı.
    watchdog.current = setTimeout(() => finish("timeout"), 25000);
    // Önce hızlı (wifi/IP) düşük doğruluk; izin reddi dışında bir hata olursa
    // yüksek doğrulukla bir kez daha dene (masaüstünde GPS olmadığı için ilk
    // denemede zaman aşımı yaygındır).
    navigator.geolocation.getCurrentPosition(
      onOk,
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          fail(err);
          return;
        }
        navigator.geolocation.getCurrentPosition(onOk, fail, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    );
  };

  // Eski localStorage pinlerini tek seferlik DB'ye taşı (DB'de konumu olmayanlar için).
  const migratedPins = useRef(false);
  useEffect(() => {
    if (migratedPins.current || customers.length === 0) return;
    const pending = customers.filter((c) => c.latitude == null && firmCoords[c.id]);
    if (pending.length === 0) {
      migratedPins.current = true;
      return;
    }
    migratedPins.current = true;
    void Promise.allSettled(
      pending.map((c) => {
        const pin = firmCoords[c.id];
        return companyService.setLocation(c.id, { latitude: pin.lat, longitude: pin.lng, source: "manual" });
      })
    ).then((results) => {
      if (results.some((r) => r.status === "fulfilled")) void refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

  // Haritalanabilir firmalar + (varsa) kullanıcıya mesafe.
  // Konum çözüm sırası: DB koordinatı → yerel manuel pin (eski) → il/ilçe merkezi.
  const mapped = useMemo<MappedFirm[]>(() => {
    return customers
      .map((c) => {
        const dbPos = c.latitude != null && c.longitude != null ? { lat: c.latitude, lng: c.longitude } : null;
        const legacyManualPos = firmCoords[c.id] ?? null;
        const pos = dbPos ?? legacyManualPos ?? coordsForCity(c.city, c.district, c.id);
        if (!pos) return null;
        const distanceKm = userPos ? haversineKm(userPos, pos) : null;
        const locationQuality = dbPos
          ? locationQualityFor(c.locationSource)
          : legacyManualPos
            ? "exact" as const
            : "fallback" as const;
        return { ...c, pos, distanceKm, locationQuality };
      })
      .filter((x): x is MappedFirm => x != null);
  }, [customers, firmCoords, userPos]);

  const unmappedCount = customers.length - mapped.length;
  const firmsWithoutExactPin = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("tr-TR");
    return customers
      .filter((c) => c.latitude == null || c.longitude == null || !isExactLocationSource(c.locationSource))
      .filter((c) => !firmCoords[c.id])
      .filter((c) => firmType === "all" || c.firmType === firmType)
      .filter((c) =>
        !term ||
        c.name.toLocaleLowerCase("tr-TR").includes(term) ||
        (c.city ?? "").toLocaleLowerCase("tr-TR").includes(term) ||
        (c.district ?? "").toLocaleLowerCase("tr-TR").includes(term)
      )
      .sort((a, b) => a.name.localeCompare(b.name, "tr"))
      .slice(0, 12);
  }, [customers, firmCoords, firmType, q]);

  const filtered = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("tr-TR");
    const maxKm = radius === "all" ? Infinity : Number(radius);
    return mapped
      .filter((f) => firmType === "all" || f.firmType === firmType)
      // Firma adıyla arama, seçilmiş yakınlık filtresinden bağımsız olarak tüm
      // kayıtları bulabilmeli. Aksi halde uzaktaki bir firma "yok" görünüyordu.
      .filter((f) => Boolean(term) || f.distanceKm == null || f.distanceKm <= maxKm)
      .filter((f) =>
        !term ||
        f.name.toLocaleLowerCase("tr-TR").includes(term) ||
        (f.city ?? "").toLocaleLowerCase("tr-TR").includes(term) ||
        (f.district ?? "").toLocaleLowerCase("tr-TR").includes(term)
      )
      .sort((a, b) => {
        if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
        return a.name.localeCompare(b.name, "tr");
      });
  }, [mapped, firmType, radius, q]);
  const selectedFirm = selectedId ? mapped.find((firm) => firm.id === selectedId) ?? null : null;

  /**
   * Ziyaret rotası: seçilen firmaları en yakın komşu (nearest-neighbor)
   * sezgiseliyle sıralar; başlangıç kullanıcı konumu (yoksa ilk durak).
   * Basit ama saha satışçısının gün planını hızlandıran pratik bir sıralama.
   */
  const routePlan = useMemo(() => {
    const stops = route.map((id) => mapped.find((f) => f.id === id)).filter((f): f is MappedFirm => f != null);
    if (stops.length === 0) return { ordered: [] as MappedFirm[], totalKm: 0 };
    const remaining = [...stops];
    const ordered: MappedFirm[] = [];
    let cursor: LatLng = userPos ?? remaining[0].pos;
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestKm = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const km = haversineKm(cursor, remaining[i].pos);
        if (km < bestKm) { bestKm = km; bestIdx = i; }
      }
      const [next] = remaining.splice(bestIdx, 1);
      ordered.push(next);
      cursor = next.pos;
    }
    let totalKm = 0;
    let prev: LatLng | null = userPos ?? null;
    for (const stop of ordered) {
      if (prev) totalKm += haversineKm(prev, stop.pos);
      prev = stop.pos;
    }
    return { ordered, totalKm };
  }, [route, mapped, userPos]);

  const openRouteInMaps = () => {
    if (routePlan.ordered.length === 0) return;
    const points: string[] = [];
    if (userPos) points.push(`${userPos.lat},${userPos.lng}`);
    routePlan.ordered.forEach((f) => points.push(`${f.pos.lat},${f.pos.lng}`));
    window.open(`https://www.google.com/maps/dir/${points.join("/")}`, "_blank", "noopener");
  };

  const routeLine = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = [];
    if (userPos) pts.push([userPos.lat, userPos.lng]);
    routePlan.ordered.forEach((f) => pts.push([f.pos.lat, f.pos.lng]));
    return pts;
  }, [routePlan.ordered, userPos]);

  const center: [number, number] = userPos ? [userPos.lat, userPos.lng] : [TURKEY_CENTER.lat, TURKEY_CENTER.lng];
  const focusFirstSearchResult = () => {
    if (!q.trim()) return;
    const first = filtered[0];
    if (first) setFocusedId(first.id);
    else toast.info("Firma bulunamadı", { description: "Firma adı, şehir veya ilçe bilgisini kontrol edin." });
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      {/* Sol panel: kontroller + yakındaki firmalar */}
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <Card className="min-w-0 space-y-2.5 border-border/60 p-3 shadow-sm">
          <form
            className="flex min-w-0 flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              focusFirstSearchResult();
            }}
          >
            <div className="relative min-w-0 flex-1">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Firma adı / şehir ara..."
              className="pl-9 h-9 bg-white"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            </div>
            <Button type="submit" size="sm" className="h-9 w-full shrink-0 sm:w-auto" disabled={!q.trim()}>
              Haritada bul
            </Button>
          </form>
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Select value={firmType} onValueChange={(v) => setFirmType(v as any)}>
              <SelectTrigger className="h-9 min-w-0 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm firmalar</SelectItem>
                <SelectItem value="customer">Müşteri</SelectItem>
                <SelectItem value="supplier_customer">Tedarikçi + Müşteri</SelectItem>
                <SelectItem value="supplier">Tedarikçi</SelectItem>
                <SelectItem value="competitor">Rakip</SelectItem>
              </SelectContent>
            </Select>
            <Select value={radius} onValueChange={(v) => setRadius(v as any)} disabled={!userPos}>
              <SelectTrigger className="h-9 min-w-0 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm mesafe</SelectItem>
                <SelectItem value="50">50 km</SelectItem>
                <SelectItem value="100">100 km</SelectItem>
                <SelectItem value="250">250 km</SelectItem>
                <SelectItem value="500">500 km</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Button variant="outline" size="sm" className="h-9 w-full" onClick={locate} disabled={geoStatus === "loading"}>
              <LocateFixed className={`size-4 ${geoStatus === "loading" ? "animate-pulse" : ""}`} />
              {geoStatus === "loading" ? "Konum alınıyor…" : userPos && geoMeta?.source === "gps" ? "Konumumu yenile" : "GPS ile bul"}
            </Button>
            <Button
              variant={selectionMode?.type === "user" ? "secondary" : "outline"}
              size="sm"
              className="h-9 w-full"
              onClick={() => setSelectionMode(selectionMode?.type === "user" ? null : { type: "user" })}
            >
              {selectionMode?.type === "user" ? <X className="size-4" /> : <Crosshair className="size-4" />}
              {selectionMode?.type === "user" ? "Seçimi iptal" : "Haritadan seç"}
            </Button>
          </div>
          <Select value={manualProvince} onValueChange={selectProvince}>
            <SelectTrigger className="h-9"><SelectValue placeholder="veya ilinizi seçin (konumum)" /></SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {PROVINCE_NAMES.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {GEO_MESSAGES[geoStatus] && (
            <div className={`rounded-md border px-3 py-2 text-[11px] leading-relaxed ${
              geoStatus === "denied" || geoStatus === "timeout" || geoStatus === "unavailable" || geoStatus === "insecure"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-blue-100 bg-blue-50 text-blue-700"
            }`}>
              {GEO_MESSAGES[geoStatus]}
            </div>
          )}
          {selectionMode?.type === "user" && (
            <p className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-[11px] leading-relaxed text-primary">
              Haritada kendi konumunuzu temsil eden noktaya tıklayın.
            </p>
          )}
          {geoMeta && userPos && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Konum: <b className="text-foreground">{manualProvince || sourceLabel(geoMeta.source)}</b>
              {geoMeta.source === "province" && " · yaklaşık il merkezi"}
              {geoMeta.accuracy ? ` · ${formatAccuracy(geoMeta.accuracy)}` : ""}
            </p>
          )}
          {userPos && (
            <Button type="button" variant="ghost" size="sm" className="h-8 w-full text-muted-foreground" onClick={clearUserLocation}>
              <X className="size-4" /> Konumu temizle
            </Button>
          )}
        </Card>

        <div className="text-[11px] text-muted-foreground px-0.5">
          {userPos ? <><b className="text-foreground">{filtered.length}</b> firma yakınlık sırasıyla</> : <><b className="text-foreground">{filtered.length}</b> firma haritada</>}
          <span> · toplam {customers.length} firma</span>
          {unmappedCount > 0 && <span> · {unmappedCount} firma konumsuz</span>}
        </div>

        {selectedFirm && (
          <Card className="relative overflow-hidden border-primary/25 bg-primary/[0.035] p-3 shadow-sm">
            <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
            <div className="flex items-start gap-3 pl-1">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-sm" style={{ backgroundColor: FIRM_TYPE_COLOR[selectedFirm.firmType] }}>
                <Building2 className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-data text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">Haritada seçili</div>
                <div className="mt-0.5 truncate text-sm font-semibold">{selectedFirm.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{FIRM_TYPE_LABEL[selectedFirm.firmType]}</span>
                  <span>·</span>
                  <span>{[selectedFirm.district, selectedFirm.city].filter(Boolean).join(", ") || "Konum bilgisi yok"}</span>
                  {selectedFirm.distanceKm != null && <><span>·</span><span className="font-medium tabular-nums text-foreground">{selectedFirm.distanceKm.toFixed(0)} km</span></>}
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Firma seçimini kaldır" onClick={() => setSelectedId(null)}>
                <X className="size-4" />
              </Button>
            </div>
          </Card>
        )}

        {routePlan.ordered.length > 0 && (
          <Card className="border-primary/30 bg-primary/[0.03] p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <RouteIcon className="size-4 text-primary" /> Ziyaret rotası
                <span className="chip chip-info">{routePlan.ordered.length} durak</span>
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setRoute([])}>
                <X className="size-3.5" /> Temizle
              </Button>
            </div>
            <ol className="mt-2 space-y-1">
              {routePlan.ordered.map((f, i) => (
                <li key={f.id} className="flex items-center gap-2 text-[13px]">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{i + 1}</span>
                  <button type="button" className="min-w-0 flex-1 truncate text-left hover:text-primary" onClick={() => { setSelectedId(f.id); setFocusedId(f.id); }}>
                    {f.name}
                  </button>
                  <button type="button" aria-label="Rotadan çıkar" className="text-muted-foreground hover:text-destructive" onClick={() => toggleRouteStop(f.id)}>
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ol>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                {userPos ? <>Konumunuzdan toplam ~<b className="tabular-nums text-foreground">{routePlan.totalKm.toFixed(0)} km</b></> : "Toplam mesafe için kendi konumunuzu ayarlayın"}
              </span>
              <Button type="button" size="sm" className="h-8 gap-1" onClick={openRouteInMaps}>
                <Navigation className="size-4" /> Haritada aç
              </Button>
            </div>
          </Card>
        )}

        <Card className="border-border/60 shadow-sm overflow-hidden flex-1 min-h-[200px]">
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/60">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Bu filtreye uyan haritalanabilir firma yok.</div>
            ) : (
              filtered.map((f) => (
                <div
                  key={f.id}
                  className={`flex w-full items-center gap-2 border-l-2 px-3 py-2.5 text-left transition-colors ${selectedId === f.id ? "border-l-primary bg-primary/[0.06]" : selectionMode?.type === "firm" && selectionMode.customerId === f.id ? "border-l-primary/40 bg-primary/10" : "border-l-transparent hover:bg-muted/50"}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(f.id);
                      setFocusedId(f.id);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-md text-white"
                      style={{ backgroundColor: FIRM_TYPE_COLOR[f.firmType] }}
                    >
                      <Building2 className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm leading-tight">{f.name}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MapPin className="size-3" />{[f.district, f.city].filter(Boolean).join(", ") || "—"}
                      </span>
                      <span className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] ${locationBadge(f.locationQuality).className}`}>
                        {locationBadge(f.locationQuality).label}
                      </span>
                    </span>
                    {f.distanceKm != null && (
                      <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{f.distanceKm.toFixed(0)} km</span>
                    )}
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant={route.includes(f.id) ? "secondary" : "ghost"}
                      size="icon"
                      className="size-8"
                      aria-label={route.includes(f.id) ? `${f.name} rotadan çıkar` : `${f.name} rotaya ekle`}
                      title={route.includes(f.id) ? "Rotadan çıkar" : "Rotaya ekle"}
                      onClick={() => toggleRouteStop(f.id)}
                    >
                      {route.includes(f.id) ? <Check className="size-4 text-primary" /> : <Plus className="size-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant={selectionMode?.type === "firm" && selectionMode.customerId === f.id ? "secondary" : "ghost"}
                      size="icon"
                      className="size-8"
                      aria-label={`${f.name} pin düzelt`}
                      title="Pin düzelt"
                      onClick={() => setSelectionMode(selectionMode?.type === "firm" && selectionMode.customerId === f.id ? null : { type: "firm", customerId: f.id })}
                    >
                      <Crosshair className="size-4" />
                    </Button>
                    {f.locationQuality === "exact" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`${f.name} pini sıfırla`}
                        title="Yaklaşık konuma dön"
                        onClick={() => resetFirmPin(f.id)}
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {firmsWithoutExactPin.length > 0 && (
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <div className="border-b border-border/60 px-3 py-2">
              <div className="text-sm font-medium">Doğrulanmış tam pini olmayan firmalar</div>
              <div className="text-[11px] text-muted-foreground">OSM sonuçları doğruluk seviyesine göre kaydedilir; ilçe merkezi tam pin sayılmaz.</div>
            </div>
            <div className="max-h-[42vh] overflow-y-auto divide-y divide-border/60">
              {firmsWithoutExactPin.map((customer) => (
                <div key={customer.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{customer.name}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {[customer.district, customer.city].filter(Boolean).join(", ") || "Adres bilgisi yok"}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0"
                      onClick={() => setOsmSearchFirmId((current) => (current === customer.id ? null : customer.id))}
                    >
                      {osmSearchFirmId === customer.id ? "Kapat" : "OSM'de ara"}
                    </Button>
                  </div>
                  {osmSearchFirmId === customer.id && (
                    <OsmCompanySearch
                      className="mt-3"
                      query={customer.name}
                      address={customer.address}
                      city={customer.city}
                      district={customer.district}
                      country={customer.country}
                      buttonLabel="Ara"
                      onSelect={(result) => applyOsmLocation(customer, result)}
                      onManualPick={() => {
                        setFocusedId(customer.id);
                        setSelectionMode({ type: "firm", customerId: customer.id });
                        setOsmSearchFirmId(null);
                        toast.message("Haritada firma noktasını seçin", {
                          description: "Doğru noktaya tıklayınca koordinat firmaya kalıcı yazılır.",
                        });
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Sağ panel: harita */}
      <Card className="border-border/60 shadow-sm overflow-hidden p-0">
        <div className="relative h-[72vh] min-h-[480px] w-full">
          {tileLoadFailed && (
            <div className="absolute inset-x-3 top-3 z-[600] rounded-md border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs text-amber-800 shadow-lg backdrop-blur">
              Harita zemini yüklenemedi. Firma pinleri çalışmaya devam eder; ağ güvenlik grubunda ve tarayıcıda
              <b> tile.openstreetmap.org</b> HTTPS erişimini kontrol edin.
            </div>
          )}
          {selectionMode && (
            <div className="absolute left-3 top-3 z-[500] max-w-[320px] rounded-md border border-primary/20 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
              <div className="font-medium text-primary">
                {selectionMode.type === "user" ? "Kendi konumunuzu seçin" : "Firma pinini düzeltin"}
              </div>
              <div className="mt-0.5 text-muted-foreground">
                {selectionMode.type === "user"
                  ? "Haritada doğru noktaya tıklayın. Kendi konumunuz yalnızca bu tarayıcıda saklanır."
                  : "Haritada doğru noktaya tıklayın. Firma pini kalıcı olarak kaydedilir ve herkes görür."}
              </div>
            </div>
          )}
          <MapContainer center={center} zoom={userPos ? 9 : 6} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              // OSM'nin resmi tek-host tile adresi a/b/c alt alanlarına göre AWS,
              // kurumsal DNS ve CSP ortamlarında daha güvenilir çalışır.
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              eventHandlers={{
                load: () => setTileLoadFailed(false),
                tileerror: () => setTileLoadFailed(true),
              }}
            />
            <MapSelectionHandler mode={selectionMode} onPick={handleMapPick} />
            <RecenterOnUser user={userPos} />
            {routeLine.length >= 2 && (
              <Polyline positions={routeLine} pathOptions={{ color: "#000c69", weight: 3, opacity: 0.7, dashArray: "6 8" }} />
            )}
            {userPos && (
              <Marker position={[userPos.lat, userPos.lng]} icon={userIcon}>
                <Popup>
                  {geoMeta?.source === "province" && manualProvince
                    ? `${manualProvince} (yaklaşık il merkezi)`
                    : geoMeta?.source === "manual_pin"
                    ? "Haritadan seçilen konum"
                    : `Buradasınız${geoMeta?.accuracy ? ` · ${formatAccuracy(geoMeta.accuracy)}` : ""}`}
                </Popup>
              </Marker>
            )}
            {filtered.map((f) => (
              <FirmMarker
                key={f.id}
                firm={f}
                focused={focusedId === f.id}
                selected={selectedId === f.id}
                onOpened={() => setFocusedId(null)}
                onSelect={(id) => setSelectedId(id)}
                onEditPin={(id) => setSelectionMode({ type: "firm", customerId: id })}
                onResetPin={resetFirmPin}
              />
            ))}
          </MapContainer>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: FIRM_TYPE_COLOR.customer }} /> Müşteri</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: FIRM_TYPE_COLOR.supplier_customer }} /> Ted.+Müşteri</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: FIRM_TYPE_COLOR.supplier }} /> Tedarikçi</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: FIRM_TYPE_COLOR.competitor }} /> Rakip</span>
          <span className="ml-auto inline-flex items-center gap-1"><AlertCircle className="size-3" /> Yalnızca doğrulanmış bina/firma sonuçları tam pin sayılır</span>
        </div>
      </Card>
    </div>
  );
}
