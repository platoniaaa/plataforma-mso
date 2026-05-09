# F5 - Refactor del frontend para JWT + Edge Functions

**Estado**: F5 plan documentado 2026-05-09. Implementacion incremental despues de F4.

## Cambios en `docs/v2/supabase-client.js`

### 1. Variables de sesion (al inicio)

```javascript
var SUPABASE_URL = 'https://loezdutwrucnoebhofjt.supabase.co';
var SUPABASE_KEY = '...'; // anon key, sigue existiendo
var _supabase = null;
var _jwt = null;       // NUEVO
var _jwtExp = 0;       // NUEVO

function initSupabase() {
  // Restaurar JWT desde sessionStorage si existe
  _jwt = sessionStorage.getItem('tpt_jwt');
  _jwtExp = parseInt(sessionStorage.getItem('tpt_jwt_exp') || '0', 10);

  var headers = {};
  if (_jwt && Date.now() < _jwtExp) {
    headers['Authorization'] = 'Bearer ' + _jwt;
  }

  _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: headers }
  });
}
```

### 2. `loginUsuario` rewrite

```javascript
loginUsuario: async function(email, password) {
  try {
    var r = await fetch(SUPABASE_URL + '/functions/v1/auth-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY  // anon key para invocar EF
      },
      body: JSON.stringify({ email: email, password: password })
    });
    var data = await r.json();
    if (!data.success) return { success: false, error: data.error };

    // Persistir
    _jwt = data.token;
    _jwtExp = data.expiresAt;
    sessionStorage.setItem('tpt_jwt', _jwt);
    sessionStorage.setItem('tpt_jwt_exp', String(_jwtExp));
    sessionStorage.setItem('tpt_usuario', JSON.stringify(data.usuario));

    // Re-instanciar el cliente con el JWT como header global
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { headers: { Authorization: 'Bearer ' + _jwt } }
    });

    return { success: true, data: { token: _jwt, usuario: data.usuario } };
  } catch(e) {
    return { success: false, error: 'Error de conexion. Intenta nuevamente.' };
  }
}
```

### 3. `cerrarSesion`

```javascript
cerrarSesion: async function() {
  _jwt = null;
  _jwtExp = 0;
  sessionStorage.removeItem('tpt_jwt');
  sessionStorage.removeItem('tpt_jwt_exp');
  sessionStorage.removeItem('tpt_usuario');
  // Reset cliente a anon
  _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return { success: true };
}
```

### 4. Helper `callEdgeFunction` (centraliza llamadas a EFs)

```javascript
async function callEdgeFunction(name, body) {
  var headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY
  };
  if (_jwt) {
    headers['Authorization'] = 'Bearer ' + _jwt;
  } else {
    headers['Authorization'] = 'Bearer ' + SUPABASE_KEY;
  }

  var r = await fetch(SUPABASE_URL + '/functions/v1/' + name, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body || {})
  });

  if (r.status === 401) {
    // Token expirado o invalido — redirigir a login
    sessionStorage.removeItem('tpt_jwt');
    sessionStorage.removeItem('tpt_jwt_exp');
    window.location.href = '/index.html?reason=expired';
    return { success: false, error: 'Sesion expirada' };
  }

  return await r.json();
}
```

### 5. Reemplazar escrituras directas por llamadas a EF

Mapeo completo de cambios (los 56 writes inventariados en F1):

