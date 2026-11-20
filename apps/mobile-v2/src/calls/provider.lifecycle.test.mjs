import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { callAnswerSchema, callEndSchema, callIceSchema, iceConfigurationSchema, incomingCallSchema } from './protocol.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const filename = fileURLToPath(new URL('./provider.native.tsx', import.meta.url));
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const conversationId = '11111111-1111-4111-8111-111111111111';
const fromUserId = '22222222-2222-4222-8222-222222222222';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness(mediaPromise, available = true) {
  const effects = [];
  const listeners = new Map();
  const emitted = [];
  const connections = [];
  const audioEvents = [];
  let holds = 0;
  const socket = {
    connected: true,
    on: (name, callback) => listeners.set(name, callback),
    off: name => listeners.delete(name),
    timeout() { return this; },
    emit(name, data, ack) { emitted.push({ name, data }); ack?.(null, { ok: true }); },
  };
  class Peer {
    connectionState = 'new';
    remoteDescription = null;
    candidates = [];
    events = new Map();
    constructor() { connections.push(this); }
    addTrack() {}
    addEventListener(name, callback) { this.events.set(name, callback); }
    async createOffer() { return { type: 'offer', sdp: 'v=0' }; }
    async createAnswer() { return { type: 'answer', sdp: 'v=0' }; }
    async setLocalDescription() {}
    async setRemoteDescription(value) { this.remoteDescription = value; }
    async addIceCandidate(value) { this.candidates.push(value); }
    close() { this.closed = true; }
  }
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useContext: () => null,
    useCallback: callback => callback,
    useMemo: callback => callback(),
    useRef: value => ({ current: value }),
    useState: value => [value, () => {}],
    useEffect: callback => effects.push(callback),
  };
  const modules = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': {
      NativeModules: available ? { WebRTCModule: {}, InCallManager: {} } : {},
      StyleSheet: { create: value => value }, Alert: { alert() {} },
      DeviceEventEmitter: { addListener: () => ({ remove() {} }) },
    },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    'react-native-webrtc': {
      RTCPeerConnection: Peer,
      RTCSessionDescription: class { constructor(value) { Object.assign(this, value); } },
      RTCIceCandidate: class { constructor(value) { Object.assign(this, value); } },
      mediaDevices: { getUserMedia: () => mediaPromise },
    },
    'react-native-incall-manager': { __esModule: true, default: {
      start: value => audioEvents.push(['start', value]),
      stop: () => audioEvents.push(['stop']),
      startRingtone() {}, stopRingtone() {}, setForceSpeakerphoneOn() {},
    } },
    '@/src/api/client': { request: async () => ({ iceServers: [{ urls: 'stun:example.com' }], expiresAt: null }) },
    '@/src/realtime/chat': { getChatCallSocket: () => socket, retainChatCallSocket: () => { holds++; return () => { holds--; }; } },
    './protocol': { callAnswerSchema, callEndSchema, callIceSchema, iceConfigurationSchema, incomingCallSchema },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: name => { if (!(name in modules)) throw Error(`Unexpected module ${name}`); return modules[name]; },
    setTimeout, clearTimeout, setInterval, clearInterval,
  }, { filename });
  const rendered = exports.NativeCallProvider({ children: null, userId: '33333333-3333-4333-8333-333333333333' });
  const cleanups = effects.map(effect => effect()).filter(value => typeof value === 'function');
  return {
    api: rendered.props.value, socket, emitted, connections, audioEvents,
    get holds() { return holds; },
    receive: (name, data) => listeners.get(name)?.(data),
    unmount: () => cleanups.forEach(cleanup => cleanup()),
  };
}

function stream() {
  const track = { id: 'audio', kind: 'audio', stopped: false, stop() { this.stopped = true; } };
  return { track, getTracks: () => [track], release() { this.released = true; } };
}

test('hanging up during native permission prompt stops and releases the late stream', async () => {
  const media = deferred();
  const app = harness(media.promise);
  const pending = app.api.startCall(conversationId, 'Ahmet');
  await new Promise(resolve => setImmediate(resolve));
  await app.receive('call:end', { conversationId, fromUserId });
  const late = stream();
  media.resolve(late);
  await pending;
  assert.equal(late.track.stopped, true);
  assert.equal(late.released, true);
  assert.equal(app.connections.length, 0);
  assert.equal(app.audioEvents.length, 0);
  assert.equal(app.holds, 0);
  app.unmount();
});

test('unmounting an established outgoing call closes media and releases the session socket', async () => {
  const local = stream();
  const app = harness(Promise.resolve(local));
  await app.api.startCall(conversationId, 'Ahmet');
  assert.equal(app.holds, 1);
  assert.equal(app.emitted.some(event => event.name === 'call:invite'), true);
  app.unmount();
  assert.equal(app.connections[0].closed, true);
  assert.equal(local.track.stopped, true);
  assert.equal(local.released, true);
  assert.equal(app.holds, 0);
  assert.equal(app.audioEvents.at(-1)[0], 'stop');
  assert.equal(app.emitted.at(-1).name, 'call:end');
});

test('an older binary without the native modules cannot start a call', async () => {
  const app = harness(Promise.resolve(stream()), false);
  assert.equal(app.api.supported, false);
  await app.api.startCall(conversationId, 'Ahmet');
  assert.equal(app.connections.length, 0);
  assert.equal(app.emitted.length, 0);
  app.unmount();
});

test('incoming calls reject busy invitations and ignore another peer ending the call', async () => {
  const app = harness(Promise.resolve(null));
  const invitation = { conversationId, fromUserId, fromName: 'Ahmet', offer: { type: 'offer', sdp: 'v=0' }, mode: 'audio' };
  app.receive('call:incoming', invitation);
  assert.equal(app.holds, 1);
  app.receive('call:incoming', invitation);
  assert.ok(app.emitted.some(event => event.name === 'call:reject' && event.data.reason === 'busy'));
  app.receive('call:end', { conversationId, fromUserId: '44444444-4444-4444-8444-444444444444' });
  assert.equal(app.holds, 1);
  app.receive('call:end', { conversationId, fromUserId });
  assert.equal(app.holds, 0);
  assert.equal(app.connections.length, 0);
  app.unmount();
});
