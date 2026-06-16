import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { Search, LocateFixed, Navigation, Phone, Building2, MapPin, AlertCircle, Crosshair, X, RotateCcw } from "lucide-react";
import { Customer, FirmType } from "../../lib/mock";
import { useStore } from "../../lib/store";
import { coordsForCity, haversineKm, openDirections, centroidForProvince, PROVINCE_NAMES, TURKEY_CENTER, type LatLng } from "../../lib/geo";
import { usePersistentState } from "../../lib/persist";

const FIRM_TYPE_LABEL: Record<FirmType, string> = {
  customer: "Müşteri",
  supplier_customer: "Tedarikçi + Müşteri",
  supplier: "Tedarikçi",
};

// Firma tipine göre pin rengi (haritada hızlı ayırt etmek için).
const FIRM_TYPE_COLOR: Record<FirmType, string> = {
  customer: "#2563eb",
  supplier_customer: "#7c3aed",
  supplier: "#d97706",
};

type GeoMeta = { source: "gps" | "province" | "manual_pin"; accuracy?: number; updatedAt: string };
type FirmLocationOverrides = Record<string, LatLng>;
type SelectionMode = null | { type: "user" } | { type: "firm"; customerId: string };
type MappedFirm = Customer & { pos: LatLng; distanceKm: number | null; locationSource: "override" | "approx" };

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
const pinIcon = (color: string) =>
  L.divIcon({
    className: "",
    html: `<span style="display:block;width:22px;height:22px;transform:rotate(45deg);border-radius:50% 50% 50% 0;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
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
  onOpened,
  onEditPin,
  onResetPin,
}: {
  firm: MappedFirm;
  focused: boolean;
  onOpened: () => void;
  onEditPin: (id: string) => void;
  onResetPin: (id: string) => void;
}) {
  const ref = useRef<L.Marker>(null);
  const map = useMap();
  useEffect(() => {
    if (focused && ref.current) {
      map.flyTo([firm.pos.lat, firm.pos.lng], Math.max(map.getZoom(), 10), { duration: 0.6 });
      ref.current.openPopup();
      onOpened();
    }
  }, [focused, firm.pos.lat, firm.pos.lng, map, onOpened]);

  return (
    <Marker ref={ref} position={[firm.pos.lat, firm.pos.lng]} icon={pinIcon(FIRM_TYPE_COLOR[firm.firmType])}>
      <Popup>
        <div className="min-w-[180px] space-y-1.5">
          <div className="font-semibold leading-tight">{firm.name}</div>
          <div className="text-xs text-muted-foreground">
            {FIRM_TYPE_LABEL[firm.firmType]} · {[firm.district, firm.city].filter(Boolean).join(", ") || "—"}
          </div>
          <div className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${firm.locationSource === "override" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {firm.locationSource === "override" ? "Tam pin" : "Şehir/ilçe yaklaşık"}
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
            {firm.locationSource === "override" && (
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
  const { customers } = useStore();
  const [q, setQ] = usePersistentState("salesmap.q", "");
  const [firmType, setFirmType] = usePersistentState<"all" | FirmType>("salesmap.firmType", "all");
  const [radius, setRadius] = usePersistentState<"all" | "50" | "100" | "250" | "500">("salesmap.radius", "all");
  const [userPos, setUserPos] = usePersistentState<LatLng | null>("salesmap.userPos", null);
  const [manualProvince, setManualProvince] = usePersistentState<string>("salesmap.province", "");
  const [geoMeta, setGeoMeta] = usePersistentState<GeoMeta | null>("salesmap.geoMeta", null);
  const [firmCoords, setFirmCoords] = usePersistentState<FirmLocationOverrides>("salesmap.firmCoords", {});
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setFirmCoords((current) => ({ ...current, [selectionMode.customerId]: pos }));
    setFocusedId(selectionMode.customerId);
    setSelectionMode(null);
  };

  const resetFirmPin = (customerId: string) => {
    setFirmCoords((current) => {
      const next = { ...current };
      delete next[customerId];
      return next;
    });
    setFocusedId(customerId);
    setSelectionMode(null);
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

  // Haritalanabilir firmalar + (varsa) kullanıcıya mesafe.
  const mapped = useMemo<MappedFirm[]>(() => {
    return customers
      .map((c) => {
        const override = firmCoords[c.id];
        const pos = override ?? coordsForCity(c.city, c.district, c.id);
        if (!pos) return null;
        const distanceKm = userPos ? haversineKm(userPos, pos) : null;
        return { ...c, pos, distanceKm, locationSource: override ? "override" as const : "approx" as const };
      })
      .filter((x): x is MappedFirm => x != null);
  }, [customers, firmCoords, userPos]);

  const unmappedCount = customers.length - mapped.length;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const maxKm = radius === "all" ? Infinity : Number(radius);
    return mapped
      .filter((f) => firmType === "all" || f.firmType === firmType)
      .filter((f) => f.distanceKm == null || f.distanceKm <= maxKm)
      .filter((f) =>
        !term ||
        f.name.toLowerCase().includes(term) ||
        (f.city ?? "").toLowerCase().includes(term) ||
        (f.district ?? "").toLowerCase().includes(term)
      )
      .sort((a, b) => {
        if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
        return a.name.localeCompare(b.name, "tr");
      });
  }, [mapped, firmType, radius, q]);

  const center: [number, number] = userPos ? [userPos.lat, userPos.lng] : [TURKEY_CENTER.lat, TURKEY_CENTER.lng];

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      {/* Sol panel: kontroller + yakındaki firmalar */}
      <div className="flex flex-col gap-3 min-h-0">
        <Card className="border-border/60 p-3 space-y-2.5 shadow-sm">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Firma / şehir ara..."
              className="pl-9 h-9 bg-white"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Select value={firmType} onValueChange={(v) => setFirmType(v as any)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm firmalar</SelectItem>
                <SelectItem value="customer">Müşteri</SelectItem>
                <SelectItem value="supplier_customer">Tedarikçi + Müşteri</SelectItem>
                <SelectItem value="supplier">Tedarikçi</SelectItem>
              </SelectContent>
            </Select>
            <Select value={radius} onValueChange={(v) => setRadius(v as any)} disabled={!userPos}>
              <SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
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
          {unmappedCount > 0 && <span> · {unmappedCount} firma konumsuz</span>}
        </div>

        <Card className="border-border/60 shadow-sm overflow-hidden flex-1 min-h-[200px]">
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/60">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Bu filtreye uyan haritalanabilir firma yok.</div>
            ) : (
              filtered.map((f) => (
                <div
                  key={f.id}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors ${selectionMode?.type === "firm" && selectionMode.customerId === f.id ? "bg-primary/10" : "hover:bg-muted/50"}`}
                >
                  <button
                    type="button"
                    onClick={() => setFocusedId(f.id)}
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
                      <span className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] ${f.locationSource === "override" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {f.locationSource === "override" ? "Tam pin" : "Şehir/ilçe yaklaşık"}
                      </span>
                    </span>
                    {f.distanceKm != null && (
                      <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{f.distanceKm.toFixed(0)} km</span>
                    )}
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
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
                    {f.locationSource === "override" && (
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
      </div>

      {/* Sağ panel: harita */}
      <Card className="border-border/60 shadow-sm overflow-hidden p-0">
        <div className="relative h-[72vh] min-h-[480px] w-full">
          {selectionMode && (
            <div className="absolute left-3 top-3 z-[500] max-w-[320px] rounded-md border border-primary/20 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
              <div className="font-medium text-primary">
                {selectionMode.type === "user" ? "Kendi konumunuzu seçin" : "Firma pinini düzeltin"}
              </div>
              <div className="mt-0.5 text-muted-foreground">
                Haritada doğru noktaya tıklayın. İşlem yalnızca bu tarayıcıda kaydedilir.
              </div>
            </div>
          )}
          <MapContainer center={center} zoom={userPos ? 9 : 6} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapSelectionHandler mode={selectionMode} onPick={handleMapPick} />
            <RecenterOnUser user={userPos} />
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
                onOpened={() => setFocusedId(null)}
                onEditPin={(id) => setSelectionMode({ type: "firm", customerId: id })}
                onResetPin={resetFirmPin}
              />
            ))}
          </MapContainer>
        </div>
        <div className="flex items-center gap-3 border-t border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: FIRM_TYPE_COLOR.customer }} /> Müşteri</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: FIRM_TYPE_COLOR.supplier_customer }} /> Ted.+Müşteri</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: FIRM_TYPE_COLOR.supplier }} /> Tedarikçi</span>
          <span className="ml-auto inline-flex items-center gap-1"><AlertCircle className="size-3" /> Tam pinler yerelde saklanır; diğerleri şehir/ilçe yaklaşıktır</span>
        </div>
      </Card>
    </div>
  );
}
