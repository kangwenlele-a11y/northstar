create table if not exists northstar_roadmaps (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null default 'richard',
  goal text not null,
  niches jsonb,
  created_at timestamptz default now()
);
alter table northstar_roadmaps enable row level security;

create index if not exists northstar_roadmaps_owner_created_at_idx on northstar_roadmaps (owner_key, created_at desc);
