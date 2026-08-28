// Llamada a Groq (OpenAI-compatible) con response_format json_object.
// Reintenta ante 429 (rate limit) y 5xx transitorios, honrando el header
// Retry-After de Groq, con backoff exponencial y tope de espera para no
// exceder el timeout de la Edge Function.
export async function callGroqJSON(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
): Promise<unknown> {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const payload = {
    model,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.4,
    max_tokens: 2048,
  };

  const MAX_ATTEMPTS = 4;
  const MAX_WAIT_MS = 25000; // tope por espera para no colgar la funcion
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  // Segundos indicados por Groq (header Retry-After o mensaje "try again in Xs")
  function parseRetryAfter(r: Response, body: string): number | null {
    const h = r.headers.get("retry-after");
    if (h) {
      const s = parseFloat(h);
      if (!isNaN(s)) return s * 1000;
    }
    const m = body.match(/try again in ([\d.]+)s/i);
    if (m) return parseFloat(m[1]) * 1000;
    return null;
  }

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const ultimo = attempt === MAX_ATTEMPTS - 1;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      // Rate limit o error transitorio del servidor -> esperar y reintentar
      if (r.status === 429 || r.status >= 500) {
        const body = await r.text().catch(() => "");
        lastErr = new Error(`Groq ${r.status}: ${body.slice(0, 200)}`);
        if (ultimo) throw lastErr;
        const sugerido = r.status === 429 ? parseRetryAfter(r, body) : null;
        const backoff = Math.min(2000 * Math.pow(2, attempt), MAX_WAIT_MS);
        await sleep(Math.min(sugerido ?? backoff, MAX_WAIT_MS));
        continue;
      }
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`Groq ${r.status}: ${body}`);
      }

      const data = await r.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("respuesta vacia de Groq");
      try {
        return JSON.parse(content);
      } catch {
        lastErr = new Error("JSON invalido");
        if (ultimo) throw lastErr;
        await sleep(1000);
      }
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (ultimo) throw e;
      // Error de red/abort: pequeña espera antes de reintentar
      await sleep(1500);
    }
  }
  throw lastErr ?? new Error("Groq call failed");
}
