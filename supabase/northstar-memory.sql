create table if not exists northstar_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  mission text,
  operating_brief jsonb,
  updated_at timestamptz default now()
);

create table if not exists northstar_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  activity text not null,
  long_term_score int,
  short_term_score int,
  lane text,
  verdict text,
  reason text,
  next_action text,
  created_at timestamptz default now()
);
create index if not exists northstar_decisions_owner_created_at_idx on northstar_decisions (owner_key, created_at desc);

create table if not exists northstar_daily_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  date date not null,
  hour int not null check (hour between 0 and 23),
  task text,
  lane text,
  done boolean default false,
  updated_at timestamptz default now(),
  unique (owner_key, date, hour)
);

create table if not exists northstar_active_focus (
  owner_key text primary key,
  task text,
  lane text,
  started_at timestamptz,
  updated_at timestamptz default now()
);

alter table northstar_profiles enable row level security;
alter table northstar_decisions enable row level security;
alter table northstar_daily_blocks enable row level security;
alter table northstar_active_focus enable row level security;