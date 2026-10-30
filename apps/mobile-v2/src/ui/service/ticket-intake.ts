type Person = { mobilePhone?: string | null; workPhone?: string | null; otherPhone?: string | null; workEmail?: string | null; personalEmail?: string | null; otherEmail?: string | null };
type Firm = { phones?: { phone: string; isDefault: boolean }[]; emails?: { email: string; isDefault: boolean }[] };

/** Web intake priority: selected contact, then the firm's default/general contact. */
export function intakeContactInfo(person?: Person | null, company?: Firm | null) {
  return {
    phone: person?.mobilePhone || person?.workPhone || person?.otherPhone || company?.phones?.find((item) => item.isDefault)?.phone || company?.phones?.[0]?.phone || '',
    email: person?.workEmail || person?.personalEmail || person?.otherEmail || company?.emails?.find((item) => item.isDefault)?.email || company?.emails?.[0]?.email || '',
  };
}

/** Selecting another firm's machine changes the customer and clears its old contact. */
export function machineIntakeCustomer(machine: { companyId?: string | null; companyName?: string | null } | null, current: { id: string; name: string } | null) {
  const changed = !!machine?.companyId && machine.companyId !== current?.id;
  return { company: changed ? { id: machine!.companyId!, name: machine!.companyName || 'Seçili firma' } : current, resetContact: changed };
}

/** Match web store.addService's metadata contract, including the intake quote choice. */
export function ticketIntakeMetadata(input: { quoteRequired: boolean; serviceNote: string; diagnosis: string; createdAt: string; stamp: number; byUserId?: string }) {
  const { quoteRequired, serviceNote, diagnosis, createdAt, stamp, byUserId } = input;
  return {
    quoteRequired, serviceStage: 'Request Opened', serviceQuote: null,
    noteHistory: serviceNote.trim() ? [{ id: `srv-note-${stamp}`, text: serviceNote.trim(), createdAt, byUserId }] : [],
    complaints: diagnosis.trim() ? [{ id: `srv-complaint-${stamp}`, text: diagnosis.trim(), createdAt, byUserId }] : [],
    activityHistory: [{ id: `srv-act-${stamp}`, text: 'Servis talebi açıldı.', createdAt, byUserId }],
    operations: [], timerStatus: 'idle', timerElapsedSeconds: 0, serviceHourlyRate: 120, serviceCurrency: 'USD',
  };
}
