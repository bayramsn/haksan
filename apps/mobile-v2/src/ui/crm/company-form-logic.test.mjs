import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_COMPANY_FORM,
  applyWebsiteSuggestion,
  buildCompanyCreateBody,
  buildCompanyUpdatePatch,
  companyFormFromDetail,
  validateCompanyForm,
} from './company-form-logic.ts';

const DIV = '11111111-1111-4111-8111-111111111111';

test('doğrulama: web zorunlu alanları', () => {
  assert.deepEqual(validateCompanyForm(EMPTY_COMPANY_FORM), {
    legalTitle: 'Firma ünvanı zorunludur',
    divisionIds: 'Bağlı bulunduğu birimi seçiniz',
  });
  const supplier = { ...EMPTY_COMPANY_FORM, legalTitle: 'X', firmType: 'supplier', divisionIds: [DIV] };
  assert.deepEqual(validateCompanyForm(supplier), { supplierCategoryCode: 'Tedarikçi türü seçiniz' });
  assert.deepEqual(validateCompanyForm({ ...supplier, supplierCategoryCode: 'logistics' }), {});
});

test('oluşturma gövdesi: web addCustomer eşlemesi', () => {
  const body = buildCompanyCreateBody({
    ...EMPTY_COMPANY_FORM,
    legalTitle: '  Haksan CNC  ',
    salesStatus: 'active_customer',
    divisionIds: [DIV],
    companyGroupCode: 'a_group',
    contactSourceCode: 'visit',
    contactSourceText: 'Fuar standı',
    city: 'İstanbul',
    latitude: 41,
    longitude: 29,
    supplierCategoryCode: 'logistics',
  });
  assert.equal(body.legalTitle, 'Haksan CNC');
  assert.equal(body.shortName, undefined);
  assert.equal(body.customerStatusCode, 'active');
  assert.deepEqual(body.companyGroupCodes, ['a_group']);
  assert.equal(body.contactSourceCode, undefined);
  assert.equal(body.contactSourceText, 'Fuar standı');
  assert.equal(body.supplierCategoryCode, undefined, 'müşteri tipinde tedarikçi türü gönderilmez');
  assert.equal(body.addresses?.[0].province, 'İstanbul');
  assert.equal(body.addresses?.[0].latitude, 41);
  assert.equal(body.addresses?.[0].isDefault, true);
  const person = buildCompanyCreateBody({ ...EMPTY_COMPANY_FORM, companyType: 'person', legalTitle: 'Ali Veli', divisionIds: [DIV] });
  assert.equal(person.shortName, 'Ali Veli');
  assert.equal(person.addresses, undefined);
  assert.equal(person.customerStatusCode, 'potential');
});

test('güncelleme yaması: yalnız değişen alanlar, temizlenen null', () => {
  const initial = { ...EMPTY_COMPANY_FORM, legalTitle: 'A', phone: '+90 555', city: 'Bursa', country: 'Almanya', divisionIds: [DIV] };
  assert.deepEqual(buildCompanyUpdatePatch(initial, initial), {});
  const patch = buildCompanyUpdatePatch(initial, { ...initial, phone: '', city: 'Kocaeli' });
  assert.equal(patch.primaryPhone, null);
  assert.ok(Array.isArray(patch.addresses));
  assert.equal(patch.addresses[0].province, 'Kocaeli');
  assert.equal(patch.addresses[0].country, 'Almanya');
  const firm = buildCompanyUpdatePatch({ ...initial, firmType: 'supplier', supplierCategoryCode: 'logistics' }, { ...initial, firmType: 'customer', supplierCategoryCode: 'logistics' });
  assert.equal(firm.relationTypeCode, 'customer');
  assert.equal(firm.supplierCategoryCode, null);
  const src = buildCompanyUpdatePatch({ ...initial, contactSourceCode: 'visit' }, { ...initial, contactSourceCode: 'visit', contactSourceText: 'Referans' });
  assert.equal(src.contactSourceCode, null);
  assert.equal(src.contactSourceText, 'Referans');
});

