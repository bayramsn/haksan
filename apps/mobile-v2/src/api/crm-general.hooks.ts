import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { calendar, chat, opportunities, quotes, service, type CalendarEventInput, type CalendarEventPatch, type ContactListQuery } from './endpoints';
import { chatKeys } from './chat.keys';
import { companyKeys } from './companies.hooks';
import { dashboardKeys } from './dashboard';
import {
  activityExt,
  calendarExt,
  chatExt,
  companiesExt,
  contactsExt,
  lookupsExt,
  mailExt,
  tasksExt,
  type CalendarImportEventType,
  type CalendarImportEvent,
  type CallInput,
  type ChatGroupPatch,
  type CompanyContactImportBody,
  type CompanyListQueryExt,
  type CompanyListRow,
  type CompanyLocationSource,
  type CompanyOsmQuery,
  type TaskListQueryExt,
  type TaskPatch,
  type TaskRecordFilter,
  type VisitInput,
} from './crm-general.api';

const PAGE_SIZE = 50;
const DIRECTORY_PAGE_SIZE = 200;
/** Mobilde bellek/ağ korunur: en çok 15 × 200 firma (web tüm dizini çeker). */
const DIRECTORY_MAX_PAGES = 15;

/* ------------------------------------------------------------ firmalar ---- */

export function useCompanyListExt(query: CompanyListQueryExt) {
  return useInfiniteQuery({
    queryKey: ['companies', 'list-ext', query] as QueryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => companiesExt.list({ ...query, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ ...data, items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
  });
}

export function useCompanySummaryExt(divisionId: string) {
  const scoped = divisionId !== 'all' ? divisionId : undefined;
  return useQuery({
    queryKey: ['companies', 'summary', scoped ?? 'all'] as QueryKey,
    queryFn: () => companiesExt.summary(scoped),
    staleTime: 30_000,
  });
}

/** Satış haritası: koordinatı olmayan firmalar da il/ilçe merkezine yerleşsin diye tam dizin. */
export function useCompanyDirectory() {
  return useQuery({
    queryKey: ['companies', 'directory'] as QueryKey,
    queryFn: async () => {
      const first = await companiesExt.list({ page: 1, pageSize: DIRECTORY_PAGE_SIZE, sortBy: 'name', sortDir: 'asc' });
      const totalPages = Math.min(DIRECTORY_MAX_PAGES, Math.max(1, first.meta.totalPages));
      const rest = totalPages > 1
        ? await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, index) =>
              companiesExt.list({ page: index + 2, pageSize: DIRECTORY_PAGE_SIZE, sortBy: 'name', sortDir: 'asc' }),
            ),
          )
        : [];
      const rows: CompanyListRow[] = [first, ...rest].flatMap((page) => page.data);
      return { rows, total: first.meta.total, truncated: first.meta.totalPages > DIRECTORY_MAX_PAGES };
    },
    staleTime: 60_000,
  });
}

export function useCompanyOsmSearch() {
  return useMutation({ mutationFn: (query: CompanyOsmQuery) => companiesExt.osmSearch(query) });
}

export function useCompanyWebsiteLookup() {
  return useMutation({
    mutationFn: (body: CompanyOsmQuery & { website?: string }) => companiesExt.websiteLookup(body),
  });
}

export function useSetCompanyLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; latitude: number | null; longitude: number | null; source?: CompanyLocationSource }) =>
      companiesExt.setLocation(vars.id, { latitude: vars.latitude, longitude: vars.longitude, source: vars.source }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyKeys.all });
    },
  });
}

export function useNearbyStaleVisits() {
  return useMutation({
    mutationFn: (body: { latitude: number; longitude: number; notify: boolean }) => companiesExt.nearbyStaleVisits(body),
  });
}

export function usePreviewCompanyContactImport() {
  return useMutation({ mutationFn: (body: CompanyContactImportBody) => companiesExt.previewCompanyContactImport(body) });
}

export function useCommitCompanyContactImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CompanyContactImportBody) => companiesExt.commitCompanyContactImport({ ...body, confirmed: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyKeys.all });
      void qc.invalidateQueries({ queryKey: ['contacts'] });
      void qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

export function useTaxOffices(city: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['lookups', 'tax-offices', city ?? null],
    queryFn: () => lookupsExt.taxOffices(city),
    staleTime: 60 * 60 * 1000,
    enabled,
  });
}

