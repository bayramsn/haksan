-- CNC-SOZ-2026/005 için imzaya esas 18.08.2026 SL-8 sözleşmesindeki taraf,
-- bedel ve şartların mevcut CRM taslağına kayıpsız aktarımı.
UPDATE "companies"
SET
  "legal_title" = 'NORM İNOX METAL ENDÜSTRİ LAZER SAN. İTH. İHR. LTD. ŞTİ.',
  "short_name" = 'NORM İNOX METAL',
  "tax_office" = 'İkitelli V.D.',
  "tax_number" = '6221661606',
  "updated_at" = now()
WHERE "id" IN (
  SELECT coalesce(c."company_id", q."company_id")
  FROM "contracts" c
  LEFT JOIN "quotes" q ON q."id" = c."quote_id"
  WHERE c."contract_no" IN ('CNC-SOZ-2026/005', 'CNC-SOZ-2026-005')
    AND EXISTS (
      SELECT 1 FROM "companies" target_company
      WHERE target_company."id" = coalesce(c."company_id", q."company_id")
        AND target_company."legal_title" ILIKE 'NORM%METAL%'
    )
);
--> statement-breakpoint
UPDATE "company_addresses"
SET
  "country" = 'Türkiye',
  "province" = 'İstanbul',
  "district" = 'Başakşehir',
  "full_address" = 'İkitelli O.S.B. Dersan Koop. Trios 2023 A Blk. No:57',
  "is_default" = true,
  "is_billing" = true,
  "updated_at" = now()
WHERE "id" IN (
  SELECT address."id"
  FROM "company_addresses" address
  WHERE address."company_id" IN (
    SELECT coalesce(c."company_id", q."company_id")
    FROM "contracts" c
    LEFT JOIN "quotes" q ON q."id" = c."quote_id"
    WHERE c."contract_no" IN ('CNC-SOZ-2026/005', 'CNC-SOZ-2026-005')
      AND EXISTS (
        SELECT 1 FROM "companies" target_company
        WHERE target_company."id" = coalesce(c."company_id", q."company_id")
          AND target_company."legal_title" ILIKE 'NORM%METAL%'
      )
  )
  AND address."deleted_at" IS NULL
  ORDER BY address."is_billing" DESC, address."is_default" DESC, address."created_at"
  LIMIT 1
);
--> statement-breakpoint
INSERT INTO "company_addresses" (
  "id", "tenant_id", "company_id", "address_type", "country", "province", "district", "full_address",
  "is_default", "is_billing", "is_shipping", "created_at", "updated_at"
)
SELECT gen_random_uuid(), company."tenant_id", company."id", 'billing', 'Türkiye', 'İstanbul', 'Başakşehir',
  'İkitelli O.S.B. Dersan Koop. Trios 2023 A Blk. No:57', true, true, false, now(), now()
