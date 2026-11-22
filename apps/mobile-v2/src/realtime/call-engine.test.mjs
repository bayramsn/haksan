import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createCallEngine } from './call-engine.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function makeStream() {
  const audio = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  const video = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  return { getTracks: () => [audio, video], getAudioTracks: () => [audio], getVideoTracks: () => [video] };
}
function harness({ id = 'a', peer = 'b', mediaGate, authorized = true, ringTimeoutMs = 10000, synchronousIce = false, connectionTimeoutMs = 30000 } = {}) {
  let context = 'account/division', mediaRequests = 0;
  const listeners = new Map(), emitted = [], peers = [], streams = [], notifications = [], states = [];
  const socket = {
    on(name, fn) { listeners.set(name, fn); }, off(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
    emit(name, data, ack) { emitted.push({ name, data }); socket.forward?.(name, data); ack?.({ ok: true }); },
  };
  const engine = createCallEngine({
    socket, getConversation: async (conversationId) => authorized && conversationId === 'dm' ? { id: 'dm', peerUserId: peer, peerName: peer.toUpperCase() } : null,
    getContextKey: () => context, getIceConfig: async () => ({ iceServers: [] }), ringTimeoutMs, connectionTimeoutMs,
    media: {
      getUserMedia: async () => { mediaRequests++; if (mediaGate) await mediaGate.promise; const stream = makeStream(); streams.push(stream); return stream; },
      createPeer: () => {
        const pc = {
          remoteDescription: null, closed: false, addedIce: [], tracks: [],
          onicecandidate: null, ontrack: null, onconnectionstatechange: null,
          addTrack(track) { this.tracks.push(track); },
          createOffer: async () => ({ type: 'offer', sdp: `offer-${id}` }), createAnswer: async () => ({ type: 'answer', sdp: `answer-${id}` }),
          async setLocalDescription(value) { this.localDescription = value; if (synchronousIce) this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: `sync-${id}` }) } }); }, async setRemoteDescription(value) { this.remoteDescription = value; },
          async addIceCandidate(value) { this.addedIce.push(value); }, close() { this.closed = true; },
        }; peers.push(pc); return pc;
      },
    }, onChange: (state) => states.push(state), notify: (message) => notifications.push(message),
  });
  return { engine, socket, emitted, peers, streams, notifications, states, listeners, incoming: (event, data) => listeners.get(event)?.(data), setContext(value) { context = value; }, get mediaRequests() { return mediaRequests; } };
}

test('iki yetkili DM ucu offer/answer ve ICE alışverişinden sonra kapanır, tüm medya serbest bırakılır', async (t) => {
  const a = harness(), b = harness({ id: 'b', peer: 'a' });
  t.after(() => { a.engine.dispose(); b.engine.dispose(); });
  function connect(from, to, fromUserId) {
    from.socket.forward = (event, data) => to.incoming(event === 'call:invite' ? 'call:incoming' : event, { ...data, fromUserId, fromName: fromUserId });
  }
  connect(a, b, 'a'); connect(b, a, 'b');
  await a.engine.start('dm', 'video'); await tick();
  assert.equal(a.engine.getState().phase, 'outgoing'); assert.equal(b.engine.getState().phase, 'incoming');
  assert.equal(b.mediaRequests, 0, 'gelen davet kendiliğinden mikrofon/kamera izni istemez');
  a.peers[0].onicecandidate({ candidate: { toJSON: () => ({ candidate: 'ice-a' }) } });
  await b.engine.accept(); await tick();
  assert.equal(a.engine.getState().phase, 'active'); assert.equal(b.engine.getState().phase, 'active');
  assert.deepEqual(b.peers[0].addedIce, [{ candidate: 'ice-a' }]);
  b.peers[0].onicecandidate({ candidate: { toJSON: () => ({ candidate: 'ice-b' }) } }); await tick();
  assert.deepEqual(a.peers[0].addedIce, [{ candidate: 'ice-b' }]);
  a.engine.toggleMute(); assert.equal(a.streams[0].getAudioTracks()[0].enabled, false);
  a.engine.toggleCamera(); assert.equal(a.streams[0].getVideoTracks()[0].enabled, false);
  a.engine.hangup();
  for (const h of [a, b]) { assert.equal(h.engine.getState().phase, 'idle'); assert.ok(h.peers[0].closed); assert.ok(h.streams[0].getTracks().every((track) => track.stopped)); }
});

