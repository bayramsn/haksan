alter table "users"
  add column if not exists "assistant_daily_usd_limit_cents" integer;

alter table "assistant_daily_token_budgets"
  add column if not exists "reserved_cost_micros" bigint default 0 not null;

comment on column "users"."assistant_daily_usd_limit_cents" is
  'Null uses ASSISTANT_DEFAULT_DAILY_USD_LIMIT; zero disables paid LLM calls for the user.';

comment on column "assistant_daily_token_budgets"."reserved_cost_micros" is
  'Daily committed LLM cost in micro-USD; reconciled to provider token usage after each call.';
