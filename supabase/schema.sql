-- ============================================================================
-- EXAMORA — Supabase schema (run once in the NEW project's SQL editor)
-- Project: fresh EXAMORA project (NOT the existing "zelda" project).
-- Conventions mirror the old localStorage layout so the app port is thin:
--   * text primary keys with app-generated ids (bank_…, q_…, ex_…, …)
--   * created_at / updated_at / timestamps as BIGINT unix-ms (matches now())
--   * 'all' year/department sentinel  → NULL year / empty department array
-- Sections: 1 helpers · 2 tables · 3 RLS · 4 student-safe view · 5 RPCs
--           6 realtime · 7 storage bucket · 8 post-run checklist
-- ============================================================================

-- ---------------------------------------------------------------- 1. helpers
create extension if not exists "pgcrypto";

-- NOTE: public.is_admin() is defined in section 3 (after tables exist),
-- because LANGUAGE sql bodies are validated at creation time.

-- --------------------------------------------------------------- 2. tables
-- Auth mirror: one row per Supabase Auth user (id = auth.users.id).
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  role        text not null check (role in ('student','super_admin')),
  student_id  text unique,                 -- register no (login alias), null for admins
  name        text not null default '',
  active      boolean not null default true,
  created_at  bigint not null default (extract(epoch from now())*1000)::bigint,
  updated_at  bigint not null default (extract(epoch from now())*1000)::bigint
);

create table if not exists public.students (
  id          text primary key,            -- app id, e.g. st_…
  student_id  text unique not null,        -- register no (24CS021 / 811324104023)
  name        text not null,
  email       text not null,
  department  text not null default '',
  year        int  not null default 2,
  section     text not null default 'A',
  status      text not null default 'active' check (status in ('active','disabled')),
  created_at  bigint not null default (extract(epoch from now())*1000)::bigint,
  updated_at  bigint not null default (extract(epoch from now())*1000)::bigint
);

create table if not exists public.question_banks (
  id             text primary key,
  name           text not null,
  description    text not null default '',
  subject        text not null default 'General',
  year           int,                       -- null = all years
  department     text[] not null default '{}',
  section        text not null default 'all',
  question_count int  not null default 0,
  status         text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_by     text not null default '',
  created_at     bigint not null default (extract(epoch from now())*1000)::bigint,
  updated_at     bigint not null default (extract(epoch from now())*1000)::bigint
);

create table if not exists public.questions (
  id              text primary key,
  bank_id         text references public.question_banks(id) on delete set null,
  text            text not null,
  type            text not null check (type in ('MCQ_SINGLE','MCQ_MULTIPLE','TRUE_FALSE','SHORT_ANSWER')),
  subject         text not null default '',
  topic           text not null default '',
  difficulty      text not null default 'Medium' check (difficulty in ('Easy','Medium','Hard')),
  options         jsonb not null default '[]',
  correct_answer  jsonb,                   -- null = answer pending (admin assigns A/B/C/D)
  needs_answer    boolean not null default false,
  source_import_id text,
  source_order    int,
  marks           numeric not null default 1,
  explanation     text,
  status          text not null default 'active' check (status in ('active','archived')),
  created_by      text not null default '',
  created_at      bigint not null default (extract(epoch from now())*1000)::bigint,
  updated_at      bigint not null default (extract(epoch from now())*1000)::bigint
);
create index if not exists idx_questions_bank on public.questions (bank_id);

create table if not exists public.exams (
  id                 text primary key,
  title              text not null,
  description        text not null default '',
  subject            text not null default '',
  department         text[] not null default '{}',
  year               int,                   -- null = all years
  section            text not null default 'all',
  duration_min       int not null default 60,
  start_at           bigint not null default 0,
  end_at             bigint not null default 0,
  password_hash      text not null default '',
  status             text not null default 'DRAFT'
                     check (status in ('DRAFT','SCHEDULED','ACTIVE','COMPLETED','ARCHIVED')),
  total_marks        numeric not null default 0,
  randomize_questions boolean not null default true,
  randomize_options   boolean not null default true,
  one_attempt_only    boolean not null default true,
  negative_marking    boolean not null default false,
  negative_marks      numeric not null default 0,
  results_release_mode text not null default 'IMMEDIATE'
                     check (results_release_mode in ('IMMEDIATE','MANUAL_RELEASE','SCHEDULED_RELEASE')),
  pass_pct           numeric not null default 40,
  pool               jsonb,                 -- {easy,medium,hard} or null
  manual_qids        text[],
  bank_id            text references public.question_banks(id) on delete set null,
  snapshot           jsonb,                 -- frozen SafeQuestion[] stamped at publish
  created_by         text not null default '',
  created_at         bigint not null default (extract(epoch from now())*1000)::bigint,
  updated_at         bigint not null default (extract(epoch from now())*1000)::bigint
);

