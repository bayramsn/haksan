import { describe, expect, it } from "vitest";
import { activityLogPrintDoc, UNCOUNTED_ACTIVITY_TYPES, type ActivityLogEntry, type ActivityLogReport, type ActivityLogUser } from "@haksan/shared";

const entry = (over: Partial<ActivityLogEntry>): ActivityLogEntry => ({
  id: "e1",
  occurredAt: "2026-09-01T08:00:00Z",
  origin: "manual",
  companyName: "BMS <Bahçeli>",
  companyLegalTitle: null,
  province: "Bursa",
  district: "Nilüfer",
  company: { sector: "Otomotiv", status: "Aktif müşteri", relation: null, machines: "MMT-1170 (2023)" },
  contactName: "Salih Bey",
  contactTitle: null,
  contactPhone: "0 555 111 22 33",
  subject: "",
  note: null,
  result: null,
  nextFollowUpAt: null,
  inOpportunity: true,
  opportunityTitle: "Kalıp CNC yatırımı",
  opportunity: {
    stage: "Teklif",
    estimatedValue: 120000,
    currency: "USD",
    probability: 60,
    expectedCloseDate: "2026-10-15T00:00:00Z",
    requestedMachine: "MMT-1170",
    temperature: "hot",
    nextAction: "Numune parça işle",
    nextActionAt: "2026-09-25T00:00:00Z",
  },
  ...over,
});

const user = (over: Partial<ActivityLogUser>): ActivityLogUser => ({
  userId: "u",
  userName: "Kişi",
  activityCount: 0,
  quoteCount: 0,
  quoteTotals: [],
  groups: [],
  week: { newOpportunities: 0, stageMoves: 0, won: 0, lost: 0, tasksCompleted: 0, tasksOverdue: 0, missedFollowUps: [] },
  targets: null,
  plan: [],
  ...over,
});

const report: ActivityLogReport = {
  // `to` açık uç: 06.09 gün sonu = 07.09 00:00 İstanbul.
  range: { from: "2026-08-31T21:00:00.000Z", to: "2026-09-06T21:00:00.000Z" },
  nextRange: { from: "2026-09-06T21:00:00.000Z", to: "2026-09-13T21:00:00.000Z" },
  users: [
    user({
      userId: "u1",
      userName: "Raif Şentürk",
      activityCount: 2,
      quoteCount: 1,
      quoteTotals: [{ currency: "USD", amount: 291000 }],
      groups: [
        { typeCode: "IN", typeName: "Gelen Arama", entries: [entry({ note: "MMT-1170 uyumlu", nextFollowUpAt: "2026-09-10T00:00:00Z" })] },
        { typeCode: "OUT", typeName: "Giden Arama", entries: [entry({ id: "e2", inOpportunity: false, opportunity: null, opportunityTitle: null, result: "Numune bekliyor", origin: "system" })] },
        { typeCode: "VISIT", typeName: "Ziyaret", entries: [] },
      ],
      week: {
        newOpportunities: 2,
        stageMoves: 3,
        won: 1,
        lost: 0,
        tasksCompleted: 4,
        tasksOverdue: 1,
        missedFollowUps: [{ companyName: "PNOMEK", dueAt: "2026-09-03T00:00:00Z", subject: "Fiyat" }],
      },
      targets: {
        period: "2026-09",
        expectedPct: 20,
        metrics: [{ key: "quote", label: "Teklif", target: 10, actual: 4, pct: 40 }],
      },
      plan: [
        { kind: "followUp", dueAt: "2026-09-08T09:00:00Z", companyName: "BMS", title: "Teklif takibi" },
        { kind: "visit", dueAt: "2026-09-10T07:00:00Z", companyName: "FARM CENTER", title: "Saha ziyareti" },
      ],
    }),
    user({ userId: "u2", userName: "Boş Kişi" }),
  ],
  quotes: [
    {
      id: "q1", documentNo: "TKL-1", revisionNo: 2, quoteDate: "2026-09-02", userName: "Raif Şentürk", companyName: "BMS",
      province: "Bursa", district: null, status: "Gönderildi", statusCode: "sent", opportunityTitle: null,
      productName: "SL-8", quantity: 1, unitPrice: 300000, discountAmount: 9000, lineTotal: 291000, currency: "USD",
    },
  ],
};

