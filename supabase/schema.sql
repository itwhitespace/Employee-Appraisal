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
  level         smallint check (level >= 1),
  supervisor_id uuid references public.employees (id) on delete set null,
  start_date    date,
  level_since   date,
  appraisal_type text not null default 'Annual'
                  check (appraisal_type in ('Annual', 'Mid-year', 'Probation')),
  created_at    timestamptz not null default now()
);

create index if not exists employees_supervisor_idx on public.employees (supervisor_id);

-- Levels of each department, edited by admin. `level` is the rank within the department
-- (1 = most junior); `name` is the grade ("Level 1", "Director") and `title` the job title.
create table if not exists public.job_levels (
  department_id text not null,
  level         smallint not null check (level >= 1),
  name          text not null,
  title         text not null default '',
  primary key (department_id, level)
);

-- Form templates edited by admin, one per department x level.
-- A missing row means "use the built-in default template".
create table if not exists public.form_templates (
  department_id text not null,
  level         smallint not null check (level >= 1),
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
alter table public.job_levels     enable row level security;

-- Upgrade a database created by an earlier version of this file (levels were fixed at 1-3).
alter table public.employees add column if not exists appraisal_type text not null default 'Annual';
alter table public.employees drop constraint if exists employees_appraisal_type_check;
alter table public.employees add constraint employees_appraisal_type_check
  check (appraisal_type in ('Annual', 'Mid-year', 'Probation'));
alter table public.employees drop constraint if exists employees_level_check;
alter table public.employees add constraint employees_level_check check (level >= 1);
alter table public.form_templates drop constraint if exists form_templates_level_check;
alter table public.form_templates add constraint form_templates_level_check check (level >= 1);

-- Levels in use. Admin can add, rename and remove them later in the web app.
insert into public.job_levels (department_id, level, name, title) values
  ('interior-designer', 1, 'Level 1', 'Junior Interior Designer'),
  ('interior-designer', 2, 'Level 2', 'Interior Designer'),
  ('interior-designer', 3, 'Level 3', 'Senior Interior Designer'),
  ('interior-designer', 4, 'Level 4', 'Associate / Lead Designer'),
  ('interior-designer', 5, 'Director', 'Studio Director'),
  ('interior-designer', 6, 'Senior Director', 'Senior Director'),
  ('3d-visualizer', 1, 'Level 1', 'Junior 3D Visualizer'),
  ('3d-visualizer', 2, 'Level 2', '3D Visualizer'),
  ('3d-visualizer', 3, 'Level 3', 'Senior 3D Visualizer'),
  ('3d-visualizer', 4, 'Level 4', 'Lead 3D Visualizer'),
  ('3d-visualizer', 5, 'Director', 'Visualization Director'),
  ('3d-visualizer', 6, 'Senior Director', 'Senior Director, Creative Technology'),
  ('business-development', 1, 'Level 1', 'BD Coordinator / Junior BD'),
  ('business-development', 2, 'Level 2', 'BD Executive'),
  ('business-development', 3, 'Level 3', 'Senior BD Executive'),
  ('business-development', 4, 'Level 4', 'BD Manager / Associate'),
  ('business-development', 5, 'Director', 'BD Director (Deputy)'),
  ('business-development', 6, 'Senior Director', 'Senior Director, Business Development'),
  ('business-administration', 1, 'Level 1', 'Admin / Accounting Officer'),
  ('business-administration', 2, 'Level 2', 'Senior Officer (AP / AR / HR-Admin)'),
  ('business-administration', 3, 'Level 3', 'Supervisor / Senior Accountant'),
  ('business-administration', 4, 'Level 4', 'Finance & Admin Manager'),
  ('business-administration', 5, 'Director', 'Finance & Administration Director'),
  ('business-administration', 6, 'Senior Director', 'Senior Director, Finance & Corporate Services'),
  ('business-administration', 7, 'Managing Director', 'Managing Director')
on conflict (department_id, level) do nothing;

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
