create extension if not exists pgcrypto;

create table if not exists public.partes (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  codigo text not null,
  fecha date not null,
  estado text not null default 'En elaboración',
  resumen text,
  obra_parte text,
  comentarios text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partes_username_codigo_unique unique (username, codigo)
);

create table if not exists public.partes_lineas (
  id uuid primary key default gen_random_uuid(),
  parte_id uuid not null references public.partes(id) on delete cascade,
  username text not null,
  fecha date not null,
  hora_inicio text,
  hora_fin text,
  unidades numeric(10,2) not null default 1,
  tipo_hora text not null,
  obra text not null,
  texto text not null,
  documento_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists idx_partes_username_fecha on public.partes(username, fecha desc);
create index if not exists idx_partes_lineas_username_fecha on public.partes_lineas(username, fecha desc);
create index if not exists idx_partes_lineas_parte_id on public.partes_lineas(parte_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_partes_updated_at on public.partes;
create trigger trg_partes_updated_at
before update on public.partes
for each row execute function public.set_updated_at();
