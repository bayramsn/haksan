import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { targetsApi, type TargetRow } from '@/src/api/targets.api';
import {
  buildPeriodResult,
  buildTeamRows,
  monthRange,
  type PeriodResult,
  type ScopeKind,
  type TargetUpsertBody,
} from '@/src/ui/sales/targets-logic';

export const targetKeys = {
  all: ['targets'] as const,
  directories: ['targets', 'directories'] as const,
  report: (input: ReportInput) => ['targets', 'report', input] as const,
  team: (period: string) => ['targets', 'team', period] as const,
  row: (kind: ScopeKind, id: string, period: string) => ['targets', 'row', kind, id, period] as const,
  myProgress: (period: string) => ['targets', 'my-progress', period] as const,
};

export type DirectoryRow = { id: string; name: string; subtitle?: string };
export type Directories = Record<ScopeKind, DirectoryRow[]>;

/** Yönetici kapsam listeleri; web ile aynı süzme (pasif/silinmiş kullanıcı yok). */
export function useTargetDirectories(enabled: boolean) {
  return useQuery({
    queryKey: targetKeys.directories,
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Directories> => {
      const [users, departments, divisions] = await Promise.all([
        targetsApi.users(),
        targetsApi.departments(),
        targetsApi.divisions(),
      ]);
      return {
        user: users
          .filter((row) => row.status !== 'passive')
          .map((row) => ({ id: row.id, name: row.fullName ?? row.email, subtitle: row.email }))
          .sort((a, b) => a.name.localeCompare(b.name, 'tr-TR')),
        department: departments.map((row) => ({ id: row.id, name: row.name, subtitle: row.code })),
        division: divisions.map((row) => ({ id: row.id, name: row.name, subtitle: row.code })),
      };
    },
  });
}

type ReportInput = { scopeKind: ScopeKind; subjectId: string; from: string; to: string; self: boolean };

/**
 * Dönem başına bir istek; yönetici olmayan kullanıcı yalnız kendi raporunu
 * `my-target-progress` ile alır (sunucu da başka kapsamı reddeder).
 */
export function useTargetReport(input: ReportInput) {
  return useQuery({
    queryKey: targetKeys.report(input),
    enabled: Boolean(input.subjectId),
    queryFn: async (): Promise<PeriodResult[]> => {
      const periods = monthRange(input.from, input.to);
      const responses = await Promise.all(
        periods.map((period) =>
          input.self
            ? targetsApi.myTargetProgress(period)
            : targetsApi.targetProgress({ period, scope: input.scopeKind, id: input.subjectId })
        )
      );
      return responses.map((response, index) => buildPeriodResult(periods[index] ?? input.to, response));
    },
  });
}

/** Ekip karnesi: tek `all-users` isteği, yalnız son dönem. */
export function useTeamScorecard(period: string, enabled: boolean) {
  return useQuery({
    queryKey: targetKeys.team(period),
    enabled,
    queryFn: async () => {
      const response = await targetsApi.targetProgress({ period, scope: 'all-users' });
      return buildTeamRows({ ...response, period });
    },
  });
}

/** Düzenlenecek dönem satırı; kayıt yoksa `null` (yeni hedef boş açılır). */
export function useTargetRow(kind: ScopeKind, id: string, period: string) {
  return useQuery({
    queryKey: targetKeys.row(kind, id, period),
    enabled: Boolean(id && period),
    queryFn: async (): Promise<TargetRow | null> => {
      const rows =
        kind === 'user'
          ? await targetsApi.userTargets(period)
          : kind === 'department'
            ? await targetsApi.departmentTargets(period)
            : await targetsApi.divisionTargets(period);
      const key = kind === 'user' ? 'userId' : kind === 'department' ? 'departmentId' : 'divisionId';
      return rows.find((row) => row[key] === id) ?? null;
    },
  });
}

/** Tek kişi/departman/bölüm hedefinin canlı ilerlemesi (form içi gösterim). */
export function useSubjectProgress(kind: ScopeKind, id: string, period: string) {
  return useQuery({
    queryKey: ['targets', 'subject-progress', kind, id, period] as const,
    enabled: Boolean(id && period),
    queryFn: () => targetsApi.targetProgress({ period, scope: kind, id }),
  });
}

export function useMyTargetProgress(period: string) {
  return useQuery({
    queryKey: targetKeys.myProgress(period),
    queryFn: async () => buildPeriodResult(period, await targetsApi.myTargetProgress(period)),
    staleTime: 60 * 1000,
  });
}

/** Benim atanmış hedef dönemlerim (son 12 dönem). */
export function useMyTargets() {
  return useQuery({ queryKey: ['targets', 'mine'] as const, queryFn: () => targetsApi.myTargets(), staleTime: 60 * 1000 });
}

export function useSaveTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id, body }: { kind: ScopeKind; id: string; body: TargetUpsertBody }) =>
      kind === 'user'
        ? targetsApi.saveUserTarget(id, body)
        : kind === 'department'
          ? targetsApi.saveDepartmentTarget(id, body)
          : targetsApi.saveDivisionTarget(id, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: targetKeys.all }),
  });
}