create table if not exists public.attempts (
  id               text primary key,
  student_id       text not null,           -- register no (display key)
  uid              uuid not null references public.profiles(id) on delete cascade,
  exam_id          text not null references public.exams(id) on delete cascade,
  status           text not null default 'IN_PROGRESS'
                   check (status in ('IN_PROGRESS','SUBMITTED','AUTO_SUBMITTED')),
  started_at       bigint not null default (extract(epoch from now())*1000)::bigint,
  server_deadline  bigint not null default 0,
  submitted_at     bigint,
  question_order   text[] not null default '{}',
  option_order     jsonb not null default '{}',
  current_index    int not null default 0,
  answers          jsonb not null default '{}',
  score            numeric,
  total_marks      numeric,
  pct              numeric,
  tab_switch_count int not null default 0,
  fs_exit_count    int not null default 0,
  refresh_count    int not null default 0,
  net_disc_count   int not null default 0,
  submission_type  text check (submission_type in ('MANUAL','AUTO')),
  updated_at       bigint not null default (extract(epoch from now())*1000)::bigint
);
create index if not exists idx_attempts_exam on public.attempts (exam_id);
create index if not exists idx_attempts_uid  on public.attempts (uid);

create table if not exists public.events (
  id          text primary key,
  attempt_id  text not null references public.attempts(id) on delete cascade,
  student_id  text not null default '',
  exam_id     text not null default '',
  event_type  text not null,
  timestamp   bigint not null default (extract(epoch from now())*1000)::bigint,
  metadata    jsonb not null default '{}'
);
create index if not exists idx_events_attempt on public.events (attempt_id);
create index if not exists idx_events_exam    on public.events (exam_id);

create table if not exists public.audit_logs (
  id          text primary key,
  admin_id    text not null default '',
  admin_email text not null default '',
  action      text not null,
  target_type text not null default '',
  target_id   text not null default '',
  timestamp   bigint not null default (extract(epoch from now())*1000)::bigint,
  metadata    jsonb not null default '{}'
);
create index if not exists idx_audit_ts on public.audit_logs (timestamp desc);

-- AI-import staging (staff review before anything reaches the bank).
create table if not exists public.imports (
  id          text primary key,
  file_name   text not null default '',
  file_type   text not null default '',
  status      text not null default 'UPLOADED',
  bank_id     text references public.question_banks(id) on delete set null,
  counts      jsonb not null default '{}',
  data        jsonb not null default '{}',  -- full ImportRecord (sizes, provider, errorReport…)
  created_by  text not null default '',
  created_at  bigint not null default (extract(epoch from now())*1000)::bigint,
  updated_at  bigint not null default (extract(epoch from now())*1000)::bigint
);
create table if not exists public.import_questions (
  id        text primary key,
  import_id text not null references public.imports(id) on delete cascade,
  data      jsonb not null default '{}'     -- full StagedQuestion
);
create index if not exists idx_import_qs_import on public.import_questions (import_id);

-- ------------------------------------------------------------------ 3. RLS
-- True when the caller owns an admin profile row (defined here, after
-- profiles exists, because LANGUAGE sql bodies validate at creation).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'super_admin' and p.active
  );
$$;

alter table public.profiles          enable row level security;
alter table public.students          enable row level security;
alter table public.question_banks    enable row level security;
alter table public.questions         enable row level security;
alter table public.exams             enable row level security;
alter table public.attempts          enable row level security;
alter table public.events            enable row level security;
alter table public.audit_logs        enable row level security;
alter table public.imports           enable row level security;
alter table public.import_questions  enable row level security;

