import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from '@/src/security/secure-store';
import { createChatDraftStore } from './chatDraftStore';

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const drafts = createChatDraftStore({
  read: (key) => SecureStore.getItemAsync(key, options),
  write: (key, value) => SecureStore.setItemAsync(key, value, options),
  remove: (key) => SecureStore.deleteItemAsync(key, options),
});

// The caller mounts this hook with a key scoped to the account and conversation.
export function useChatDraft(key: string | null) {
  const [text, setText] = useState('');
  const [storageError, setStorageError] = useState(false);
  const revision = useRef(key ? drafts.revision(key) : 0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestText = useRef('');
  const mounted = useRef(false);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!key) return;
    const version = revision.current;
    void drafts.write(key, latestText.current, version).then((saved) => {
      if (mounted.current && version === revision.current) setStorageError(!saved);
    });
  }, [key]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (key) {
      const initialRevision = drafts.revision(key);
      void drafts.read(key).then((saved) => {
        if (!active || revision.current !== initialRevision || drafts.revision(key) !== initialRevision) return;
        latestText.current = saved;
        setText(saved);
      }).catch(() => {
        if (active) setStorageError(true);
      });
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && timer.current) flush();
    });
    return () => {
      subscription.remove();
      active = false;
      mounted.current = false;
      if (timer.current) flush();
    };
  }, [flush, key]);

  function update(value: string) {
    revision.current = key ? drafts.advance(key) : revision.current + 1;
    latestText.current = value;
    if (mounted.current) setText(value);
    if (timer.current) clearTimeout(timer.current);
    if (key) timer.current = setTimeout(flush, 300);
  }

  function clearSent(version: number) {
    if (version !== revision.current || (key && drafts.revision(key) !== version)) return;
    update('');
    flush();
  }

  return { text, storageError, update, clearSent, currentRevision: () => revision.current };
}
