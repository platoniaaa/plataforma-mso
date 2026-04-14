-- ============================================
-- Migracion: Sistema de correos via Resend
-- ============================================

-- 1. Ampliar notificaciones con campos que la UI espera y mirror de email
ALTER TABLE public.notificaciones
  ADD COLUMN IF NOT EXISTS titulo TEXT,
  ADD COLUMN IF NOT EXISTS accion_url TEXT,
  ADD COLUMN IF NOT EXISTS correo_id UUID;

-- 2. Tabla historial de correos enviados
CREATE TABLE IF NOT EXISTS public.correos_enviados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programa_id UUID REFERENCES public.programas(id) ON DELETE SET NULL,
  evento TEXT NOT NULL CHECK (evento IN ('bienvenida','encuesta_disponible','confirmacion','recordatorio','manual')),
  tipo_template TEXT,
  enviado_por UUID REFERENCES public.usuarios(id),
  encuesta_id UUID REFERENCES public.encuestas(id) ON DELETE SET NULL,
  asunto TEXT NOT NULL,
  cuerpo_html TEXT NOT NULL,
  destinatarios JSONB NOT NULL,
  resend_ids JSONB DEFAULT '[]'::jsonb,
  adjuntos JSONB DEFAULT '[]'::jsonb,
  estado TEXT DEFAULT 'enviado' CHECK (estado IN ('enviado','parcial','fallido','pendiente')),
  error TEXT,
  fecha_enviado TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_correos_programa
  ON public.correos_enviados(programa_id, fecha_enviado DESC);
CREATE INDEX IF NOT EXISTS idx_correos_evento
  ON public.correos_enviados(evento, fecha_enviado DESC);

-- 3. FK correo_id desde notificaciones
ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_correo_id_fkey;
ALTER TABLE public.notificaciones
  ADD CONSTRAINT notificaciones_correo_id_fkey
  FOREIGN KEY (correo_id) REFERENCES public.correos_enviados(id) ON DELETE SET NULL;

-- 4. RLS permisivo (alineado con patron del resto del schema)
ALTER TABLE public.correos_enviados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "correos_all" ON public.correos_enviados;
CREATE POLICY "correos_all" ON public.correos_enviados FOR ALL USING (true) WITH CHECK (true);