/** Firma formu seçenek listeleri; detay kimlik döndürdüğü için kod eşlemesi de buradan. */
export function useCompanyFormLookups() {
  const staleTime = 60 * 60 * 1000;
  const relationTypes = useQuery({ queryKey: ['lookups', 'company-relation-types'], queryFn: lookupsExt.companyRelationTypes, staleTime });
  const statuses = useQuery({ queryKey: ['lookups', 'company-statuses'], queryFn: lookupsExt.companyStatuses, staleTime });
  const groups = useQuery({ queryKey: ['lookups', 'company-groups'], queryFn: lookupsExt.companyGroups, staleTime });
  const sectors = useQuery({ queryKey: ['lookups', 'company-sectors'], queryFn: lookupsExt.companySectors, staleTime });
  const contactSources = useQuery({ queryKey: ['lookups', 'contact-sources'], queryFn: lookupsExt.contactSources, staleTime });
  return {
    relationTypes: relationTypes.data,
    statuses: statuses.data,
    groups: groups.data,
    sectors: sectors.data,
    contactSources: contactSources.data,
    isPending: relationTypes.isPending || statuses.isPending || contactSources.isPending,
  };
}

/* ------------------------------------------------------------ kontaklar ---- */

export function useContactListExt(query: ContactListQuery & { divisionId?: string }, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['contacts', 'list-ext', query] as QueryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => contactsExt.list({ ...query, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    select: (data) => ({ ...data, items: data.pages.flatMap((p) => p.data), total: data.pages[0]?.meta.total ?? 0 }),
    enabled,
  });
}

export function useContactSummaryExt(divisionId: string) {
  const scoped = divisionId && divisionId !== 'all' ? divisionId : undefined;
  return useQuery({
    queryKey: ['contacts', 'summary', scoped ?? 'all'] as QueryKey,
    queryFn: () => contactsExt.summary(scoped),
  });
}

export function useContactCompanyLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; companyId: string; action: 'primary' | 'unlink' }) =>
      vars.action === 'primary'
        ? contactsExt.setPrimaryCompany(vars.id, vars.companyId)
        : contactsExt.unlinkCompany(vars.id, vars.companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contacts'] });
      void qc.invalidateQueries({ queryKey: companyKeys.all });
    },
  });
}

/* --------------------------------------------------------------- mail ---- */

export function useMailAccountStatus() {
  return useQuery({ queryKey: ['mail', 'account-status'], queryFn: () => mailExt.account(), staleTime: 5 * 60_000 });
}

/* --------------------------------------------------------------- sohbet ---- */

export function useChatConversation(id: string) {
  return useQuery({
    queryKey: chatKeys.conversation(id),
    queryFn: () => chatExt.conversation(id),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

function useInvalidateChat() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: chatKeys.conversations });
}

export function useUpdateChatGroup(id: string) {
  const invalidate = useInvalidateChat();
  return useMutation({ mutationFn: (patch: ChatGroupPatch) => chatExt.updateGroup(id, patch), onSuccess: invalidate });
}

export function useAddChatMembers(id: string) {
  const invalidate = useInvalidateChat();
  return useMutation({ mutationFn: (userIds: string[]) => chatExt.addMembers(id, userIds), onSuccess: invalidate });
}

export function useRemoveChatMember(id: string) {
  const invalidate = useInvalidateChat();
  return useMutation({ mutationFn: (userId: string) => chatExt.removeMember(id, userId), onSuccess: invalidate });
}

export function useSetChatMemberRole(id: string) {
  const invalidate = useInvalidateChat();
  return useMutation({
    mutationFn: (vars: { userId: string; role: 'admin' | 'member' }) => chatExt.setMemberRole(id, vars.userId, vars.role),
    onSuccess: invalidate,
  });
}

export function useChatWebRtcConfig() {
  return useQuery({ queryKey: ['chat', 'webrtc-config'], queryFn: () => chatExt.webrtcConfig(), enabled: false, staleTime: 60_000 });
}

export function useChatSearch(conversationId: string, search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: ['chat', 'search', conversationId, term],
    queryFn: () => chat.messages(conversationId, { search: term, limit: 50 }),
    select: (data) => data.messages,
    enabled: Boolean(conversationId) && term.length >= 2,
  });
}

export type ShareableRecord = { id: string; label: string; sublabel: string | null };

