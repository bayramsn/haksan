import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NoteTemplateCreateInput, NoteTemplateUpdateInput } from '@haksan/shared';
import { request } from './client';
import { useCan } from '@/src/auth/AuthProvider';

export type NoteTemplate = { id: string; title: string; body: string; scope: string };
export function useNoteTemplates(scope: string) {
  const canRead = useCan('quotes.read');
  return useQuery({ queryKey: ['note-templates', scope], queryFn: () => request<NoteTemplate[]>('/note-templates', { query: { scope } }), enabled: canRead });
}
export function useSaveNoteTemplate() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, body }: { id?: string; body: NoteTemplateCreateInput | NoteTemplateUpdateInput }) => request<NoteTemplate>(id ? `/note-templates/${id}` : '/note-templates', { method: id ? 'PATCH' : 'POST', body }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['note-templates'] }); } });
}
export function useDeleteNoteTemplate() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => request(`/note-templates/${id}`, { method: 'DELETE' }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['note-templates'] }); } });
}
