-- Control de licencia por cliente: nivel 1 (avisos) y nivel 2 (solo lectura)
alter table public.clientes
  add column if not exists fecha_expiracion date,
  add column if not exists dias_gracia int not null default 15;

-- Indice para consultas rapidas por fecha de expiracion
create index if not exists idx_clientes_fecha_expiracion on public.clientes(fecha_expiracion);
