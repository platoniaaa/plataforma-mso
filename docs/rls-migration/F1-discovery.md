# F1 - Discovery: Inventario de queries Supabase

**Estado**: F1 completada 2026-05-09. Insumo para F2 (diseño de policies RLS) y F4 (Edge Functions de escritura).

## Objetivo

Mapear cada llamada `_supabase.from(...)` y `_supabase.storage.*` en el código frontend para:
1. Identificar qué tablas necesitan RLS estricto vs. lectura pública.
2. Identificar qué operaciones deben migrar a Edge Functions con `service_role`.
3. Establecer base para diseñar policies RLS sin romper flujos.

## Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Llamadas inventariadas | ~140 |
| Tablas tocadas | 18 |
| Operaciones de escritura (insert/update/delete/upsert) | 56 |
| Operaciones de lectura (select) | 84 |
| Storage buckets usados | 2 (`archivos-programa`, `evidencias-observaciones`) |

## Clasificación por tabla

### 🔴 PII alta (RLS estricto + escrituras vía Edge Function)

| Tabla | Reads | Writes | Decisión |
|---|---|---|---|
| `usuarios` | login, listado admin, panel programa, importacion participantes | insert (registro/import), update (cambio estado/datos), delete (cleanup) | **RLS estricto**. Reads: admin todas, user solo su fila. Writes: solo Edge Function. |
| `respuestas` | listar respuestas por encuesta, calculos de informes, panel programa, evolucion del lider | upsert (responder encuesta), delete (rehacer evaluacion) | **RLS estricto**. Reads: admin todas, user solo donde `evaluador_id = self`. Writes: Edge Function `respuestas-submit`. |
| `feedback` | listar feedback recibido (colab), listar feedback equipo (lider) | insert (registrar feedback) | **RLS estricto**. Reads: lider/participante solo el suyo. Writes: Edge Function `feedback-submit`. |
| `password_resets` | (solo backend) | insert (request), update (used_at) | **RLS bloqueado a anon completamente**. Solo Edge Functions ya existentes (`password-reset-request`, `password-reset-confirm`). |
| `correos_enviados` | listar para historial (admin) | insert (lo hace Edge Function send-email) | **RLS**: lectura solo admin, escritura solo Edge Function. |

### 🟡 Mixto (RLS con policies por rol)

| Tabla | Reads | Writes | Decisión |
|---|---|---|---|
| `participantes_programa` | listar por programa, listar por usuario, validacion de pertenencia | upsert (asociar), delete (desasociar/cleanup), insert (carga Excel) | RLS: lectura abierta a auth, escritura solo Edge Function `participantes-write`. |
| `informes_generados` | listar generados por programa | insert (registrar generacion) | RLS: lectura solo admin, escritura Edge Function `informe-register`. |
| `notificaciones` | listar pendientes/leidas, contar | update (marcar leida) | RLS: usuario solo ve las suyas. Update: solo si `usuario_id = self`. |
| `observaciones` | listar por programa, contar por programa, detalle | insert, update, cambiar estado | RLS: lider ve sus observaciones, admin todas. Edge Function para writes con archivos adjuntos. |

### 🟢 Operativo (lectura abierta a anon, escritura admin via Edge Function)

| Tabla | Reads | Writes | Decisión |
|---|---|---|---|
| `clientes` | listar registro publico, listar admin | insert/update/delete/cambiar estado | Read: anon allow. Write: Edge Function `clientes-write` con check rol admin. |
| `programas` | listar todos, listar dashboard usuario, obtener uno | insert/update/activar/desactivar/eliminar | Read: anon allow. Write: Edge Function `programas-write` admin. |
| `competencias` | listar por programa | insert (manual + Excel), update, delete | Read: anon. Write: Edge Function `competencias-write`. |
| `conductas` | (no aparece directo, viene anidado en competencias) | (idem) | Idem competencias. |
| `encuestas` | listar por programa, obtener completa, obtener pendiente | insert, update, activar, cerrar, eliminar, actualizar fecha_cierre | Read: anon. Write: Edge Function `encuestas-write`. |
| `preguntas` | listar por encuesta, obtener orden | insert, update, delete | Read: anon. Write: Edge Function `preguntas-write`. |
| `archivos_programa` | listar visible para participantes | insert (subir), update visibilidad, delete | Read: filtrar por `visible_participantes` para no-admin. Write: Edge Function `archivos-write`. |
| `hitos_programa` (Carta Gantt) | listar por programa, obtener orden | insert, update, delete, carga masiva | Read: anon. Write: Edge Function `gantt-write`. |
| `plataforma_config` | leer (kill switch) | (raro: solo MSO via Supabase Studio) | Read: anon. Write: bloqueado a anon, solo service_role. |

### Storage