-- profiles: admins full; users read their own row.
create policy "admin all profiles" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());
create policy "own profile read" on public.profiles
  for select using (id = auth.uid());

-- students roster: admins full; a student reads their own row.
create policy "admin all students" on public.students
  for all using (public.is_admin()) with check (public.is_admin());
create policy "own student row" on public.students
  for select using (student_id = (select p.student_id from public.profiles p where p.id = auth.uid()));

-- banks + questions (WITH answers): admin only. Students use questions_public.
create policy "admin all banks" on public.question_banks
  for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all questions" on public.questions
  for all using (public.is_admin()) with check (public.is_admin());

-- exams: admins full; students read live exams only (SCHEDULED/ACTIVE).
-- NOTE: rows include the shared exam password hash — the same secret that is
-- told to students out-of-band, so visibility matches existing behaviour.
create policy "admin all exams" on public.exams
  for all using (public.is_admin()) with check (public.is_admin());
create policy "student live exams" on public.exams
  for select using (status in ('SCHEDULED','ACTIVE'));

-- attempts: admins full; students own rows (insert/update own IN_PROGRESS,
-- final submit goes through submit_attempt RPC which re-checks everything).
create policy "admin all attempts" on public.attempts
  for all using (public.is_admin()) with check (public.is_admin());
create policy "own attempts read" on public.attempts
  for select using (uid = auth.uid());
create policy "own attempt insert" on public.attempts
  for insert with check (uid = auth.uid());
create policy "own attempt progress update" on public.attempts
  for update using (uid = auth.uid() and status = 'IN_PROGRESS')
  with check (uid = auth.uid());

-- events: written by log_exam_event RPC (SECURITY DEFINER); admins read.
create policy "admin all events" on public.events
  for all using (public.is_admin()) with check (public.is_admin());

-- audit logs: admin only.
create policy "admin all audit" on public.audit_logs
  for all using (public.is_admin()) with check (public.is_admin());

-- imports staging: admin only.
create policy "admin all imports" on public.imports
  for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all import_questions" on public.import_questions
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------- 4. student-safe question view
-- Active questions WITHOUT correct_answer / explanation. Students fetch exam
-- content through this view; grading data never leaves the server.
create or replace view public.questions_public as
  select id, bank_id, text, type, subject, topic, difficulty,
         options, marks, source_order, status, created_at, updated_at
  from public.questions
  where status = 'active';
grant select on public.questions_public to authenticated;

-- ------------------------------------------------------------------ 5. RPCs
-- Register-no → email lookup for the "Email or Register No" login box.
-- Returns null when unknown (login then fails with generic Invalid credentials).
create or replace function public.get_email_for_student_id(reg text)
returns text language sql stable security definer set search_path = public as $$
  select p.email from public.profiles p
  where lower(p.student_id) = lower(trim(reg)) and p.active
  limit 1;
$$;
grant execute on function public.get_email_for_student_id(text) to anon, authenticated;

