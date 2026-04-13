export function buildAnalisisPrompt(
  preguntaTexto: string,
  momento: string,
  respuestas: string[],
) {
  const system =
    `Eres un consultor senior de desarrollo organizacional en MSO Chile, especializado en programas de transferencia al puesto de trabajo (TPT). Analizas respuestas abiertas de participantes con rigor, objetividad y enfoque accionable. Respondes SIEMPRE en JSON valido con la estructura solicitada. Nunca inventas citas: todas las citas deben aparecer literalmente en las respuestas entregadas. No incluyes nombres, cargos ni datos personales. Momento del analisis: ${momento.toUpperCase()}.`;

  const user =
    `Pregunta: "${preguntaTexto}"

Respuestas (anonimizadas, una por linea):
${
      respuestas
        .map((r, i) => `${i + 1}. ${r.replace(/\s+/g, " ").trim()}`)
        .join("\n")
    }

Produce un JSON con EXACTAMENTE esta estructura:
{
  "resumen_ejecutivo": "3 a 5 oraciones en espanol neutro",
  "temas_recurrentes": [
    { "tema": "string", "frecuencia_aprox": number, "ejemplo": "string literal extraido de una respuesta" }
  ],
  "sentimiento_general": {
    "clasificacion": "positivo" | "mixto" | "critico",
    "justificacion": "string breve"
  },
  "citas_destacadas": ["cita literal 1", "cita literal 2"],
  "senales_alerta": ["string"],
  "recomendaciones": ["string accionable alineada con consultoria MSO"]
}

Devuelve SOLO el JSON, sin texto adicional.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function buildComparativoPrompt(
  preguntaTexto: string,
  analisisPre: unknown,
  analisisPost: unknown,
) {
  const system =
    `Eres consultor senior de MSO Chile. Comparas dos analisis cualitativos (PRE y POST) del mismo programa para identificar evolucion. Respondes SIEMPRE en JSON valido.`;

  const user = `Pregunta: "${preguntaTexto}"

ANALISIS PRE:
${JSON.stringify(analisisPre, null, 2)}

ANALISIS POST:
${JSON.stringify(analisisPost, null, 2)}

Produce JSON con EXACTAMENTE esta estructura:
{
  "resumen_evolucion": "3 a 5 oraciones",
  "temas_aparecidos": ["string"],
  "temas_desaparecidos": ["string"],
  "evolucion_sentimiento": "string",
  "cambios_significativos": ["string"],
  "recomendaciones_post": ["string accionable"]
}

Devuelve SOLO el JSON.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
