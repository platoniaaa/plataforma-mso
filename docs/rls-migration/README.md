# Migracion RLS - Plataforma TPT

> **Estado**: en preparacion. Activacion productiva planificada para **agosto 2026** despues del cierre del programa Grow 2 con Sodexo.

## Contexto

La plataforma usa autenticacion custom (no Supabase Auth) con sesion en `sessionStorage` y queries con anon key publica. Esto deja la BD expuesta: cualquiera con el anon key (visible en el JS publico) puede consultar tablas sensibles via la API REST de Supabase.

Activar RLS sin preparacion rompe la plataforma porque las policies tipicas dependen de `auth.uid()` (Supabase Auth) que en este caso no existe. Por eso la migracion es por fases.

## Motivacion

1. **Regulatoria**: Ley 21.719 (Chile) entra en vigencia octubre 2026. Exige principios de proporcionalidad y proteccion de datos personales.
2. **Seguridad**: prevenir acceso no autorizado a PII (respuestas de encuestas, feedback, emails de Sodexo).

## Plan general

| Fase | Foco | Entregable | Toca produccion |
|---|---|---|---|
| F1 | Discovery | Inventario de queries | ❌ |
| F2 | Diseño SQL | Policies y JWT schema | ❌ |
| F3 | `auth-login` | Edge Function que mintea JWT | ❌ (codigo, no deploy) |
| F4 | 15 Edge Functions de escritura | Todas las writes detras de EFs | ❌ (codigo, no deploy) |
| F5 | Frontend refactor | `supabase-client.js` actualizado para JWT y EFs | ❌ (codigo, no deploy) |
| F6 | SQL migration | `20260801_rls_initial.sql` aplicable | ❌ (preparado, no aplicado) |
| F7 | Testing en TEST | Validacion exhaustiva en programa TEST | ⚠️ solo TEST |
| F8 | Deploy productivo | Activacion completa fuera de horario | ✅ agosto 2026 |

## Documentos

- [F1-discovery.md](./F1-discovery.md) — inventario de las ~140 queries
- [F2-policies-design.md](./F2-policies-design.md) — diseño SQL completo de las RLS policies
- [F3-auth-login.md](./F3-auth-login.md) — especificacion del Edge Function de login con JWT custom
- [F4-write-edge-functions.md](./F4-write-edge-functions.md) — especificacion de las 15 Edge Functions de escritura + 1 implementacion de referencia
- [F5-frontend-refactor.md](./F5-frontend-refactor.md) — plan de cambios en `supabase-client.js`

## Estado de implementacion

| Componente | Estado | Ubicacion |
|---|---|---|
| F1 documento | ✅ | `docs/rls-migration/F1-discovery.md` |
| F2 documento | ✅ | `docs/rls-migration/F2-policies-design.md` |
| F3 documento | ✅ | `docs/rls-migration/F3-auth-login.md` |
| F3 codigo | ✅ | `supabase/functions/auth-login/index.ts` |
| F4 documento | ✅ | `docs/rls-migration/F4-write-edge-functions.md` |
| F4 codigo | 🚧 0/15 | `supabase/functions/{respuestas-submit,feedback-submit,...}/` |
| F4 helper compartido | 🚧 | `supabase/functions/_shared/auth.ts` |
| F5 documento | ✅ | `docs/rls-migration/F5-frontend-refactor.md` |
| F5 codigo | 🚧 | `docs/v2/supabase-client.js` |
| F6 SQL migration | 🚧 | `supabase/migrations/20260801_rls_initial.sql` |
| F7 testing | 🚧 | (pendiente) |
| F8 deploy | 🚧 | (pendiente) |

## Roadmap sugerido (mayo - agosto 2026)

| Mes | Trabajo |
|---|---|
| Mayo (resto) | F4 sprints 1-2 (`feedback-submit`, `notificaciones-mark-read`, `informe-register`, `clientes-write`, `programas-write`, `competencias-write`) |
| Junio | F4 sprints 3-5 (Edge Functions restantes) + F5 refactor frontend en branch |
| Julio | F6 SQL migration listo + F7 testing en TEST programa exhaustivo. **No tocar produccion: programa Grow 2 cerrandose.** |
| Agosto | F8 deploy productivo. Edge Functions primero, frontend despues, RLS migration al final con kill switch listo. |

## Consideraciones criticas

- **No activar RLS en produccion antes de agosto** mientras Grow 2 este corriendo.
- **Toda la preparacion (F4-F7) se hace en branch dedicado** `feat/rls-migration`, no en `main`.
- **El JWT_SECRET es sensible**: nunca commitearlo, solo configurarlo via `npx supabase secrets set`.
- **Reversibilidad**: cada migration tiene su `down`. Si algo se cae en agosto, `ALTER TABLE x DISABLE ROW LEVEL SECURITY` la deja como antes en segundos.
- **Testing exhaustivo en TEST**: el programa TEST tiene un lider y un colaborador especificos. Validar todos los flujos como ambos roles + admin antes de tocar prod.