describe("activityLogPrintDoc", () => {
  it("beyaz A4 kâğıt üstünde özet, kişi dökümü, CRM bağlamı ve plan basar", () => {
    const doc = activityLogPrintDoc(report, { letterheadSrc: "/print/haksan-letterhead.png", generatedAt: new Date("2026-09-07T06:00:00Z") });
    const body = doc.body;
    // Kök neden: .page sarmalayıcısı yoksa ekran arka planı koyu gri kalıyordu.
    expect(body).toContain('<main class="page activity-report">');
    expect(body).toContain('src="/print/haksan-letterhead.png"');
    // Başlıkta açık uç değil son günün kendisi
    expect(doc.title).toBe("Aktivite Raporu 2026-09-01 – 2026-09-06");
    expect(body).toContain("<b>01.09.2026 – 06.09.2026</b>");
    // Özet kutuları
    expect(body).toContain('<div class="summary-value">2</div>'); // toplam aktivite
    expect(body).toContain("1 / 1"); // fırsat içi / dışı
    expect(body).toContain("1 / 0"); // kazanılan / kaybedilen
    expect(body).toContain("1 adet");
    expect(body).toContain("291.000 USD");
    // Kişi bandı: tür karışımı, hafta hareketi, kaçırılan takip, ay hedefi; boş tür ve boş kişi basılmaz
    expect(body).toContain("<b>1</b> Gelen Arama");
    expect(body).toContain("Yeni fırsat 2");
    expect(body).toContain("Geciken görev 1");
    expect(body).toContain("Kaçırılan takip:</b> PNOMEK (03.09.2026)");
    expect(body).toContain("Eylül hedefi");
    expect(body).toContain("4/10 (%40)");
    expect(body).not.toContain("Ziyaret <span");
    expect(body).not.toContain("Boş Kişi</h3>");
    // Kayıt satırı: kaçışlı firma, firma bağlamı, fırsat bağlamı, sistem etiketi, not yoksa uyarı, takip
    expect(body).toContain("BMS &lt;Bahçeli&gt;");
    expect(body).toContain("Sektör: Otomotiv · Durum: Aktif müşteri · Makine parkı: MMT-1170 (2023)");
    expect(body).toContain("Teklif · 120.000 USD · %60 · Kapanış 15.10.2026 · İstenen: MMT-1170 · Sıcak");
    expect(body).toContain("Numune parça işle");
    expect(body).toContain('<span class="tag out">Sistem</span>');
    expect(body).toContain("Not girilmemiş.");
    expect(body).toContain('<span class="fu">10.09.2026</span>');
    // Teklif tablosu: durum + revizyon + toplam satırı
    expect(body).toContain("TKL-1 · R2");
    expect(body).toContain("Gönderildi");
    expect(body).toContain('<td colspan="10">Toplam</td><td class="num">291.000 USD</td>');
    // Önümüzdeki hafta
    expect(body).toContain("Önümüzdeki hafta planı · 07.09.2026 – 13.09.2026 · 2 plan");
    expect(body).toContain("Saha ziyareti");
  });

  // Fırsat popup'ında not yazmak tek tık: sayıya girerse "Aktivite" çipi ve
  // kullanıcı sıralaması ziyaret/arama yapanı aşağı iter. Not görünür kalır,
  // sayılmaz — bu yüzden `activityCount` 0 olan kişi de rapordan düşmemeli.
  it("yalnız not yazmış kişiyi sayısı sıfır olsa da rapordan düşürmez", () => {
    const onlyNotes = activityLogPrintDoc(
      {
        ...report,
        users: [
          user({
            userId: "u9",
            userName: "Notçu Kişi",
            activityCount: 0,
            groups: [{ typeCode: "note", typeName: "Yorum", entries: [entry({ id: "n1", subject: "Fırsat notu", note: "Müşteri dosya bekliyor." })] }],
          }),
        ],
      },
      { letterheadSrc: null, generatedAt: new Date("2026-09-07T06:00:00Z") },
    ).body;
    expect(onlyNotes).toContain("Notçu Kişi");
    expect(onlyNotes).toContain("Müşteri dosya bekliyor.");
    expect(onlyNotes).toContain("Aktivite <b>0</b>");
    expect(UNCOUNTED_ACTIVITY_TYPES.has("note")).toBe(true);
    expect(UNCOUNTED_ACTIVITY_TYPES.has("customer_visit")).toBe(false);
  });
});
