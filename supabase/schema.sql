-- Whitespace Partners - Employee Performance Appraisal
-- Run once in Supabase > SQL Editor. Safe to run again: it does not drop or overwrite data.

create extension if not exists pgcrypto;

-- Employee database. `code` is the 5-digit employee code used to log in, together with
-- the password. `password_hash` is a scrypt hash; null = the person cannot log in yet.
create table if not exists public.employees (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[0-9]{5}$'),
  name          text not null,
  nickname      text not null default '',
  password_hash text,
  role          text not null default 'employee' check (role in ('employee', 'supervisor', 'admin')),
  position      text not null default '',
  team          text not null default '',
  -- Null department/level/supervisor = this person has no appraisal form (e.g. HR admin).
  department_id text check (department_id in
                  ('interior-designer', '3d-visualizer', 'business-development',
                   'business-administration', 'it-support')),
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

-- Appraisal rounds. `id` is the name shown to users ("FY2026/27"); exactly one is current.
create table if not exists public.cycles (
  id         text primary key,
  period     text not null default '',
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists cycles_one_current on public.cycles (is_current) where is_current;

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
  -- The form, the employee's details and the appraiser as they were when the result was
  -- confirmed or the cycle closed, so history does not change with later edits.
  snapshot          jsonb,
  primary key (employee_id, cycle)
);

-- Scales, edited by admin on the Scale & Rating page. Any of these tables left empty
-- means "use the built-in defaults".

-- Rating Band: the grade a Performance Score earns from `min_score` up to the next band.
create table if not exists public.rating_bands (
  position  smallint primary key,
  min_score numeric(3, 2) not null check (min_score >= 0 and min_score <= 5),
  grade     text not null,
  meaning   text not null default '',
  share     text not null default '',
  merit     text not null default ''
);

-- Level of the Potential score (average of section F): the Y axis of the 9-Box.
create table if not exists public.potential_bands (
  level     text primary key check (level in ('Low', 'Medium', 'High')),
  min_score numeric(3, 2) not null check (min_score >= 0 and min_score <= 5)
);

-- Level of the Performance Score: the X axis of the 9-Box.
create table if not exists public.performance_bands (
  level     text primary key check (level in ('Low', 'Medium', 'High')),
  min_score numeric(3, 2) not null check (min_score >= 0 and min_score <= 5)
);

-- 9-Box Talent: the name of the box for each pair of levels.
create table if not exists public.nine_box (
  id                smallint primary key check (id between 1 and 9),
  potential_level   text not null check (potential_level in ('Low', 'Medium', 'High')),
  performance_level text not null check (performance_level in ('Low', 'Medium', 'High')),
  box_label         text not null,
  unique (potential_level, performance_level)
);

-- Row Level Security with no policies: the tables cannot be read or written with the
-- public (anon) key. The web app reaches them only from its server, using the service role key.
alter table public.employees      enable row level security;
alter table public.form_templates enable row level security;
alter table public.evaluations    enable row level security;
alter table public.job_levels     enable row level security;
alter table public.cycles         enable row level security;
alter table public.rating_bands      enable row level security;
alter table public.potential_bands   enable row level security;
alter table public.performance_bands enable row level security;
alter table public.nine_box          enable row level security;

-- Upgrade a database created by an earlier version of this file (levels were fixed at 1-3).
alter table public.employees add column if not exists nickname text not null default '';
alter table public.employees add column if not exists password_hash text;
alter table public.employees add column if not exists appraisal_type text not null default 'Annual';
alter table public.employees drop constraint if exists employees_appraisal_type_check;
alter table public.employees add constraint employees_appraisal_type_check
  check (appraisal_type in ('Annual', 'Mid-year', 'Probation'));
alter table public.employees drop constraint if exists employees_department_id_check;
alter table public.employees add constraint employees_department_id_check
  check (department_id in
                  ('interior-designer', '3d-visualizer', 'business-development',
                   'business-administration', 'it-support'));
alter table public.employees drop constraint if exists employees_level_check;
alter table public.employees add constraint employees_level_check check (level >= 1);
alter table public.form_templates drop constraint if exists form_templates_level_check;
alter table public.form_templates add constraint form_templates_level_check check (level >= 1);

alter table public.evaluations add column if not exists snapshot jsonb;

-- First cycle; later ones are added by admin in the web app.
insert into public.cycles (id, period, is_current)
select 'FY2026/27', 'ต.ค. 2026 – ก.ย. 2027', true
where not exists (select 1 from public.cycles);

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
  ('business-administration', 7, 'Managing Director', 'Managing Director'),
  ('it-support', 1, 'Level 1', 'IT Support Officer (Helpdesk)'),
  ('it-support', 2, 'Level 2', 'IT Support Specialist'),
  ('it-support', 3, 'Level 3', 'Senior IT Specialist / System Administrator'),
  ('it-support', 4, 'Level 4', 'IT Manager')
on conflict (department_id, level) do nothing;

-- Starting scales. Admin edits them later in the web app; existing rows are left alone.
insert into public.rating_bands (position, min_score, grade, meaning, share, merit) values
  (1, 0.00, 'D - Unsatisfactory', 'ต่ำกว่ามาตรฐาน → Performance Improvement Plan (PIP) 90 วัน ไม่ปรับเงินเดือน', '≤ 5%', '0.00x'),
  (2, 2.25, 'C - Needs Improvement', 'ต้องพัฒนา → แผนพัฒนาเฉพาะจุด ติดตามทุกเดือน', '10–15%', '0.50x'),
  (3, 3.00, 'B - Meets Expectations', 'ได้มาตรฐาน → พัฒนาต่อเนื่องในระดับปัจจุบัน', '50–60%', '1.00x'),
  (4, 3.75, 'A - Exceeds Expectations', 'เกินมาตรฐาน → พิจารณาเพิ่มความรับผิดชอบ / เลื่อนระดับ', '20%', '1.25x'),
  (5, 4.50, 'S - Outstanding', 'ดีเยี่ยม → Talent pool, เลื่อนระดับเร่งด่วน, retention plan', '≤ 10%', '1.50x')
on conflict (position) do nothing;

insert into public.potential_bands (level, min_score) values
  ('Low', 0.00), ('Medium', 3.00), ('High', 4.00)
on conflict (level) do nothing;

insert into public.performance_bands (level, min_score) values
  ('Low', 0.00), ('Medium', 3.00), ('High', 3.75)
on conflict (level) do nothing;

insert into public.nine_box (id, potential_level, performance_level, box_label) values
  (1, 'Low', 'Low', 'Underperformer – PIP'),
  (2, 'Low', 'Medium', 'Effective Contributor'),
  (3, 'Low', 'High', 'Trusted Professional'),
  (4, 'Medium', 'Low', 'Inconsistent Player – ต้องปรับปรุง'),
  (5, 'Medium', 'Medium', 'Core Player – กำลังหลัก'),
  (6, 'Medium', 'High', 'High Performer – ผู้ทำผลงานสูง'),
  (7, 'High', 'Low', 'Rough Diamond – โค้ชใกล้ชิด'),
  (8, 'High', 'Medium', 'Emerging Talent – ผู้มีศักยภาพโดดเด่น'),
  (9, 'High', 'High', 'Star – ผู้นำอนาคต')
on conflict (id) do nothing;

-- Test accounts: Admin 33333, Supervisor 22222, User 11111. The password of each is its
-- own code. Only a database with no employees gets them, so running this file again on
-- a live database never brings them back.
do $seed$
begin
  if not exists (select 1 from public.employees) then
    insert into public.employees (code, name, role, position, team, start_date, level_since, password_hash)
    values ('33333', 'พรทิพย์ สายสุวรรณ', 'admin', 'HR Manager', 'People & Culture', '2018-06-01', '2022-10-01',
            'scrypt$0c67aa7451e81b7f285a551c90711381$b4224ace12d769243172a47aa6864b57e435bc70c6194f155a31fc504f9a513d4ee7d444d6597c7196759416aace1bd2e8bf93bfffb5c8e247e67f33e6486c18')
    on conflict (code) do nothing;

    insert into public.employees (code, name, role, position, team, department_id, start_date, level_since, password_hash)
    values ('22222', 'วรินทร์ จันทรประเสริฐ', 'supervisor', 'Lead Interior Designer', 'Studio A',
            'interior-designer', '2016-03-01', '2021-10-01',
            'scrypt$6e2b074c82d35268c577c397c7d27e01$2924fd86e794b0501e9495a0cf0aa5bc70fd5d42ef180a8e593f236920f20948e44e65212b0518994aad05bb8f5598f1f446b358e3ba21ca178400857f4eb9b4')
    on conflict (code) do nothing;

    insert into public.employees (code, name, role, position, team, department_id, level, supervisor_id, start_date, level_since, password_hash)
    select '11111', 'ณัฐชา ศรีวงศ์', 'employee', 'Junior Interior Designer', 'Studio A',
           'interior-designer', 1, s.id, '2023-01-01', '2025-01-01',
           'scrypt$08cb39570049cceb82ac41c32e6fa5eb$7d2410f9273cf0077edd2921a5033e9388415b5e3a70fd0ae568febd43f10854c4623808ff2592baabbe24ea6a16201aea77921d16337c41097460ca47526cf1'
    from public.employees s
    where s.code = '22222'
    on conflict (code) do nothing;
  end if;
end
$seed$;
