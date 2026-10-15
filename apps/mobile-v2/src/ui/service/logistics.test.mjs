import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDeliveryPayload,
  buildShipmentPayload,
  cargoLabelInfo,
  carrierShare,
  companyUserInfo,
  completionError,
  deliveryDocument,
  fillUserInfo,
  defaultTrackingNo,
  deliveryDraft,
  deliveryKpis,
  deliveryStep,
  durationMinutes,
  emptyShipmentLine,
  etaState,
  filterShipments,
  installationDraft,
  installationKpis,
  installationPayload,
  installationStep,
  installationsForTab,
  isSigned,
  parseDay,
  routeStep,
  shipmentKpis,
  shipmentPartyName,
  suggestedFormNo,
  upcomingDeliveries,
  upcomingInstallations,
} from './logistics.ts';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const status = (code) => ({ code });

test('sevkiyat ETA, rota adımı ve KPI', () => {
  assert.deepEqual(etaState(null, NOW), { label: 'ETA yok', tone: 'neutral' });
  assert.equal(etaState('2026-10-13T12:00:00Z', NOW).label, '2 gün gecikmiş');
  assert.equal(etaState('2026-10-15T12:00:00Z', NOW).label, 'Bugün');
  assert.deepEqual(etaState('2026-10-17T12:00:00Z', NOW), { label: '2 gün kaldı', tone: 'warning' });
  assert.equal(etaState('2026-11-15T12:00:00Z', NOW).tone, 'success');
  assert.equal(routeStep('cleared'), 2);
  assert.equal(routeStep('preparing'), 0);
  const rows = [
    { direction: 'incoming', carrier: 'Aras', status: status('in_transit'), senderName: 'Tedarikçi' },
    { direction: 'outgoing', carrier: 'Aras', status: status('at_customs'), company: { legalTitle: 'ABC A.Ş.', shortName: 'ABC' } },
    { direction: 'outgoing', carrier: null, status: status('delivered') },
  ];
  assert.deepEqual(shipmentKpis(rows), { total: 3, inTransit: 1, customs: 1, delivered: 1 });
  assert.equal(filterShipments(rows, { direction: 'outgoing', status: 'delivered' }).length, 1);
  assert.deepEqual(carrierShare(rows), [
    { name: 'Aras', count: 2, share: 67 },
    { name: '', count: 1, share: 33 },
  ]);
  assert.equal(shipmentPartyName(rows[0]), 'Tedarikçi');
  assert.equal(shipmentPartyName(rows[1]), 'ABC');
  assert.equal(shipmentPartyName(rows[2]), null);
  assert.equal(defaultTrackingNo(0.0421), 'TRK-042100');
});

test('sevkiyat formu web doğrulama mesajlarını verir', () => {
  const base = {
    direction: 'outgoing',
    companyId: '',
    senderCompanyId: '',
    senderName: 'HAKSAN',
    transportMode: 'road',
    carrierCompanyId: '',
    carrier: 'Aras',
    productCategoryCode: 'TEZGAH',
    destinationWarehouseId: '',
    destination: 'Bursa',
    deliveryAddressSnapshot: '',
    trackingNo: 'TRK-1',
    origin: '',
    loadingDate: '',
    eta: '2026-10-20',
    statusCode: 'preparing',
    notes: '',
    lines: [{ ...emptyShipmentLine(), description: 'Torna', quantity: '2', packageQuantity: '1' }],
  };
  assert.deepEqual(buildShipmentPayload({ ...base, trackingNo: ' ' }), { error: 'Takip no giriniz' });
  assert.deepEqual(buildShipmentPayload({ ...base, senderName: '' }), { error: 'Gönderici firma seçin veya yazın' });
  assert.deepEqual(buildShipmentPayload({ ...base, carrier: '' }), { error: 'Taşıyıcı firma seçin veya yazın' });
  assert.deepEqual(buildShipmentPayload({ ...base, destination: '' }), { error: 'Varış yeri veya firma adresi seçin' });
  assert.deepEqual(buildShipmentPayload({ ...base, lines: [emptyShipmentLine()] }), { error: 'Ürün satırlarını tamamlayınız' });
  const ok = buildShipmentPayload(base);
  assert.ok('body' in ok);
  assert.equal(ok.body.senderName, 'HAKSAN');
  assert.equal(ok.body.companyId, undefined);
  assert.deepEqual(ok.body.items, [{ description: 'Torna', quantity: 2, sortOrder: 0, packageQuantity: 1, packageUnitCode: 'package' }]);
  assert.match(ok.body.eta, /^2026-10-20T/);
  const linked = buildShipmentPayload({
    ...base,
    lines: [{ ...emptyShipmentLine(), inventoryItemId: 'inv-1', productModelId: 'pm-1', serialNumber: ' SN-9 ', description: 'Torna' }],
  });
  assert.deepEqual(linked.body.items, [
    { inventoryItemId: 'inv-1', productModelId: 'pm-1', description: 'Torna', serialNumber: 'SN-9', quantity: 1, sortOrder: 0 },
  ]);
});

