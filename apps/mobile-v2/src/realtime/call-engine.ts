export type CallMode = 'audio' | 'video';
export type CallTrack = { enabled: boolean; stop(): void };
export type CallStream = { getTracks(): CallTrack[]; getAudioTracks(): CallTrack[]; getVideoTracks(): CallTrack[]; toURL?(): string };
type Description = { type: string; sdp?: string };
export type CallPeer = {
  remoteDescription?: unknown; connectionState?: string;
  onicecandidate: ((event: { candidate?: { toJSON?(): unknown } | null }) => void) | null;
  ontrack: ((event: { streams: CallStream[] }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  addTrack(track: CallTrack, stream: CallStream): unknown;
  createOffer(): Promise<Description>; createAnswer(): Promise<Description>;
  setLocalDescription(value: Description): Promise<void>; setRemoteDescription(value: Description): Promise<void>;
  addIceCandidate(value: unknown): Promise<void>; close(): void;
};
export type CallMedia = { getUserMedia(mode: CallMode): Promise<CallStream>; createPeer(config: unknown): CallPeer };
export type CallState = {
  phase: 'idle' | 'preparing' | 'incoming' | 'outgoing' | 'active';
  conversationId?: string; peerUserId?: string; peerName?: string; mode?: CallMode;
  localStream?: CallStream; remoteStream?: CallStream; startedAt?: number; connected?: boolean; muted: boolean; cameraOff: boolean;
};
export type CallSocket = { on(event: string, fn: (data: any) => void): unknown; off(event: string, fn: (data: any) => void): unknown; emit(event: string, data: unknown, ack?: (data?: { ok?: boolean }) => void): unknown };
type Conversation = { id: string; peerUserId: string; peerName: string };
type Signal = { conversationId: string; fromUserId: string; fromName?: string; offer?: Description; answer?: Description; candidate?: unknown; mode?: CallMode; reason?: string };
type Options = {
  socket: CallSocket; getConversation(id: string): Promise<Conversation | null>;
  getContextKey(): string; getIceConfig(): Promise<unknown>; media: CallMedia;
  onChange(state: CallState): void; notify(message: string): void; ringTimeoutMs?: number; connectionTimeoutMs?: number;
};

/** Foreground-only DM calls. Socket signaling never grants CRM/conversation access. */
export function createCallEngine(options: Options) {
  let state: CallState = { phase: 'idle', muted: false, cameraOff: false };
  let generation = 0, disposed = false, busy = false;
  let context = '', pc: CallPeer | undefined, stream: CallStream | undefined, offer: Description | undefined;
  let queue: unknown[] = [], timer: ReturnType<typeof setTimeout> | undefined;
  let localQueue: unknown[] = [], signaled = false;
  let pendingIncoming: { conversationId: string; fromUserId: string; context: string; ice: unknown[] } | undefined;
  const update = (next: CallState) => { state = next; options.onChange({ ...state }); };
  const valid = (ticket: number) => !disposed && ticket === generation && context === options.getContextKey();
  function cleanup() {
    generation++; busy = false;
    if (timer) clearTimeout(timer);
    timer = undefined; queue = []; localQueue = []; signaled = false; pendingIncoming = undefined; offer = undefined;
    if (pc) { pc.onicecandidate = null; pc.ontrack = null; pc.onconnectionstatechange = null; pc.close(); }
    pc = undefined;
    stream?.getTracks().forEach((track) => track.stop()); stream = undefined;
    state.remoteStream?.getTracks().forEach((track) => track.stop());
    update({ phase: 'idle', muted: false, cameraOff: false });
  }
  function emit(event: string, payload: unknown) { if (context === options.getContextKey()) options.socket.emit(event, payload); }
  function hangup() {
    if (state.phase !== 'idle') emit(state.phase === 'incoming' ? 'call:reject' : 'call:end', { conversationId: state.conversationId });
    cleanup();
  }
  function ringTimer() { if (timer) clearTimeout(timer); timer = setTimeout(() => { options.notify('Arama yanıtlanmadı.'); hangup(); }, options.ringTimeoutMs ?? 45_000); }
  function connectionTimer() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!state.connected) timer = setTimeout(() => { options.notify('Arama bağlantısı kurulamadı.'); hangup(); }, options.connectionTimeoutMs ?? 30_000);
  }
  function ensure(ticket: number) {
    if (valid(ticket)) return;
    if (ticket === generation) cleanup();
    throw new Error('Arama bağlamı değişti.');
  }
  async function authorize(id: string, peer?: string) {
    const conversation = await options.getConversation(id);
    if (!conversation || conversation.id !== id || !conversation.peerUserId || (peer && conversation.peerUserId !== peer)) throw new Error('Bu birebir görüşmeye erişilemiyor.');
    return conversation;
  }
  async function build(ticket: number) {
    const config = await options.getIceConfig(); ensure(ticket);
    const acquired = await options.media.getUserMedia(state.mode ?? 'audio');
    if (!valid(ticket)) { acquired.getTracks().forEach((track) => track.stop()); ensure(ticket); }
    stream = acquired;
    const peer = options.media.createPeer(config); pc = peer;
    acquired.getTracks().forEach((track) => peer.addTrack(track, acquired));
    peer.onicecandidate = ({ candidate }) => {
      if (!candidate || !valid(ticket)) return;
      const value = candidate.toJSON?.() ?? candidate;
      if (signaled) emit('call:ice', { conversationId: state.conversationId, candidate: value });
      else if (localQueue.length < 128) localQueue.push(value);
    };
    peer.ontrack = ({ streams }) => { if (valid(ticket)) update({ ...state, remoteStream: streams[0] }); };
    peer.onconnectionstatechange = () => {
      if (!valid(ticket)) return;
      if (peer.connectionState === 'connected') {
        if (timer) clearTimeout(timer); timer = undefined;
        update({ ...state, connected: true, startedAt: state.startedAt ?? Date.now() });
      } else if (['failed', 'disconnected', 'closed'].includes(peer.connectionState ?? '')) {
        options.notify('Arama bağlantısı kesildi.'); hangup();
      }
    };
    update({ ...state, localStream: acquired });
    return peer;
  }
  async function flush(peer: CallPeer, ticket: number) {
    for (const candidate of queue.splice(0)) { ensure(ticket); try { await peer.addIceCandidate(candidate); } catch { /* Invalid candidates do not prevent remaining ICE. */ } ensure(ticket); }
  }
  function flushLocal(ticket: number) {
    if (!valid(ticket)) return;
    signaled = true;
    for (const candidate of localQueue.splice(0)) {
      if (!valid(ticket)) return;
      emit('call:ice', { conversationId: state.conversationId, candidate });
    }
  }
  async function start(id: string, mode: CallMode = 'audio') {
    if (disposed || busy || state.phase !== 'idle') return;
    busy = true; context = options.getContextKey(); const ticket = ++generation;
    update({ phase: 'preparing', conversationId: id, mode, muted: false, cameraOff: false });
    try {
      const conversation = await authorize(id); ensure(ticket);
      update({ ...state, peerUserId: conversation.peerUserId, peerName: conversation.peerName });
      const peer = await build(ticket); ensure(ticket);
      const description = await peer.createOffer(); ensure(ticket);
      await peer.setLocalDescription(description); ensure(ticket);
      update({ ...state, phase: 'outgoing' }); busy = false; ringTimer();
      options.socket.emit('call:invite', { conversationId: id, offer: description, mode }, (reply) => {
        if (valid(ticket) && reply?.ok === false) { options.notify('Arama başlatılamadı.'); cleanup(); }
      });
      flushLocal(ticket);
    } catch (error) { if (ticket === generation) { options.notify(error instanceof Error ? error.message : 'Arama başlatılamadı.'); cleanup(); } }
  }
  async function accept() {
    if (disposed || busy || state.phase !== 'incoming' || !state.conversationId || !offer) return;
    if (context !== options.getContextKey()) return cleanup();
    busy = true; const ticket = generation, description = offer, id = state.conversationId, peerId = state.peerUserId;
    try {
      await authorize(id, peerId); ensure(ticket);
      const peer = await build(ticket); ensure(ticket);
      await peer.setRemoteDescription(description); ensure(ticket); await flush(peer, ticket);
      const answer = await peer.createAnswer(); ensure(ticket);
      await peer.setLocalDescription(answer); ensure(ticket);
      if (timer) clearTimeout(timer); timer = undefined; busy = false;
      update({ ...state, phase: 'active' }); connectionTimer();
      emit('call:answer', { conversationId: id, to: peerId, answer });
      flushLocal(ticket);
    } catch (error) { if (ticket === generation) { options.notify(error instanceof Error ? error.message : 'Arama kabul edilemedi.'); hangup(); } }
  }
  const matches = (data: Signal) => state.phase !== 'idle' && data?.conversationId === state.conversationId && data.fromUserId === state.peerUserId && context === options.getContextKey();
  async function incoming(data: Signal) {
    if (disposed || !data?.conversationId || !data.fromUserId || data.offer?.type !== 'offer' || typeof data.offer.sdp !== 'string' || data.offer.sdp.length > 65_536 || (data.mode && !['audio', 'video'].includes(data.mode))) return;
    const initialContext = options.getContextKey(), initialGeneration = generation;
    const pending = state.phase === 'idle' && !busy && !pendingIncoming
      ? { conversationId: data.conversationId, fromUserId: data.fromUserId, context: initialContext, ice: [] as unknown[] } : undefined;
    if (pending) pendingIncoming = pending;
    let conversation: Conversation;
    try { conversation = await authorize(data.conversationId, data.fromUserId); } catch { if (pendingIncoming === pending) pendingIncoming = undefined; return; }
    if (disposed || initialContext !== options.getContextKey() || initialGeneration !== generation) { if (pendingIncoming === pending) pendingIncoming = undefined; return; }
    if (busy || state.phase !== 'idle' || (pendingIncoming && pendingIncoming !== pending)) { options.socket.emit('call:reject', { conversationId: data.conversationId, reason: 'busy' }); return; }
    queue = pending?.ice ?? []; pendingIncoming = undefined;
    context = initialContext; ++generation; offer = data.offer;
    update({ phase: 'incoming', conversationId: data.conversationId, peerUserId: conversation.peerUserId, peerName: conversation.peerName, mode: data.mode ?? 'audio', muted: false, cameraOff: false }); ringTimer();
  }
  async function answer(data: Signal) {
    if (!matches(data) || busy || state.phase !== 'outgoing' || !pc || data.answer?.type !== 'answer' || typeof data.answer.sdp !== 'string' || data.answer.sdp.length > 65_536) return;
    busy = true; const ticket = generation, peer = pc;
    try { await authorize(data.conversationId, data.fromUserId); ensure(ticket); await peer.setRemoteDescription(data.answer); ensure(ticket); await flush(peer, ticket);
      if (timer) clearTimeout(timer); timer = undefined; busy = false; update({ ...state, phase: 'active' }); connectionTimer();
    } catch { if (ticket === generation) hangup(); }
  }
  async function ice(data: Signal) {
    if (!data?.candidate) return;
    try { if (JSON.stringify(data.candidate).length > 16_384) return; } catch { return; }
    if (!matches(data)) {
      const pending = pendingIncoming;
      if (pending && pending.context === options.getContextKey() && pending.conversationId === data.conversationId && pending.fromUserId === data.fromUserId && pending.ice.length < 128) pending.ice.push(data.candidate);
      return;
    }
    if (!pc?.remoteDescription) { if (queue.length < 128) queue.push(data.candidate); return; }
    try { await pc.addIceCandidate(data.candidate); } catch { /* Ignore malformed ICE. */ }
  }
  const handlers: Record<string, (data: any) => void> = {
    'call:incoming': (data) => { void incoming(data); }, 'call:answer': (data) => { void answer(data); }, 'call:ice': (data) => { void ice(data); },
    'call:reject': (data: Signal) => { if (matches(data)) { options.notify(data.reason === 'busy' ? 'Karşı taraf başka bir aramada.' : 'Arama reddedildi.'); cleanup(); } },
    'call:end': (data: Signal) => { if (matches(data)) cleanup(); }, disconnect: () => cleanup(),
  };
  Object.entries(handlers).forEach(([event, handler]) => options.socket.on(event, handler));
  return {
    start, accept, hangup, reject: hangup, getState: () => ({ ...state }),
    toggleMute() { if (!stream || context !== options.getContextKey()) return; const muted = !state.muted; stream.getAudioTracks().forEach((track) => { track.enabled = !muted; }); update({ ...state, muted }); },
    toggleCamera() { if (!stream || context !== options.getContextKey()) return; const cameraOff = !state.cameraOff; stream.getVideoTracks().forEach((track) => { track.enabled = !cameraOff; }); update({ ...state, cameraOff }); },
    dispose() { hangup(); disposed = true; Object.entries(handlers).forEach(([event, handler]) => options.socket.off(event, handler)); },
  };
}
