// Edge Function: send-email
// Sistema de notificaciones via Resend con dos modos:
//   1) evento automatico: bienvenida, encuesta_disponible, confirmacion, recordatorio_batch
//   2) manual: Admin escoge subset + asunto + cuerpo HTML
//
// Body esperado:
// {
//   evento: "bienvenida" | "encuesta_disponible" | "confirmacion" | "recordatorio_batch" | "manual",
//   userId?: string,            // requerido para "manual"
//   programa_id?: string,       // requerido para bienvenida, encuesta_disponible, manual
//   encuesta_id?: string,       // requerido para encuesta_disponible, manual subset sin_responder
//   usuario_id?: string,        // requerido para confirmacion (el que acaba de responder)
//   usuario_ids?: string[],     // opcional para bienvenida (a quienes recien agregaron)
//   subset?: "todos" | "lideres" | "colaboradores" | "sin_responder",  // solo manual
//   asunto?: string,            // solo manual
//   cuerpo_html?: string,       // solo manual
//   adjuntos?: [{ nombre, tipo, contenido }]  // base64, solo manual
// }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "./_shared/cors.ts";
import { renderTemplate, TemplateVars } from "./_shared/templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

// Valores default — se pueden sobreescribir via secrets si cambia el dominio
const FROM_EMAIL = Deno.env.get("RESEND_FROM") || "onboarding@resend.dev";
const FROM_NAME = Deno.env.get("RESEND_FROM_NAME") || "MSO TPT";
const URL_LOGIN = Deno.env.get("PLATFORM_URL") || "https://platoniaaa.github.io/plataforma-mso/v2/";

interface ReqBody {
  evento: string;
  userId?: string;
  programa_id?: string;
  encuesta_id?: string;
  usuario_id?: string;
  usuario_ids?: string[];
  subset?: string;
  asunto?: string;
  cuerpo_html?: string;
  adjuntos?: Array<{ nombre: string; tipo: string; contenido: string }>;
}

