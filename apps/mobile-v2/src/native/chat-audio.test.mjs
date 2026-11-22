import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as policy from './chat-audio-policy.ts';
const source=ts.transpileModule(readFileSync(new URL('./chat-audio.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
function harness({native=true,granted=true}={}){
 let scope='a',number=0;const stored=new Map(),events=new Set(),calls={record:0,release:0,permissions:0,play:0,downloads:[],modes:[],signed:[]};
 const app={currentState:'active',addEventListener:(_,cb)=>{events.add(cb);return {remove:()=>events.delete(cb)}}};
 class File {
  constructor(root,name){this.uri=name?`${root}/${name}`:root;}
  get exists(){return stored.has(this.uri)} get size(){return stored.get(this.uri)??0}
  create(){stored.set(this.uri,0)} delete(){stored.delete(this.uri)} move(target){stored.set(target.uri,this.size);stored.delete(this.uri)}
  writableStream(){return {getWriter:()=>({write:async bytes=>stored.set(this.uri,this.size+bytes.byteLength),close:async()=>{},abort:async()=>{},releaseLock:()=>{}})}}
 }
 class Recorder {
  isRecording=false;uri='file:///cache/native.m4a';
  constructor(options){calls.options=options}
  async prepareToRecordAsync(){stored.set(this.uri,128)}
  record(options){calls.record++;calls.recordOptions=options;this.isRecording=true}
  getStatus(){return {isRecording:this.isRecording,durationMillis:1000}}
  async stop(){this.isRecording=false}
  release(){calls.release++}
 }
 class Player {playing=false;duration=2;currentTime=0;isLoaded=true;play(){this.playing=true;calls.play++}pause(){this.playing=false}remove(){}async seekTo(v){this.currentTime=v}}
 const sdk={AudioModule:{AudioRecorder:Recorder},requestRecordingPermissionsAsync:async()=>{calls.permissions++;return {granted}},setAudioModeAsync:async mode=>calls.modes.push(mode),RecordingPresets:{HIGH_QUALITY:{extension:'.m4a',sampleRate:44100,ios:{outputFormat:'aac'},android:{outputFormat:'mpeg4'}}},createAudioPlayer:()=>new Player()};
 const mocks={
  'react-native':{AppState:app,Platform:{OS:'ios'}},'expo-modules-core':{requireOptionalNativeModule:()=>native?{}:null},'expo-file-system':{File,Paths:{cache:'file:///cache'}},'expo-crypto':{randomUUID:()=>String(++number)},
  'expo/fetch': { fetch: async (url, options) => {
    calls.downloads.push({url, options}); let done = false;
    return { ok: true, headers: {get: () => null}, body: {getReader: () => ({
      read: async () => {if(done) return {done:true}; done=true; return {done:false,value:new Uint8Array([1,2,3])};},
      cancel: async () => {}, releaseLock: () => {},
    })} };
  } },
  '@/src/api/client':{requestContextKey:()=>scope,RequestScopeChangedError:class ScopeError extends Error{}},'@/src/api/config':{apiBaseUrl:()=> 'https://crm.example/api/v1'},'@/src/api/endpoints':{files:{signedDownload:async id=>{calls.signed.push(id);return {downloadUrl:'https://storage.example/voice?signature=signed',mimeType:'audio/mp4',filename:'voice.m4a'}}}},'./chat-audio-policy':policy,'expo-audio':sdk,
 };
 const exports={};vm.runInNewContext(source,{exports,require:name=>{assert.ok(name in mocks,`Unexpected dependency ${name}`);return mocks[name]},__DEV__:false,AbortController,URL,setTimeout,clearTimeout});
 return {api:exports,calls,stored,setScope:()=>scope='b',emit:state=>{app.currentState=state;for(const cb of events)cb(state)}};
}
test('missing native audio does not request microphone or crash until explicit use',async()=>{
 const h=harness({native:false}),session=new h.api.ChatAudioSession();await assert.rejects(session.startRecording(),/güncel/);assert.equal(h.calls.permissions,0);await session.dispose();
});
test('permission denial never starts a recorder',async()=>{
 const h=harness({granted:false}),session=new h.api.ChatAudioSession();await assert.rejects(session.startRecording(),/mikrofon izni/);assert.equal(h.calls.record,0);await session.dispose();
});
test('capture is explicit, foreground-only, prepares a manual m4a attachment and cleans every temp file',async()=>{
 const h=harness(),session=new h.api.ChatAudioSession();assert.equal(h.calls.record,0);await session.startRecording();assert.equal(h.calls.recordOptions.forDuration,300);assert.equal(h.calls.options.numberOfChannels,1);assert.ok(h.calls.modes.every(mode=>mode.shouldPlayInBackground===false));
 const result=await session.finishRecording();assert.equal(result.upload.mimeType,'audio/mp4');assert.equal(result.upload.extension,'m4a');assert.equal(result.upload.sizeBytes,128);assert.equal(h.calls.signed.length,0);assert.equal(h.calls.downloads.length,0);assert.ok(h.stored.has(result.upload.uri));
 await session.previewRecording();assert.equal(h.calls.play,1);await session.dispose();assert.equal(h.stored.size,0);
});
test('scope changes and backgrounding stop captured audio and prevent later use',async()=>{
 const h=harness(),session=new h.api.ChatAudioSession();await session.startRecording();h.setScope();assert.throws(()=>session.status());await session.dispose();assert.equal(h.stored.size,0);
 const h2=harness(),s2=new h2.api.ChatAudioSession();await s2.startRecording();h2.emit('background');await s2.dispose();assert.throws(()=>s2.status());assert.equal(h2.stored.size,0);
});
test('playback obtains the authorized signed URL without forwarding tokens and deletes cached media on stop',async()=>{
 const h=harness(),session=new h.api.ChatAudioSession();await session.playAttachment('file-id');assert.deepEqual(h.calls.signed,['file-id']);assert.equal(h.calls.downloads[0].options.credentials,'omit');assert.equal(h.calls.downloads[0].options.headers,undefined);assert.equal(h.calls.downloads[0].options.redirect,'error');assert.equal(h.calls.play,1);assert.equal(h.stored.size,1);await h.api.stopChatAudio();assert.equal(h.stored.size,0);
});
