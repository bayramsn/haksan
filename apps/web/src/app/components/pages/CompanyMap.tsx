import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Search, MapPin, Navigation, Building2, LocateFixed } from "lucide-react";
import type { Customer } from "../../lib/mock";
import { useExplicitFullCompanyDirectory } from "../../lib/companyServerData";

/**
 * Türkiye il merkez koordinatları (yaklaşık). Firma `city` alanına göre haritaya
 * konumlandırmak için kullanılır. Eşleşme yoksa Türkiye merkezine düşülür.
 */
const PROVINCE_COORDS: Record<string, [number, number]> = {
  adana: [37.0, 35.321], adiyaman: [37.764, 38.276], afyonkarahisar: [38.756, 30.538], agri: [39.719, 43.051],
  aksaray: [38.368, 34.037], amasya: [40.65, 35.833], ankara: [39.933, 32.859], antalya: [36.897, 30.713],
  ardahan: [41.111, 42.702], artvin: [41.183, 41.819], aydin: [37.848, 27.845], balikesir: [39.649, 27.886],
  bartin: [41.638, 32.337], batman: [37.881, 41.135], bayburt: [40.255, 40.224], bilecik: [40.142, 29.979],
  bingol: [38.885, 40.498], bitlis: [38.401, 42.108], bolu: [40.576, 31.578], burdur: [37.72, 30.29],
  bursa: [40.188, 29.06], canakkale: [40.155, 26.414], cankiri: [40.601, 33.616], corum: [40.55, 34.953],
  denizli: [37.776, 29.086], diyarbakir: [37.914, 40.23], duzce: [40.844, 31.156], edirne: [41.677, 26.555],
  elazig: [38.68, 39.226], erzincan: [39.75, 39.5], erzurum: [39.904, 41.27], eskisehir: [39.766, 30.526],
  gaziantep: [37.066, 37.378], giresun: [40.912, 38.39], gumushane: [40.46, 39.481], hakkari: [37.575, 43.74],
  hatay: [36.4, 36.349], igdir: [39.92, 44.045], isparta: [37.764, 30.553], istanbul: [41.008, 28.978],
  izmir: [38.423, 27.142], kahramanmaras: [37.575, 36.937], karabuk: [41.204, 32.627], karaman: [37.181, 33.215],
  kars: [40.602, 43.097], kastamonu: [41.388, 33.782], kayseri: [38.731, 35.478], kilis: [36.718, 37.121],
  kirikkale: [39.846, 33.515], kirklareli: [41.735, 27.225], kirsehir: [39.146, 34.164], kocaeli: [40.853, 29.881],
  konya: [37.871, 32.485], kutahya: [39.42, 29.985], malatya: [38.355, 38.309], manisa: [38.619, 27.429],
  mardin: [37.312, 40.735], mersin: [36.812, 34.641], mugla: [37.215, 28.363], mus: [38.746, 41.751],
  nevsehir: [38.624, 34.714], nigde: [37.966, 34.679], ordu: [40.984, 37.879], osmaniye: [37.075, 36.247],
  rize: [41.025, 40.518], sakarya: [40.756, 30.378], samsun: [41.286, 36.33], sanliurfa: [37.168, 38.793],
  siirt: [37.929, 41.94], sinop: [42.026, 35.153], sivas: [39.747, 37.017], sirnak: [37.519, 42.455],
  tekirdag: [40.978, 27.511], tokat: [40.314, 36.554], trabzon: [41.0, 39.717], tunceli: [39.107, 39.548],
  usak: [38.674, 29.405], van: [38.494, 43.38], yalova: [40.655, 29.276], yozgat: [39.82, 34.808],
  zonguldak: [41.456, 31.799],
};

const normalizeCity = (city?: string) =>
  (city ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/i̇/g, "i")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z]/g, "")
    .trim();

const TURKEY_CENTER: [number, number] = [39.0, 35.0];

const coordsForCity = (city?: string): [number, number] | null => PROVINCE_COORDS[normalizeCity(city)] ?? null;

/** Haversine km. */
const distanceKm = (a: [number, number], b: [number, number]) => {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

/** Leaflet'i CDN'den bir kez yükler. */
function useLeaflet() {
  const [ready, setReady] = useState<boolean>(() => typeof window !== "undefined" && !!(window as any).L);
  useEffect(() => {
    if ((window as any).L) {
      setReady(true);
      return;
    }
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    let script = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.src = LEAFLET_JS;
      script.async = true;
      document.body.appendChild(script);
    }
    const onLoad = () => setReady(true);
    script.addEventListener("load", onLoad);
    if ((window as any).L) setReady(true);
    return () => script?.removeEventListener("load", onLoad);
  }, []);
  return ready;
}

type Placed = { customer: Customer; coord: [number, number]; distance?: number };

