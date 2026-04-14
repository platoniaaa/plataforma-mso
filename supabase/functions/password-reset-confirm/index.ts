// Edge Function: password-reset-confirm
// Recibe { token, new_password } y:
// 1. Valida token (existe, no usado, no expirado)
// 2. Actualiza usuarios.password_visible
// 3. Marca el token como usado
// 4. Envia correo de confirmacion

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { renderTemplate } from "../send-email/_shared/templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("RESEND_FROM") || "onboarding@resend.dev";
const FROM_NAME = Deno.env.get("RESEND_FROM_NAME") || "MSO TPT";
const URL_LOGIN = Deno.env.get("PLATFORM_URL") || "https://platoniaaa.github.io/plataforma-mso/v2/";

const ERROR_INVALIDO = "Link invalido o expirado. Solicita un nuevo link desde la pantalla de olvide mi contrasena.";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const token = (body?.token || "").toString().trim();
    const newPassword = (body?.new_password || "").toString();

    if (!token) return json({ success: false, error: "Token requerido" }, 400);
    if (!newPassword || newPassword.length < 6) {
      return json({ success: false, error: "La contrasena debe tener al menos 6 caracteres" }, 400);
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    // Buscar token valido
    const { data: reset } = await db
      .from("password_resets")
      .select("id, usuario_id, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (!reset) return json({ success: false, error: ERROR_INVALIDO }, 400);
    if (reset.used_at) return json({ success: false, error: ERROR_INVALIDO }, 400);
    if (new Date(reset.expires_at).getTime() < Date.now()) {
      return json({ success: false, error: ERROR_INVALIDO }, 400);
    }

    // Traer datos del usuario antes de actualizar (para el correo)
    const { data: user } = await db
      .from("usuarios")
      .select("id, nombre, email")
      .eq("id", reset.usuario_id)
      .single();

    if (!user) return json({ success: false, error: ERROR_INVALIDO }, 400);

    // Actualizar contrasena
    const { error: updErr } = await db
      .from("usuarios")
      .update({ password_visible: newPassword })
      .eq("id", reset.usuario_id);

    if (updErr) {
      console.error("[password-reset-confirm] update error", updErr);
      return json({ success: false, error: "No se pudo actualizar la contrasena. Intenta nuevamente." }, 500);
    }

    // Marcar token como usado
    await db.from("password_resets").update({ used_at: new Date().toISOString() }).eq("id", reset.id);

    // Enviar correo de confirmacion
    const fechaCambio = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "long", timeStyle: "short" });
    const rendered = renderTemplate("reset_confirmacion", {
      nombre: user.nombre,
      fecha_cambio: fechaCambio,
    }, URL_LOGIN);

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: [user.email],
          subject: rendered.asunto,
          html: rendered.html,
        }),
      });
    } catch (e) {
      console.error("[password-reset-confirm] Resend exception", e);
      // No fallamos el reset por esto
    }

    return json({ success: true, message: "Contrasena actualizada. Ya puedes iniciar sesion." });
  } catch (e) {
    console.error("[password-reset-confirm]", e);
    return json({ success: false, error: "Error inesperado. Intenta nuevamente." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
