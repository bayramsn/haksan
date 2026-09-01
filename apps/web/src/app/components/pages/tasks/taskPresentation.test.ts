import { describe, expect, it } from "vitest";
import { dueLabel, isOpen, relatedRecord, TASK_VIEWS } from "./taskPresentation";
import type { TaskDTO } from "../../../../lib/services";

function task(overrides: Partial<TaskDTO> = {}): TaskDTO {
  return {
    id: "t1",
    title: "Müşteriyi ara",
    description: null,
    status: "todo",
    priority: "normal",
    assignedToUserId: null,
    createdBy: null,
    dueAt: null,
    remindBeforeMinutes: null,
    companyId: null,
    contactId: null,
    opportunityId: null,
    quoteId: null,
    serviceTicketId: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    overdue: false,
    assignee: null,
    company: null,
    contact: null,
    opportunity: null,
    quote: null,
    serviceTicket: null,
    ...overrides,
  };
}

describe("görev son tarih etiketi", () => {
  it("tarihsiz görevi ayrı tonda gösterir", () => {
    expect(dueLabel(task())).toEqual({ text: "Tarihsiz", tone: "none" });
  });

  it("gecikmeyi sunucunun hesabına göre yazar, tarihi kendi yeniden yorumlamaz", () => {
    // Aynı gün ama saati geçmiş: "bugün" değil "gecikti" okunmalı.
    const today = new Date();
    today.setHours(8, 0, 0, 0);
    const label = dueLabel(task({ dueAt: today.toISOString(), overdue: true }));
    expect(label.tone).toBe("overdue");
    expect(label.text).toContain("gecikti");
  });

  it("bir günden az gecikmeyi gün olarak yuvarlamaz", () => {
    // Dün 23:59'da biten görev bugün 00:30'da "1 gün gecikti" diyordu.
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);
    expect(dueLabel(task({ dueAt: twoHoursAgo.toISOString(), overdue: true })).text).toBe("2 saat gecikti");

    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
    expect(dueLabel(task({ dueAt: tenMinutesAgo.toISOString(), overdue: true })).text).toBe("10 dk gecikti");
  });

  it("bugünkü açık görevi saatiyle gösterir", () => {
    const later = new Date();
    later.setHours(23, 30, 0, 0);
    const label = dueLabel(task({ dueAt: later.toISOString() }));
    expect(label.tone).toBe("today");
    expect(label.text).toContain("Bugün");
  });

  it("gelecekteki görevi gecikmiş saymaz", () => {
    const nextWeek = new Date(Date.now() + 7 * 86_400_000);
    expect(dueLabel(task({ dueAt: nextWeek.toISOString() })).tone).toBe("normal");
  });
});

describe("görev durumu ve ilgili kayıt", () => {
  it("tamamlanan ve iptal edilen görevler için Geçmiş görünümünü sunar", () => {
    expect(TASK_VIEWS).toContainEqual({ value: "history", label: "Geçmiş" });
    expect(TASK_VIEWS.some((view) => view.value === "completed")).toBe(false);
  });

  it("yalnız yapılacak ve devam eden görevler açıktır", () => {
    expect(isOpen(task({ status: "todo" }))).toBe(true);
    expect(isOpen(task({ status: "in_progress" }))).toBe(true);
    expect(isOpen(task({ status: "done" }))).toBe(false);
    expect(isOpen(task({ status: "cancelled" }))).toBe(false);
  });

  it("firma varsa kısa adı, yoksa unvanı gösterir", () => {
    const withShort = relatedRecord(
      task({ company: { id: "c1", legalTitle: "ABC Makina Sanayi A.Ş.", shortName: "ABC Makina" } })
    );
    expect(withShort).toEqual({ label: "ABC Makina", kind: "Firma" });

    const withoutShort = relatedRecord(
      task({ company: { id: "c1", legalTitle: "ABC Makina Sanayi A.Ş.", shortName: null } })
    );
    expect(withoutShort?.label).toBe("ABC Makina Sanayi A.Ş.");
  });

  it("hiçbir kayda bağlı olmayan görev için boş döner", () => {
    expect(relatedRecord(task())).toBeNull();
  });
});
