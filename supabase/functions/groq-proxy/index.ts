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
      model: body.model || "openai/gpt-oss-120b",
      messages: body.messages,
      temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
      max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 2048,
    };
    if (body.response_format) payload.response_format = body.response_format;

    const MAX_ATTEMPTS = 4;
    const MAX_WAIT_MS = 25000;
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
    const parseRetryAfter = (resp: Response, body: string): number | null => {
      const h = resp.headers.get("retry-after");
      if (h) { const s = parseFloat(h); if (!isNaN(s)) return s * 1000; }
      const m = body.match(/try again in ([\d.]+)s/i);
      return m ? parseFloat(m[1]) * 1000 : null;
    };

    let r: Response | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      // Rate limit o error transitorio -> esperar y reintentar
      if ((r.status === 429 || r.status >= 500) && attempt < MAX_ATTEMPTS - 1) {
        const errTxt = await r.text().catch(() => "");
        const sugerido = r.status === 429 ? parseRetryAfter(r, errTxt) : null;
        const backoff = Math.min(2000 * Math.pow(2, attempt), MAX_WAIT_MS);
        await sleep(Math.min(sugerido ?? backoff, MAX_WAIT_MS));
        continue;
      }
      break;
    }

    if (!r || !r.ok) {
      const txt = r ? await r.text() : "sin respuesta";
      return json({ success: false, error: `Groq ${r?.status ?? 0}: ${txt}` }, 502);
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
