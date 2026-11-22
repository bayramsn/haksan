import * as Crypto from 'expo-crypto';
import { requestContextKey } from '@/src/api/client';
import { createMailDocumentStore } from './mail-document-store';
export type { MailDocumentDraft } from './mail-document-store';
const store=createMailDocumentStore(requestContextKey,()=>Crypto.randomUUID());
export const stageMailDocument=store.stage;
export const loadMailDocument=store.read;
export const discardMailDocument=store.remove;