| Bucket | Uso | Decisión |
|---|---|---|
| `archivos-programa` | recursos del programa para participantes | Reads: signed URLs generadas por Edge Function `archivo-signed-url`. Writes: Edge Function `archivo-upload`. |
| `evidencias-observaciones` | adjuntos en observaciones de campo | Reads: signed URLs por Edge Function. Writes: Edge Function. |

## Operaciones críticas que cambian de capa

Las siguientes operaciones hoy se hacen desde el frontend con anon key. Tras la migración pasarán a Edge Functions:

### Edge Functions nuevas a crear (F4)

| Edge Function | Reemplaza | Validación interna |
|---|---|---|
| `auth-login` | `loginUsuario` | Valida email+password contra `usuarios`, retorna JWT firmado con user_id + rol |
| `respuestas-submit` | `enviarRespuestas`, `rehacerEncuesta` | JWT valido, evaluador_id == JWT.user_id |
| `feedback-submit` | `registrarFeedback` | JWT valido, lider_id == JWT.user_id, rol = lider |
| `usuarios-admin-write` | `crearUsuario`, `actualizarUsuario`, `cambiarEstadoUsuario`, `eliminarTodosParticipantes`, `importarParticipantesExcel` | JWT.rol == admin |
| `participantes-write` | `asociarParticipantes`, `desasociarParticipante` | JWT.rol == admin |
| `clientes-write` | `crearCliente`, `actualizarCliente`, `desactivarCliente`, `eliminarCliente` | JWT.rol == admin |
| `programas-write` | `crearPrograma`, `actualizarPrograma`, `activarPrograma`, `desactivarPrograma`, `eliminarPrograma` | JWT.rol == admin |
| `competencias-write` | `crearCompetencia`, `actualizarCompetencia`, `desactivarCompetencia/Conducta`, `importarCompetenciasExcel` | JWT.rol == admin |
| `encuestas-write` | `crearEncuesta`, `actualizarEncuesta`, `activarEncuesta`, `cerrarEncuesta`, `eliminarEncuesta` | JWT.rol == admin |
| `preguntas-write` | `agregarPregunta`, `actualizarPregunta`, `eliminarPregunta` | JWT.rol == admin |
| `archivos-write` | `subirArchivoPrograma`, `eliminarArchivoPrograma`, `actualizarVisibilidadArchivo` | JWT.rol == admin para admin actions |
| `gantt-write` | `crearHito`, `actualizarHito`, `eliminarHito`, `importarGanttExcel` | JWT.rol == admin |
| `observaciones-write` | `crearObservacion`, `actualizarObservacion`, `cambiarEstadoObservacion` | JWT.rol == lider o admin |
| `notificaciones-mark-read` | `marcarNotificacionLeida` | JWT.user_id == notificacion.usuario_id |
| `informe-register` | `registrarInformeGenerado` | JWT.rol == admin |

**Total**: 15 Edge Functions nuevas + 1 ya existente reutilizada (`send-email` para correos manuales).

### Lecturas que se mantienen en frontend con anon (sin Edge Function)

Tablas operativas (verde) — siguen usando `supabase.from(...).select()` directo. Solo cambia que las RLS policies validan que la query es un select y que la tabla está en la whitelist de lectura pública.

### Lecturas que requieren JWT (no Edge Function, pero sí header)

Tablas amarillas/rojas — el frontend sigue haciendo `select` directo, pero envía el JWT custom en `Authorization`. Las RLS policies extraen `current_setting('request.jwt.claims', true)::json->>'user_id'` para filtrar.

## Decisiones de diseño abiertas (a confirmar en F2)

1. **Algoritmo de firma del JWT**: HS256 con `JWT_SECRET` env var, o RS256 con par de claves. Recomendación: HS256 por simplicidad.
2. **Vencimiento del JWT**: 8 horas (cubre jornada laboral) vs 30 días (más cómodo, menos seguro). Recomendación: 24 horas con refresh silencioso al usar la plataforma.
3. **¿Qué hacer cuando expira durante uso?**: redirigir a login con mensaje, o silent refresh con un endpoint dedicado. Recomendación: silent refresh.
4. **¿Logout invalida el JWT?**: sin tabla de tokens revocados, un logout solo borra del client. Si alguien capturó el JWT podría seguir usándolo hasta vencer. Recomendación inicial: aceptar este riesgo, mitigado por TTL corto.
5. **Migración de 36 usuarios existentes**: no requieren cambio porque el JWT se mintea al hacer login, no al crear usuario. Cero migración de datos.

## Próximos pasos

- F2: redactar SQL exacto de RLS policies para cada tabla (siguiente entrega).
- F3: implementar `auth-login` Edge Function.
- F4: implementar las 15 Edge Functions de escritura.
- F5: refactor frontend.
- F6-F8: testing + deploy en TEST + activación en agosto 2026.

## Inventario raw (para referencia)

Ver `docs/v2/supabase-client.js` líneas 1-2700. Total de queries detectadas en grep: ~140 puntos de toque distribuidos en 18 tablas + 2 storage buckets.
