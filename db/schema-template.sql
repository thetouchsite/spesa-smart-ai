-- =============================================================================
-- Spesa Smart — initial schema TEMPLATE (NOT YET APPLIED).
--
-- Lovable Cloud is not enabled for the MVP. When you turn it on, apply this
-- SQL via the migration tool — do NOT copy this file directly into
-- supabase/migrations/, which is managed automatically.
--
-- Conventions: CREATE TABLE → GRANT → ENABLE RLS → CREATE POLICY.
-- =============================================================================

-- ─── users ───────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.users to authenticated;
grant all on public.users to service_role;
alter table public.users enable row level security;
create policy "Users read own profile" on public.users
  for select to authenticated using (id = auth.uid());
create policy "Users update own profile" on public.users
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ─── saved_plans ─────────────────────────────────────────────────────────────
create table if not exists public.saved_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  label text not null,
  city text not null,
  country text not null,
  household int not null,
  budget numeric not null,
  currency text not null check (currency in ('EUR','GBP','USD')),
  frequency text not null check (frequency in ('weekly','monthly')),
  style text not null,
  allergies text[] not null default '{}',
  dislikes text not null default '',
  zero_spend_day boolean not null default false,
  estimated_spend numeric not null default 0,
  savings numeric not null default 0,
  score int not null default 0,
  plan jsonb not null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.saved_plans to authenticated;
grant all on public.saved_plans to service_role;
alter table public.saved_plans enable row level security;
create policy "Plans owner select" on public.saved_plans
  for select to authenticated using (user_id = auth.uid());
create policy "Plans owner insert" on public.saved_plans
  for insert to authenticated with check (user_id = auth.uid());
create policy "Plans owner update" on public.saved_plans
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Plans owner delete" on public.saved_plans
  for delete to authenticated using (user_id = auth.uid());

-- ─── meals / grocery_items (denormalised for analytics) ──────────────────────
create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  saved_plan_id uuid not null references public.saved_plans(id) on delete cascade,
  day text not null,
  breakfast text not null,
  lunch text not null,
  dinner text not null,
  is_zero_spend boolean not null default false
);
grant select, insert, update, delete on public.meals to authenticated;
grant all on public.meals to service_role;
alter table public.meals enable row level security;
create policy "Meals via owning plan" on public.meals
  for all to authenticated
  using (exists (select 1 from public.saved_plans p where p.id = saved_plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.saved_plans p where p.id = saved_plan_id and p.user_id = auth.uid()));

create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  saved_plan_id uuid not null references public.saved_plans(id) on delete cascade,
  name text not null,
  category text not null,
  quantity text not null,
  estimated_cost numeric not null default 0
);
grant select, insert, update, delete on public.grocery_items to authenticated;
grant all on public.grocery_items to service_role;
alter table public.grocery_items enable row level security;
create policy "Grocery via owning plan" on public.grocery_items
  for all to authenticated
  using (exists (select 1 from public.saved_plans p where p.id = saved_plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.saved_plans p where p.id = saved_plan_id and p.user_id = auth.uid()));

-- ─── reference data (read-only to all signed-in users) ───────────────────────
create table if not exists public.price_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('manual','external_api','web_import','provider')),
  trust int not null default 50
);
grant select on public.price_sources to authenticated;
grant all on public.price_sources to service_role;
alter table public.price_sources enable row level security;
create policy "Price sources readable" on public.price_sources for select to authenticated using (true);

create table if not exists public.ingredient_prices (
  id uuid primary key default gen_random_uuid(),
  ingredient_name text not null,
  category text not null,
  unit text not null,
  quantity numeric not null,
  price numeric not null,
  currency text not null,
  city text not null,
  country text not null,
  source_id uuid references public.price_sources(id),
  confidence_score numeric not null default 0.5,
  recorded_at timestamptz not null default now()
);
grant select on public.ingredient_prices to authenticated;
grant all on public.ingredient_prices to service_role;
alter table public.ingredient_prices enable row level security;
create policy "Prices readable" on public.ingredient_prices for select to authenticated using (true);

create table if not exists public.smart_alternatives (
  id uuid primary key default gen_random_uuid(),
  from_ingredient text not null,
  to_ingredient text not null,
  nutrition_impact text not null check (nutrition_impact in ('similar','better','lower'))
);
grant select on public.smart_alternatives to authenticated;
grant all on public.smart_alternatives to service_role;
alter table public.smart_alternatives enable row level security;
create policy "Alternatives readable" on public.smart_alternatives for select to authenticated using (true);

create table if not exists public.supermarkets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  baseline_multiplier numeric not null default 1.0
);
grant select on public.supermarkets to authenticated;
grant all on public.supermarkets to service_role;
alter table public.supermarkets enable row level security;
create policy "Supermarkets readable" on public.supermarkets for select to authenticated using (true);
