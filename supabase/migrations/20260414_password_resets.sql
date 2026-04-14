-- ============================================
-- Migracion: Sistema de reset de contrasena
-- ============================================

CREATE TABLE IF NOT EXISTS public.password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  ip_origen TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token
  ON public.password_resets(token) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_password_resets_usuario
  ON public.password_resets(usuario_id, created_at DESC);

ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;

-- Solo service role puede acceder (sin policies = nadie via anon key)
DROP POLICY IF EXISTS "password_resets_service_only" ON public.password_resets;
CREATE POLICY "password_resets_service_only"
  ON public.password_resets FOR ALL USING (false);
