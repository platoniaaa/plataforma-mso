// Edge Function: analizar-respuestas-abiertas
// Recibe { userId, encuestaId, preguntaId, tipoAnalisis?, forzarRegenerar? }
// Valida admin, lee respuestas anonimizadas, llama a Grok, cachea y retorna.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "./_shared/cors.ts";
import { callGroqJSON } from "./_shared/groq.ts";
import {
  buildAnalisisPrompt,
  buildComparativoPrompt,
} from "./_shared/prompts.ts";

interface ReqBody {
  userId: string;
  encuestaId: string;
  preguntaId: string;
  tipoAnalisis?: "individual" | "comparativo_pre_post";
  forzarRegenerar?: boolean;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
// Modelo Groq con soporte de response_format json_object
const MODEL = "llama-3.3-70b-versatile";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GROQ_API_KEY) {
      return json({ success: false, error: "GROQ_API_KEY no configurada" }, 500);
    }

    const body = (await req.json()) as ReqBody;
    const {
      userId,
      encuestaId,
      preguntaId,
      tipoAnalisis = "individual",
      forzarRegenerar = false,
    } = body;

    if (!userId || !encuestaId || !preguntaId) {
      return json(
        { success: false, error: "Parametros requeridos faltantes" },
        400,
      );
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Validar admin
    const { data: usr, error: uErr } = await db
      .from("usuarios")
      .select("id, rol")
      .eq("id", userId)
      .single();
    if (uErr || !usr || usr.rol !== "admin") {
      return json({ success: false, error: "No autorizado" }, 403);
    }

    // 2. Cargar pregunta + encuesta
    const { data: preg, error: pErr } = await db
      .from("preguntas")
      .select(
        "id, texto_pregunta, tipo_respuesta, encuesta_id, encuestas(id, programa_id, tipo)",
      )
      .eq("id", preguntaId)
      .single();

    if (pErr || !preg) {
      return json({ success: false, error: "Pregunta no encontrada" }, 404);
    }
    if (!["texto_breve", "parrafo"].includes(preg.tipo_respuesta)) {
      return json(
        { success: false, error: "La pregunta no es de tipo abierta" },
        400,
      );
    }
    const encuesta = (preg as unknown as {
      encuestas: { id: string; programa_id: string; tipo: "pre" | "post" };
    }).encuestas;
    const momento: "pre" | "post" = encuesta.tipo;
    const programaId = encuesta.programa_id;

    // 3. Cache hit?
    if (!forzarRegenerar) {
      const { data: cached } = await db
        .from("analisis_cualitativo")
        .select("*")
        .eq("encuesta_id", encuestaId)
        .eq("pregunta_id", preguntaId)
        .eq("tipo_analisis", tipoAnalisis)
        .maybeSingle();
      if (cached) {
        return json({ success: true, data: cached, cached: true });
      }
    }

    // 4. Construir prompt + llamada a Grok
    let resultado: unknown;
    let nRespuestas = 0;

    if (tipoAnalisis === "comparativo_pre_post") {
      // Buscar analisis individual POST actual + PRE analogo del mismo programa
      const { data: cachePost } = await db
        .from("analisis_cualitativo")
        .select("resultado")
        .eq("encuesta_id", encuestaId)
        .eq("pregunta_id", preguntaId)
        .eq("tipo_analisis", "individual")
        .maybeSingle();

      // PRE: buscar pregunta con mismo texto en encuesta PRE del mismo programa
      const { data: encsPre } = await db
        .from("encuestas")
        .select("id")
        .eq("programa_id", programaId)
        .eq("tipo", "pre")
        .eq("tipo_cuestionario", "autoevaluacion");
      const preEncIds = (encsPre || []).map((e) => e.id);
      let cachePre: { resultado: unknown } | null = null;
      if (preEncIds.length) {
        const { data: pregsPre } = await db
          .from("preguntas")
          .select("id, texto_pregunta")
          .in("encuesta_id", preEncIds)
          .in("tipo_respuesta", ["texto_breve", "parrafo"]);
        const match = (pregsPre || []).find((x) =>
          (x.texto_pregunta || "").trim().toLowerCase() ===
            (preg.texto_pregunta || "").trim().toLowerCase()
        );
        if (match) {
          const { data: cp } = await db
            .from("analisis_cualitativo")
            .select("resultado")
            .eq("pregunta_id", match.id)
            .eq("tipo_analisis", "individual")
            .maybeSingle();
          cachePre = cp;
        }
      }

      if (!cachePre || !cachePost) {
        return json({
          success: false,
          error: "Faltan analisis individuales PRE/POST para comparar",
          code: "NO_PAIR",
        }, 200);
      }

      const messages = buildComparativoPrompt(
        preg.texto_pregunta,
        cachePre.resultado,
        cachePost.resultado,
      );
      resultado = await callGroqJSON(GROQ_API_KEY, MODEL, messages);
    } else {
      // Individual: leer respuestas (solo valor, anonimizado)
      const { data: respsRaw } = await db
        .from("respuestas")
        .select("valor")
        .eq("pregunta_id", preguntaId);

      const respuestas = (respsRaw || [])
        .map((r) => (r.valor ?? "").toString().trim())
        .filter((t) => t.length >= 3);

      if (respuestas.length < 2) {
        return json({
          success: false,
          error: "Insuficientes respuestas para analisis (minimo 2)",
          code: "NOT_ENOUGH_DATA",
        }, 200);
      }
      nRespuestas = respuestas.length;

      const messages = buildAnalisisPrompt(
        preg.texto_pregunta,
        momento,
        respuestas,
      );
      resultado = await callGroqJSON(GROQ_API_KEY, MODEL, messages);
    }

    // 5. Validar schema minimo
    if (!isValidAnalisis(resultado, tipoAnalisis)) {
      return json({
        success: false,
        error: "Respuesta del LLM con formato invalido",
        code: "INVALID_JSON",
      }, 502);
    }

    // 6. Upsert cache
    const row = {
      programa_id: programaId,
      encuesta_id: encuestaId,
      pregunta_id: preguntaId,
      momento,
      tipo_analisis: tipoAnalisis,
      resultado,
      modelo: MODEL,
      n_respuestas: nRespuestas,
      generado_por: userId,
      updated_at: new Date().toISOString(),
    };
    const { data: upserted, error: upErr } = await db
      .from("analisis_cualitativo")
      .upsert(row, { onConflict: "encuesta_id,pregunta_id,tipo_analisis" })
      .select()
      .single();

    if (upErr) return json({ success: false, error: upErr.message }, 500);

    return json({ success: true, data: upserted, cached: false });
  } catch (e) {
    console.error("[analizar-respuestas-abiertas]", e);
    return json({
      success: false,
      error: (e as Error).message || "Error interno",
    }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidAnalisis(r: unknown, tipo: string): boolean {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  if (tipo === "individual") {
    return (
      typeof o.resumen_ejecutivo === "string" &&
      Array.isArray(o.temas_recurrentes) &&
      typeof o.sentimiento_general === "object" &&
      Array.isArray(o.citas_destacadas) &&
      Array.isArray(o.senales_alerta) &&
      Array.isArray(o.recomendaciones)
    );
  }
  return (
    typeof o.resumen_evolucion === "string" &&
    Array.isArray(o.temas_aparecidos) &&
    Array.isArray(o.temas_desaparecidos)
  );
}
