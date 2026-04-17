-- Config global de la plataforma (kill switch del proveedor)
-- Singleton: siempre existe una sola fila con id=1
create table if not exists public.plataforma_config (
  id int primary key default 1,
  activa boolean not null default true,
  modo_solo_lectura boolean not null default false,
  mensaje text,
  updated_at timestamptz not null default now(),
  constraint plataforma_config_singleton check (id = 1)
);

-- Insertar fila unica si no existe
insert into public.plataforma_config (id, activa, modo_solo_lectura)
values (1, true, false)
on conflict (id) do nothing;

-- RLS: lectura publica (el frontend necesita saber el estado sin auth),
-- pero updates/deletes bloqueados (solo se modifica desde Supabase dashboard con service_role)
alter table public.plataforma_config enable row level security;

drop policy if exists "plataforma_config_read" on public.plataforma_config;
create policy "plataforma_config_read" on public.plataforma_config
  for select using (true);

-- No creamos policy de UPDATE/INSERT/DELETE para anon/authenticated,
-- por lo que RLS rechaza todas esas operaciones por defecto.
-- Solo el service_role (usado desde el dashboard de Supabase) puede modificar.