interface Destinatario {
  usuario_id: string;
  email: string;
  nombre: string;
  lider_nombre?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) return json({ success: false, error: "RESEND_API_KEY no configurada" }, 500);

    const body = (await req.json()) as ReqBody;
    if (!body || !body.evento) return json({ success: false, error: "Evento requerido" }, 400);

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    // Info del programa (usada por casi todos los eventos)
    let programa: { id: string; nombre: string } | null = null;
    if (body.programa_id) {
      const { data } = await db.from("programas").select("id, nombre").eq("id", body.programa_id).single();
      if (data) programa = data;
    }

    // Resolver destinatarios + elegir template segun evento
    let destinatarios: Destinatario[] = [];
    let tipoTemplate = "";
    let extraVars: Partial<TemplateVars> = {};
    let encuesta: { id: string; nombre: string; tipo: string; tipo_cuestionario: string; fecha_cierre: string | null; programa_id: string } | null = null;

    if (body.evento === "bienvenida") {
      if (!programa) return json({ success: false, error: "programa_id requerido" }, 400);
      tipoTemplate = "bienvenida";
      destinatarios = await resolverBienvenida(db, programa.id, body.usuario_ids);
    } else if (body.evento === "encuesta_disponible") {
      if (!body.encuesta_id) return json({ success: false, error: "encuesta_id requerido" }, 400);
      const r = await db.from("encuestas").select("*, programas(nombre)").eq("id", body.encuesta_id).single();
      if (r.error || !r.data) return json({ success: false, error: "Encuesta no encontrada" }, 404);
      encuesta = r.data as typeof encuesta;
      if (!programa) programa = { id: encuesta.programa_id, nombre: (r.data as { programas: { nombre: string } }).programas.nombre };
      tipoTemplate = encuesta.tipo_cuestionario === "coevaluacion" ? "encuesta_disponible_co" : "encuesta_disponible_auto";
      extraVars.fecha_cierre = encuesta.fecha_cierre || "Sin fecha definida";
      destinatarios = await resolverEncuestaDisponible(db, encuesta);
    } else if (body.evento === "confirmacion") {
      if (!body.usuario_id) return json({ success: false, error: "usuario_id requerido" }, 400);
      tipoTemplate = "confirmacion";
      const u = await db.from("usuarios").select("id, nombre, email").eq("id", body.usuario_id).single();
      if (u.error || !u.data) return json({ success: false, error: "Usuario no encontrado" }, 404);
      destinatarios = [{ usuario_id: u.data.id, email: u.data.email, nombre: u.data.nombre }];
    } else if (body.evento === "recordatorio_batch") {
      // Ejecutado por cron: busca encuestas activas con cierre en 1 o 3 dias
      return await handleRecordatorioBatch(db);
    } else if (body.evento === "manual") {
      if (!body.userId) return json({ success: false, error: "userId requerido" }, 400);
      const admin = await db.from("usuarios").select("id, rol").eq("id", body.userId).single();
      if (admin.error || !admin.data || admin.data.rol !== "admin") {
        return json({ success: false, error: "No autorizado" }, 403);
      }
      if (!programa) return json({ success: false, error: "programa_id requerido" }, 400);
      if (!body.asunto || !body.cuerpo_html) return json({ success: false, error: "asunto y cuerpo_html requeridos" }, 400);
      tipoTemplate = "manual";
      extraVars.asunto_manual = body.asunto;
      extraVars.cuerpo_manual_html = body.cuerpo_html;
      destinatarios = await resolverSubset(db, programa.id, body.subset || "todos", body.encuesta_id);
    } else {
      return json({ success: false, error: "Evento desconocido" }, 400);
    }

    if (destinatarios.length === 0) {
      return json({ success: true, enviados: 0, mensaje: "Sin destinatarios" });
    }

    // Persistir cabecera del envio
    const { data: correoRow, error: correoErr } = await db
      .from("correos_enviados")
      .insert({
        programa_id: programa?.id || null,
        evento: body.evento,
        tipo_template: tipoTemplate,
        enviado_por: body.userId || null,
        encuesta_id: encuesta?.id || body.encuesta_id || null,
        asunto: "(multi)",
        cuerpo_html: "(multi)",
        destinatarios: destinatarios.map((d) => ({ usuario_id: d.usuario_id, email: d.email, nombre: d.nombre })),
        adjuntos: body.adjuntos ? body.adjuntos.map((a) => ({ nombre: a.nombre, tipo: a.tipo })) : [],
        estado: "pendiente",
      })
      .select()
      .single();

    if (correoErr || !correoRow) {
      return json({ success: false, error: "Error registrando correo: " + (correoErr?.message || "desconocido") }, 500);
    }

    // Enviar a cada destinatario
    const resendIds: Array<{ usuario_id: string; email: string; resend_id?: string; error?: string }> = [];
    let primerAsunto = "";
    let primerHtml = "";

    for (const d of destinatarios) {
      const vars: TemplateVars = {
        nombre: d.nombre,
        programa: programa?.nombre || "",
        fecha_cierre: extraVars.fecha_cierre || "",
        lider_nombre: d.lider_nombre || "",
        asunto_manual: extraVars.asunto_manual,
        cuerpo_manual_html: extraVars.cuerpo_manual_html,
      };
      const rendered = renderTemplate(tipoTemplate, vars, URL_LOGIN);
      if (!primerAsunto) { primerAsunto = rendered.asunto; primerHtml = rendered.html; }

      const payload: Record<string, unknown> = {
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [d.email],
        subject: rendered.asunto,
        html: rendered.html,
      };

      if (body.adjuntos && body.adjuntos.length) {
        payload.attachments = body.adjuntos.map((a) => ({
          filename: a.nombre,
          content: a.contenido,
        }));
      }

      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const rjson = await r.json();
        if (r.ok && rjson.id) {
          resendIds.push({ usuario_id: d.usuario_id, email: d.email, resend_id: rjson.id });
        } else {
          resendIds.push({ usuario_id: d.usuario_id, email: d.email, error: rjson.message || rjson.name || ("HTTP " + r.status) });
        }
      } catch (e) {
        resendIds.push({ usuario_id: d.usuario_id, email: d.email, error: (e as Error).message });
      }
    }

    const exitosos = resendIds.filter((x) => x.resend_id).length;
    const fallidos = resendIds.length - exitosos;
    const estadoFinal = fallidos === 0 ? "enviado" : exitosos === 0 ? "fallido" : "parcial";

    // Update con asunto/html final y estado
    await db
      .from("correos_enviados")
      .update({
        asunto: primerAsunto,
        cuerpo_html: primerHtml,
        resend_ids: resendIds,
        estado: estadoFinal,
        error: fallidos > 0 ? resendIds.filter((x) => x.error).map((x) => `${x.email}: ${x.error}`).join(" | ") : null,
      })
      .eq("id", correoRow.id);

    // Insertar mirror en notificaciones (in-app bell)
    const notifRows = resendIds
      .filter((x) => x.resend_id)
      .map((x) => ({
        usuario_id: x.usuario_id,
        titulo: primerAsunto,
        mensaje: primerAsunto,
        tipo: body.evento,
        correo_id: correoRow.id,
      }));
    if (notifRows.length > 0) {
      await db.from("notificaciones").insert(notifRows);
    }

    return json({
      success: true,
      enviados: exitosos,
      fallidos,
      correo_id: correoRow.id,
      resultados: resendIds,
    });
  } catch (e) {
    console.error("[send-email]", e);
    return json({ success: false, error: (e as Error).message }, 500);
  }
});

