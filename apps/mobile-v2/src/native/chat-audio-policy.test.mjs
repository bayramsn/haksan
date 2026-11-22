import test from 'node:test';
import assert from 'node:assert/strict';
import { chatAudioDuration, validateVoiceRecording, signedChatAudioUrl, isChatAudioMime } from './chat-audio-policy.ts';
test('voice capture validates m4a, native file, minimum duration and 25 MB bounds',()=>{
 validateVoiceRecording({uri:'file:///cache/voice.m4a',bytes:1024,durationMillis:1000});
 for(const patch of [{uri:'https://outside/voice.m4a'},{uri:'file:///cache/voice.html'},{bytes:0},{bytes:26*1024*1024},{durationMillis:10}])assert.throws(()=>validateVoiceRecording({uri:'file:///cache/voice.m4a',bytes:1024,durationMillis:1000,...patch}));
 assert.equal(chatAudioDuration(62000),'1:02');assert.equal(chatAudioDuration(-1),'0:00');
});
test('signed playback accepts HTTPS and local development URLs without accepting unsafe schemes or user info',()=>{
 const base='https://crm.example/api/v1';
 assert.equal(signedChatAudioUrl('https://storage.example/a?X-Amz-Signature=signed',base),'https://storage.example/a?X-Amz-Signature=signed');
 assert.equal(signedChatAudioUrl('/api/v1/files/a',base),'https://crm.example/api/v1/files/a');
 for(const url of ['javascript:alert(1)','file:///secret','https://user:pass@storage.example/a','http://storage.example/a','https://storage.example/a#private'])assert.throws(()=>signedChatAudioUrl(url,base));
 assert.equal(signedChatAudioUrl('http://127.0.0.1/a',base,true),'http://127.0.0.1/a');
 assert.equal(isChatAudioMime('audio/mp4'),true);assert.equal(isChatAudioMime('image/png'),false);
});
