-- Revenue Intelligence: sparade projekt per användare.
-- Kör en gång i Supabase → SQL Editor → New query → Run.
-- Samma Supabase-projekt som BESS Simulation; tabellen är separat från bess_projects.

create table if not exists public.ri_projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  user_email  text,
  full_name   text,
  phone       text,
  company     text,
  name        text not null check (char_length(name) between 1 and 80),
  area        text not null check (area in ('SE1','SE2','SE3','SE4')),
  mw          numeric not null check (mw > 0 and mw <= 1000),
  mwh         numeric not null check (mwh > 0 and mwh <= 2500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ri_projects_user_idx on public.ri_projects (user_id, updated_at desc);

alter table public.ri_projects enable row level security;

drop policy if exists "ri_own_select" on public.ri_projects;
drop policy if exists "ri_own_insert" on public.ri_projects;
drop policy if exists "ri_own_update" on public.ri_projects;
drop policy if exists "ri_own_delete" on public.ri_projects;

create policy "ri_own_select" on public.ri_projects for select using (auth.uid() = user_id);
create policy "ri_own_insert" on public.ri_projects for insert with check (auth.uid() = user_id);
create policy "ri_own_update" on public.ri_projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ri_own_delete" on public.ri_projects for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
