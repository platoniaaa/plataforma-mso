-- Tabla de hitos para la Carta Gantt del programa
CREATE TABLE IF NOT EXISTS public.hitos_programa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programa_id UUID NOT NULL REFERENCES public.programas(id) ON DELETE CASCADE,
  actividad TEXT NOT NULL,
  fase TEXT,
  fecha_inicio DATE NOT NULL,
  fecha_termino DATE NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  encuesta_id UUID REFERENCES public.encuestas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hitos_programa ON public.hitos_programa(programa_id, orden);

ALTER TABLE public.hitos_programa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hitos_all" ON public.hitos_programa;
CREATE POLICY "hitos_all" ON public.hitos_programa FOR ALL USING (true) WITH CHECK (true);
