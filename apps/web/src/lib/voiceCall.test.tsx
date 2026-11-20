// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceCallProvider, useVoiceCall } from './voiceCall';

const mocks = vi.hoisted(() => ({
  emit: vi.fn(), listeners: new Map<string, (event: any) => unknown>(),
  media: vi.fn(), display: vi.fn(), ice: vi.fn(), toast: { error: vi.fn(), info: vi.fn() },
}));
vi.mock('./chatRealtime', () => ({
  chatRealtimeEnabled: () => true,
  getChatSocket: () => ({ connected: true, emit: mocks.emit,
    on: (name: string, callback: (event: any) => unknown) => mocks.listeners.set(name, callback),
    off: (name: string) => mocks.listeners.delete(name),
  }),
}));
vi.mock('./services', () => ({ chatService: { webrtcConfig: () => mocks.ice() } }));
vi.mock('sonner', () => ({ toast: mocks.toast }));

class Peer {
  static peers: Peer[] = [];
  connectionState = 'new';
  remoteDescription: unknown = null;
  onconnectionstatechange?: () => void;
  onicecandidate?: (event: { candidate: { toJSON(): RTCIceCandidateInit } }) => void;
  close = vi.fn(); addTrack = vi.fn(); addIceCandidate = vi.fn();
  sender = { track: { kind: "video" }, replaceTrack: vi.fn(async (_track: unknown) => {}) };
  getSenders = () => [this.sender];
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'offer' }));
  createAnswer = vi.fn(async () => ({ type: 'answer', sdp: 'answer' }));
  setLocalDescription = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async (description: unknown) => { this.remoteDescription = description; });
  constructor() { Peer.peers.push(this); }
}
function Controls() {
  const call = useVoiceCall();
  return <><button onClick={() => void call.startCall('dm-a', 'Ahmet', 'video')}>Start</button><span data-testid="phase">{call.phase}</span></>;
}
function setup() { return render(<VoiceCallProvider><Controls /></VoiceCallProvider>); }
function stream() {
  const track = Object.assign(new EventTarget(), { stop: vi.fn(), enabled: true, readyState: "live" });
  return { track, getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [track] };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mocks.listeners.clear(); Peer.peers = [];
  vi.stubGlobal('RTCPeerConnection', Peer);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: mocks.media, getDisplayMedia: mocks.display } });
  mocks.ice.mockResolvedValue({ iceServers: [] });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('web calls', () => {
  it('waits for invitation acknowledgement before sending locally gathered ICE', async () => {
    mocks.media.mockResolvedValue(stream()); setup();
    await act(async () => { fireEvent.click(screen.getByText('Start')); });
    const candidate = { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 };
    act(() => Peer.peers[0].onicecandidate?.({ candidate: { toJSON: () => candidate } }));
    expect(mocks.emit).not.toHaveBeenCalledWith('call:ice', expect.anything());
    const invitation = mocks.emit.mock.calls.find(([event]) => event === 'call:invite')!;
    act(() => invitation[2]({ ok: true }));
    expect(mocks.emit).toHaveBeenCalledWith('call:ice', { conversationId: 'dm-a', candidate });
  });

  async function activate() {
    await act(async () => { fireEvent.click(screen.getByText('Start')); });
    await act(async () => {
      await mocks.listeners.get('call:answer')?.({ conversationId: 'dm-a', fromUserId: 'peer', answer: { type: 'answer' } });
    });
  }

  it('restores the original camera track when the browser ends sharing', async () => {
    const camera = stream();
    const display = stream();
    mocks.media.mockResolvedValue(camera);
    mocks.display.mockResolvedValue(display);
    setup();
    await activate();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ekranı paylaş' })); });
    expect(mocks.display).toHaveBeenCalledWith({ video: true, audio: false });
    expect(Peer.peers[0].sender.replaceTrack).toHaveBeenLastCalledWith(display.track);
    await act(async () => { display.track.dispatchEvent(new Event('ended')); });
    expect(Peer.peers[0].sender.replaceTrack).toHaveBeenLastCalledWith(camera.track);
    expect(display.track.stop).toHaveBeenCalledOnce();
    expect(camera.track.stop).not.toHaveBeenCalled();
  });

  it('releases screen capture obtained after the call ends', async () => {
    const display = stream();
    let resolve!: (value: unknown) => void;
    mocks.media.mockResolvedValue(stream());
    mocks.display.mockImplementation(() => new Promise((done) => { resolve = done; }));
    setup();
    await activate();
    fireEvent.click(screen.getByRole('button', { name: 'Ekranı paylaş' }));
    fireEvent.click(screen.getByText('Kapat'));
    await act(async () => { resolve(display); });
    expect(display.track.stop).toHaveBeenCalledOnce();
    expect(Peer.peers[0].sender.replaceTrack).not.toHaveBeenCalled();
  });

  it('stops late camera/microphone permission results after cancellation and blocks concurrent starts', async () => {
    const media = stream();
    let resolve!: (value: unknown) => void;
    mocks.media.mockImplementation(() => new Promise((done) => { resolve = done; }));
    setup();
    fireEvent.click(screen.getByText('Start'));
    fireEvent.click(screen.getByText('Start'));
    expect(mocks.media).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('phase').textContent).toBe('outgoing');
    fireEvent.click(screen.getByText('Kapat'));
    await act(async () => { resolve(media); });
    expect(media.track.stop).toHaveBeenCalledOnce();
    expect(Peer.peers).toHaveLength(0);
    expect(mocks.emit).not.toHaveBeenCalledWith('call:invite', expect.anything(), expect.anything());
    expect(screen.getByTestId('phase').textContent).toBe('idle');
  });

  it('sends the video offer and releases all media when the provider unmounts', async () => {
    const media = stream(); mocks.media.mockResolvedValue(media);
    const view = setup();
    await act(async () => { fireEvent.click(screen.getByText('Start')); });
    expect(mocks.media).toHaveBeenCalledWith({ audio: true, video: true });
    expect(mocks.emit).toHaveBeenCalledWith('call:invite', expect.objectContaining({ conversationId: 'dm-a', mode: 'video' }), expect.any(Function));
    view.unmount();
    expect(media.track.stop).toHaveBeenCalledOnce();
    expect(Peer.peers[0].close).toHaveBeenCalledOnce();
    expect(mocks.emit).toHaveBeenCalledWith('call:end', { conversationId: 'dm-a' });
  });

  it('keeps a call during a temporary network interruption and ends a failed connection', async () => {
    mocks.media.mockResolvedValue(stream()); setup();
    await act(async () => { fireEvent.click(screen.getByText('Start')); });
    const peer = Peer.peers[0];
    act(() => { peer.connectionState = 'disconnected'; peer.onconnectionstatechange?.(); vi.advanceTimersByTime(3_000); });
    expect(peer.close).not.toHaveBeenCalled();
    act(() => { peer.connectionState = 'connected'; peer.onconnectionstatechange?.(); vi.advanceTimersByTime(12_000); });
    expect(screen.getByTestId('phase').textContent).toBe('outgoing');
    act(() => { peer.connectionState = 'failed'; peer.onconnectionstatechange?.(); });
    expect(screen.getByTestId('phase').textContent).toBe('idle');
    expect(mocks.emit).toHaveBeenCalledWith('call:end', { conversationId: 'dm-a' });
  });

  it('ignores a late answer after hangup while remote description is being applied', async () => {
    mocks.media.mockResolvedValue(stream()); setup();
    await act(async () => { fireEvent.click(screen.getByText('Start')); });
    let finish!: () => void;
    Peer.peers[0].setRemoteDescription.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    let pending: unknown;
    act(() => { pending = mocks.listeners.get('call:answer')?.({ conversationId: 'dm-a', fromUserId: 'peer', answer: { type: 'answer' } }); });
    fireEvent.click(screen.getByText('Kapat'));
    await act(async () => { finish(); await pending; });
    expect(screen.getByTestId('phase').textContent).toBe('idle');
  });
});
