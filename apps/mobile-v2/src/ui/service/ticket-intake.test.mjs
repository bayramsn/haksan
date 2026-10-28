import test from 'node:test';
import assert from 'node:assert/strict';
import { intakeContactInfo, machineIntakeCustomer, ticketIntakeMetadata } from './ticket-intake.ts';

test('service intake prefers selected contact and falls back separately to the company default', () => {
  const firm = { phones: [{ phone: 'first', isDefault: false }, { phone: 'default', isDefault: true }], emails: [{ email: 'firm@example.com', isDefault: true }] };
  assert.deepEqual(intakeContactInfo({ mobilePhone: 'mobile', workPhone: 'work' }, firm), { phone: 'mobile', email: 'firm@example.com' });
  assert.deepEqual(intakeContactInfo({ otherPhone: 'other', personalEmail: 'person@example.com' }, firm), { phone: 'other', email: 'person@example.com' });
  assert.deepEqual(intakeContactInfo(null, firm), { phone: 'default', email: 'firm@example.com' });
  assert.deepEqual(intakeContactInfo(null, null), { phone: '', email: '' });
});

test('choosing another company machine switches customer and invalidates contact; clearing keeps customer', () => {
  const company = { id: 'a', name: 'Firma A' };
  assert.deepEqual(machineIntakeCustomer({ companyId: 'b', companyName: 'Firma B' }, company), { company: { id: 'b', name: 'Firma B' }, resetContact: true });
  assert.deepEqual(machineIntakeCustomer({ companyId: 'a', companyName: 'Firma A' }, company), { company, resetContact: false });
  assert.deepEqual(machineIntakeCustomer(null, company), { company, resetContact: false });
  assert.deepEqual(machineIntakeCustomer({ companyId: 'b', companyName: 'Firma B' }, null), { company: { id: 'b', name: 'Firma B' }, resetContact: true });
});


test('intake quote requirement persists alongside notes, complaint and activity metadata', () => {
  const input = { quoteRequired: true, serviceNote: ' Servis notu ', diagnosis: ' Arıza ', createdAt: '2026-10-24 10:00', stamp: 42, byUserId: 'technician' };
  const metadata = ticketIntakeMetadata(input);
  assert.equal(metadata.quoteRequired, true);
  assert.equal(metadata.serviceStage, 'Request Opened');
  assert.equal(metadata.noteHistory[0].text, 'Servis notu');
  assert.equal(metadata.complaints[0].text, 'Arıza');
  assert.equal(metadata.activityHistory[0].byUserId, 'technician');
  assert.equal(metadata.timerStatus, 'idle');
  const withoutQuote = ticketIntakeMetadata({ ...input, quoteRequired: false, serviceNote: ' ', diagnosis: '' });
  assert.equal(withoutQuote.quoteRequired, false);
  assert.deepEqual(withoutQuote.noteHistory, []);
  assert.deepEqual(withoutQuote.complaints, []);
});
