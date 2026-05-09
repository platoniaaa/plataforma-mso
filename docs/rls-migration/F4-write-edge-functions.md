# F4 - Edge Functions de escritura

**Estado**: F4 especificacion + 1 implementacion de referencia completadas 2026-05-09. Las otras 14 Edge Functions se construyen en sesiones de continuidad usando la plantilla.

## Patron comun

Todas las Edge Functions de escritura siguen el mismo patron de 5 pasos:

1. Validar el JWT recibido en `Authorization: Bearer <token>`. Extraer `user_id` y `rol`.
2. Validar que el rol tenga permiso para la operacion (admin / lider / cualquier auth).
3. Validar el body (campos requeridos, formato).
4. Operar con `service_role` (bypassa RLS).
5. Retornar resultado o error.

## Helper compartido (reutilizable)

Para no repetir codigo, hay que crear `supabase/functions/_shared/auth.ts` con funciones helper:

```typescript
// _shared/auth.ts
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const JWT_SECRET = Deno.env.get("JWT_SECRET") || Deno.env.get("SUPABASE_JWT_SECRET")!;

export interface JwtPayload {
  user_id: string;
  rol: string;
  sub: string;
  exp: number;
}

export async function verifyJwt(authHeader: string | null): Promise<JwtPayload | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.substring(7);
  try {
    const keyBuf = new TextEncoder().encode(JWT_SECRET);
    const key = await crypto.subtle.importKey(
      "raw", keyBuf, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
    );
    const payload = await verify(token, key) as unknown as JwtPayload;
    return payload;
  } catch {
    return null;
  }
}

export function requireAuth(payload: JwtPayload | null) {
  if (!payload) throw new Response(JSON.stringify({ success: false, error: "No autorizado" }), { status: 401 });
}

export function requireAdmin(payload: JwtPayload | null) {
  requireAuth(payload);
  if (payload!.rol !== "admin") {
    throw new Response(JSON.stringify({ success: false, error: "Permisos insuficientes" }), { status: 403 });
  }
}
```

## Especificacion de las 15 Edge Functions

| # | Edge Function | Reemplaza (frontend) | Validacion | Tablas afectadas |
|---|---|---|---|---|
| 1 | `respuestas-submit` | `enviarRespuestas`, `rehacerEncuesta` | Auth + `evaluador_id` debe ser self | `respuestas` upsert/delete |
| 2 | `feedback-submit` | `registrarFeedback` | Auth + rol=lider o admin, `lider_id`=self si lider | `feedback` insert |
| 3 | `usuarios-admin-write` | `crearUsuario`, `actualizarUsuario`, `cambiarEstadoUsuario`, `eliminarTodosParticipantes` | requireAdmin | `usuarios` insert/update/delete |
| 4 | `usuarios-import` | `importarParticipantesExcel`, `asignarColaborador` | requireAdmin | `usuarios` + `participantes_programa` upsert |
| 5 | `participantes-write` | `asociarParticipantes`, `desasociarParticipante` | requireAdmin | `participantes_programa` upsert/delete |
| 6 | `clientes-write` | `crearCliente`, `actualizarCliente`, `desactivarCliente`, `eliminarCliente` | requireAdmin | `clientes` insert/update/delete |
| 7 | `programas-write` | `crearPrograma`, `actualizarPrograma`, `activarPrograma`, `desactivarPrograma`, `eliminarPrograma` | requireAdmin | `programas` insert/update/delete |
| 8 | `competencias-write` | `crearCompetencia`, `actualizarCompetencia`, `desactivarCompetencia`, `desactivarConducta`, `importarCompetenciasExcel` | requireAdmin | `competencias` + `conductas` |
| 9 | `encuestas-write` | `crearEncuesta`, `actualizarEncuesta`, `activarEncuesta`, `cerrarEncuesta`, `eliminarEncuesta` | requireAdmin | `encuestas` insert/update/delete |
| 10 | `preguntas-write` | `agregarPregunta`, `actualizarPregunta`, `eliminarPregunta` | requireAdmin | `preguntas` insert/update/delete |
| 11 | `archivos-write` | `subirArchivoPrograma`, `eliminarArchivoPrograma`, `actualizarVisibilidadArchivo` | requireAdmin para writes; usuario auth para signed URL | `archivos_programa` + storage |
| 12 | `gantt-write` | `crearHito`, `actualizarHito`, `eliminarHito`, `importarGanttExcel`, `actualizarFechasGanttDesdeProgramas` | requireAdmin | `hitos_programa` insert/update/delete + `programas` update |
| 13 | `observaciones-write` | `crearObservacion`, `actualizarObservacion`, `cambiarEstadoObservacion` | rol=lider (con `lider_id`=self) o admin | `observaciones` + storage `evidencias-observaciones` |
| 14 | `notificaciones-mark-read` | `marcarNotificacionLeida` | Auth + `usuario_id`=self | `notificaciones` update |
| 15 | `informe-register` | `registrarInformeGenerado` | requireAdmin | `informes_generados` insert |

(Mas la ya existente `send-email/manual` que cubre el flujo de correos manuales.)

## Implementacion de referencia: `respuestas-submit`

