// CRM Alan Ayarları sekmesinin lookup metadata'sı (etiketler, gruplar, kullanım
// haritası). Salt veri; davranış LookupManagerTab içindedir.

// Bölüme (CNC / Üniversal / Sac İşleme) göre ayrılabilen ürün listeleri.
// API tarafındaki DIVISION_SCOPED_LOOKUPS ile aynı olmalıdır (markalar hariç;
// markalar tenant tablosudur ama bölüm kolonu taşır ve aynı şekilde filtrelenir).
export const DIVISION_SCOPED_LOOKUPS = new Set([
  "product-groups",
  "product-categories",
  "product-subcategories",
  "product-types",
  "product-spec-groups",
  "brands",
]);

// Ürün taksonomi zincirindeki üst bağ: kategori → grup, alt kategori → kategori,
// ürün tipi → alt kategori. Üst bağı boş ("Tümü") olan kayıt tüm üstlerde geçerlidir.
export const LOOKUP_PARENTS: Record<string, { lookup: string; label: string; field: "productGroupId" | "categoryId" | "subcategoryId" }> = {
  "product-categories": { lookup: "product-groups", label: "Ürün Grubu", field: "productGroupId" },
  "product-subcategories": { lookup: "product-categories", label: "Ürün Kategorisi", field: "categoryId" },
  "product-types": { lookup: "product-subcategories", label: "Ürün Alt Kategorisi", field: "subcategoryId" },
};

// Teknik bilgi grupları ürün tiplerine atanır (atama yoksa grup tüm tiplerde geçerlidir).
export const SPEC_GROUP_LOOKUP = "product-spec-groups";

export const lookupLabels: Record<string, string> = {
  "company-sectors": "Sektörler",
  "contact-sources": "Firma İrtibat Şekli",
  "company-groups": "Firma Grupları",
  "company-statuses": "Firma Durumları",
  "company-relation-types": "Firma İlişki Türleri",
  "decision-roles": "Karar Rolleri",
  "user-titles": "Kullanıcı Ünvanları",
  "activity-types": "Aktivite Türleri",
  "pipeline-stages": "Satış Aşamaları",
  "opportunity-statuses": "Satış Kartı Durumları",
  "quote-statuses": "Teklif Durumları",
  "proforma-statuses": "Proforma Durumları",
  "contract-statuses": "Sözleşme Durumları",
  "product-types": "Ürün Tipleri",
  brands: "Ürün Markaları",
  "product-groups": "Ürün Grupları",
  "product-categories": "Ürün Kategorileri",
  "product-subcategories": "Ürün Alt Kategorileri",
  "product-spec-groups": "Teknik Bilgi Grupları",
  "equipment-types": "Donanım Tipleri",
  "units": "Birimler",
  "inventory-statuses": "Stok Durumları",
  "stock-location-statuses": "Stok Lokasyon Durumları",
  "warranty-statuses": "Garanti Durumları",
  "service-ticket-statuses": "Servis Talebi Durumları",
  "installation-statuses": "Kurulum Durumları",
  "shipment-statuses": "Sevkiyat Durumları",
  "shipment-package-units": "Sevkiyat Paket Birimleri",
  "payment-statuses": "Ödeme Durumları",
  "invoice-statuses": "Fatura Durumları",
  "currencies": "Para Birimleri",
  "file-document-types": "Doküman Türleri",
  "storage-providers": "Depolama Sağlayıcıları",
  "tax-offices": "Vergi Daireleri",
};

