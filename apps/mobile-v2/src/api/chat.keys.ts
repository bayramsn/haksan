import type { QueryKey } from '@tanstack/react-query';

/** Sohbet cache anahtarları hook ve realtime katmanı arasında döngü yaratmadan paylaşılır. */
export const chatKeys = {
  all: ['chat'] as const,
  conversations: ['chat', 'conversations'] as const,
  /** `conversations` önekiyle başlar: realtime'ın liste tazelemesi detayı da tazeler. */
  conversation: (id: string): QueryKey => ['chat', 'conversations', id],
  messages: (id: string): QueryKey => ['chat', 'messages', id],
};