test('kurulum KPI, sekme, adım ve süre', () => {
  const rows = [
    { status: status('scheduled'), scheduledDate: '2026-10-20', formData: null, assignedTo: { fullName: 'Ali' } },
    { status: status('scheduled'), scheduledDate: '2026-10-18', formData: null, assignedTo: null },
    { status: status('completed'), scheduledDate: null, formData: { formNo: 'DR-1' } },
    { status: status('in_progress'), scheduledDate: null, formData: null },
  ];
  assert.deepEqual(installationKpis(rows, 2), { total: 4, planned: 2, completed: 1, forms: 3 });
  assert.equal(installationsForTab(rows, 'open').length, 3);
  assert.equal(installationsForTab(rows, 'forms').length, 1);
  assert.deepEqual(upcomingInstallations(rows).map((row) => row.scheduledDate), ['2026-10-18', '2026-10-20']);
  assert.deepEqual(rows.map(installationStep), [1, 0, 4, 2]);
  assert.equal(durationMinutes('1', '30'), 90);
  assert.equal(suggestedFormNo('ab-12c-def'), 'DR-AB12CD');
  assert.equal(suggestedFormNo(null), '');
});

test('kurulum tutanağı taslağı kayıtlı veriyi ve makineyi birleştirir', () => {
  const defaults = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
  const draft = installationDraft(
    {
      customerDeviceId: 'dev-1',
      company: { legalTitle: 'ABC A.Ş.', shortName: null },
      contact: { fullName: 'Ayşe' },
      customerDevice: { serialNumber: 'SN1', model: 'M', productModelName: 'MV-850', brandName: 'Haksan', controlUnit: 'Fanuc' },
    },
    { checks: [{ id: 'a', label: 'A', status: 'done', note: 'ok' }, { id: 'x', label: 'Özel', status: 'not_done' }], problem: { hasProblem: false } },
    defaults,
  );
  assert.equal(draft.formNo, 'DR-DEV1');
  assert.equal(draft.tezgahModel, 'MV-850');
  assert.equal(draft.cncModel, 'Fanuc');
  assert.equal(draft.firma, 'ABC A.Ş.');
  assert.deepEqual(draft.checks.map((check) => [check.id, check.status]), [['a', 'done'], ['b', ''], ['x', 'not_done']]);
  assert.equal(draft.problemHasProblem, 'no');
  assert.match(completionError(draft), /Kurulum tarihi/);
  const filled = { ...draft, kurulumTarihi: '2026-10-15', checks: draft.checks.map((check) => ({ ...check, status: 'done' })) };
  assert.equal(completionError(filled), null);
  assert.match(completionError({ ...filled, problemHasProblem: 'yes' }), /açıklama/);
  const payload = installationPayload(filled);
  assert.equal(payload.kullanici.adres, undefined);
  assert.equal(payload.checks[0].note, 'ok');
  assert.equal(payload.problem.hasProblem, false);
  assert.match(payload.kurulumTarihi, /^2026-10-15T/);
});

