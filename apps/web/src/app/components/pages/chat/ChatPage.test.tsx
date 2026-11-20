// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPage } from './ChatPage';

const mock = vi.hoisted(() => ({
  service: { conversations: vi.fn(), directory: vi.fn(), conversation: vi.fn(), messages: vi.fn(), pinned: vi.fn(), markRead: vi.fn(), sendMessage: vi.fn(), pinMessage: vi.fn(), forwardMessage: vi.fn() },
  realtime: null as null | { onMessageEvent: () => void },
}));
vi.mock('../../../../lib/services', () => ({ chatService: mock.service, fileService: {} }));
vi.mock('../../../../lib/auth', () => ({ useAuth: () => ({ user: { id: 'me' }, hasRole: () => true }) }));
vi.mock('../../../../lib/voiceCall', () => ({ useVoiceCall: () => ({ supported: false }) }));
vi.mock('../../../../lib/chatRealtime', () => ({ useChatRealtime: (params: any) => { mock.realtime = params; }, useChatTyping: () => ({ typingNames: [], sendTyping: vi.fn() }) }));
vi.mock('../tasks/TaskFormDialog', () => ({ TaskFormDialog: () => null }));
vi.mock('./GroupDialogs', () => ({ NewGroupDialog: () => null, GroupSettingsDialog: () => null }));
vi.mock('./ShareRecordDialog', () => ({ ShareRecordDialog: () => null }));
vi.mock('../../brand', () => ({ BrandIllustration: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
afterEach(cleanup);
const message = (id: string, body: string, createdAt = '2026-11-06T10:00:00.000Z') => ({ id, body, createdAt, senderId: 'other', senderName: 'Ahmet', kind: 'text', attachments: [], reactions: [], replyTo: null, refCard: null, location: null, editedAt: null });
const group = { id: 'group', type: 'group', title: 'Satış Ekibi', onlyAdminsCanPost: false, myRole: 'admin', members: [{ userId: 'me', fullName: 'Ben' }, { userId: 'other', fullName: 'Ahmet Yılmaz' }], unreadCount: 0, lastMessage: null };
beforeEach(() => {
  vi.clearAllMocks();
  mock.service.conversations.mockResolvedValue([group]);
  mock.service.directory.mockResolvedValue([]);
  mock.service.conversation.mockResolvedValue(group);
  mock.service.messages.mockResolvedValue({ messages: [message('latest', 'Son fiyat')], hasMore: false });
  mock.service.pinned.mockResolvedValue([]);
  mock.service.markRead.mockResolvedValue({ ok: true });
  mock.service.sendMessage.mockResolvedValue({});
});
describe('chat collaboration', () => {
  it('filters mentions independently from other unread chats', async () => {
    mock.service.conversations.mockResolvedValue([
      { ...group, unreadCount: 1, mentionCount: 1 },
      { ...group, id: 'other-group', title: 'Servis Ekibi', unreadCount: 3, mentionCount: 0 },
    ]);
    render(<ChatPage />);
    expect(await screen.findByText('Servis Ekibi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '@Bahsetmeler' }));
    expect(screen.getByText('Satış Ekibi')).toBeTruthy();
    expect(screen.queryByText('Servis Ekibi')).toBeNull();
  });
  it('opens the conversation supplied by a mention notification', async () => {
    render(<ChatPage initialConversationId="group" />);
    expect(await screen.findByText('Son fiyat')).toBeTruthy();
    expect(mock.service.conversation).toHaveBeenCalledWith('group');
  });
  it('keeps the notification message visible until the user returns to the live conversation', async () => {
    mock.service.messages.mockImplementation(async (_id: string, query: { around?: string }) => ({
      messages: query.around ? [message('old', 'Bildirimdeki mesaj')] : [message('latest', 'Son fiyat')],
      hasMore: false,
    }));
    render(<ChatPage initialConversationId="group" initialMessageId="old" />);
    const target = await screen.findByText('Bildirimdeki mesaj');
    expect(target.closest('#chat-message-old')).toBeTruthy();
    expect(mock.service.messages).toHaveBeenCalledWith('group', { around: 'old', limit: 31 });
    await act(async () => { mock.realtime?.onMessageEvent(); });
    expect(screen.getByText('Bildirimdeki mesaj')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Anlık mesaj akışına dön' }));
    expect(await screen.findByText('Son fiyat')).toBeTruthy();
  });
  it('sends selected group mentions as user IDs', async () => {
    render(<ChatPage initialConversationId="group" />);
    const input = await screen.findByPlaceholderText('Mesaj yazın…');
    fireEvent.change(input, { target: { value: '@Ah', selectionStart: 3 } });
    fireEvent.click(await screen.findByRole('button', { name: '@Ahmet Yılmaz' }));
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(mock.service.sendMessage).toHaveBeenCalledWith('group', expect.objectContaining({ body: '@Ahmet Yılmaz', mentionUserIds: ['other'] })));
  });
  it('keeps earlier messages visible when a realtime refresh arrives', async () => {
    mock.service.messages.mockImplementation((_id: string, query: any) => Promise.resolve(query.before
      ? { messages: [message('old', 'Geçen ayki fiyat', '2026-10-01T10:00:00.000Z')], hasMore: false }
      : { messages: [message('latest', 'Son fiyat')], hasMore: true }));
    render(<ChatPage initialConversationId="group" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Önceki mesajları yükle' }));
    expect(await screen.findByText('Geçen ayki fiyat')).toBeTruthy();
    await act(async () => { mock.realtime?.onMessageEvent(); });
    expect(screen.getByText('Geçen ayki fiyat')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Anlık mesaj akışına dön' }));
    await waitFor(() => expect(screen.queryByText('Geçen ayki fiyat')).toBeNull());
  });
});
