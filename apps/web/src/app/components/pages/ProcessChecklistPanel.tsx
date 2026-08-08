import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Circle, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { type OpportunityProcessActionKey } from "@haksan/shared";
import { activityService } from "../../../lib/services";
import { useAuth } from "../../../lib/auth";
import { useStore } from "../../lib/store";
import {
  OPPORTUNITY_PAYMENT_METHOD_LABELS,
  salesStageLabel,
  type OpportunityPaymentMethod,
  type QualificationStage,
  type SalesCase,
} from "../../lib/mock";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Combobox } from "../ui/combobox";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { CreateContactDialog } from "../dialogs/CreateDialogs";
import { QuoteDialog } from "../dialogs/QuoteDialog";
import { RequestedMachineCombobox } from "../shared/RequestedMachineCombobox";
import { OPPORTUNITY_OPERATION_GROUP_STEPS } from "./opportunityProcessGroups";
import { focusWorkspaceTarget } from "../../lib/workspaceFocus";

/**
 * Ödeme planının ipucu metni seçilen ödeme şekline göre değişir: kullanıcı boş
 * kutuya ne yazacağını tahmin etmek zorunda kalmasın.
 */
const PAYMENT_TERMS_PLACEHOLDER: Partial<Record<OpportunityPaymentMethod, string>> = {
  cash: "Peşin: ödeme tarihi ve varsa peşin iskontosu",
  wire_transfer: "Havale: hesap, tutar ve transfer tarihi",
  promissory_note: "Senet: adet, vade tarihleri ve tutarlar",
  term: "Vadeli: vade gün sayısı ve son ödeme tarihi",
  installment: "Taksitli: taksit adedi, tutarı ve ilk taksit tarihi",
  leasing: "Leasing: finans kuruluşu, süre ve peşinat oranı",
  letter_of_credit: "Akreditif: banka, vade ve açılış koşulları",
  cheque: "Çek: adet, vade tarihleri ve keşideci",
};

/**
 * Kartın bulunduğu satış derecesini geçmek için tamamlanması gereken alanları
 * satır satır listeler ve her birini kartın içinden doldurulabilir hâle getirir.
 * Kontrol listesi backend'in `qualificationReadiness.checks` çıktısıdır; burada
 * yalnız her `key` için doğru düzenleyici eşlenir. Böylece UI, backend'in
 * gerçekten aradığı koşulun dışına çıkıp olmayan bir kural vaat etmez.
 *
 * Panel elementini üst bileşen yaratır (aksiyon isteği ve dialog'lar oranın
 * state'ine bağlı) ama render edildiği yer satış alanı kutusunun içidir: kutuya
 * prop olarak geçer. Böylece `requestedAction` bağı korunur, portal gerekmez.
 *
 * Gösterilen görevler ray'dan seçilen alana göre değişir (`checks` prop'u).
 * İleri alanlar `readOnly`: sırası gelmemiş görevi doldurmak sırayı atlamaktır.
 *
 * İlerletme düğmesi burada YOK — tek düğme kutunun altındadır; burada ikinci bir
 * ilerletme yolu olması hem kapalı kart hem sunucu engelleri kontrolünü atlayan
 * ikinci bir kapı açardı.
 */