FROM "companies" company
WHERE company."id" IN (
  SELECT coalesce(c."company_id", q."company_id")
  FROM "contracts" c
  LEFT JOIN "quotes" q ON q."id" = c."quote_id"
  WHERE c."contract_no" IN ('CNC-SOZ-2026/005', 'CNC-SOZ-2026-005')
    AND EXISTS (
      SELECT 1 FROM "companies" target_company
      WHERE target_company."id" = coalesce(c."company_id", q."company_id")
        AND target_company."legal_title" ILIKE 'NORM%METAL%'
    )
)
AND NOT EXISTS (
  SELECT 1 FROM "company_addresses" address
  WHERE address."company_id" = company."id" AND address."deleted_at" IS NULL
);
--> statement-breakpoint
UPDATE "company_phones"
SET "phone" = '02128018191', "phone_type" = 'main', "is_default" = true, "updated_at" = now()
WHERE "id" IN (
  SELECT phone."id"
  FROM "company_phones" phone
  WHERE phone."company_id" IN (
    SELECT coalesce(c."company_id", q."company_id")
    FROM "contracts" c
    LEFT JOIN "quotes" q ON q."id" = c."quote_id"
    WHERE c."contract_no" IN ('CNC-SOZ-2026/005', 'CNC-SOZ-2026-005')
      AND EXISTS (
        SELECT 1 FROM "companies" target_company
        WHERE target_company."id" = coalesce(c."company_id", q."company_id")
          AND target_company."legal_title" ILIKE 'NORM%METAL%'
      )
  )
  AND phone."deleted_at" IS NULL
  ORDER BY phone."is_default" DESC, phone."created_at"
  LIMIT 1
);
--> statement-breakpoint
INSERT INTO "company_phones" (
  "id", "tenant_id", "company_id", "phone_type", "phone", "is_default", "created_at", "updated_at"
)
SELECT gen_random_uuid(), company."tenant_id", company."id", 'main', '02128018191', true, now(), now()
FROM "companies" company
WHERE company."id" IN (
  SELECT coalesce(c."company_id", q."company_id")
  FROM "contracts" c
  LEFT JOIN "quotes" q ON q."id" = c."quote_id"
  WHERE c."contract_no" IN ('CNC-SOZ-2026/005', 'CNC-SOZ-2026-005')
    AND EXISTS (
      SELECT 1 FROM "companies" target_company
      WHERE target_company."id" = coalesce(c."company_id", q."company_id")
        AND target_company."legal_title" ILIKE 'NORM%METAL%'
    )
)
AND NOT EXISTS (
  SELECT 1 FROM "company_phones" phone
  WHERE phone."company_id" = company."id" AND phone."deleted_at" IS NULL
);
--> statement-breakpoint
INSERT INTO "company_phones" (
  "id", "tenant_id", "company_id", "phone_type", "phone", "is_default", "created_at", "updated_at"
)
SELECT gen_random_uuid(), company."tenant_id", company."id", 'mobile', '05325876736', false, now(), now()
FROM "companies" company
WHERE company."id" IN (
  SELECT coalesce(c."company_id", q."company_id")
  FROM "contracts" c
  LEFT JOIN "quotes" q ON q."id" = c."quote_id"
  WHERE c."contract_no" IN ('CNC-SOZ-2026/005', 'CNC-SOZ-2026-005')
    AND EXISTS (
      SELECT 1 FROM "companies" target_company
      WHERE target_company."id" = coalesce(c."company_id", q."company_id")
        AND target_company."legal_title" ILIKE 'NORM%METAL%'
    )
)
AND NOT EXISTS (
  SELECT 1 FROM "company_phones" phone
  WHERE phone."company_id" = company."id"
    AND regexp_replace(phone."phone", '[^0-9]', '', 'g') IN ('05325876736', '5325876736', '905325876736')
    AND phone."deleted_at" IS NULL
);
--> statement-breakpoint
UPDATE "contracts"
SET
  "signed_date" = '2026-08-18T00:00:00+03:00'::timestamptz,
  "terms" = jsonb_build_object(
    'paymentTermsText', E'Sözleşmeye konu tezgah İŞLETME TESLİM şeklinde fiyatlandırılmıştır.\nSiparişte 10.000 USD peşin, kalan bakiye 30 – 60 – 90 – 120 – 150 – 180 gün vadeli USD çekleri ile tahsil edilecektir.\nÖdeme tarihinde {{ALICI}}, HAKSAN MAKİNA''dan kur bilgisi alarak TL karşılığını HAKSAN MAKİNA hesabına havale edecektir.',
    'deliveryTermsText', E'Tezgahın teslimi sözleşme tarihinden itibaren 90 gün sonra gerçekleştirilecektir.\nTezgah NORM İNOX METAL/Başakşehir tesislerine teslim edilecek olup, tezgahın İstanbul şehir içi karayolu taşıma ve sigortası HAKSAN MAKİNA''ya aittir.\nTezgahın teslimini müteakip 2 gün içerisinde HAKSAN MAKİNA personeli tarafından kurulum ve ilk çalıştırma gerçekleştirilecektir.\nKurulumu müteakip eğitim ve demo çalışması NORM İNOX METAL tesislerinde 2 gün süreyle yapılacaktır.',
    'warrantyTermsText', E'Mekanik garanti teslimle başlar ve tüm üretim hatalarına karşı 1 yıldır.\nKontrol ünitesi garantisi teslimle başlar ve 2 yıl FANUC/Türkiye garantisi kapsamındadır.\nHAKSAN MAKİNA garanti süresinde ve sonrasında karşılıklı şartlar dahilinde teknik destek, bilgi, belge, doküman ve yedek parça sağlar.',
    'deliveryLocation', 'NORM İNOX METAL/Başakşehir tesisleri',
    'estimatedDeliveryDaysMin', 90,
    'estimatedDeliveryDaysMax', 90,
    'importCostsExcluded', false,
    'vatIncluded', true,
    'freightPaidBySeller', true
  ),
  "document_snapshot" = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                coalesce("document_snapshot", '{}'::jsonb),
                '{quote}', coalesce("document_snapshot"->'quote', '{}'::jsonb) || jsonb_build_object(
                  'subtotal', 50000, 'discountTotal', 0, 'vatAmount', 10000, 'grandTotal', 60000
                ), true
              ),
              '{terms}', jsonb_build_object(
                'paymentTermsText', E'Sözleşmeye konu tezgah İŞLETME TESLİM şeklinde fiyatlandırılmıştır.\nSiparişte 10.000 USD peşin, kalan bakiye 30 – 60 – 90 – 120 – 150 – 180 gün vadeli USD çekleri ile tahsil edilecektir.\nÖdeme tarihinde {{ALICI}}, HAKSAN MAKİNA''dan kur bilgisi alarak TL karşılığını HAKSAN MAKİNA hesabına havale edecektir.',
                'deliveryTermsText', E'Tezgahın teslimi sözleşme tarihinden itibaren 90 gün sonra gerçekleştirilecektir.\nTezgah NORM İNOX METAL/Başakşehir tesislerine teslim edilecek olup, tezgahın İstanbul şehir içi karayolu taşıma ve sigortası HAKSAN MAKİNA''ya aittir.\nTezgahın teslimini müteakip 2 gün içerisinde HAKSAN MAKİNA personeli tarafından kurulum ve ilk çalıştırma gerçekleştirilecektir.\nKurulumu müteakip eğitim ve demo çalışması NORM İNOX METAL tesislerinde 2 gün süreyle yapılacaktır.',
                'warrantyTermsText', E'Mekanik garanti teslimle başlar ve tüm üretim hatalarına karşı 1 yıldır.\nKontrol ünitesi garantisi teslimle başlar ve 2 yıl FANUC/Türkiye garantisi kapsamındadır.\nHAKSAN MAKİNA garanti süresinde ve sonrasında karşılıklı şartlar dahilinde teknik destek, bilgi, belge, doküman ve yedek parça sağlar.',
                'deliveryLocation', 'NORM İNOX METAL/Başakşehir tesisleri',
                'estimatedDeliveryDaysMin', 90, 'estimatedDeliveryDaysMax', 90,
                'importCostsExcluded', false, 'vatIncluded', true, 'freightPaidBySeller', true
              ), true
            ),
            '{company}', coalesce("document_snapshot"->'company', '{}'::jsonb) || jsonb_build_object(
              'legalTitle', 'NORM İNOX METAL ENDÜSTRİ LAZER SAN. İTH. İHR. LTD. ŞTİ.',
              'shortName', 'NORM İNOX METAL', 'taxOffice', 'İkitelli V.D.', 'taxNumber', '6221661606'
            ), true
          ),
          '{companyAddresses}', jsonb_build_array(jsonb_build_object(
            'addressType', 'billing', 'country', 'Türkiye', 'province', 'İstanbul', 'district', 'Başakşehir',
            'fullAddress', 'İkitelli O.S.B. Dersan Koop. Trios 2023 A Blk. No:57', 'isDefault', true, 'isBilling', true
          )), true
        ),
        '{companyPhones}', jsonb_build_array(
          jsonb_build_object('phoneType', 'main', 'phone', '02128018191', 'isDefault', true),
          jsonb_build_object('phoneType', 'mobile', 'phone', '05325876736', 'isDefault', false)
        ), true
      ),
      '{contact}', coalesce("document_snapshot"->'contact', '{}'::jsonb) || jsonb_build_object(
        'fullName', 'Eyüp KÖKLÜ', 'workPhone', '02128018191', 'mobilePhone', '05325876736'
      ), true
    ),
    '{receivables}', jsonb_build_array(jsonb_build_object(
      'amount', 10000, 'dueDate', '2026-08-18', 'notes', 'Siparişte peşin', 'paymentMethod', 'cash'
    )), true
  ),
  "updated_at" = now()
