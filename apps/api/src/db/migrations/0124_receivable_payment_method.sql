ALTER TABLE "receivables"
  ADD COLUMN IF NOT EXISTS "payment_method" varchar(32);

UPDATE "receivables"
SET "payment_method" = CASE
  WHEN "notes" ~* 'çek|cheque' THEN 'cheque'
  WHEN "notes" ~* 'senet|promissory' THEN 'promissory_note'
  WHEN "notes" ~* 'leasing' THEN 'leasing'
  WHEN "notes" ~* 'akreditif|letter of credit' THEN 'letter_of_credit'
  WHEN "notes" ~* 'taksit|installment' THEN 'installment'
  WHEN "notes" ~* 'vadeli|term' THEN 'term'
  WHEN "notes" ~* 'havale|eft|wire' THEN 'wire_transfer'
  WHEN "notes" ~* 'nakit|cash' THEN 'cash'
  ELSE NULL
END
WHERE "payment_method" IS NULL;