// ============================================
// Resolvedores de destinatarios
// ============================================

async function resolverBienvenida(
  db: ReturnType<typeof createClient>,
  programaId: string,
  usuarioIds?: string[],
): Promise<Destinatario[]> {
  let query = db
    .from("participantes_programa")
    .select("usuario_id, rol_programa, lider_id, usuarios!participantes_programa_usuario_id_fkey(id, nombre, email)")
    .eq("programa_id", programaId);
  if (usuarioIds && usuarioIds.length > 0) query = query.in("usuario_id", usuarioIds);
  const r = await query;
  return (r.data || [])
    .map((row) => {
      const u = Array.isArray(row.usuarios) ? row.usuarios[0] : row.usuarios;
      if (!u || !u.email) return null;
      return { usuario_id: u.id, email: u.email, nombre: u.nombre || "" };
    })
    .filter((x): x is Destinatario => x !== null);
}

async function resolverEncuestaDisponible(
  db: ReturnType<typeof createClient>,
  encuesta: { id: string; tipo_cuestionario: string; programa_id: string },
): Promise<Destinatario[]> {
  const esCoev = encuesta.tipo_cuestionario === "coevaluacion";
  const rolBuscado = esCoev ? "colaborador" : "lider";

  const r = await db
    .from("participantes_programa")
    .select("usuario_id, rol_programa, lider_id, usuarios!participantes_programa_usuario_id_fkey(id, nombre, email)")
    .eq("programa_id", encuesta.programa_id)
    .eq("rol_programa", rolBuscado);

  // Si es coevaluacion, resolver nombres de los lideres asignados
  let liderMap: Record<string, string> = {};
  if (esCoev) {
    const liderIds = Array.from(new Set((r.data || []).map((x: Record<string, unknown>) => x.lider_id).filter(Boolean))) as string[];
    if (liderIds.length > 0) {
      const lr = await db.from("usuarios").select("id, nombre").in("id", liderIds);
      (lr.data || []).forEach((l: { id: string; nombre: string }) => { liderMap[l.id] = l.nombre; });
    }
  }

  return (r.data || [])
    .map((row: Record<string, unknown>) => {
      const u = Array.isArray(row.usuarios) ? row.usuarios[0] : row.usuarios;
      if (!u || !u.email) return null;
      const result: Destinatario = { usuario_id: u.id, email: u.email, nombre: u.nombre || "" };
      if (esCoev && row.lider_id && liderMap[row.lider_id as string]) {
        result.lider_nombre = liderMap[row.lider_id as string];
      }
      return result;
    })
    .filter((x): x is Destinatario => x !== null);
}

