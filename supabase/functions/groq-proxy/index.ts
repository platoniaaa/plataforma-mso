// Edge Function: groq-proxy
// Proxy para llamadas a Groq desde el frontend sin exponer la API key.
// Recibe { messages, model?, temperature?, max_tokens?, response_format? }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;

interface ReqBody {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GROQ_API_KEY) {
      return json({ success: false, error: "GROQ_API_KEY no configurada" }, 500);
    }

    const body = (await req.json()) as ReqBody;
    if (!body.messages || !Array.isArray(body.messages)) {
      return json({ success: false, error: "messages requerido" }, 400);
    }

    const payload: Record<string, unknown> = {
      model: body.model || "llama-3.3-70b-versatile",
      messages: body.messages,
      temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
      max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 2048,
    };
    if (body.response_format) payload.response_format = body.response_format;

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const txt = await r.text();
      return json({ success: false, error: `Groq ${r.status}: ${txt}` }, 502);
    }

    const data = await r.json();
    if (data.choices && data.choices[0]) {
      return json({
        success: true,
        response: data.choices[0].message.content,
      });
    }
    return json({ success: false, error: "Respuesta inesperada de Groq" }, 502);
  } catch (e) {
    console.error("[groq-proxy]", e);
    return json({ success: false, error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
