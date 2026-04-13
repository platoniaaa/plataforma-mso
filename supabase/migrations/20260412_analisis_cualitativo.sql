-- Tabla de cache para analisis cualitativo de respuestas abiertas
CREATE TABLE IF NOT EXISTS public.analisis_cualitativo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programa_id UUID NOT NULL REFERENCES public.programas(id) ON DELETE CASCADE,
  encuesta_id UUID NOT NULL REFERENCES public.encuestas(id) ON DELETE CASCADE,
  pregunta_id UUID NOT NULL REFERENCES public.preguntas(id) ON DELETE CASCADE,
  momento TEXT NOT NULL CHECK (momento IN ('pre','post')),
  tipo_analisis TEXT NOT NULL DEFAULT 'individual'
    CHECK (tipo_analisis IN ('individual','comparativo_pre_post')),
  resultado JSONB NOT NULL,
  modelo TEXT NOT NULL,
  n_respuestas INTEGER NOT NULL DEFAULT 0,
  generado_por UUID REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (encuesta_id, pregunta_id, tipo_analisis)
);

CREATE INDEX IF NOT EXISTS idx_analisis_cual_programa
  ON public.analisis_cualitativo(programa_id, momento);

ALTER TABLE public.analisis_cualitativo ENABLE ROW LEVEL SECURITY;

-- Alineado con patron permisivo del schema (validacion real en Edge Function)
CREATE POLICY "analisis_read_all" ON public.analisis_cualitativo
  FOR SELECT USING (true);
CREATE POLICY "analisis_write_all" ON public.analisis_cualitativo
  FOR ALL USING (true) WITH CHECK (true);
