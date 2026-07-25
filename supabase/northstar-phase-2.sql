create table if not exists northstar_agent_state (
  agent text primary key,
  current_task text,
  status text check (status in ('idle', 'working', 'blocked', 'waiting_on_richard')),
  detail text,
  blocked_reason text,
  updated_at timestamptz default now()
);
alter table northstar_agent_state enable row level security;

insert into northstar_agent_state (agent, status) values
  ('richard', 'idle'), ('claude', 'idle'), ('codex', 'idle'),
  ('hermes', 'idle'), ('openclaw', 'idle')
on conflict (agent) do nothing;

create table if not exists northstar_goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz default now()
);
alter table northstar_goals enable row level security;

alter table northstar_daily_blocks add column if not exists goal_id uuid references northstar_goals(id);
alter table northstar_daily_blocks add column if not exists depends_on int;