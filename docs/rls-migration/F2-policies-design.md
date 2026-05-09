# F2 - Diseño de RLS Policies

**Estado**: F2 completada 2026-05-09. Insumo para F3 (auth-login) y F6 (aplicación de migration).

## Decisiones cerradas (de F1)

| # | Decisión | Resolución | Justificación |
|---|---|---|---|
| 1 | Algoritmo de firma JWT | **HS256** con JWT_SECRET de Supabase | Permite que las policies usen `auth.jwt()` nativo sin configuración extra. Simple y suficiente. |
| 2 | TTL del JWT | **24 horas** | Cubre jornada laboral con margen. Si el usuario sigue activo, se hace refresh silencioso al hacer cualquier acción. |
| 3 | Refresh durante uso | **Silent refresh**: si quedan <2h al token, la siguiente llamada con JWT lo renueva automáticamente | Cero fricción para el usuario. Frontend intercepta con un wrapper. |
| 4 | Logout invalida JWT | **No, solo borra del cliente** | Sin tabla de tokens revocados (sería complicación). Mitigado por TTL corto y HTTPS. Aceptable para el contexto del cliente. |
| 5 | Migración de los 36 usuarios | **Cero migración de datos** | El JWT se mintea al hacer login, no al crear usuario. Solo cambia el flujo de login, no las filas de `usuarios`. |

## Estructura del JWT custom

**Payload** (lo que `auth-login` retorna firmado):

```json
{
  "sub": "<user_id_uuid>",
  "user_id": "<user_id_uuid>",
  "rol": "admin" | "jefatura" | "participante",
  "role": "authenticated",
  "iat": 1715287200,
  "exp": 1715373600,
  "iss": "tpt-platform",
  "aud": "authenticated"
}
```

**Campos clave**:
- `role: "authenticated"`: hace que PostgREST elevate la conexión de anon a authenticated.
- `aud: "authenticated"`: requerido por Supabase para validar el token.
- `sub` y `user_id`: redundancia útil. `sub` es el estándar JWT, `user_id` es el campo que las policies leerán explícitamente.
- `rol`: rol funcional dentro de MSO (no confundir con `role` de Postgres).

**Firma**: HS256 con `JWT_SECRET` de Supabase (mismo secret que firma anon key y service_role).

## Helpers SQL

Para que las policies sean legibles, creamos 3 funciones helper:

```sql
-- ============================================================
-- Helpers para extraer claims del JWT custom
-- ============================================================

CREATE OR REPLACE FUNCTION auth.tpt_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'user_id', '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.tpt_rol()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('request.jwt.claims', true)::json->>'rol'
$$;

CREATE OR REPLACE FUNCTION auth.tpt_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT (current_setting('request.jwt.claims', true)::json->>'rol') = 'admin'
$$;
```

## Policies por tabla

### 🔴 PII alta

#### `usuarios`

```sql
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

-- SELECT: usuario solo su fila, admin todas
CREATE POLICY "usuarios_select_self_or_admin"
ON usuarios FOR SELECT
TO authenticated
USING (id = auth.tpt_user_id() OR auth.tpt_is_admin());

-- INSERT/UPDATE/DELETE: solo service_role (Edge Functions)
-- Sin policies = denegado por default a anon y authenticated
```

#### `respuestas`

```sql
ALTER TABLE respuestas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "respuestas_select_own_or_admin"
ON respuestas FOR SELECT
TO authenticated
USING (evaluador_id = auth.tpt_user_id() OR auth.tpt_is_admin());

-- Writes: solo service_role
```

#### `feedback`

```sql
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback_select_involved_or_admin"
ON feedback FOR SELECT
TO authenticated
USING (
  lider_id = auth.tpt_user_id()
  OR participante_id = auth.tpt_user_id()
  OR auth.tpt_is_admin()
);

-- Writes: solo service_role
```

#### `password_resets`

