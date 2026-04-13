// Llamada a Groq (OpenAI-compatible) con response_format json_object + 1 reintento
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

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
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

      if (r.status === 429) {
        await new Promise((res) => setTimeout(res, 2000));
        lastErr = new Error("rate limited");
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
        if (attempt === 1) throw lastErr;
      }
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt === 1) throw e;
    }
  }
  throw lastErr ?? new Error("Groq call failed");
}
