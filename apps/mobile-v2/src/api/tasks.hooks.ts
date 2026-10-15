import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { tasks, type TaskInput, type TaskStatus, type TaskView } from './endpoints';
import { tasksExt } from './crm-general.api';

export const taskKeys = {
  all: ['tasks'] as const,
  list: (query: { view?: TaskView; search?: string; companyId?: string; opportunityId?: string }): QueryKey => [
    'tasks',
    'list',
    query,
  ],
  counts: ['tasks', 'counts'] as const,
  detail: (id: string): QueryKey => ['tasks', 'detail', id],
  assignees: ['tasks', 'assignees'] as const,
};

export function useTaskList(query: { view?: TaskView; search?: string; companyId?: string; opportunityId?: string }) {
  return useQuery({
    queryKey: taskKeys.list(query),
    queryFn: () => tasks.list({ ...query, pageSize: 100 }),
    staleTime: 60 * 1000,
  });
}

export function useTaskCounts() {
  return useQuery({ queryKey: taskKeys.counts, queryFn: () => tasks.counts(), staleTime: 60 * 1000 });
}

export function useTaskDetail(id: string) {
  return useQuery({ queryKey: taskKeys.detail(id), queryFn: () => tasks.get(id), enabled: Boolean(id) });
}

export function useTaskAssignees() {
  return useQuery({ queryKey: taskKeys.assignees, queryFn: () => tasks.assignees(), staleTime: 10 * 60 * 1000 });
}

/** Liste, sayımlar ve detay aynı veriyi gösteriyor; biri değişince hepsi tazelenir. */
function settleTasks(qc: ReturnType<typeof useQueryClient>) {
  return () => void qc.invalidateQueries({ queryKey: taskKeys.all });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: TaskInput) => tasks.create(body), onSuccess: settleTasks(qc) });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<TaskInput> }) => tasks.update(id, body),
    onSuccess: settleTasks(qc),
  });
}

export function useAddTaskComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) => tasks.comment(id, comment),
    onSuccess: (task) => {
      qc.setQueryData(taskKeys.detail(task.id), task);
      void qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

/**
 * Durum değişikliği. Sunucu `done` için 1..480 karakterlik tamamlama notu
 * ister; not olmadan gönderilen `done` 400 döner.
 */
export function useToggleTaskDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, completionNote }: { id: string; status: TaskStatus; completionNote?: string }) =>
      tasksExt.update(id, status === 'done' ? { status, completionNote } : { status }),
    onSuccess: settleTasks(qc),
  });
}
