-- Whitespace Partners - Employee Performance Appraisal
-- Run once in Supabase > SQL Editor. Safe to run again: it does not drop or overwrite data.

create extension if not exists pgcrypto;

-- Employee database. `code` is the 5-digit employee code used to log in.
create table if not exists public.employees (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[0-9]{5}$'),
  name          text not null,
  role          text not null default 'employee' check (role in ('employee', 'supervisor', 'admin')),
  position      text not null default '',
  team          text not null default '',
  -- Null department/level/supervisor = this person has no appraisal form (e.g. HR admin).
  department_id text check (department_id in
                  ('interior-designer', '3d-visualizer', 'business-development', 'business-administration')),
  level         smallint check (level between 1 and 3),
  supervisor_id uuid references public.employees (id) on delete set null,
  start_date    date,
  level_since   date,
  created_at    timestamptz not null default now()
);

create index if not exists employees_supervisor_idx on public.employees (supervisor_id);

-- Form templates edited by admin, one per department x level.
-- A missing row means "use the built-in default template".
create table if not exists public.form_templates (
  department_id text not null,
  level         smallint not null check (level between 1 and 3),
  weights       jsonb not null,
  sections      jsonb not null,
  updated_at    timestamptz not null default now(),
  primary key (department_id, level)
);

-- One appraisal per employee per cycle.
create table if not exists public.evaluations (
  employee_id       uuid not null references public.employees (id) on delete cascade,
  cycle             text not null,
  status            text not null default 'draft' check (status in ('draft', 'self_submitted', 'completed')),
  scores            jsonb not null default '{}'::jsonb,
  personal_kpis     jsonb not null default '[]'::jsonb,
  idp               jsonb not null,
  comments          jsonb not null,
  updated_at        timestamptz,
  self_submitted_at timestamptz,
  completed_at      timestamptz,
  primary key (employee_id, cycle)
);

-- Row Level Security with no policies: the tables cannot be read or written with the
-- public (anon) key. The web app reaches them only from its server, using the service role key.
alter table public.employees      enable row level security;
alter table public.form_templates enable row level security;
alter table public.evaluations    enable row level security;

-- Test accounts: Admin 33333, Supervisor 22222, User 11111.
insert into public.employees (code, name, role, position, team, start_date, level_since)
values ('33333', 'พรทิพย์ สายสุวรรณ', 'admin', 'HR Manager', 'People & Culture', '2018-06-01', '2022-10-01')
on conflict (code) do nothing;

insert into public.employees (code, name, role, position, team, department_id, start_date, level_since)
values ('22222', 'วรินทร์ จันทรประเสริฐ', 'supervisor', 'Lead Interior Designer', 'Studio A',
        'interior-designer', '2016-03-01', '2021-10-01')
on conflict (code) do nothing;

insert into public.employees (code, name, role, position, team, department_id, level, supervisor_id, start_date, level_since)
select '11111', 'ณัฐชา ศรีวงศ์', 'employee', 'Junior Interior Designer', 'Studio A',
       'interior-designer', 1, s.id, '2023-01-01', '2025-01-01'
from public.employees s
where s.code = '22222'
on conflict (code) do nothing;
