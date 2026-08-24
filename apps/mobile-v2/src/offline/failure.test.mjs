import assert from 'node:assert/strict';
import test from 'node:test';
// Node 22 .ts dosyalarındaki tipleri sıyırarak çalıştırır; böylece test gerçek
// kaynağı import eder, kopyasını değil.
import { classifyFailure } from './failure.ts';

test('ağ yoksa kuyruk beklemeye alınır', () => {
  assert.equal(classifyFailure({ offline: true, retryCount: 0, maxRetries: 5 }), 'offline');
});

test('4xx kalıcıdır, kuyruğu tıkamasın diye düşürülür', () => {
  for (const status of [400, 403, 404, 422]) {
    assert.equal(classifyFailure({ offline: false, status, retryCount: 0, maxRetries: 5 }), 'drop');
  }
});

test('409 çakışması kullanıcı çözümü için ayrılır', () => {
  assert.equal(classifyFailure({ offline: false, status: 409, retryCount: 0, maxRetries: 5 }), 'conflict');
});

test('5xx deneme hakkı bitene kadar tekrarlanır', () => {
  assert.equal(classifyFailure({ offline: false, status: 503, retryCount: 0, maxRetries: 3 }), 'retry');
  assert.equal(classifyFailure({ offline: false, status: 503, retryCount: 1, maxRetries: 3 }), 'retry');
  assert.equal(classifyFailure({ offline: false, status: 503, retryCount: 2, maxRetries: 3 }), 'drop');
});
