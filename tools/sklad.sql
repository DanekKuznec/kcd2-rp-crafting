-- Склад цеха для «Счётной книги ремесленника».
-- Вставить целиком в Supabase: SQL Editor -> New query -> Run. Запускать один раз.

-- Участники: строка появляется сама при первом входе через Discord, роль «pending» (ждёт подтверждения).
create table if not exists public.members (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  role text not null default 'pending' check (role in ('pending', 'member', 'head')),
  created_at timestamptz not null default now()
);

-- Движения по складу: плюс - положили, минус - взяли.
create table if not exists public.moves (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users on delete set null,
  res text not null,
  qty integer not null check (qty <> 0),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists moves_created_idx on public.moves (created_at desc);

-- Остатки = сумма движений по каждому ресурсу.
create or replace view public.stock with (security_invoker = true) as
  select res, sum(qty)::integer as qty from public.moves group by res;

-- Кто какой роли (функция обходит RLS, чтобы правила не зацикливались; лежит вне API).
create schema if not exists private;
grant usage on schema private to authenticated;
create or replace function private.my_role() returns text
  language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.members where user_id = (select auth.uid())), 'none')
$$;
revoke execute on function private.my_role() from public, anon;
grant execute on function private.my_role() to authenticated;

-- При первом входе создаём участника с ником из Discord.
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.members (user_id, name)
  values (new.id, coalesce(new.raw_user_meta_data -> 'custom_claims' ->> 'global_name',
                           new.raw_user_meta_data ->> 'full_name',
                           new.raw_user_meta_data ->> 'name', ''))
  on conflict (user_id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.members enable row level security;
alter table public.moves enable row level security;

-- members: видят все вошедшие; роль меняет только глава.
drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated using (true);
drop policy if exists members_head_update on public.members;
create policy members_head_update on public.members for update to authenticated
  using ((select private.my_role()) = 'head') with check ((select private.my_role()) = 'head');
drop policy if exists members_head_delete on public.members;
create policy members_head_delete on public.members for delete to authenticated
  using ((select private.my_role()) = 'head');

-- moves: видят и пишут только подтверждённые участники; пишут только от своего имени; удаляет только глава.
drop policy if exists moves_read on public.moves;
create policy moves_read on public.moves for select to authenticated
  using ((select private.my_role()) in ('member', 'head'));
drop policy if exists moves_insert on public.moves;
create policy moves_insert on public.moves for insert to authenticated
  with check ((select private.my_role()) in ('member', 'head') and user_id = (select auth.uid()));
drop policy if exists moves_head_delete on public.moves;
create policy moves_head_delete on public.moves for delete to authenticated
  using ((select private.my_role()) = 'head');

-- Живое обновление у всех открытых страниц.
do $$ begin
  alter publication supabase_realtime add table public.moves;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.members;
exception when others then null; end $$;

-- ===== Обновление 7 ноября: ранги цеха вместо ролей =====
-- Ранги 0..9 (0 = нет доступа), отдельный флаг admin - управление сайтом.
-- Одобрять и менять ранги могут: admin, ранг 9 (Цехмейстер), ранг 8 (Цеховой Старейшина).
-- Они не могут: трогать ранги выше своего, менять свой ранг, выдавать admin, трогать admin.
alter table public.members add column if not exists rank integer not null default 0 check (rank between 0 and 9);
alter table public.members add column if not exists admin boolean not null default false;
alter table public.members add column if not exists rp_name text not null default '';
-- (функции private.my_rank, private.is_admin, private.can_approve, триггер private.members_guard
--  и политики members_update, members_admin_delete, moves_read/insert/delete - см. миграцию sklad_ranks в Supabase)
