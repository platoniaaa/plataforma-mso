-- Tabla de feedback: lider da feedback estructurado a colaborador
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  programa_id uuid not null references public.programas(id) on delete cascade,
  lider_id uuid not null references public.usuarios(id) on delete cascade,
  participante_id uuid not null references public.usuarios(id) on delete cascade,
  observacion_id uuid null references public.observaciones(id) on delete set null,
  fortaleza text not null,
  aspecto_reforzar text not null,
  recomendacion text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_programa on public.feedback(programa_id);
create index if not exists idx_feedback_lider on public.feedback(lider_id);
create index if not exists idx_feedback_participante on public.feedback(participante_id);

alter table public.feedback enable row level security;

drop policy if exists "feedback_all_access" on public.feedback;
create policy "feedback_all_access" on public.feedback for all using (true) with check (true);
