-- İdari satın almalarda firma seçimi opsiyonel olabilsin diye supplier_company_id NOT NULL kalkıyor.
ALTER TABLE "purchase_orders" ALTER COLUMN "supplier_company_id" DROP NOT NULL;