test('teslimat KPI, adım ve gövde', () => {
  const rows = [
    { status: 'completed', signedBy: 'Ali', formData: null, deliveryDate: '2026-10-01' },
    { status: 'pending', signedBy: ' ', formData: { tezgah: { model: 'MV' } }, deliveryDate: '2026-10-20' },
    { status: 'pending', signedBy: null, formData: {}, deliveryDate: '2026-10-10' },
  ];
  assert.deepEqual(deliveryKpis(rows), { total: 3, completed: 1, pending: 2 });
  assert.deepEqual(rows.map(deliveryStep), [3, 1, 0]);
  assert.deepEqual(upcomingDeliveries(rows).map((row) => row.deliveryDate), ['2026-10-10', '2026-10-20']);
  const draft = deliveryDraft(null);
  assert.deepEqual(buildDeliveryPayload(draft), { error: 'Firma seçiniz' });
  const ok = buildDeliveryPayload({ ...draft, companyId: 'c1', deliveryDate: '2026-10-15', tezgahModel: 'MV' });
  assert.ok('body' in ok);
  assert.equal(ok.body.status, 'pending');
  assert.deepEqual(ok.body.formData.tezgah, { model: 'MV' });
  assert.equal(parseDay('2026-02-30'), null);
});

test('tutanak kullanıcı bilgisi firma kaydından türetilir', () => {
  const info = companyUserInfo({
    addresses: [{ fullAddress: null, street: 'Atatürk Cd.', buildingNumber: '5', locality: null, district: 'Esenyurt', province: 'İstanbul', isDefault: true }],
    phones: [
      { phone: '0212 000 00 01', phoneType: 'fax', isDefault: false },
      { phone: '0532 000 00 00', phoneType: 'mobile', isDefault: false },
      { phone: '0212 000 00 00', phoneType: 'main', isDefault: true },
    ],
    emails: [{ email: 'info@ornek.com', isDefault: true }],
  });
  assert.deepEqual(info, {
    adres: 'Atatürk Cd. 5 Esenyurt İstanbul',
    telefon: '0212 000 00 00',
    faks: '0212 000 00 01',
    gsm: '0532 000 00 00',
    eposta: 'info@ornek.com',
  });
  assert.deepEqual(companyUserInfo(null), { adres: '', telefon: '', faks: '', gsm: '', eposta: '' });

  const draft = installationDraft({ customerDeviceId: 'abc-123' }, { kullanici: { telefon: '111' } }, []);
  const filled = fillUserInfo(draft, info);
  assert.equal(filled.telefon, '111');
  assert.equal(filled.faks, '0212 000 00 01');
});

test('teslimat formu kurulum tutanağı belgesine çevrilir', () => {
  const draft = deliveryDraft({
    companyId: 'c1',
    shipmentId: null,
    deliveryDate: '2026-10-10T09:00:00Z',
    signedBy: '—',
    status: 'pending',
    notes: null,
    formData: { tezgah: { model: 'HX-3015' }, kurulumuYapan: 'Ali' },
  });
  const doc = deliveryDocument(draft, 'Örnek A.Ş.', companyUserInfo(null), 'deliv-99');
  assert.equal(doc.firma, 'Örnek A.Ş.');
  assert.equal(doc.tezgahModel, 'HX-3015');
  assert.equal(doc.teslimAlan, '');
  assert.equal(doc.kurulumuYapan, 'Ali');
  assert.equal(doc.formNo, 'DR-DELIV9');
  assert.equal(doc.teslimTarihi, '2026-10-10');
});

test('kargo etiketi ve imza yardımcıları', () => {
  const label = cargoLabelInfo({
    addresses: [{ fullAddress: null, street: 'Atatürk Cd.', buildingNumber: '5', locality: 'Merkez', district: 'Esenyurt', province: 'İstanbul' }],
    phones: [{ phone: '0532 000 00 00', phoneType: 'mobile' }],
  });
  assert.deepEqual(label, { adres: 'Atatürk Cd. 5 Merkez', ilceSehir: 'Esenyurt / İstanbul', tel: '0532 000 00 00' });
  assert.equal(isSigned('—'), false);
  assert.equal(isSigned('  '), false);
  assert.equal(isSigned('Ayşe Yılmaz'), true);
});
