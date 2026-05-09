// Edge Function: auth-login
// Valida credenciales contra la tabla `usuarios` y emite un JWT custom firmado con el JWT_SECRET de Supabase.
// El JWT contiene { user_id, rol, role: "authenticated", aud: "authenticated", iss, iat, exp }
// y permite que las RLS policies funcionen vía `current_setting('request.jwt.claims', true)`.
//
// Body: { email: string, password: string }
// Response success: { success: true, token: string, expiresAt: number, usuario: {...} }
// Response failure: { success: false, error: string } con status 401/500

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// El JWT_SECRET es el mismo que firma anon key y service_role.
// Configurar como secret: npx supabase secrets set JWT_SECRET=<valor del dashboard>
const JWT_SECRET = Deno.env.get("JWT_SECRET") || Deno.env.get("SUPABASE_JWT_SECRET")!;

const TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 horas
const ISSUER = "tpt-platform";
const AUDIENCE = "authenticated";

interface ReqBody {
  email?: string;
  password?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!JWT_SECRET) {
      console.error("[auth-login] JWT_SECRET no configurado");
      return json({ success: false, error: "Configuracion del servidor incompleta" }, 500);
    }

    const body = (await req.json()) as ReqBody;
    const email = (body.email || "").toString().trim();
    const password = (body.password || "").toString();

    if (!email || !password) {
      return json({ success: false, error: "email y password requeridos" }, 400);
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    // Match case-insensitive en email + match exacto en password
    // (consistente con el fix de loginUsuario en supabase-client.js)
    const { data: user, error } = await db
      .from("usuarios")
      .select("id, nombre, email, rol, cargo, estado, cliente_id, password_visible")
      .ilike("email", email)
      .eq("password_visible", password)
      .maybeSingle();

    if (error) {
      console.error("[auth-login] db error", error);
      return json({ success: false, error: "Error de autenticacion" }, 500);
    }

    if (!user) {
      return json({ success: false, error: "Credenciales invalidas. Verifica tu correo y contrasena." }, 401);
    }

    if (user.estado && user.estado !== "Activo") {
      return json({ success: false, error: "Cuenta inactiva. Contacta al administrador." }, 403);
    }

    // Construir el JWT custom
    const iat = getNumericDate(0);
    const exp = getNumericDate(TOKEN_TTL_SECONDS);

    const payload = {
      sub: user.id,
      user_id: user.id,
      rol: user.rol,
      role: "authenticated",
      iat,
      exp,
      iss: ISSUER,
      aud: AUDIENCE,
    };

    // Importar la clave HMAC desde el secret string
    const keyBuf = new TextEncoder().encode(JWT_SECRET);
    const key = await crypto.subtle.importKey(
      "raw",
      keyBuf,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );

    const token = await create({ alg: "HS256", typ: "JWT" }, payload, key);

    // No incluimos password_visible en la respuesta
    const usuarioOut = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      cargo: user.cargo,
      cliente_id: user.cliente_id,
    };

    return json({
      success: true,
      token,
      expiresAt: exp * 1000, // ms epoch para conveniencia del cliente
      usuario: usuarioOut,
    });
  } catch (e) {
    console.error("[auth-login] exception", e);
    return json({ success: false, error: (e as Error).message || "Error inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
