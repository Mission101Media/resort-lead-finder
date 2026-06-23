create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  plan text not null default 'Starter',
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'Sales Rep',
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  destination text not null default 'Beach',
  group_type text not null default 'Family',
  budget numeric not null default 0,
  travel_date date,
  status text not null default 'New',
  score int not null default 1,
  source text not null default 'Manual',
  notes text,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  customer_email text,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  plan text,
  status text not null default 'incomplete',
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.leads enable row level security;
alter table public.tasks enable row level security;
alter table public.billing_subscriptions enable row level security;

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = target_company_id
      and cm.user_id = auth.uid()
  );
$$;

create policy "companies are visible to owners and members"
on public.companies
for select
using (owner_id = auth.uid() or public.is_company_member(id));

create policy "authenticated users can create their company"
on public.companies
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "owners can update their company"
on public.companies
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "members can view company membership"
on public.company_members
for select
using (user_id = auth.uid() or public.is_company_member(company_id));

create policy "owners can add themselves as first member"
on public.company_members
for insert
to authenticated
with check (user_id = auth.uid());

create policy "company members can read leads"
on public.leads
for select
using (public.is_company_member(company_id));

create policy "company members can create leads"
on public.leads
for insert
to authenticated
with check (public.is_company_member(company_id));

create policy "company members can update leads"
on public.leads
for update
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

create policy "company members can delete leads"
on public.leads
for delete
using (public.is_company_member(company_id));

create policy "company members can read tasks"
on public.tasks
for select
using (public.is_company_member(company_id));

create policy "company members can create tasks"
on public.tasks
for insert
to authenticated
with check (public.is_company_member(company_id));

create policy "company members can update tasks"
on public.tasks
for update
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

create policy "company members can delete tasks"
on public.tasks
for delete
using (public.is_company_member(company_id));

create policy "company members can read billing subscriptions"
on public.billing_subscriptions
for select
using (company_id is not null and public.is_company_member(company_id));

create index if not exists leads_company_id_idx on public.leads(company_id);
create index if not exists leads_status_idx on public.leads(company_id, status);
create index if not exists tasks_company_id_idx on public.tasks(company_id);
create index if not exists company_members_user_id_idx on public.company_members(user_id);
create index if not exists billing_subscriptions_customer_email_idx on public.billing_subscriptions(customer_email);
create index if not exists billing_subscriptions_company_id_idx on public.billing_subscriptions(company_id);