async function resolverSubset(
  db: ReturnType<typeof createClient>,
  programaId: string,
  subset: string,
  encuestaId?: string,
): Promise<Destinatario[]> {
  const r = await db
    .from("participantes_programa")
    .select("usuario_id, rol_programa, lider_id, usuarios!participantes_programa_usuario_id_fkey(id, nombre, email)")
    .eq("programa_id", programaId);

  let rows = (r.data || []).filter((x: Record<string, unknown>) => {
    const u = Array.isArray(x.usuarios) ? x.usuarios[0] : x.usuarios;
    return u && u.email;
  });

  if (subset === "lideres") rows = rows.filter((x: Record<string, unknown>) => x.rol_programa === "lider");
  else if (subset === "colaboradores") rows = rows.filter((x: Record<string, unknown>) => x.rol_programa === "colaborador");
  else if (subset === "sin_responder" && encuestaId) {
    // Quienes NO han respondido la encuesta indicada
    const resp = await db.from("respuestas").select("evaluador_id").eq("encuesta_id", encuestaId);
    const respondieron = new Set((resp.data || []).map((x: { evaluador_id: string }) => x.evaluador_id));
    rows = rows.filter((x: Record<string, unknown>) => !respondieron.has(x.usuario_id));
  }

  return rows.map((row: Record<string, unknown>) => {
    const u = Array.isArray(row.usuarios) ? row.usuarios[0] : row.usuarios;
    return { usuario_id: u.id, email: u.email, nombre: u.nombre || "" };
  });
}

// ============================================
// Recordatorio batch (cron diario)
// ============================================

async function handleRecordatorioBatch(db: ReturnType<typeof createClient>): Promise<Response> {
  // Encuestas activas con cierre en 1 o 3 dias desde hoy
  const hoy = new Date();
  const target1 = new Date(hoy); target1.setDate(hoy.getDate() + 1);
  const target3 = new Date(hoy); target3.setDate(hoy.getDate() + 3);
  const fmt = (d: Date) => d.toISOString().substring(0, 10);
  const targets = [{ dias: 1, fecha: fmt(target1) }, { dias: 3, fecha: fmt(target3) }];

  let totalEnviados = 0;
  const resumen: Array<{ encuesta_id: string; dias: number; enviados: number }> = [];

  for (const t of targets) {
    const encs = await db.from("encuestas").select("*, programas(id, nombre)").eq("estado", "activa").eq("fecha_cierre", t.fecha);
    for (const e of (encs.data || [])) {
      // Quienes NO respondieron
      const pendientes = await resolverSinResponder(db, e);
      for (const d of pendientes) {
        const rendered = renderTemplate("recordatorio", {
          nombre: d.nombre,
          programa: (e as { programas: { nombre: string } }).programas.nombre,
          fecha_cierre: e.fecha_cierre,
          dias: String(t.dias),
        }, URL_LOGIN);

        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: `${FROM_NAME} <${FROM_EMAIL}>`, to: [d.email], subject: rendered.asunto, html: rendered.html }),
        });
        const rjson = await r.json();
        if (r.ok && rjson.id) totalEnviados++;
      }

      if (pendientes.length > 0) {
        // Registrar 1 fila por encuesta/target en historial
        await db.from("correos_enviados").insert({
          programa_id: e.programa_id,
          evento: "recordatorio",
          tipo_template: "recordatorio",
          encuesta_id: e.id,
          asunto: `Recordatorio ${t.dias}d: ${e.nombre}`,
          cuerpo_html: "(batch)",
          destinatarios: pendientes.map((d) => ({ usuario_id: d.usuario_id, email: d.email, nombre: d.nombre })),
          estado: "enviado",
        });
      }
      resumen.push({ encuesta_id: e.id, dias: t.dias, enviados: pendientes.length });
    }
  }

  return json({ success: true, enviados: totalEnviados, detalle: resumen });
}

async function resolverSinResponder(
  db: ReturnType<typeof createClient>,
  encuesta: { id: string; programa_id: string; tipo_cuestionario: string },
): Promise<Destinatario[]> {
  const rolBuscado = encuesta.tipo_cuestionario === "coevaluacion" ? "colaborador" : "lider";
  const parts = await db
    .from("participantes_programa")
    .select("usuario_id, usuarios!participantes_programa_usuario_id_fkey(id, nombre, email)")
    .eq("programa_id", encuesta.programa_id)
    .eq("rol_programa", rolBuscado);
  const resp = await db.from("respuestas").select("evaluador_id").eq("encuesta_id", encuesta.id);
  const respondieron = new Set((resp.data || []).map((x: { evaluador_id: string }) => x.evaluador_id));
  return (parts.data || [])
    .map((row: Record<string, unknown>) => {
      const u = Array.isArray(row.usuarios) ? row.usuarios[0] : row.usuarios;
      if (!u || !u.email || respondieron.has(u.id)) return null;
      return { usuario_id: u.id, email: u.email, nombre: u.nombre || "" };
    })
    .filter((x): x is Destinatario => x !== null);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