test('çoklu adres: oluşturma ve detaydan form', () => {
  const body = buildCompanyCreateBody({
    ...EMPTY_COMPANY_FORM,
    legalTitle: 'Çoklu',
    divisionIds: [DIV],
    city: 'Bursa',
    address: 'Merkez',
    addressIsShipping: false,
    additionalAddresses: [
      {
        key: 'a1',
        addressType: 'factory',
        country: 'Türkiye',
        city: 'İstanbul',
        district: 'Tuzla',
        address: 'OSB',
        latitude: null,
        longitude: null,
        isDefault: false,
        isShipping: true,
        isBilling: false,
      },
    ],
  });
  assert.equal(body.addresses?.length, 2);
  assert.equal(body.addresses?.[1].province, 'İstanbul');
  assert.equal(body.addresses?.[1].isShipping, true);
  assert.equal(body.addresses?.[0].isShipping, false);

  const form = companyFormFromDetail(
    {
      companyType: 'company',
      relationTypeId: 'r1',
      customerStatusId: 's1',
      supplierCategoryCode: null,
      contactSourceId: null,
      contactSourceText: null,
      sector: null,
      legalTitle: 'Firma',
      shortName: null,
      taxOffice: null,
      taxNumber: null,
      website: null,
      notes: null,
      addresses: [
        {
          id: 'addr-1',
          addressType: 'office',
          country: 'Türkiye',
          province: 'Bursa',
          district: 'Nilüfer',
          fullAddress: 'Merkez',
          latitude: null,
          longitude: null,
          isDefault: true,
          isShipping: false,
          isBilling: true,
        },
        {
          id: 'addr-2',
          addressType: 'factory',
          country: 'Türkiye',
          province: 'İstanbul',
          district: 'Tuzla',
          fullAddress: 'OSB',
          latitude: null,
          longitude: null,
          isDefault: false,
          isShipping: true,
          isBilling: false,
        },
      ],
      phones: [],
      emails: [],
      divisions: [{ id: DIV }],
      companyGroups: [],
    },
    {
      relationTypes: [{ id: 'r1', code: 'customer' }],
      statuses: [{ id: 's1', code: 'potential' }],
      contactSources: [],
    },
  );
  assert.equal(form.city, 'Bursa');
  assert.equal(form.additionalAddresses.length, 1);
  assert.equal(form.additionalAddresses[0].id, 'addr-2');
  assert.equal(form.additionalAddresses[0].city, 'İstanbul');
});

test('detaydan form: kimlik → kod eşlemesi', () => {
  const form = companyFormFromDetail(
    {
      companyType: 'company',
      relationTypeId: 'r1',
      customerStatusId: 's1',
      supplierCategoryCode: 'manufacturer',
      contactSourceId: 'c1',
      contactSourceText: null,
      sector: 'Otomotiv Yan Sanayi',
      legalTitle: 'Firma',
      shortName: null,
      taxOffice: null,
      taxNumber: '123',
      website: null,
      notes: null,
      addresses: [{ addressType: 'factory', country: 'Türkiye', province: 'Bursa', district: 'Nilüfer', fullAddress: 'OSB', latitude: '40.2', longitude: '28.9', isDefault: true }],
      phones: [{ phoneType: 'main', phone: '+90 1' }, { phoneType: 'fax', phone: '+90 2' }],
      emails: [{ emailType: 'secondary', email: 'b@x.com' }],
      divisions: [{ id: DIV }],
      companyGroups: [{ code: 'b_group' }],
    },
    {
      relationTypes: [{ id: 'r1', code: 'supplier_customer' }],
      statuses: [{ id: 's1', code: 'active' }],
      contactSources: [{ id: 'c1', code: 'visit' }],
    },
  );
  assert.equal(form.firmType, 'supplier_customer');
  assert.equal(form.salesStatus, 'active_customer');
  assert.equal(form.contactSourceCode, 'visit');
  assert.equal(form.addressType, 'factory');
  assert.equal(form.latitude, 40.2);
  assert.equal(form.fax, '+90 2');
  assert.equal(form.email2, 'b@x.com');
  assert.deepEqual(form.divisionIds, [DIV]);
  assert.equal(form.companyGroupCode, 'b_group');
});

test('site önerisi yalnız boş alanları doldurur', () => {
  const next = applyWebsiteSuggestion({ ...EMPTY_COMPANY_FORM, phone: '+90 1' }, { website: 'https://x.com', phone: '+90 2', city: 'İzmir' });
  assert.equal(next.website, 'https://x.com');
  assert.equal(next.phone, '+90 1');
  assert.equal(next.city, 'İzmir');
});