/** Web ShareRecordDialog: son 50 teklif / satış kartı / servis kaydı. */
export function useShareableRecords(type: 'quote' | 'opportunity' | 'service_ticket', enabled = true) {
  return useQuery({
    queryKey: ['chat', 'shareable', type],
    enabled,
    queryFn: async (): Promise<ShareableRecord[]> => {
      if (type === 'quote') {
        const res = await quotes.list({ page: 1, pageSize: 50 });
        return res.data.map((q) => ({
          id: q.id,
          label: `Teklif ${q.documentNo}`,
          sublabel: q.company?.shortName ?? q.company?.legalTitle ?? q.status?.name ?? null,
        }));
      }
      if (type === 'opportunity') {
        const res = await opportunities.list({ page: 1, pageSize: 50 });
        return res.data.map((o) => ({ id: o.id, label: o.title, sublabel: o.company?.shortName ?? o.company?.legalTitle ?? null }));
      }
      const res = await service.tickets({ page: 1, pageSize: 50 });
      return res.data.map((t) => ({ id: t.id, label: `Servis ${t.ticketNo}`, sublabel: t.subject }));
    },
  });
}

/* -------------------------------------------------------------- takvim ---- */

const calendarEventsPrefix = ['calendar', 'events'] as const;

export function useCalendarEventsExt(query: { from: string; to: string; ownerUserId?: string; includeArchived: boolean }) {
  return useQuery({
    queryKey: [...calendarEventsPrefix, 'ext', query],
    queryFn: () =>
      calendarExt.events({
        from: query.from,
        to: query.to,
        ownerUserId: query.ownerUserId,
        includeArchived: query.includeArchived ? 'true' : 'false',
      }),
  });
}

export function useCalendarOwners(enabled: boolean) {
  return useQuery({ queryKey: ['calendar', 'owners'], queryFn: () => calendar.owners(), enabled, staleTime: 10 * 60_000 });
}

function useInvalidateCalendar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: calendarEventsPrefix });
    void qc.invalidateQueries({ queryKey: dashboardKeys.all });
  };
}

export function useCreateCalendarEventExt() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (body: CalendarEventInput & { ownerUserId?: string }) => calendarExt.create(body),
    onSuccess: invalidate,
  });
}

export function useUpdateCalendarEventExt() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (vars: { id: string; patch: CalendarEventPatch }) => calendarExt.update(vars.id, vars.patch),
    onSuccess: invalidate,
  });
}

export function useArchiveCalendarEvent() {
  const invalidate = useInvalidateCalendar();
  return useMutation({ mutationFn: (id: string) => calendarExt.remove(id), onSuccess: invalidate });
}

export function useRestoreCalendarEvent() {
  const invalidate = useInvalidateCalendar();
  return useMutation({ mutationFn: (id: string) => calendarExt.restore(id), onSuccess: invalidate });
}

export function useCalendarImportPreview() {
  return useMutation({ mutationFn: (body: { fileName: string; fileBase64: string }) => calendarExt.importPreview(body) });
}

export function useCalendarImportCommit() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (body: { defaultEventType: CalendarImportEventType; events: CalendarImportEvent[] }) =>
      calendarExt.importCommit({
        defaultEventType: body.defaultEventType,
        events: body.events.map(({ duplicate: _d, inWindow: _w, ...event }) => event),
      }),
    onSuccess: invalidate,
  });
}

/* -------------------------------------------------------------- görevler ---- */

export function useTaskListExt(query: TaskListQueryExt) {
  return useQuery({
    queryKey: ['tasks', 'list-ext', query],
    queryFn: () => tasksExt.list({ pageSize: 100, ...query }),
  });
}

export function useTaskSummary(enabled: boolean) {
  return useQuery({ queryKey: ['tasks', 'summary'], queryFn: () => tasksExt.summary(), enabled, staleTime: 60_000 });
}

export function useTaskRecordEvents(filter: TaskRecordFilter) {
  const enabled = Object.values(filter).some(Boolean);
  return useQuery({ queryKey: ['tasks', 'events', filter], queryFn: () => tasksExt.events(filter), enabled });
}

function useInvalidateTasks() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: dashboardKeys.all });
  };
}

export function usePatchTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (vars: { id: string; patch: TaskPatch }) => tasksExt.update(vars.id, vars.patch),
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({ mutationFn: (id: string) => tasksExt.remove(id), onSuccess: invalidate });
}

/* ----------------------------------------------------- ziyaret / arama ---- */

function useInvalidateActivities() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['activities'] });
    void qc.invalidateQueries({ queryKey: ['tasks', 'events'] });
    void qc.invalidateQueries({ queryKey: companyKeys.all });
    void qc.invalidateQueries({ queryKey: dashboardKeys.all });
  };
}

export function useCreateVisit() {
  const invalidate = useInvalidateActivities();
  return useMutation({ mutationFn: (body: VisitInput) => activityExt.createVisit(body), onSuccess: invalidate });
}

export function useCreateCall() {
  const invalidate = useInvalidateActivities();
  return useMutation({ mutationFn: (body: CallInput) => activityExt.createCall(body), onSuccess: invalidate });
}
