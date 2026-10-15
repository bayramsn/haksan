import type { QueryKey } from '@tanstack/react-query';

/** Sohbet cache anahtarları hook ve realtime katmanı arasında döngü yaratmadan paylaşılır. */
export const chatKeys = {
  all: ['chat'] as const,
  conversations: ['chat', 'conversations'] as const,
  messages: (id: string): QueryKey => ['chat', 'messages', id],
};
