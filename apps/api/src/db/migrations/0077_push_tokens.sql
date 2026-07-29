create table if not exists "push_tokens" (
  "id" uuid primary key default gen_random_uuid(),
  "tenant_id" uuid not null references "tenants" ("id") on delete cascade,
  "user_id" uuid not null references "users" ("id") on delete cascade,
  "token" varchar(255) not null,
  "platform" varchar(16) not null default 'expo',
  "last_seen_at" timestamptz not null default now(),
  "created_at" timestamptz not null default now()
);

create unique index if not exists "push_tokens_token_unique" on "push_tokens" ("token");
create index if not exists "push_tokens_user_idx" on "push_tokens" ("user_id");