test('setLocalDescription içindeki senkron ICE invite/answer sonrası iletilir; async DM doğrulamasında kaybolmaz', async (t) => {
  const a = harness({ synchronousIce: true }), b = harness({ id: 'b', peer: 'a', synchronousIce: true });
  t.after(() => { a.engine.dispose(); b.engine.dispose(); });
  a.socket.forward = (event, data) => b.incoming(event === 'call:invite' ? 'call:incoming' : event, { ...data, fromUserId: 'a' });
  b.socket.forward = (event, data) => a.incoming(event, { ...data, fromUserId: 'b' });
  await a.engine.start('dm'); await tick();
  assert.deepEqual(a.emitted.map((event) => event.name), ['call:invite', 'call:ice']);
  await b.engine.accept(); await tick();
  assert.deepEqual(b.emitted.map((event) => event.name), ['call:answer', 'call:ice']);
  assert.deepEqual(b.peers[0].addedIce, [{ candidate: 'sync-a' }]);
  assert.deepEqual(a.peers[0].addedIce, [{ candidate: 'sync-b' }]);
});

test('yetkisiz başlangıç ve sahte DM daveti medya istemez', async (t) => {
  const h = harness({ authorized: false }); t.after(() => h.engine.dispose());
  await h.engine.start('dm');
  h.incoming('call:incoming', { conversationId: 'dm', fromUserId: 'b', offer: { type: 'offer', sdp: 'x' } }); await tick();
  assert.equal(h.mediaRequests, 0); assert.equal(h.engine.getState().phase, 'idle'); assert.equal(h.emitted.length, 0);
});

test('yanlış kişi/konuşma answer, ICE ve kapatma sinyalleri aktif aramayı etkileyemez', async (t) => {
  const h = harness(); t.after(() => h.engine.dispose()); await h.engine.start('dm');
  for (const payload of [{ conversationId: 'dm', fromUserId: 'intruder' }, { conversationId: 'other', fromUserId: 'b' }]) {
    for (const event of ['call:answer', 'call:ice', 'call:end', 'call:reject']) h.incoming(event, { ...payload, answer: { type: 'answer', sdp: 'bad' }, candidate: { candidate: 'bad' } });
  }
  await tick(); assert.equal(h.engine.getState().phase, 'outgoing'); assert.equal(h.peers[0].remoteDescription, null); assert.equal(h.peers[0].addedIce.length, 0);
});

for (const action of ['hangup', 'context']) {
  test(`mikrofon izni beklerken ${action} eski aramayı yeniden canlandırmaz`, async (t) => {
    const gate = deferred(), h = harness({ mediaGate: gate }); t.after(() => h.engine.dispose());
    const starting = h.engine.start('dm'); await tick(); assert.equal(h.mediaRequests, 1);
    if (action === 'hangup') h.engine.hangup(); else h.setContext('other-account');
    gate.resolve(); await starting;
    assert.equal(h.engine.getState().phase, 'idle'); assert.equal(h.peers.length, 0);
    assert.ok(h.streams[0].getTracks().every((track) => track.stopped)); assert.ok(!h.emitted.some((event) => event.name === 'call:invite'));
  });
}

test('kabul sırasında izin beklerken kapatma medyayı temizler, yinelenen kabul tek izin ister', async (t) => {
  const gate = deferred(), h = harness({ mediaGate: gate }); t.after(() => h.engine.dispose());
  h.incoming('call:incoming', { conversationId: 'dm', fromUserId: 'b', offer: { type: 'offer', sdp: 'valid' } }); await tick();
  const accepting = h.engine.accept(); await tick(); await h.engine.accept(); assert.equal(h.mediaRequests, 1);
  h.engine.hangup(); gate.resolve(); await accepting;
  assert.equal(h.engine.getState().phase, 'idle'); assert.ok(h.streams[0].getTracks().every((track) => track.stopped)); assert.equal(h.peers.length, 0);
});

test('bekleyen ICE 128 adayla sınırlı, meşgul aramada ikinci davet medya açmaz', async (t) => {
  const h = harness(); t.after(() => h.engine.dispose());
  const payload = { conversationId: 'dm', fromUserId: 'b', offer: { type: 'offer', sdp: 'valid' } };
  h.incoming('call:incoming', payload); await tick();
  for (let i = 0; i < 200; i++) h.incoming('call:ice', { ...payload, candidate: { candidate: `candidate-${i}` } });
  h.incoming('call:incoming', payload); await tick();
  assert.ok(h.emitted.some((event) => event.name === 'call:reject' && event.data.reason === 'busy'));
  await h.engine.accept(); assert.equal(h.peers[0].addedIce.length, 128); assert.equal(h.mediaRequests, 1);
});