export function CompanyMapPage() {
  const companyDirectoryQuery = useExplicitFullCompanyDirectory("company-map");
  const customers = companyDirectoryQuery.data ?? [];
  const leafletReady = useLeaflet();
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [geoError, setGeoError] = useState<string>("");
  const [q, setQ] = useState("");

  // Konumu olan firmalar (küçük bir dağıtma jitter'ı ile üst üste binmeyi azalt)
  const placed = useMemo<Placed[]>(() => {
    const seen = new Map<string, number>();
    return customers
      .map((c) => {
        const base = coordsForCity(c.city);
        if (!base) return null;
        const n = seen.get(c.city) ?? 0;
        seen.set(c.city, n + 1);
        const jitter = n === 0 ? 0 : 0.02 * Math.ceil(n / 2) * (n % 2 === 0 ? 1 : -1);
        const coord: [number, number] = [base[0] + jitter, base[1] + jitter];
        return { customer: c, coord };
      })
      .filter(Boolean) as Placed[];
  }, [customers]);

  const filtered = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("tr-TR");
    const list = !t
      ? placed
      : placed.filter((p) => p.customer.name.toLocaleLowerCase("tr-TR").includes(t) || (p.customer.city ?? "").toLocaleLowerCase("tr-TR").includes(t));
    if (userPos) {
      return [...list]
        .map((p) => ({ ...p, distance: distanceKm(userPos, p.coord) }))
        .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    }
    return list;
  }, [placed, q, userPos]);

  const locateMe = () => {
    if (!navigator.geolocation) {
      setGeoError("Tarayıcı konum desteği yok.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoError("");
        setUserPos([pos.coords.latitude, pos.coords.longitude]);
      },
      () => setGeoError("Konum alınamadı (izin verilmedi)."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Harita kurulumu
  useEffect(() => {
    if (!leafletReady || !mapElRef.current || mapRef.current) return;
    const L = (window as any).L;
    const map = L.map(mapElRef.current).setView(TURKEY_CENTER, 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
  }, [leafletReady]);

  // Marker güncelle
  useEffect(() => {
    if (!leafletReady || !mapRef.current || !layerRef.current) return;
    const L = (window as any).L;
    layerRef.current.clearLayers();
    filtered.forEach((p) => {
      const marker = L.marker(p.coord).addTo(layerRef.current);
      const addr = [p.customer.address, p.customer.district, p.customer.city].filter(Boolean).join(" ");
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr || p.customer.name)}`;
      const popup = document.createElement("div");
      popup.style.minWidth = "160px";
      const title = document.createElement("b");
      title.textContent = p.customer.name;
      const location = document.createElement("div");
      location.textContent = `${p.customer.city ?? ""}${p.distance != null ? ` · ${p.distance.toFixed(0)} km` : ""}`;
      const directions = document.createElement("a");
      directions.href = mapsUrl;
      directions.target = "_blank";
      directions.rel = "noopener noreferrer";
      directions.textContent = "Yol tarifi";
      popup.append(title, location, directions);
      marker.bindPopup(popup);
    });
    if (userPos) {
      const L2 = (window as any).L;
      const me = L2.circleMarker(userPos, { radius: 8, color: "#000c69", fillColor: "#000c69", fillOpacity: 0.9 }).addTo(layerRef.current);
      me.bindPopup("Buradasınız");
      mapRef.current.setView(userPos, 9);
    }
  }, [filtered, leafletReady, userPos]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Firma / şehir ara..." className="pl-9 h-9 bg-white" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 justify-center" onClick={locateMe}>
          <LocateFixed className="size-4" /> Konumumu bul · yakındakiler
        </Button>
      </div>

      {geoError && <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{geoError}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <Card className="border-border/60 shadow-sm overflow-hidden">
          <div ref={mapElRef} className="h-[60vh] min-h-[360px] w-full bg-muted/30" />
          {!leafletReady && (
            <div className="px-4 py-3 text-xs text-muted-foreground">Harita yükleniyor…</div>
          )}
        </Card>

        <Card className="border-border/60 shadow-sm overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="tracking-tight flex items-center gap-2 text-base">
              <MapPin className="size-4 text-primary" /> {userPos ? "Yakındaki Firmalar" : "Firmalar"}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{filtered.length} firma haritada</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[52vh] overflow-y-auto divide-y divide-border/60">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Konumlandırılabilir firma yok.
                </div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.customer.id}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50 flex items-center gap-2.5"
                    onClick={() => {
                      if (mapRef.current) mapRef.current.setView(p.coord, 11);
                    }}
                  >
                    <div className="size-8 rounded-md bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center shrink-0">
                      <Building2 className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-tight truncate">{p.customer.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{p.customer.city}</div>
                    </div>
                    {p.distance != null && (
                      <span className="text-[11px] tabular-nums text-muted-foreground flex items-center gap-0.5 shrink-0">
                        <Navigation className="size-3" /> {p.distance.toFixed(0)} km
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
