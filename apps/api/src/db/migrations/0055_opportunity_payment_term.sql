ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS payment_term_days integer;
