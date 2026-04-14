// Edge Function: password-reset-request
// Recibe { email } y siempre retorna el mismo mensaje para no revelar si el email existe.
// Si el email existe: genera token, lo persiste, envia correo via Resend con el link.
// Rate limit silencioso: si hay un reset activo de <2min, no envia otro.

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

const RESPONSE_MENSAJE_GENERICO = "Si el email esta registrado, recibiras un link en tu bandeja. Revisa tambien tu carpeta de spam.";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const email = (body?.email || "").toString().trim().toLowerCase();

    // Validacion minima de formato — no revela existencia
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: true, message: RESPONSE_MENSAJE_GENERICO });
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    // Buscar usuario (si no existe, retornamos mensaje generico)
    const { data: user } = await db
      .from("usuarios")
      .select("id, nombre, email")
      .eq("email", email)
      .maybeSingle();

    if (!user) {
      return json({ success: true, message: RESPONSE_MENSAJE_GENERICO });
    }

    // Rate limit silencioso: si ya hay un reset activo hace <2min, no enviamos otro
    const dosMinAtras = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recent } = await db
      .from("password_resets")
      .select("id")
      .eq("usuario_id", user.id)
      .is("used_at", null)
      .gt("created_at", dosMinAtras)
      .maybeSingle();

    if (recent) {
      return json({ success: true, message: RESPONSE_MENSAJE_GENERICO });
    }

    // Crear token
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1h
    const ipOrigen = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    const { data: reset, error: resetErr } = await db
      .from("password_resets")
      .insert({
        usuario_id: user.id,
        expires_at: expiresAt,
        ip_origen: ipOrigen,
        user_agent: userAgent,
      })
      .select("token")
      .single();

    if (resetErr || !reset) {
      console.error("[password-reset-request] insert error", resetErr);
      // Fallback silencioso: no revelamos nada
      return json({ success: true, message: RESPONSE_MENSAJE_GENERICO });
    }

    // Armar link y enviar correo via Resend
    const resetUrl = `${URL_LOGIN}reset.html?token=${reset.token}`;
    const rendered = renderTemplate("reset_request", {
      nombre: user.nombre,
      reset_url: resetUrl,
    }, URL_LOGIN);

    try {
      const r = await fetch("https://api.resend.com/emails", {
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
      if (!r.ok) {
        const txt = await r.text();
        console.error("[password-reset-request] Resend error", r.status, txt);
      }
    } catch (e) {
      console.error("[password-reset-request] Resend exception", e);
    }

    return json({ success: true, message: RESPONSE_MENSAJE_GENERICO });
  } catch (e) {
    console.error("[password-reset-request]", e);
    // Incluso en error generico, no revelamos nada
    return json({ success: true, message: RESPONSE_MENSAJE_GENERICO });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