```sql
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;

-- Sin policies para anon ni authenticated.
-- Solo service_role (Edge Functions password-reset-request y password-reset-confirm).
```

#### `correos_enviados`

```sql
ALTER TABLE correos_enviados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "correos_select_admin"
ON correos_enviados FOR SELECT
TO authenticated
USING (auth.tpt_is_admin());

-- Inserts: solo service_role (Edge Function send-email)
```

### 🟡 Mixto

#### `participantes_programa`

```sql
ALTER TABLE participantes_programa ENABLE ROW LEVEL SECURITY;

-- Lectura abierta a authenticated (necesaria para "mi equipo", "mi lider", "mi programa")
CREATE POLICY "pp_select_authenticated"
ON participantes_programa FOR SELECT
TO authenticated
USING (true);

-- Writes: solo service_role
```

#### `informes_generados`

```sql
ALTER TABLE informes_generados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "informes_select_admin"
ON informes_generados FOR SELECT
TO authenticated
USING (auth.tpt_is_admin());

-- Inserts: solo service_role (Edge Function informe-register)
```

#### `notificaciones`

```sql
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_select_self_or_admin"
ON notificaciones FOR SELECT
TO authenticated
USING (usuario_id = auth.tpt_user_id() OR auth.tpt_is_admin());

CREATE POLICY "notif_update_self"
ON notificaciones FOR UPDATE
TO authenticated
USING (usuario_id = auth.tpt_user_id())
WITH CHECK (usuario_id = auth.tpt_user_id());

-- Inserts: solo service_role (Edge Functions las crean)
```

#### `observaciones`

```sql
ALTER TABLE observaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obs_select_lider_or_admin"
ON observaciones FOR SELECT
TO authenticated
USING (lider_id = auth.tpt_user_id() OR auth.tpt_is_admin());

-- Writes: solo service_role
```

### 🟢 Operativo

Mismo patrón para todas las tablas operativas: lectura abierta a anon y authenticated, escritura solo via service_role.

```sql
-- Plantilla aplicada a: clientes, programas, competencias, conductas,
-- encuestas, preguntas, hitos_programa, plataforma_config

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clientes_select_anon" ON clientes FOR SELECT TO anon USING (true);
CREATE POLICY "clientes_select_auth" ON clientes FOR SELECT TO authenticated USING (true);

ALTER TABLE programas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "programas_select_anon" ON programas FOR SELECT TO anon USING (true);
CREATE POLICY "programas_select_auth" ON programas FOR SELECT TO authenticated USING (true);

ALTER TABLE competencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comp_select_anon" ON competencias FOR SELECT TO anon USING (true);
CREATE POLICY "comp_select_auth" ON competencias FOR SELECT TO authenticated USING (true);

ALTER TABLE conductas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cond_select_anon" ON conductas FOR SELECT TO anon USING (true);
CREATE POLICY "cond_select_auth" ON conductas FOR SELECT TO authenticated USING (true);

ALTER TABLE encuestas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enc_select_anon" ON encuestas FOR SELECT TO anon USING (true);
CREATE POLICY "enc_select_auth" ON encuestas FOR SELECT TO authenticated USING (true);

ALTER TABLE preguntas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "preg_select_anon" ON preguntas FOR SELECT TO anon USING (true);
CREATE POLICY "preg_select_auth" ON preguntas FOR SELECT TO authenticated USING (true);

ALTER TABLE hitos_programa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hitos_select_anon" ON hitos_programa FOR SELECT TO anon USING (true);
CREATE POLICY "hitos_select_auth" ON hitos_programa FOR SELECT TO authenticated USING (true);

ALTER TABLE plataforma_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config_select_anon" ON plataforma_config FOR SELECT TO anon USING (true);
CREATE POLICY "config_select_auth" ON plataforma_config FOR SELECT TO authenticated USING (true);
-- No writes desde nadie except service_role (es config de plataforma)
```