export const lookupUsage: Record<string, string[]> = {
  "company-sectors": ["Firma formu", "firma filtreleri", "rapor kırılımları"],
  "contact-sources": ["Firma formu", "lead kaynağı", "satış raporları"],
  "company-groups": ["Firma formu", "portföy filtreleri", "bölüm ayrımı"],
  "company-statuses": ["Firma kartı", "firma filtreleri"],
  "company-relation-types": ["Firma ilişkileri", "tedarikçi/müşteri bağlantıları"],
  "decision-roles": ["Kontak formu", "karar verici analizi"],
  "user-titles": ["Kullanıcı formu", "teklif/proforma/sözleşme imza satırı"],
  "activity-types": ["Aktivite formu", "takvim", "satış takip raporları"],
  "pipeline-stages": ["Satış kanbanı", "satış kartı", "pipeline raporu"],
  "opportunity-statuses": ["Satış kartı", "fırsat filtreleri"],
  "quote-statuses": ["Teklif listesi", "teklif onay akışı"],
  "proforma-statuses": ["Proforma listesi", "doküman durumu"],
  "contract-statuses": ["Sözleşme listesi", "doküman durumu"],
  "product-categories": ["Ürün formu", "teklif satırları", "stok filtreleri"],
  brands: ["Ürün formu", "teklif satırları", "fiyat listesi"],
  "product-subcategories": ["Ürün formu", "teklif satırları", "ürün daraltma"],
  "product-groups": ["Ürün formu", "teklif satırları", "bölüm bazlı katalog"],
  "product-types": ["Ürün formu", "teklif satırları", "teknik bilgi şablonları"],
  "product-spec-groups": ["Teknik bilgi", "ürün özellikleri", "teklif teknik tablo"],
  "equipment-types": ["Ürün donanımı", "standart/opsiyonel ekipman"],
  "units": ["Teklif kalemleri", "stok", "teknik bilgi birimleri"],
  "inventory-statuses": ["Stok kartları", "stok filtreleri"],
  "stock-location-statuses": ["Stok lokasyonları", "depo takibi"],
  "warranty-statuses": ["Garanti kayıtları", "servis filtreleri"],
  "service-ticket-statuses": ["Servis talepleri", "servis panosu"],
  "installation-statuses": ["Kurulum kayıtları", "operasyon filtreleri"],
  "shipment-statuses": ["Sevkiyat listesi", "operasyon filtreleri"],
  "shipment-package-units": ["Sevkiyat formu", "paket/palet birimi", "irsaliye paket bilgisi"],
  "payment-statuses": ["Ödeme listesi", "finans raporları"],
  "invoice-statuses": ["Fatura listesi", "finans raporları"],
  currencies: ["Teklif", "fatura", "rapor para birimi"],
  "file-document-types": ["Doküman yükleme", "dosya filtreleri"],
  "storage-providers": ["Dosya altyapısı", "entegrasyon ayarları"],
  "tax-offices": ["Firma formu", "fatura bilgileri", "vergi dairesi seçimi"],
};

// Ürün grubu, kurulum adım sırasında listelenir (1→7); markalar akış dışıdır.
export const LOOKUP_MENU_GROUPS: Array<{ label: string; names: string[] }> = [
  {
    label: "Firma",
    names: ["company-sectors", "company-groups", "company-statuses", "company-relation-types", "contact-sources", "decision-roles", "tax-offices"],
  },
  {
    label: "Satış",
    names: ["pipeline-stages", "opportunity-statuses", "activity-types", "quote-statuses", "proforma-statuses", "contract-statuses"],
  },
  {
    label: "Ürün",
    names: ["product-groups", "product-categories", "product-subcategories", "product-types", "equipment-types", "product-spec-groups", "units", "brands"],
  },
  {
    label: "Stok & Servis",
    names: ["inventory-statuses", "stock-location-statuses", "warranty-statuses", "service-ticket-statuses", "installation-statuses", "shipment-statuses", "shipment-package-units"],
  },
  {
    label: "Finans",
    names: ["payment-statuses", "invoice-statuses", "currencies"],
  },
  {
    label: "Genel",
    names: ["user-titles", "file-document-types", "storage-providers"],
  },
];

// Menüde gizlenen listeler (şu an yok; ürün tipleri alt kategoriye bağlı
// düzenlenebilsin diye kurulum akışına geri alındı).
export const HIDDEN_LOOKUP_MENU_NAMES = new Set<string>([]);

export const PRODUCT_FLOW_STEPS: Array<{ key: string; label: string; helper: string; lookupName: string }> = [
  {
    key: "product-groups",
    lookupName: "product-groups",
    label: "Ürün Grupları",
    helper: "CNC, Üniversal, Sac İşleme gibi ana bölüm/grup ayrımı.",
  },
  {
    key: "product-categories",
    lookupName: "product-categories",
    label: "Ürün Kategorileri",
    helper: "Tezgah, yedek parça, aksesuar gibi ürün ailesi.",
  },
  {
    key: "product-subcategories",
    lookupName: "product-subcategories",
    label: "Ürün Alt Kategorileri",
    helper: "İşleme merkezi, torna veya parçaya ait alt ayrım; kategoriye bağlıdır.",
  },
  {
    key: "product-types",
    lookupName: "product-types",
    label: "Ürün Tipleri",
    helper: "Alt kategoriye bağlı ürün/tezgah tipi; teknik bilgi şablonlarının anahtarıdır.",
  },
  {
    key: "equipment-types",
    lookupName: "equipment-types",
    label: "Donanım Tipleri",
    helper: "Standart ve opsiyonel donanım sınıfları.",
  },
  {
    key: "product-spec-groups",
    lookupName: "product-spec-groups",
    label: "Teknik Bilgi Grupları",
    helper: "Teknik özellikleri tabloda gruplayan başlıklar.",
  },
  {
    key: "units",
    lookupName: "units",
    label: "Birimler",
    helper: "Teklif, stok ve teknik bilgi ölçü birimleri.",
  },
];

export const PRODUCT_FLOW_LOOKUPS = new Set(PRODUCT_FLOW_STEPS.map((step) => step.lookupName));

export const PRODUCT_SETUP_START_LOOKUP = "product-groups";