export function ProcessChecklistPanel({
  sc,
  requestedAction,
  onActionHandled,
  onSaved,
  checks: checksOverride,
  readOnly = false,
}: {
  sc: SalesCase;
  requestedAction?: OpportunityProcessActionKey | null;
  onActionHandled?: () => void;
  /**
   * Gösterilecek görev listesi. Verilmezse mevcut alanınki kullanılır.
   * Ray'dan başka bir alan seçildiğinde o alanın görevleri geçilir — kontroller
   * `processReadiness.checks` içinde `qualificationStage` ile etiketli geliyor.
   */
  checks?: Array<{ key: string; label: string; complete: boolean }>;
  /** İleri alanların görevleri yalnız önizlemedir; düzenleme kapalıdır. */
  readOnly?: boolean;
  /**
   * Kaydetmeden sonra satış alanı kutusunun hazırlık verisini tazeler.
   *
   * Panel `sc.qualificationReadiness`'i (store) okur, kutu ise kendi detay
   * çağrısındaki `processReadiness`'i okur. Yalnız store tazelenirse görev
   * tikli görünür ama kutu eski engeli göstermeye devam eder — kullanıcıya
   * "yapılan görev kabul edilmedi" gibi görünen şey budur.
   */
  onSaved?: () => Promise<void> | void;
}) {
  const { customers, contacts, users, products, updateCase, updateCustomer, decideCaseApproval, refresh } =
    useStore();
  const { hasRole, hasPermission } = useAuth();
  const isSuperAdmin = hasRole("super_admin");
  const canUpdate = hasPermission("opportunities.update");
  const canCreateActivity = hasPermission("activities.create");
  const canCreateQuote = hasPermission("quotes.create");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editingKeys, setEditingKeys] = useState<Set<string>>(new Set());
  const readiness = sc.qualificationReadiness;
  const company = customers.find((item) => item.id === sc.customerId);
  const grade = (sc.qualificationStage ?? "lead") as QualificationStage;
  const areaSteps = OPPORTUNITY_OPERATION_GROUP_STEPS[grade] ?? [];
  const checkByAction: Partial<Record<OpportunityProcessActionKey, string>> = {
    assign_owner: "owner",
    edit_subject: "subject",
    link_company: "company",
    edit_company: "location",
    link_contact: "contact",
    create_contact: "contact",
    record_call: "call",
    record_visit: "visit",
    edit_machine: "machine",
    edit_payment_method: "payment_method",
    edit_contract_terms: "contract_terms",
    edit_payment_terms: "payment_terms",
    approve_payment: "payment",
    approve_customs: "customs",
    approve_invoice: "invoice",
    approve_installation: "installation",
    approve_win: "win",
  };
  const requestedCheckKey = requestedAction ? checkByAction[requestedAction] : undefined;

  useEffect(() => {
    if (!requestedAction) return;
    const key = checkByAction[requestedAction];
    if (!key || !readiness?.checks.some((item) => item.key === key)) return;
    setEditingKeys((current) => new Set(current).add(key));
    onActionHandled?.();
    // Engel düğmesi kutunun üst yarısında, açılan düzenleyici görev listesinde:
    // uzun listede satır ekranın dışında kalabiliyor. Satırı görünüre getirip
    // ilk alanına odaklan.
    window.setTimeout(() => {
      const row = document.getElementById(`process-check-${key}`);
      if (!row) return;
      focusWorkspaceTarget(row, { focus: false, block: "center" });
      row.querySelector<HTMLElement>("input, textarea, select, [role='combobox'], button")?.focus({ preventScroll: true });
    }, 60);
  }, [requestedAction, readiness?.checks, onActionHandled]);

  const companyContacts = useMemo(
    () =>
      !sc.customerId
        ? []
        : contacts
            .filter((c) => c.customerId === sc.customerId || c.companyIds?.includes(sc.customerId!))
            .map((c) => ({
              value: c.id,
              label: c.name,
              hint: [c.title, c.department].filter(Boolean).join(" · "),
            })),
    [contacts, sc.customerId]
  );

  /** Bir görev satırını açar ve görünüre kaydırır. */
  const openCheck = (key: string) => {
    setEditingKeys((current) => new Set(current).add(key));
    window.setTimeout(() => {
      const row = document.getElementById(`process-check-${key}`);
      if (!row) return;
      focusWorkspaceTarget(row, { focus: false, block: "center" });
      row.querySelector<HTMLElement>("input, textarea, select, [role='combobox'], button")?.focus({ preventScroll: true });
    }, 60);
  };

  if (!readiness) return null;

  // Ray'dan seçilen alanın görevleri; seçim yoksa mevcut alanınki.
  const checks = checksOverride ?? readiness.checks;

  /** Bir düzenleyicinin kaydetme sarmalayıcısı: kilit, hata ve tazeleme tek yerde. */
  const run = async (
    key: string,
    action: () => Promise<unknown>,
    successMessage: string,
    authorized = canUpdate,
  ) => {
    if (!authorized || busyKey) return;
    setBusyKey(key);
    try {
      await action();
      // Tazeleme burada, tek yerde: tek tek düzenleyicilere bırakıldığında
      // bazıları tazeliyor bazıları tazelemiyordu ve görev "bazen kabul
      // edilmemiş" gibi görünüyordu. İki kaynak da güncellenmeli — panel
      // store'dan, kutu kendi detay çağrısından okuyor.
      await refresh();
      await onSaved?.();
      toast.success(successMessage);
      if (requestedAction) onActionHandled?.();
    } catch (error: any) {
      toast.error("Kaydedilemedi", { description: error?.message ?? "İstek başarısız oldu." });
    } finally {
      setBusyKey(null);
    }
  };

  const body = (
    <section aria-label="Mevcut satış alanının görevleri" className="space-y-4 p-4 sm:p-5">
        {/* Görevler satış alanı kutusunun kendi içeriği. Ayrı bir "Alan
            görevleri" başlığı ve alan rozeti kutuyu ikinci kez etiketlerdi —
            alan kimliğini kutunun başlığı zaten söylüyor. Geriye yalnız
            ilerleme sayacı kalıyor. */}
        <div className="flex justify-end">
          <span className="text-[11px] text-muted-foreground">
            {checks.filter((c) => c.complete).length}/{checks.length} tamamlandı
          </span>
        </div>

        {areaSteps.length > 0 && (
          <p className="text-[11px] leading-4 text-muted-foreground">
            Bu alanın operasyon adımları:{" "}
            <b className="font-medium text-foreground">
              {areaSteps.map((step) => salesStageLabel(step)).join(" → ")}
            </b>
          </p>
        )}

        {requestedCheckKey && !readOnly && !checks.some((item) => item.key === requestedCheckKey) && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="mb-2 text-xs font-semibold">Seçilen hızlı işlem</div>
            <CheckEditor
              checkKey={requestedCheckKey}
              openCheck={openCheck}
              sc={sc}
              company={company}
              companyContacts={companyContacts}
              users={users}
              products={products}
              isSuperAdmin={isSuperAdmin}
              canCreateQuote={canCreateQuote}
              canCreateActivity={canCreateActivity}
              complete={false}
              busy={busyKey !== null}
              disabled={!canUpdate || busyKey !== null}
              run={run}
              updateCase={updateCase}
              updateCustomer={updateCustomer}
              decideCaseApproval={decideCaseApproval}
              refresh={refresh}
            />
          </div>
        )}

        {checks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Bu aşamada tamamlanacak alan yok.</p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {checks.map((check) => {
              const isActivityCheck = check.key === "call" || check.key === "visit";
              return (
                <li key={check.key} id={`process-check-${check.key}`} className="flex flex-col gap-2 scroll-mt-24 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {check.complete ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success" />
                    ) : (
                      <Circle className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={`min-w-0 flex-1 text-xs ${check.complete ? "text-muted-foreground" : "font-medium"}`}>
                      {check.label}
                    </span>
                    {busyKey === check.key && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                    {check.complete && !isActivityCheck && !readOnly && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0 gap-1 px-2 text-[10px]"
                        onClick={() =>
                          setEditingKeys((current) => {
                            const next = new Set(current);
                            if (next.has(check.key)) next.delete(check.key);
                            else next.add(check.key);
                            return next;
                          })
                        }
                      >
                        <Pencil className="size-3" />
                        {editingKeys.has(check.key) ? "Kapat" : "Düzenle"}
                      </Button>
                    )}
                  </div>
                  {/* İleri alanlar yalnız önizleme: henüz sırası gelmemiş bir
                      alanın görevini doldurmak sırayı atlamak olurdu. */}
                  {!readOnly && (!check.complete || editingKeys.has(check.key) || isActivityCheck) && (
                    <CheckEditor
                      checkKey={check.key}
                      openCheck={openCheck}
                      sc={sc}
                      company={company}
                      companyContacts={companyContacts}
                      users={users}
                      products={products}
                      isSuperAdmin={isSuperAdmin}
                      canCreateQuote={canCreateQuote}
                      canCreateActivity={canCreateActivity}
                      complete={check.complete}
                      busy={busyKey !== null}
                      disabled={!canUpdate || busyKey !== null}
                      run={run}
                      updateCase={updateCase}
                      updateCustomer={updateCustomer}
                      decideCaseApproval={decideCaseApproval}
                      refresh={refresh}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

    </section>
  );

  // Eksik özeti ve ilerletme düğmesi kutunun altında; burada tekrar etmek aynı
  // bilgiyi iki kez, ilerletmeyi iki düğmede gösterirdi.
  return body;
}

type EditorProps = {
  checkKey: string;
  sc: SalesCase;
  company: ReturnType<typeof useStore>["customers"][number] | undefined;
  companyContacts: { value: string; label: string; hint?: string }[];
  users: ReturnType<typeof useStore>["users"];
  products: ReturnType<typeof useStore>["products"];
  isSuperAdmin: boolean;
  canCreateQuote: boolean;
  canCreateActivity: boolean;
  complete: boolean;
  busy: boolean;
  disabled: boolean;
  run: (
    key: string,
    action: () => Promise<unknown>,
    successMessage: string,
    authorized?: boolean,
  ) => Promise<void>;
  updateCase: ReturnType<typeof useStore>["updateCase"];
  updateCustomer: ReturnType<typeof useStore>["updateCustomer"];
  decideCaseApproval: ReturnType<typeof useStore>["decideCaseApproval"];
  refresh: ReturnType<typeof useStore>["refresh"];
  /** Başka bir görev satırını açıp oraya kaydırır (ödeme planı → ödeme şekli). */
  openCheck: (key: string) => void;
};

/** Tek bir kontrol satırının düzenleyicisi; `checkKey` backend'in ürettiği anahtardır. */
function CheckEditor(props: EditorProps) {
  const { checkKey, sc, company, companyContacts, users, products, isSuperAdmin, disabled, run, openCheck } = props;
  const [draft, setDraft] = useState("");
  const [draft2, setDraft2] = useState("");

  const saveCase = (patch: Parameters<EditorProps["updateCase"]>[1], message: string) =>
    run(checkKey, () => props.updateCase(sc.id, patch), message);

  const saveCompany = (patch: Record<string, unknown>, message: string) => {
    if (!company) return Promise.resolve();
    return run(checkKey, () => props.updateCustomer(company.id, patch as any), message);
  };

  const textRow = (placeholder: string, onSave: (value: string) => void, multiline = false) => (
    <div className="flex flex-col gap-2 pl-6 sm:flex-row sm:items-end">
      {multiline ? (
        <Textarea
          className="min-h-16 bg-white text-xs"
          placeholder={placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <Input
          className="h-8 bg-white text-xs"
          placeholder={placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0"
        disabled={disabled || !draft.trim()}
        onClick={() => onSave(draft.trim())}
      >
        Kaydet
      </Button>
    </div>
  );

  const wrap = (node: ReactNode) => <div className="pl-6">{node}</div>;

  const activityCheck = ({
    label,
    activityTypeCode,
    subject,
    successMessage,
  }: {
    label: string;
    activityTypeCode: "outgoing_call" | "customer_visit";
    subject: string;
    successMessage: string;
  }) => {
    const inputId = `qualification-${checkKey}-note-${sc.id}`;
    const checkboxId = `qualification-${checkKey}-complete-${sc.id}`;
    const unavailable = !props.canCreateActivity || !sc.customerId;
    const activityDisabled = props.busy || props.complete || unavailable;

    return wrap(
      <div className="space-y-2 rounded-md bg-slate-50/80 p-2.5">
        <div className="flex min-h-8 items-center gap-2">
          <Checkbox
            id={checkboxId}
            checked={props.complete}
            disabled={activityDisabled}
            aria-describedby={`${checkboxId}-hint`}
            onCheckedChange={(checked) => {
              if (checked !== true || props.complete || unavailable) return;
              void run(
                checkKey,
                async () => {
                  await activityService.create({
                    opportunityId: sc.id,
                    companyId: sc.customerId!,
                    activityTypeCode,
                    subject,
                    activityDate: new Date(),
                    description: draft.trim() || undefined,
                  });
                  setDraft("");
                  await props.refresh();
                },
                successMessage,
                props.canCreateActivity,
              );
            }}
          />
          <label htmlFor={checkboxId} className="cursor-pointer text-xs font-medium">
            {props.complete ? `${label} olarak işaretlendi` : `${label} olarak işaretle`}
          </label>
        </div>
        {!props.complete && (
          <Input
            id={inputId}
            className="h-8 bg-white text-xs"
            placeholder={`${label} notu (isteğe bağlı)`}
            value={draft}
            disabled={activityDisabled}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
        <p id={`${checkboxId}-hint`} className="text-[10px] leading-4 text-muted-foreground">
          {!props.canCreateActivity
            ? "Aktivite oluşturma yetkiniz bulunmuyor."
            : !sc.customerId
              ? "Önce fırsata firma bağlanmalı."
              : props.complete
                ? "Tamamlanma bilgisi bağlı aktivite kaydından doğrulanır."
                : "Not yazmak zorunlu değildir. Yazılan not Aktivite bölümünde görünür."}
        </p>
      </div>
    );
  };

  switch (checkKey) {
    case "subject":
      return textRow("Satış konusu / talep başlığı", (value) => void saveCase({ title: value }, "Konu kaydedildi"));

    case "owner":
      if (!isSuperAdmin) {
        return wrap(
          <p className="text-[10px] text-muted-foreground">
            Sorumlu atamasını yalnız süper yönetici değiştirebilir.
          </p>
        );
      }
      return wrap(
        <Select
          disabled={disabled}
          onValueChange={(value) => void saveCase({ assignedUserId: value }, "Sorumlu atandı")}
        >
          <SelectTrigger size="sm" className="h-8 w-full bg-white text-xs sm:w-64">
            <SelectValue placeholder="Sorumlu seçin" />
          </SelectTrigger>
          <SelectContent>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "company":
      return wrap(
        <p className="text-[10px] text-muted-foreground">
          Aşağıdaki “Tekliften önce firma kaydı gerekli” bölümünden firmayı bağlayın; diğer alanlar firma
          bağlandıktan sonra doldurulabilir.
        </p>
      );

    case "contact":
      if (!sc.customerId) {
        return wrap(<p className="text-[10px] text-muted-foreground">Önce firma bağlanmalı.</p>);
      }
      return wrap(
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {companyContacts.length > 0 && (
            <Combobox
              className="h-8 w-full text-xs sm:w-72"
              options={companyContacts}
              value={sc.primaryContactId ?? ""}
              onChange={(value) => void saveCase({ primaryContactId: value }, "Kontak bağlandı")}
              placeholder="Firmanın kontağını seçin"
              searchPlaceholder="Kontak ara…"
              emptyText="Kontak bulunamadı"
            />
          )}
          <CreateContactDialog
            defaultCustomerId={sc.customerId}
            draftKey={`draft.opportunity.${sc.id}.contact`}
            initialValues={{
              name: sc.leadContactName ?? "",
              phone: sc.leadPhone ?? "",
              email: sc.leadEmail ?? "",
              note: `${sc.requestedProduct} fırsat kartından oluşturuldu.`,
            }}
            onCreated={(contactId) => {
              void saveCase({ primaryContactId: contactId }, "Kontak oluşturuldu ve fırsata bağlandı");
            }}
            trigger={
              <Button type="button" size="sm" variant="outline" className="h-8 shrink-0">
                Yeni kontak oluştur
              </Button>
            }
          />
        </div>
      );

    case "location":
      return (
        <div className="flex flex-col gap-2 pl-6 sm:flex-row sm:items-end">
          <Input
            className="h-8 bg-white text-xs"
            placeholder="İl"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Input
            className="h-8 bg-white text-xs"
            placeholder="İlçe"
            value={draft2}
            onChange={(event) => setDraft2(event.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            disabled={disabled || !draft.trim() || !draft2.trim()}
            onClick={() =>
              void saveCompany({ city: draft.trim(), district: draft2.trim() }, "İl ve ilçe kaydedildi")
            }
          >
            Kaydet
          </Button>
        </div>
      );

    case "address":
      return textRow("Açık adres", (value) => void saveCompany({ address: value }, "Adres kaydedildi"), true);
    case "email":
      return textRow("ornek@firma.com", (value) => void saveCompany({ email: value }, "E-posta kaydedildi"));
    case "phone":
      return textRow("0212 xxx xx xx", (value) => void saveCompany({ phone: value }, "Telefon kaydedildi"));
    case "sector":
      return textRow("Örn. CNC Talaşlı İmalat", (value) => void saveCompany({ sector: value }, "Sektör kaydedildi"));

    case "call":
      return activityCheck({
        label: "Arama yapıldı",
        activityTypeCode: "outgoing_call",
        subject: "Giden Arama",
        successMessage: "Arama kaydedildi",
      });

    case "visit":
      return activityCheck({
        label: "Ziyaret yapıldı",
        activityTypeCode: "customer_visit",
        subject: "Müşteri Ziyareti",
        successMessage: "Ziyaret kaydedildi",
      });

    case "machine":
      return wrap(
        <RequestedMachineCombobox
          className="h-8 w-full bg-white text-xs sm:w-96"
          products={products}
          value={sc.requestedMachine}
          disabled={disabled}
          onValueChange={(value) =>
            saveCase({ requestedMachine: value }, "İstenen makine kaydedildi")
          }
        />
      );

    case "quote":
      if (!sc.customerId) {
        return wrap(<p className="text-[10px] text-muted-foreground">Tekliften önce firma bağlanmalı.</p>);
      }
      if (!props.canCreateQuote) {
        return wrap(<p className="text-[10px] text-muted-foreground">Teklif oluşturma yetkiniz bulunmuyor.</p>);
      }
      return wrap(
        <QuoteDialog
          defaultCaseId={sc.id}
          defaultCustomerId={sc.customerId}
          trigger={
            <Button type="button" size="sm" className="h-8" disabled={disabled}>
              Teklif oluştur
            </Button>
          }
        />
      );

    case "payment_method":
      return wrap(
        <Select
          disabled={disabled}
          onValueChange={(value) =>
            void saveCase({ paymentMethod: value as OpportunityPaymentMethod }, "Ödeme biçimi kaydedildi")
          }
        >
          <SelectTrigger size="sm" className="h-8 w-full bg-white text-xs sm:w-64">
            <SelectValue placeholder="Ödeme biçimi seçin" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(OPPORTUNITY_PAYMENT_METHOD_LABELS) as OpportunityPaymentMethod[])
              .filter((code) => code !== "undecided")
              .map((code) => (
                <SelectItem key={code} value={code}>
                  {OPPORTUNITY_PAYMENT_METHOD_LABELS[code]}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      );

    case "contract_terms":
      return textRow(
        "Sözleşme şartları (teslim, garanti, cezai şart…)",
        (value) => void saveCase({ contractTerms: value }, "Sözleşme şartları kaydedildi"),
        true
      );
    case "payment_terms": {
      // Ödeme planı, ödeme şeklinden türer: peşinde vade yazılmaz, leasingde
      // taksit tablosu firmanın değil finans kuruluşunun işidir. Şekil
      // seçilmeden boş bir metin kutusu açmak kullanıcıyı neyi yazacağını
      // bilmeden bırakıyordu — önce şekil, sonra ona göre plan.
      const method = sc.paymentMethod;
      if (!method || method === "undecided") {
        return wrap(
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Önce ödeme şeklini seçin; plan ona göre açılır.</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={disabled}
              onClick={() => openCheck("payment_method")}
            >
              Ödeme şeklini seç
            </Button>
          </div>
        );
      }
      return textRow(
        PAYMENT_TERMS_PLACEHOLDER[method] ?? "Ödeme koşulları (peşinat, vade, taksit…)",
        (value) => void saveCase({ paymentTerms: value }, "Ödeme koşulları kaydedildi"),
        true
      );
    }

    // A+ alanı: beş onay. Onay yetkisi backend'de rol bazlı kontrol edilir.
    case "payment":
    case "customs":
    case "invoice":
    case "installation":
    case "win":
      return wrap(
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={disabled}
          onClick={() =>
            void run(
              checkKey,
              () => props.decideCaseApproval(sc.id, checkKey as any, "approved"),
              "Onay verildi"
            )
          }
        >
          Onayla
        </Button>
      );

    default:
      return null;
  }
}