WHERE "contract_no" IN ('CNC-SOZ-2026/005', 'CNC-SOZ-2026-005')
  AND EXISTS (
    SELECT 1 FROM "companies" target_company
    WHERE target_company."id" = coalesce(
      "contracts"."company_id",
      (SELECT target_quote."company_id" FROM "quotes" target_quote WHERE target_quote."id" = "contracts"."quote_id")
    )
      AND target_company."legal_title" ILIKE 'NORM%METAL%'
  );
--> statement-breakpoint
UPDATE "contracts" contract
SET "document_snapshot" = jsonb_set(
  contract."document_snapshot",
  '{items}',
  coalesce((
    SELECT jsonb_agg(
      CASE WHEN item_row."ordinality" = 1 THEN
        item_row."item"
        || jsonb_build_object('unitPrice', 50000, 'lineTotal', 50000, 'discountAmount', 0, 'vatRate', 20)
        || jsonb_build_object('compatibility', coalesce(item_row."item"->'compatibility', '{}'::jsonb) || jsonb_build_object(
          'technicalSpecs', jsonb_build_array(
            jsonb_build_object('key', 'Maks. Tornalama Kapasitesi', 'value', 'Ø 320 mm'),
            jsonb_build_object('key', 'Maks. Tornalama Boyu', 'value', '480 mm'),
            jsonb_build_object('key', 'Çubuk İşleme Kapasitesi', 'value', 'Ø 52 mm'),
            jsonb_build_object('key', 'İş Mili Devri', 'value', '4.500 dv/dk'),
            jsonb_build_object('key', 'İş Mili Motor Gücü', 'value', '15 kW'),
            jsonb_build_object('key', 'Hidrolik Ayna Çapı', 'value', '8” (Ø 200 mm)'),
            jsonb_build_object('key', 'Kızak Tipi', 'value', 'Hassas Lineer Kızak'),
            jsonb_build_object('key', 'X, Z Eksen Motor Gücü', 'value', '2,5 kW / 2,5 kW'),
            jsonb_build_object('key', 'Taret Tipi', 'value', 'Hidrolik, 10 İstasyon'),
            jsonb_build_object('key', 'Karşı Punta Pinol Hareketi', 'value', '88 mm'),
            jsonb_build_object('key', 'Karşı Punta Pinol Çapı', 'value', 'Ø 58 mm'),
            jsonb_build_object('key', 'Tezgah Ağırlığı', 'value', '3.350 kg')
          )
        ))
      ELSE item_row."item" END
      ORDER BY item_row."ordinality"
    )
    FROM jsonb_array_elements(coalesce(contract."document_snapshot"->'items', '[]'::jsonb))
      WITH ORDINALITY AS item_row("item", "ordinality")
  ), '[]'::jsonb),
  true
), "updated_at" = now()
WHERE contract."contract_no" IN ('CNC-SOZ-2026/005', 'CNC-SOZ-2026-005')
  AND EXISTS (
    SELECT 1 FROM "companies" target_company
    WHERE target_company."id" = coalesce(
      contract."company_id",
      (SELECT target_quote."company_id" FROM "quotes" target_quote WHERE target_quote."id" = contract."quote_id")
    )
      AND target_company."legal_title" ILIKE 'NORM%METAL%'
  );
