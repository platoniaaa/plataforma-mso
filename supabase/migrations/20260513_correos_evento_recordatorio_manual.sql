-- ============================================
-- Migracion: ampliar CHECK constraint de correos_enviados.evento
-- Agrega 'recordatorio_manual' (boton manual de admin desde tab-participantes)
-- y 'notif_lider_coeval' (notificacion al lider cuando su colab termina coevaluacion,
-- que el codigo ya envia hace tiempo pero falta en el CHECK).
-- ============================================

ALTER TABLE public.correos_enviados
  DROP CONSTRAINT IF EXISTS correos_enviados_evento_check;

ALTER TABLE public.correos_enviados
  ADD CONSTRAINT correos_enviados_evento_check
  CHECK (evento IN (
    'bienvenida',
    'encuesta_disponible',
    'confirmacion',
    'recordatorio',
    'recordatorio_manual',
    'notif_lider_coeval',
    'manual'
  ));