-- Server-side submit + scoring. Enforces ownership, deadline (late → AUTO),
-- negative marking and frozen per-question marks. Mirrors engine.scoreAttempt.
create or replace function public.submit_attempt(p_attempt_id text, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a      public.attempts%rowtype;
  e      public.exams%rowtype;
  q      record;
  v      jsonb;
  ok     boolean;
  sc     numeric := 0;
  tot    numeric := 0;
  late   boolean;
  st     text;
begin
  select * into a from public.attempts where id = p_attempt_id;
  if not found then raise exception 'attempt not found'; end if;
  if a.uid <> auth.uid() and not public.is_admin() then raise exception 'not your attempt'; end if;
  if a.status <> 'IN_PROGRESS' then
    return jsonb_build_object('score', a.score, 'total', a.total_marks, 'pct', a.pct, 'status', a.status);
  end if;
  select * into e from public.exams where id = a.exam_id;

  for q in select * from public.questions where id = any (a.question_order) loop
    tot := tot + q.marks;
    v := p_answers -> q.id;
    if v is null or v = 'null'::jsonb then continue; end if;
    ok := false;
    if q.type = 'MCQ_SINGLE' then
      ok := (v)::text::numeric = coalesce((q.correct_answer)::text::numeric, -999999);
    elsif q.type = 'TRUE_FALSE' then
      ok := (v)::text::boolean = coalesce((q.correct_answer)::text::boolean, null) and (q.correct_answer)::text is not null;
    elsif q.type = 'MCQ_MULTIPLE' then
      ok := (select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(v) x)
         = (select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(coalesce(q.correct_answer, '[]')) x);
    elsif q.type = 'SHORT_ANSWER' then
      ok := lower(trim(both ' ' from (v #>> '{}'))) = lower(trim(both ' ' from coalesce(q.correct_answer #>> '{}', '')))
            and coalesce(q.correct_answer #>> '{}', '') <> '';
    end if;
    if ok then sc := sc + q.marks;
    elsif e.negative_marking then sc := sc - e.negative_marks;
    end if;
  end loop;
  sc := greatest(0, round(sc*100)/100);
  late := (extract(epoch from now())*1000)::bigint > a.server_deadline;
  st := case when late then 'AUTO_SUBMITTED' else 'SUBMITTED' end;

  update public.attempts set
    answers = p_answers, score = sc, total_marks = tot,
    pct = case when tot > 0 then round(sc/tot*100) else 0 end,
    status = st, submitted_at = (extract(epoch from now())*1000)::bigint,
    submission_type = case when late then 'AUTO' else 'MANUAL' end,
    updated_at = (extract(epoch from now())*1000)::bigint
  where id = a.id;

  return jsonb_build_object('score', sc, 'total', tot,
    'pct', case when tot > 0 then round(sc/tot*100) else 0 end, 'status', st);
end;
$$;
grant execute on function public.submit_attempt(text, jsonb) to authenticated;

-- Proctoring event + server-side counters (never trust client counts).
create or replace function public.log_exam_event(p_attempt_id text, p_type text, p_meta jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare a public.attempts%rowtype; col text;
begin
  select * into a from public.attempts where id = p_attempt_id;
  if not found then raise exception 'attempt not found'; end if;
  if a.uid <> auth.uid() and not public.is_admin() then raise exception 'not your attempt'; end if;
  col := case p_type
    when 'TAB_SWITCH' then 'tab_switch_count'
    when 'FULLSCREEN_EXIT' then 'fs_exit_count'
    when 'BROWSER_REFRESH' then 'refresh_count'
    when 'NETWORK_DISCONNECTED' then 'net_disc_count'
    else null end;
  if col is not null then
    execute format('update public.attempts set %I = %I + 1, updated_at = %L where id = %L',
      col, col, (extract(epoch from now())*1000)::bigint, a.id);
  end if;
  insert into public.events (id, attempt_id, student_id, exam_id, event_type, timestamp, metadata)
  values ('ev_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
          a.id, a.student_id, a.exam_id, p_type,
          (extract(epoch from now())*1000)::bigint, coalesce(p_meta, '{}'));
end;
$$;
grant execute on function public.log_exam_event(text, text, jsonb) to authenticated;

-- -------------------------------------------------------------- 6. realtime
-- Live monitoring dashboard (attempts + proctoring events stream).
alter publication supabase_realtime add table public.attempts;
alter publication supabase_realtime add table public.events;

-- ------------------------------------------------- 7. private import bucket
insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;
create policy "admin all import files" on storage.objects
  for all using (bucket_id = 'imports' and public.is_admin())
  with check (bucket_id = 'imports' and public.is_admin());

-- ------------------------------------------------- 8. post-run checklist
-- 1. Supabase dashboard → Authentication → Providers → Email: create users
--      admin@college.edu / Admin@123  (add to Auth, then row below)
--    and each student (email / Jjcet@2k26). Turn OFF "Confirm email" so
--    password login works immediately (Auth → Providers → Email → Confirm email OFF).
-- 2. Mirror every auth user into profiles (admin example):
--      insert into profiles (id, email, role, name)
--      values ('<auth-user-uuid>', 'admin@college.edu', 'super_admin', 'Admin');
--    student example:
--      insert into profiles (id, email, role, student_id, name)
--      values ('<uuid>', 'arun@college.edu', 'student', '24CS021', 'Arun');
-- 3. Paste the NEW project's URL + anon key into the app's .env as
--    VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY and redeploy.