#### `archivos_programa` (caso especial: filtro de visibilidad)

```sql
ALTER TABLE archivos_programa ENABLE ROW LEVEL SECURITY;

-- Anon no debe leer archivos
-- Authenticated: solo los visibles para participantes (filtro automatico),
-- excepto admin que ve todos
CREATE POLICY "archivos_select_visible_or_admin"
ON archivos_programa FOR SELECT
TO authenticated
USING (
  visible_participantes = true
  OR auth.tpt_is_admin()
);

-- Writes: solo service_role
```

### Storage buckets

```sql
-- Bucket archivos-programa: solo signed URLs por Edge Function
CREATE POLICY "archivos_bucket_no_anon"
ON storage.objects FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Authenticated: lectura via signed URL (que es bypass implicito).
-- Escritura: bloqueada, solo Edge Function con service_role.

-- Bucket evidencias-observaciones: igual patron
```

## Verificación de coverage

Tabla de control de qué pasa con cada tabla bajo cada rol:

| Tabla | anon SELECT | anon WRITE | auth user SELECT | auth user WRITE | service_role |
|---|---|---|---|---|---|
| usuarios | ❌ | ❌ | self + admin | ❌ | ✅ |
| respuestas | ❌ | ❌ | own + admin | ❌ | ✅ |
| feedback | ❌ | ❌ | involved + admin | ❌ | ✅ |
| password_resets | ❌ | ❌ | ❌ | ❌ | ✅ |
| correos_enviados | ❌ | ❌ | admin | ❌ | ✅ |
| participantes_programa | ❌ | ❌ | ✅ todos | ❌ | ✅ |
| informes_generados | ❌ | ❌ | admin | ❌ | ✅ |
| notificaciones | ❌ | ❌ | self + admin | self UPDATE | ✅ |
| observaciones | ❌ | ❌ | lider + admin | ❌ | ✅ |
| clientes | ✅ | ❌ | ✅ | ❌ | ✅ |
| programas | ✅ | ❌ | ✅ | ❌ | ✅ |
| competencias | ✅ | ❌ | ✅ | ❌ | ✅ |
| conductas | ✅ | ❌ | ✅ | ❌ | ✅ |
| encuestas | ✅ | ❌ | ✅ | ❌ | ✅ |
| preguntas | ✅ | ❌ | ✅ | ❌ | ✅ |
| hitos_programa | ✅ | ❌ | ✅ | ❌ | ✅ |
| plataforma_config | ✅ | ❌ | ✅ | ❌ | ✅ |
| archivos_programa | ❌ | ❌ | visibles + admin | ❌ | ✅ |

## Casos límite a validar en F7 (testing)

1. **Anon intenta leer respuestas**: 0 filas devueltas (RLS las oculta).
2. **Lider A intenta leer respuestas de Lider B**: 0 filas (filter por evaluador_id).
3. **Lider A intenta UPDATE notificaciones de Lider B**: rechazado (WITH CHECK).
4. **Token expirado**: PostgREST retorna 401, frontend redirige a login.
5. **Token sin claim `rol`**: `tpt_is_admin()` retorna false, niveles inferiores aplican.
6. **Anon llama directamente a una tabla operativa**: ✅ funciona (SELECT permitido).
7. **Anon intenta INSERT en `clientes`**: rechazado (no policy WITH CHECK para anon).
8. **Edge Function con service_role**: bypassa todas las policies, opera normalmente.

## Migration script

El SQL completo de F2 se materializa en una migration de Supabase:

`supabase/migrations/20260801_rls_initial.sql`

(A crear en F6 antes de aplicar a producción. Por ahora todo está en este documento de diseño.)

## Próximos pasos

- F3: implementar Edge Function `auth-login` que minta el JWT con la estructura definida arriba.
- F4: las 15 Edge Functions de escritura usan service_role, así que las policies anti-write les son transparentes.
- F6: convertir este SQL en migration aplicable.