test('yanıtsız arama süre sonunda kapanır, dispose soket dinleyicilerini kaldırır', async () => {
  const h = harness({ ringTimeoutMs: 5 });
  await h.engine.start('dm'); await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(h.engine.getState().phase, 'idle'); assert.ok(h.peers[0].closed);
  h.engine.dispose(); assert.equal(h.listeners.size, 0);
});

test('eski native pakette WebRTC modülü yoksa adapter JS paketini yüklemeden güvenle kapanır', async () => {
  const code = ts.transpileModule(readFileSync(new URL('../native/chat-call.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const exports = {}, loaded = [];
  vm.runInNewContext(code, { exports, require: (name) => { loaded.push(name); if (name === 'react-native') return { NativeModules: {} }; throw new Error('WebRTC eski pakette yüklenmemeli'); } });
  assert.equal(await exports.getChatCallMedia(), null);
  assert.deepEqual(loaded, ['react-native']);
});

test('desteklenen native adapter yükleme sırasında izin istemez, yalnız explicit getUserMedia çağrısı ister', async () => {
  const code = ts.transpileModule(readFileSync(new URL('../native/chat-call.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const exports = {}, requests = [];
  vm.runInNewContext(code, { exports, require: (name) => {
    if (name === 'react-native') return { NativeModules: { WebRTCModule: {} }, AppState: { currentState: 'active' } };
    if (name === 'react-native-webrtc') return { mediaDevices: { getUserMedia: async (constraints) => { requests.push(JSON.parse(JSON.stringify(constraints))); return makeStream(); } } };
    throw new Error(`Unexpected adapter import: ${name}`);
  } });
  const media = await exports.getChatCallMedia(); assert.equal(requests.length, 0);
  await media.getUserMedia('audio'); await media.getUserMedia('video');
  assert.deepEqual(requests, [{ audio: true, video: false }, { audio: true, video: true }]);
});

test('iOS permission-sheet inactive state waits for foreground and stops acquired media if backgrounded',async()=>{
 const code=ts.transpileModule(readFileSync(new URL('../native/chat-call.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
 for(const next of ['active','background']){
  let listener;const stream=makeStream(), app={currentState:'inactive',addEventListener:(_,fn)=>{listener=fn;return {remove:()=>{listener=undefined}}}};
  const exports={};vm.runInNewContext(code,{exports,setTimeout,clearTimeout,require:name=>{
   if(name==='react-native')return {NativeModules:{WebRTCModule:{}},AppState:app};
   if(name==='react-native-webrtc')return {mediaDevices:{getUserMedia:async()=>stream}};
   throw new Error(name);
  }});
  const adapter=await exports.getChatCallMedia();const pending=adapter.getUserMedia('audio');await tick();assert.ok(listener);
  app.currentState=next;listener(next);
  if(next==='active'){assert.equal(await pending,stream);assert.equal(stream.getAudioTracks()[0].stopped,false);}
  else {await assert.rejects(pending,/iptal/);assert.equal(stream.getAudioTracks()[0].stopped,true);}
  assert.equal(listener,undefined);
 }
});


test('SDP yanıtı süreyi başlatmaz; medya bağlantısı kurulamazsa kaynaklar kapanır', async (t) => {
  const h = harness({ connectionTimeoutMs: 15 }); t.after(() => h.engine.dispose());
  await h.engine.start('dm');
  h.incoming('call:answer', { conversationId: 'dm', fromUserId: 'b', answer: { type: 'answer', sdp: 'answer' } }); await tick();
  assert.equal(h.engine.getState().startedAt, undefined);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(h.engine.getState().phase, 'idle');
  assert.ok(h.streams[0].getTracks().every((track) => track.stopped));
  assert.ok(h.notifications.includes('Arama bağlantısı kurulamadı.'));
});

test('gerçek RTC bağlantısı süreyi başlatır ve bağlantı zaman aşımını kaldırır', async (t) => {
  const h = harness({ connectionTimeoutMs: 15 }); t.after(() => h.engine.dispose());
  await h.engine.start('dm');
  h.incoming('call:answer', { conversationId: 'dm', fromUserId: 'b', answer: { type: 'answer', sdp: 'answer' } }); await tick();
  h.peers[0].connectionState = 'connected'; h.peers[0].onconnectionstatechange();
  assert.equal(h.engine.getState().connected, true); assert.ok(h.engine.getState().startedAt);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(h.engine.getState().phase, 'active');
});