Esta es la mas compleja porque maneja upsert + delete (rehacer evaluacion). El resto de las 14 sigue patrones similares mas simples.

```typescript
// supabase/functions/respuestas-submit/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyJwt, requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ReqBody {
  action: "submit" | "rehacer";
  encuestaId: string;
  respuestas?: Array<{
    pregunta_id: string;
    valor: string | number;
    evaluado_id?: string | null;
  }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = await verifyJwt(req.headers.get("Authorization"));
    requireAuth(jwt);

    const body = await req.json() as ReqBody;
    if (!body.action || !body.encuestaId) {
      return json({ success: false, error: "action y encuestaId requeridos" }, 400);
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    if (body.action === "rehacer") {
      // Borrar las respuestas previas del usuario en esta encuesta
      const { error } = await db.from("respuestas")
        .delete()
        .eq("encuesta_id", body.encuestaId)
        .eq("evaluador_id", jwt!.user_id);
      if (error) return json({ success: false, error: error.message }, 500);
      return json({ success: true });
    }

    // action === "submit"
    if (!Array.isArray(body.respuestas) || body.respuestas.length === 0) {
      return json({ success: false, error: "respuestas requeridas" }, 400);
    }

    // Determinar evaluado_id: en autoevaluacion es el mismo evaluador,
    // en coevaluacion viene en el body
    const encR = await db.from("encuestas")
      .select("tipo_cuestionario, programa_id")
      .eq("id", body.encuestaId).single();
    if (encR.error || !encR.data) return json({ success: false, error: "Encuesta no encontrada" }, 404);

    let evaluadoIdDefault = jwt!.user_id;
    if (encR.data.tipo_cuestionario === "coevaluacion") {
      // Buscar el lider asociado
      const pp = await db.from("participantes_programa")
        .select("lider_id")
        .eq("usuario_id", jwt!.user_id)
        .eq("programa_id", encR.data.programa_id)
        .maybeSingle();
      if (!pp.data?.lider_id) {
        return json({ success: false, error: "Sin lider asociado para coevaluacion" }, 400);
      }
      evaluadoIdDefault = pp.data.lider_id;
    }

    const rows = body.respuestas.map((r) => ({
      encuesta_id: body.encuestaId,
      pregunta_id: r.pregunta_id,
      evaluador_id: jwt!.user_id, // forzado a self, no se acepta override del cliente
      evaluado_id: r.evaluado_id || evaluadoIdDefault,
      valor: String(r.valor),
    }));

    const { error } = await db.from("respuestas").upsert(rows, {
      onConflict: "encuesta_id,pregunta_id,evaluador_id",
    });
    if (error) return json({ success: false, error: error.message }, 500);

    return json({ success: true, inserted: rows.length });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ success: false, error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

**Lo critico**: `evaluador_id: jwt!.user_id` — se fuerza al user_id del JWT, ignorando lo que mande el cliente. Esto evita que un usuario malicioso intente registrar respuestas en nombre de otro.

## Patron generico para las otras 14

```typescript
// Ejemplo de plantilla para clientes-write, programas-write, etc.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyJwt, requireAdmin } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const jwt = await verifyJwt(req.headers.get("Authorization"));
    requireAdmin(jwt);

    const body = await req.json();
    const { action, ...payload } = body;

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    let result;
    switch (action) {
      case "create": result = await db.from("TABLA").insert(payload).select().single(); break;
      case "update": result = await db.from("TABLA").update(payload.data).eq("id", payload.id); break;
      case "delete": result = await db.from("TABLA").delete().eq("id", payload.id); break;
      default: return json({ success: false, error: "action invalida" }, 400);
    }

    if (result.error) return json({ success: false, error: result.error.message }, 500);
    return json({ success: true, data: result.data });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
```

## Plan de implementacion incremental

Las 14 Edge Functions restantes se pueden construir en sprints de 2-3 funciones por sesion:

| Sprint | Edge Functions | Foco |
|---|---|---|
| 1 | `feedback-submit`, `notificaciones-mark-read`, `informe-register` | Faciles, validacion por self |
| 2 | `clientes-write`, `programas-write`, `competencias-write` | Operativas admin, patron simple |
| 3 | `encuestas-write`, `preguntas-write`, `gantt-write` | Operativas admin con anidamiento |
| 4 | `usuarios-admin-write`, `usuarios-import`, `participantes-write` | Mas complejas (Excel + cascada) |
| 5 | `archivos-write`, `observaciones-write` | Mas complejas (storage + adjuntos) |

Total estimado: 5 sesiones de 1-2 horas cada una.

## Despliegue (en F8, agosto 2026)

```bash
# Una vez que todas esten construidas y testeadas en TEST:
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy auth-login --project-ref loezdutwrucnoebhofjt
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy respuestas-submit --project-ref loezdutwrucnoebhofjt
# ... 14 mas
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy informe-register --project-ref loezdutwrucnoebhofjt
```

Las Edge Functions son **additivas**: desplegarlas no rompe nada, porque el frontend sigue usando los flujos antiguos hasta que F5 los reemplace.

## Proximos pasos

- F5: refactor del frontend para llamar a las Edge Functions y enviar JWT.
- F6: convertir el SQL de F2 en migration aplicable.