| Funcion actual | Reemplazo |
|---|---|
| `enviarRespuestas` | `callEdgeFunction('respuestas-submit', { action: 'submit', encuestaId, respuestas })` |
| `rehacerEncuesta` | `callEdgeFunction('respuestas-submit', { action: 'rehacer', encuestaId })` |
| `registrarFeedback` | `callEdgeFunction('feedback-submit', payload)` |
| `crearUsuario` / `actualizarUsuario` / `cambiarEstadoUsuario` | `callEdgeFunction('usuarios-admin-write', { action, ... })` |
| `importarParticipantesExcel` / `asignarColaborador` | `callEdgeFunction('usuarios-import', { participantes })` |
| `asociarParticipantes` / `desasociarParticipante` / `eliminarTodosParticipantes` | `callEdgeFunction('participantes-write', { action, ... })` |
| `crearCliente` / `actualizarCliente` / `desactivarCliente` / `eliminarCliente` | `callEdgeFunction('clientes-write', { action, ... })` |
| `crearPrograma` / `actualizarPrograma` / `activarPrograma` / `desactivarPrograma` / `eliminarPrograma` | `callEdgeFunction('programas-write', { action, ... })` |
| `crearCompetencia` / `actualizarCompetencia` / `desactivarCompetencia` / `desactivarConducta` / `importarCompetenciasExcel` | `callEdgeFunction('competencias-write', { action, ... })` |
| `crearEncuesta` / `actualizarEncuesta` / `activarEncuesta` / `cerrarEncuesta` / `eliminarEncuesta` | `callEdgeFunction('encuestas-write', { action, ... })` |
| `agregarPregunta` / `actualizarPregunta` / `eliminarPregunta` | `callEdgeFunction('preguntas-write', { action, ... })` |
| `subirArchivoPrograma` / `eliminarArchivoPrograma` / `actualizarVisibilidadArchivo` | `callEdgeFunction('archivos-write', { action, ... })` |
| `crearHito` / `actualizarHito` / `eliminarHito` / `importarGanttExcel` / `actualizarFechasGanttDesdeProgramas` | `callEdgeFunction('gantt-write', { action, ... })` |
| `crearObservacion` / `actualizarObservacion` / `cambiarEstadoObservacion` | `callEdgeFunction('observaciones-write', { action, ... })` |
| `marcarNotificacionLeida` | `callEdgeFunction('notificaciones-mark-read', { id })` |
| `registrarInformeGenerado` | `callEdgeFunction('informe-register', payload)` |

### 6. Lecturas: las 84 queries SELECT siguen igual

Las lecturas usan `_supabase.from(...).select(...)` directo. La unica diferencia es que el cliente Supabase ahora va con el JWT en el header (lo seteamos en `loginUsuario`). Las RLS policies extraen `user_id` del JWT y filtran automaticamente.

**Excepcion**: queries que dependen de `App.token` o `userId` desde `sessionStorage.tpt_usuario` para filtrar — esas pueden simplificarse porque el filtro lo hara la policy. Pero por compatibilidad inicial, mantener los filtros explicitos en JS no hace daño (RLS aplica un AND adicional).

## Tests por flujo en TEST programa (F7)

Antes de aplicar en produccion, validar los siguientes flujos extremo-a-extremo en el programa TEST con RLS activo:

1. **Login admin** → JWT recibido → ver Dashboard con clientes y programas → ✅
2. **Login lider TEST** → JWT recibido → ir a Mi Programa → solo ver datos de su programa → ✅
3. **Login colaborador TEST** → ir a Mis Encuestas → responder coevaluacion → ✅
4. **Lider intenta leer respuestas de otro lider** (manipulando URL): RLS bloquea → ✅
5. **Anon intenta listar usuarios**: 0 filas → ✅
6. **Anon intenta crear cliente**: rechazado → ✅
7. **JWT expira**: siguiente accion devuelve 401, redirige a login → ✅
8. **Admin importa Excel de participantes**: Edge Function `usuarios-import` valida rol y opera → ✅
9. **Carolina envia correo manual**: send-email con CC a Carolina + reply_to → ✅
10. **Cron de recordatorios**: sigue funcionando (usa service_role internamente) → ✅

## Riesgos y mitigaciones

| Riesgo | Mitigacion |
|---|---|
| Olvidar reemplazar una escritura → query falla por RLS en prod | Audit final con grep `_supabase\.from.*\.(insert|update|upsert|delete)` antes del deploy |
| JWT expira mientras el usuario esta en una pagina larga | Banner amigable "Tu sesion expiro" + redirect a login con `?reason=expired&return=<url>` |
| Edge Function caida → todo el flujo de escritura cae | Las EFs son additivas; con kill switch frontend podemos volver al flujo antiguo si es critico |
| Cambio en estructura del JWT entre auth-login y middleware | Documentar payload schema en F3 (ya hecho); cualquier cambio debe propagarse simultaneamente |

## Estimacion de esfuerzo

| Tarea | Tiempo |
|---|---|
| Cambios 1-4 en supabase-client.js (header del archivo, login, logout, helper) | 2 horas |
| Reemplazar las 56 escrituras (1 por funcion en promedio) | 6 horas |
| Audit final + tests manuales en TEST | 4 horas |
| **Total F5** | **~12 horas** (1.5-2 dias de trabajo concentrado) |

## Proximos pasos

- F4 sprints (5 sesiones cortas) para construir las 14 Edge Functions restantes.
- F5 refactor frontend (despues de F4 completo, asi podemos ir reemplazando funcion por funcion).
- F6: SQL migration `20260801_rls_initial.sql` con todas las policies de F2.
- F7: testing exhaustivo en TEST programa.
- F8: deploy productivo en agosto 2026 fuera de horario laboral.
