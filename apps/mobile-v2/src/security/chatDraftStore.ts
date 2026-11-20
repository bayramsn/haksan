type DraftStorage = {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

const segment = /^[a-zA-Z0-9-]{1,64}$/;
export function chatDraftKey(tenantId?: string, userId?: string, conversationId?: string) {
  if (!tenantId || !userId || !conversationId || ![tenantId, userId, conversationId].every((part) => segment.test(part))) return null;
  return `chat.draft.v1.${tenantId}.${userId}.${conversationId}`;
}

export function createChatDraftStore(storage: DraftStorage) {
  const revisions = new Map<string, number>();
  const pending = new Map<string, Promise<boolean>>();
  const fallback = new Map<string, string>();
  const maxFallbackDrafts = 16;

  const revision = (key: string) => revisions.get(key) ?? 0;

  return {
    revision,
    advance(key: string) {
      const next = revision(key) + 1;
      revisions.set(key, next);
      return next;
    },
    async read(key: string) {
      const operation = pending.get(key);
      if (operation) await operation;
      if (fallback.has(key)) return fallback.get(key) ?? '';
      return (await storage.read(key)) ?? '';
    },
    write(key: string, value: string, version: number) {
      const previous = pending.get(key);
      const operation = (async () => {
        if (previous) await previous;
        if (revision(key) !== version) return true;
        try {
          if (value) await storage.write(key, value);
          else await storage.remove(key);
          fallback.delete(key);
          return true;
        } catch {
          // A device that cannot save this draft can still restore it during this session.
          fallback.delete(key);
          fallback.set(key, value);
          if (fallback.size > maxFallbackDrafts) {
            const oldest = fallback.keys().next().value;
            if (oldest !== undefined) fallback.delete(oldest);
          }
          return false;
        }
      })();
      pending.set(key, operation);
      void operation.then(() => {
        if (pending.get(key) === operation) pending.delete(key);
      });
      return operation;
    },
  };
}
