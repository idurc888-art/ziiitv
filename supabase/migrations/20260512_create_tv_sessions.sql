-- Migration: create_tv_sessions
-- Criado em: 2026-05-12
-- Descrição: Registro permanente de cada TV vinculada (enterprise device tracking)

-- Tabela principal
create table if not exists public.tv_sessions (
  id            uuid primary key default gen_random_uuid(),
  device_id     text unique not null,
  device_name   text,
  device_model  text,

  -- Configuração de playlist
  playlist_url  text,
  playlist_type text check (playlist_type in ('m3u', 'xtream')),
  xtream_host   text,
  xtream_user   text,
  xtream_pass   text,

  -- Controle
  user_id       uuid references auth.users(id) on delete set null,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Trigger para atualizar updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tv_sessions_updated_at on public.tv_sessions;
create trigger tv_sessions_updated_at
  before update on public.tv_sessions
  for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.tv_sessions enable row level security;

create policy "tv_sessions: anon read" on public.tv_sessions
  for select using (true);

create policy "tv_sessions: anon insert" on public.tv_sessions
  for insert with check (true);

create policy "tv_sessions: anon update" on public.tv_sessions
  for update using (true);

-- Índice de busca rápida por device_id
create index if not exists tv_sessions_device_id_idx
  on public.tv_sessions (device_id);

-- Garante políticas abertas no pair_tokens para anon key da TV
alter table if exists public.pair_tokens enable row level security;

drop policy if exists "pair_tokens: anon all" on public.pair_tokens;
create policy "pair_tokens: anon all" on public.pair_tokens
  for all using (true) with check (true);
