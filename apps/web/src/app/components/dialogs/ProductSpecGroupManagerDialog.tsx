import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Pencil, Plus, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { adminService } from "../../../lib/services";
import { useAuth } from "../../../lib/auth";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { MultiSelect } from "../ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";

type SpecGroupRow = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  divisionId?: string | null;
  productTypeIds?: string[];
  isActive?: boolean;
};

type ProductTypeRow = {
  id: string;
  code: string;
  name: string;
  divisionId?: string | null;
  isActive?: boolean;
};

type GroupForm = {
  name: string;
  description: string;
  code: string;
  divisionId: string;
  productTypeIds: string[];
  isActive: boolean;
};

const emptyForm: GroupForm = {
  name: "",
  description: "",
  code: "",
  divisionId: "",
  productTypeIds: [],
  isActive: true,
};

function foldCode(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "");
}

export function ProductSpecGroupManagerDialog({
  divisionId,
  productTypeCode,
  productTypeLabel,
  onGroupsChange,
}: {
  divisionId?: string;
  productTypeCode: string;
  productTypeLabel: string;
  onGroupsChange?: (groups: SpecGroupRow[]) => void;
}) {
  const { hasRole, user } = useAuth();
  const canManage = hasRole("super_admin");
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<SpecGroupRow[]>([]);
  const [productTypes, setProductTypes] = useState<ProductTypeRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<GroupForm>(emptyForm);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const divisions = user?.divisions ?? [];
  const selectedProductTypeId = useMemo(
    () => productTypes.find((row) => foldCode(row.code) === foldCode(productTypeCode))?.id,
    [productTypeCode, productTypes]
  );
  const availableProductTypes = useMemo(
    () =>
      productTypes.filter(
        (row) =>
          row.isActive !== false &&
          (form.divisionId ? !row.divisionId || row.divisionId === form.divisionId : !row.divisionId)
      ),
    [form.divisionId, productTypes]
  );
  const availableProductTypeIds = useMemo(
    () => new Set(availableProductTypes.map((row) => row.id)),
    [availableProductTypes]
  );
  const visibleGroups = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("tr-TR");
    return [...groups]
      .filter((group) =>
        search
          ? [group.name, group.code, group.description ?? ""].some((value) =>
              value.toLocaleLowerCase("tr-TR").includes(search)
            )
          : true
      )
      .sort((left, right) => {
        const leftAssigned = selectedProductTypeId
          ? (left.productTypeIds ?? []).includes(selectedProductTypeId)
          : false;
        const rightAssigned = selectedProductTypeId
          ? (right.productTypeIds ?? []).includes(selectedProductTypeId)
          : false;
        if (leftAssigned !== rightAssigned) return leftAssigned ? -1 : 1;
        return left.name.localeCompare(right.name, "tr-TR");
      });
  }, [groups, query, selectedProductTypeId]);

  const openRow = (row: SpecGroupRow) => {
    setSelectedId(row.id);
    setForm({
      name: row.name,
      description: row.description ?? "",
      code: row.code,
      divisionId: row.divisionId ?? "",
      productTypeIds: row.productTypeIds ?? [],
      isActive: row.isActive !== false,
    });
  };

  const openNew = () => {
    setSelectedId("new");
    setForm({
      ...emptyForm,
      divisionId: divisionId ?? "",
      productTypeIds: selectedProductTypeId ? [selectedProductTypeId] : [],
    });
  };

  const load = async (keepSelectedId?: string | "new" | null) => {
    setLoading(true);
    try {
      const params = divisionId ? { divisionId } : undefined;
      const [nextGroups, nextProductTypes] = await Promise.all([
        adminService.lookupRows("product-spec-groups", params),
        // Bölüm değiştirilebildiği için ürün tiplerinin tamamını al; formda ilgili
        // bölüm + ortak kayıtlarla sınırla.
        adminService.lookupRows("product-types"),
      ]);
      const normalizedGroups = (nextGroups ?? []) as SpecGroupRow[];
      const normalizedTypes = (nextProductTypes ?? []) as ProductTypeRow[];
      setGroups(normalizedGroups);
      setProductTypes(normalizedTypes);
      onGroupsChange?.(normalizedGroups);

      const targetId = keepSelectedId && keepSelectedId !== "new" ? keepSelectedId : selectedId;
      const target = targetId && targetId !== "new"
        ? normalizedGroups.find((row) => row.id === targetId)
        : normalizedGroups.find((row) =>
            normalizedTypes
              .filter((type) => foldCode(type.code) === foldCode(productTypeCode))
              .some((type) => (row.productTypeIds ?? []).includes(type.id))
          ) ?? normalizedGroups[0];
      if (target) openRow(target);
      else openNew();
    } catch (error: any) {
      toast.error("Teknik bilgi grupları yüklenemedi", {
        description: error?.message ?? "API isteği başarısız oldu.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !canManage) return;
    setQuery("");
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canManage, divisionId, productTypeCode]);

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("Grup adı zorunludur");
      return;
    }
    setSaving(true);
    try {
      let saved: SpecGroupRow;
      if (selectedId === "new") {
        saved = await adminService.createLookup("product-spec-groups", {
          name,
          description: form.description.trim(),
          divisionId: form.divisionId || null,
          productTypeIds: form.productTypeIds,
          isActive: form.isActive,
        });
        toast.success("Teknik bilgi grubu eklendi");
      } else if (selectedId) {
        saved = await adminService.updateLookup("product-spec-groups", selectedId, {
          name,
          description: form.description.trim(),
          divisionId: form.divisionId || null,
          productTypeIds: form.productTypeIds,
          isActive: form.isActive,
        });
        toast.success("Teknik bilgi grubu güncellendi");
      } else {
        return;
      }
      await load(saved.id);
    } catch (error: any) {
      toast.error("Teknik bilgi grubu kaydedilemedi", {
        description: error?.message ?? "API isteği başarısız oldu.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!canManage || !productTypeCode) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5"
          aria-label="Teknik bilgi gruplarını düzenle"
        >
          <Pencil className="size-3.5" />
          Grupları düzenle
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] w-[95vw] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Teknik Bilgi Grupları</DialogTitle>
          <DialogDescription>
            {productTypeLabel} için grup adlarını, açıklamalarını ve ürün tipi bağlantılarını ürün kaydını kapatmadan düzenleyin.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 overflow-hidden rounded-lg border border-border/70 bg-white md:min-h-[470px] md:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="border-b border-border/70 bg-muted/15 md:border-b-0 md:border-r">
            <div className="space-y-2 border-b border-border/60 p-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Grup ara..."
                  className="h-8 bg-white pl-8 text-xs"
                />
              </div>
              <Button type="button" variant="outline" size="sm" className="h-8 w-full gap-1.5" onClick={openNew}>
                <Plus className="size-3.5" />
                Yeni grup
              </Button>
            </div>
            <div className="max-h-[360px] space-y-1 overflow-y-auto p-2 md:max-h-[520px]">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Gruplar yükleniyor...
                </div>
              )}
              {!loading &&
                visibleGroups.map((group) => {
                  const assigned =
                    selectedProductTypeId && (group.productTypeIds ?? []).includes(selectedProductTypeId);
                  const appliesToAll = !(group.productTypeIds ?? []).length;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => openRow(group)}
                      className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
                        selectedId === group.id
                          ? "border-primary/30 bg-primary/5"
                          : "border-transparent hover:border-border/60 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate text-xs font-medium">{group.name}</span>
                        {selectedId === group.id && <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {assigned && <Badge className="px-1.5 py-0 text-[9px]">Bu tipe bağlı</Badge>}
                        {appliesToAll && (
                          <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                            Tüm tipler
                          </Badge>
                        )}
                        {group.isActive === false && (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">
                            Pasif
                          </Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              {!loading && !visibleGroups.length && (
                <div className="px-3 py-10 text-center text-xs text-muted-foreground">
                  Bu kapsamda teknik bilgi grubu yok.
                </div>
              )}
            </div>
          </aside>

          <section className="p-4">
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary/15 bg-primary/[0.035] p-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <SlidersHorizontal className="size-4" />
              </span>
              <div>
                <div className="text-xs font-semibold">
                  {selectedId === "new" ? "Yeni teknik bilgi grubu" : "Grup ayarları"}
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  Ürün tipi bağlantısı boş bırakılırsa grup tüm ürün tiplerinde kullanılabilir.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Ad</Label>
                <Input
                  className="mt-1.5"
                  value={form.name}
                  maxLength={255}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Örn. Fener Mili"
                />
              </div>
              <div>
                <Label>Bağlı olduğu bölüm</Label>
                <Select
                  value={form.divisionId || "__all__"}
                  onValueChange={(value) => {
                    const nextDivisionId = value === "__all__" ? "" : value;
                    const allowedIds = new Set(
                      productTypes
                        .filter(
                          (row) =>
                            row.isActive !== false &&
                            (nextDivisionId ? !row.divisionId || row.divisionId === nextDivisionId : !row.divisionId)
                        )
                        .map((row) => row.id)
                    );
                    setForm((current) => ({
                      ...current,
                      divisionId: nextDivisionId,
                      productTypeIds: current.productTypeIds.filter((id) => allowedIds.has(id)),
                    }));
                  }}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tümü (ortak kayıt)</SelectItem>
                    {divisions.map((division) => (
                      <SelectItem key={division.id} value={division.id}>
                        {division.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sistem kodu</Label>
                <Input
                  className="mt-1.5 bg-muted/30"
                  value={form.code || "Kaydedildiğinde otomatik oluşur"}
                  disabled
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Atandığı Ürün Tipleri</Label>
                <div className="mt-1.5">
                  <MultiSelect
                    options={availableProductTypes.map((row) => ({ value: row.id, label: row.name }))}
                    selected={form.productTypeIds.filter((id) => availableProductTypeIds.has(id))}
                    onChange={(productTypeIds) => setForm((current) => ({ ...current, productTypeIds }))}
                    placeholder="Ürün tipi seçin"
                    emptyText="Bu bölümde ürün tipi yok"
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Seçim yapılmazsa bu grup tüm ürün tiplerinin teknik bilgi ekranlarında geçerlidir.
                </p>
              </div>
              <div className="sm:col-span-2">
                <Label>Açıklama</Label>
                <Textarea
                  className="mt-1.5 min-h-24 resize-y"
                  value={form.description}
                  maxLength={2000}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="Grubun kullanım amacını yazın..."
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(isActive) => setForm((current) => ({ ...current, isActive }))}
                />
                Aktif
              </label>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Kapat
          </Button>
          <Button type="button" disabled={saving || loading || !selectedId} onClick={save}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Kaydediliyor...
              </>
            ) : selectedId === "new" ? (
              "Grubu Ekle"
            ) : (
              "Değişiklikleri Kaydet"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
