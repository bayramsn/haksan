import assert from 'node:assert/strict';
import test from 'node:test';
import { ticketMachineLine } from './machines.ts';

test('servis kartı marka, model ve seriyi tek satırda birleştirir', () => {
  assert.equal(ticketMachineLine({ brand: 'Haksan', model: 'HEX 3015', serialNumber: 'SN-9' }), 'Haksan · HEX 3015 · SN-9');
  assert.equal(ticketMachineLine({ brand: null, model: '', serialNumber: 'SN-9' }), 'SN-9');
  assert.equal(ticketMachineLine(null), null);
  assert.equal(ticketMachineLine({ brand: null, model: null, serialNumber: null }), null);
});
