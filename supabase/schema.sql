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
                  ('interior-designer', 'drafter-cad', '3d-visualizer', 'business-development',
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
  status            text not null default 'draft'
                    check (status in ('draft', 'self_submitted', 'completed', 'approved')),
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
alter table public.employees add column if not exists birth_date date;
alter table public.employees drop constraint if exists employees_appraisal_type_check;
alter table public.employees add constraint employees_appraisal_type_check
  check (appraisal_type in ('Annual', 'Mid-year', 'Probation'));
alter table public.employees drop constraint if exists employees_department_id_check;
alter table public.employees add constraint employees_department_id_check
  check (department_id in
                  ('interior-designer', 'drafter-cad', '3d-visualizer', 'business-development',
                   'business-administration', 'it-support'));
alter table public.employees drop constraint if exists employees_level_check;
alter table public.employees add constraint employees_level_check check (level >= 1);
alter table public.form_templates drop constraint if exists form_templates_level_check;
alter table public.form_templates add constraint form_templates_level_check check (level >= 1);

alter table public.evaluations add column if not exists snapshot jsonb;

-- Admin approval: after the supervisor confirms ("completed") admin approves ("approved"),
-- and only then does the employee see the whole form.
alter table public.evaluations drop constraint if exists evaluations_status_check;
alter table public.evaluations add constraint evaluations_status_check
  check (status in ('draft', 'self_submitted', 'completed', 'approved'));
alter table public.evaluations add column if not exists approved_at timestamptz;
alter table public.evaluations add column if not exists approved_by uuid
  references public.employees (id) on delete set null;

-- Compensation (salary structure, Compa-ratio). Only people with compensation_access may
-- open it; the flag is set here in SQL, never from the web app, so no admin can grant it
-- to themselves. The tables start empty: salary figures are never kept in this file.
alter table public.employees add column if not exists compensation_access boolean not null default false;
-- A second password for the compensation pages, separate from the sign-in password; null = not
-- set yet (the person sets it the first time, after confirming the sign-in password).
alter table public.employees add column if not exists compensation_password_hash text;

-- Salary bands; grade 1 is the highest. Compa-ratio = base salary / mid_salary.
create table if not exists public.salary_grades (
  grade      smallint primary key check (grade >= 1),
  name       text not null,
  min_salary numeric(12, 2) not null check (min_salary >= 0),
  mid_salary numeric(12, 2) not null check (mid_salary > 0),
  max_salary numeric(12, 2) not null,
  check (min_salary <= mid_salary and mid_salary <= max_salary)
);

-- Each grade names its job level (MD, SM, SD, D, 4 … 1) and the level of the web app it pays,
-- the same in every department. Grades used to be mapped per department.
alter table public.salary_grades add column if not exists job_level text not null default '';
alter table public.salary_grades add column if not exists level_name text unique;
drop table if exists public.salary_grade_levels;

-- Who opened or changed compensation data, and when.
create table if not exists public.compensation_audit (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  actor_id uuid references public.employees (id) on delete set null,
  action   text not null
);
create index if not exists compensation_audit_at_idx on public.compensation_audit (at desc);

-- Pay of each employee from `effective_date` on. A raise adds a row, so the history stays;
-- saving again with the same date corrects that row.
create table if not exists public.salaries (
  id             bigint generated always as identity primary key,
  employee_id    uuid not null references public.employees (id) on delete cascade,
  effective_date date not null,
  base_salary    numeric(12, 2) not null check (base_salary > 0),
  allowance      numeric(12, 2) not null default 0 check (allowance >= 0),
  note           text not null default '',
  created_by     uuid references public.employees (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (employee_id, effective_date)
);

-- The merit increase of each cycle: budget, matrix multipliers and any amounts set by hand.
create table if not exists public.merit_plans (
  cycle_id   text primary key references public.cycles (id) on delete cascade,
  plan       jsonb not null,
  updated_by uuid references public.employees (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- The bonus of each cycle: profit, share, matrix multipliers and any amounts set by hand.
create table if not exists public.bonus_plans (
  cycle_id   text primary key references public.cycles (id) on delete cascade,
  plan       jsonb not null,
  updated_by uuid references public.employees (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Pay figures are encrypted by the app (AES-256-GCM, key COMPENSATION_KEY in Vercel): salaries
-- keep base salary + allowance in amounts_enc, plans in plan_enc. The plain columns stay nullable
-- until supabase/encrypt-step2.local.sql removes them.
alter table public.salaries add column if not exists amounts_enc text;
alter table public.merit_plans add column if not exists plan_enc text;
alter table public.bonus_plans add column if not exists plan_enc text;
do $$
begin
  -- Only while the plain columns still exist (step 2 drops them).
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'salaries' and column_name = 'base_salary') then
    alter table public.salaries alter column base_salary drop not null;
    alter table public.salaries alter column allowance drop not null;
    alter table public.salaries alter column allowance drop default;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'merit_plans' and column_name = 'plan') then
    alter table public.merit_plans alter column plan drop not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'bonus_plans' and column_name = 'plan') then
    alter table public.bonus_plans alter column plan drop not null;
  end if;
end $$;

-- Sandbox: the compensation pages on made-up pay (the *_demo tables), for people with
-- compensation_sandbox (set only here, like compensation_access). See supabase/sandbox.local.sql.
alter table public.employees add column if not exists compensation_sandbox boolean not null default false;

create table if not exists public.salaries_demo (
  id             bigint generated always as identity primary key,
  employee_id    uuid not null references public.employees (id) on delete cascade,
  effective_date date not null,
  amounts_enc    text not null,
  note           text not null default '',
  created_by     uuid references public.employees (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (employee_id, effective_date)
);

create table if not exists public.merit_plans_demo (
  cycle_id   text primary key references public.cycles (id) on delete cascade,
  plan_enc   text not null,
  updated_by uuid references public.employees (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.bonus_plans_demo (
  cycle_id   text primary key references public.cycles (id) on delete cascade,
  plan_enc   text not null,
  updated_by uuid references public.employees (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.compensation_audit_demo (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  actor_id uuid references public.employees (id) on delete set null,
  action   text not null
);
create index if not exists compensation_audit_demo_at_idx on public.compensation_audit_demo (at desc);

alter table public.salaries_demo           enable row level security;
alter table public.merit_plans_demo        enable row level security;
alter table public.bonus_plans_demo        enable row level security;
alter table public.compensation_audit_demo enable row level security;

alter table public.salaries            enable row level security;
alter table public.bonus_plans         enable row level security;
alter table public.salary_grades       enable row level security;
alter table public.merit_plans         enable row level security;
alter table public.compensation_audit  enable row level security;

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
  ('drafter-cad', 1, 'Level 1', 'Junior Drafter / CAD Operator'),
  ('drafter-cad', 2, 'Level 2', 'Drafter'),
  ('drafter-cad', 3, 'Level 3', 'Senior Drafter / CAD Technician'),
  ('drafter-cad', 4, 'Level 4', 'Lead Drafter / Documentation Lead'),
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

-- Years with the company by which each level is expected to move on (Career Matrix);
-- the top levels have none. Used by the tenure chart on the dashboard; admin edits it.
alter table public.job_levels add column if not exists expected_years numeric(4, 1);
update public.job_levels
set expected_years = case level when 1 then 3 when 2 then 5 when 3 then 7 when 4 then 12 when 5 then 15 end
where expected_years is null and level between 1 and 5;

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

-- IT Assets, phase 1: software licenses and renewals (admin only). See supabase/software.local.sql.
-- One line of the license list: one purchase (lot) of a program or service, e.g. 24 seats of
-- AutoCAD LT on one contract, or one domain. `name` groups the lots of the same program.
create table if not exists public.software_licenses (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  -- What tells this lot apart: domain name, contract or order number, edition.
  detail          text not null default '',
  category        text not null default '',
  license_type    text not null default 'subscription' check (license_type in ('subscription', 'perpetual')),
  -- monthly, 1y, 2y, 3y (a contract of that many years) or perpetual.
  billing_cycle   text not null default '1y' check (billing_cycle in ('monthly', '1y', '2y', '3y', 'perpetual')),
  -- Monthly charges: the day of the month they are taken.
  renew_day       smallint check (renew_day between 1 and 31),
  start_date      date,
  expire_date     date,
  seats           integer check (seats >= 0),
  unit_price      numeric(12, 2) check (unit_price >= 0),
  -- Baht per year, also for contracts of several years.
  price_per_year  numeric(12, 2) check (price_per_year >= 0),
  payment_method  text not null default '' check (payment_method in ('', 'invoice', 'card', 'other')),
  -- Which card, e.g. "Mastercard ••1234"; never the full number.
  card_label      text not null default '',
  vendor          text not null default '',
  vendor_contact  text not null default '',
  status          text not null default 'active' check (status in ('active', 'cancelled')),
  remark          text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.employees (id) on delete set null
);
create index if not exists software_licenses_name_idx on public.software_licenses (name);

-- Each renewal keeps the term it replaced, so the cost of every year stays on record.
create table if not exists public.software_license_renewals (
  id             bigint generated always as identity primary key,
  license_id     uuid not null references public.software_licenses (id) on delete cascade,
  start_date     date,
  expire_date    date,
  price_per_year numeric(12, 2),
  seats          integer,
  note           text not null default '',
  renewed_at     timestamptz not null default now(),
  renewed_by     uuid references public.employees (id) on delete set null
);
create index if not exists software_license_renewals_license_idx
  on public.software_license_renewals (license_id, renewed_at desc);

alter table public.software_licenses         enable row level security;
alter table public.software_license_renewals enable row level security;

-- IT budget on the IT Assets dashboard. See supabase/it-budget.local.sql.
-- Which part of the budget a license is counted in, as in the IT Budget workbook.
alter table public.software_licenses
  add column if not exists budget_group text not null default 'back-office';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'software_licenses_budget_group_check') then
    alter table public.software_licenses
      add constraint software_licenses_budget_group_check check (budget_group in ('back-office', 'designer'));
  end if;
end $$;

-- Hardware lines of the budget, per fiscal year (October to September). `fiscal_year` is the
-- year it starts, e.g. 2026 = Oct 2026 – Sep 2027. `amounts` holds baht per month, e.g.
-- {"2026-10": 24500}.
create table if not exists public.it_budget_hardware (
  id          uuid primary key default gen_random_uuid(),
  fiscal_year smallint not null check (fiscal_year between 2000 and 2100),
  position    integer not null default 0,
  item        text not null check (length(trim(item)) > 0),
  detail      text not null default '',
  amounts     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.employees (id) on delete set null
);
create index if not exists it_budget_hardware_year_idx on public.it_budget_hardware (fiscal_year, position);
alter table public.it_budget_hardware enable row level security;

-- IT Assets, phase 2: the computer register, filled by the agent (install.cmd) and by IT.
-- See supabase/devices.local.sql. Never stores passwords, product keys or recovery keys.
create table if not exists public.devices (
  id                 uuid primary key default gen_random_uuid(),

  -- ── Register (typed in / imported) ─────────────────────────────────────────────────────
  -- e.g. WS-131150C7. Empty for a computer the agent enrolled before IT registered it.
  asset_number       text unique check (asset_number is null or length(trim(asset_number)) > 0),
  device_type        text not null default '' check (device_type in ('', 'workstation', 'notebook', 'macbook', 'other')),
  -- Who the computer is given to. Until it is matched to an employee, the name / email from
  -- the workbook are kept as they were written.
  holder_id          uuid references public.employees (id) on delete set null,
  holder_name        text not null default '',
  holder_email       text not null default '',
  purchase_date      date,
  -- Bill / order number of the purchase, e.g. a JIB bill number.
  purchase_doc       text not null default '',
  purchase_price     numeric(12, 2) check (purchase_price >= 0),
  vendor             text not null default '',
  warranty_expire    date,
  status             text not null default 'active' check (status in ('active', 'spare', 'repair', 'retired')),
  remark             text not null default '',

  -- ── 1. Identity ────────────────────────────────────────────────────────────────────────
  computer_name      text not null default '',
  serial_number      text not null default '',
  manufacturer       text not null default '',
  model              text not null default '',
  -- What the agent reads from the machine: desktop or laptop.
  chassis            text not null default '' check (chassis in ('', 'desktop', 'laptop')),
  -- The motherboard UUID, to tell computers apart when names repeat.
  hardware_uuid      text unique,

  -- ── 2. Hardware ────────────────────────────────────────────────────────────────────────
  cpu                text not null default '',
  cpu_cores          smallint check (cpu_cores > 0),
  -- As written or reported ("16 DDR5 5200"), and the size in GB for filters and totals.
  ram_text           text not null default '',
  ram_gb             numeric(6, 1) check (ram_gb >= 0),
  -- [{"model": "Samsung SSD 980", "type": "SSD", "sizeGb": 500, "freeGb": 120}, ...]
  disks              jsonb not null default '[]'::jsonb,
  disk_text          text not null default '',
  disk_total_gb      numeric(8, 1) check (disk_total_gb >= 0),
  disk_free_gb       numeric(8, 1) check (disk_free_gb >= 0),
  gpu                text not null default '',
  gpu_memory_gb      numeric(5, 1) check (gpu_memory_gb >= 0),
  -- [{"name": "Dell P2422H", "serial": "..."}, ...]
  monitors           jsonb not null default '[]'::jsonb,
  -- Laptops: present capacity as a percentage of the design capacity.
  battery_health     smallint check (battery_health between 0 and 150),
  mainboard          text not null default '',
  bios_version       text not null default '',
  bios_date          date,
  power_supply       text not null default '',

  -- ── 3. Operating system ────────────────────────────────────────────────────────────────
  os_name            text not null default '',
  os_version         text not null default '',
  os_install_date    date,
  -- Whether Windows is activated; the key itself is never sent.
  os_activated       boolean,
  last_update_at     timestamptz,
  last_boot_at       timestamptz,

  -- ── 4. Network ─────────────────────────────────────────────────────────────────────────
  ip_address         text not null default '',
  mac_address        text not null default '',
  -- [{"name": "Wi-Fi", "mac": "...", "ip": "...", "type": "wifi"}, ...]
  network            jsonb not null default '[]'::jsonb,
  connection         text not null default '' check (connection in ('', 'lan', 'wifi', 'other')),

  -- ── 5. User (matched to employees through device_logins) ───────────────────────────────
  login_user         text not null default '',
  last_login_user    text not null default '',

  -- ── 7. Security ────────────────────────────────────────────────────────────────────────
  antivirus          text not null default '',
  antivirus_enabled  boolean,
  antivirus_updated_at timestamptz,
  firewall_enabled   boolean,
  -- BitLocker / FileVault on the system disk; the recovery key is never sent.
  disk_encrypted     boolean,

  -- ── 8. Agent and status ────────────────────────────────────────────────────────────────
  -- none = registered by hand, no agent yet; pending = enrolled, waiting for IT to approve;
  -- approved = its reports are accepted; blocked = its token is refused.
  agent_status       text not null default 'none' check (agent_status in ('none', 'pending', 'approved', 'blocked')),
  -- SHA-256 of the device's own token; the token itself stays on the computer.
  agent_token_hash   text unique,
  agent_version      text not null default '',
  enrolled_at        timestamptz,
  -- Online when this is within the last 15 minutes.
  last_seen_at       timestamptz,
  -- When the full inventory (sections 1–4, 7) and the software list were last sent.
  inventory_at       timestamptz,
  software_at        timestamptz,
  -- Anything else a newer agent sends, kept until it gets a column of its own.
  agent_extra        jsonb not null default '{}'::jsonb,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.employees (id) on delete set null
);
create index if not exists devices_holder_idx on public.devices (holder_id);
create index if not exists devices_serial_idx on public.devices (serial_number);
create index if not exists devices_computer_name_idx on public.devices (computer_name);

-- ── 6. Installed programs: the latest list of each computer, replaced once a day. ──────────
create table if not exists public.device_software (
  id           bigint generated always as identity primary key,
  device_id    uuid not null references public.devices (id) on delete cascade,
  name         text not null,
  version      text not null default '',
  publisher    text not null default '',
  install_date date
);
create index if not exists device_software_device_idx on public.device_software (device_id);
create index if not exists device_software_name_idx on public.device_software (lower(name));

-- ── 5. Which employee a sign-in name belongs to (WS\somchai, somchai on a Mac, …). ──────────
-- Filled in later, when the matching screen is built; one person may have several names.
create table if not exists public.device_logins (
  login_name   text primary key check (login_name = lower(login_name)),
  employee_id  uuid references public.employees (id) on delete cascade,
  confirmed_at timestamptz,
  confirmed_by uuid references public.employees (id) on delete set null
);
create index if not exists device_logins_employee_idx on public.device_logins (employee_id);

alter table public.devices         enable row level security;
alter table public.device_software enable row level security;
alter table public.device_logins   enable row level security;

-- ── Who has held each computer, and when (copied at the time of each change). ──────────────
create table if not exists public.device_holder_history (
  id          uuid primary key default gen_random_uuid(),
  device_id   uuid not null references public.devices (id) on delete cascade,
  holder_id   uuid references public.employees (id) on delete set null,
  holder_code text not null default '',
  holder_name text not null default '',
  department  text not null default '',
  team        text not null default '',
  start_date  date not null,
  end_date    date,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  created_by  uuid references public.employees (id) on delete set null
);
create index if not exists device_holder_history_device_idx
  on public.device_holder_history (device_id, start_date desc);

alter table public.device_holder_history enable row level security;
