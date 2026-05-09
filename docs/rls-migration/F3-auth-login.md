# F3 - Edge Function `auth-login` (custom JWT)

**Estado**: F3 código completado 2026-05-09. **No desplegada aún** (deploy queda para F8 en agosto 2026).

## Qué hace

Reemplaza el flujo actual de login (`loginUsuario` en `supabase-client.js`) con una Edge Function que:

1. Valida email + password contra la tabla `usuarios` (case-insensitive en email).
2. Si las credenciales son correctas, mintea un **JWT custom firmado con HS256** usando el `JWT_SECRET` de Supabase.
3. Devuelve el token al frontend.
4. El frontend lo guarda en `sessionStorage` y lo envía en `Authorization: Bearer <token>` en todas las queries posteriores.
5. Las RLS policies leen los claims del token via `current_setting('request.jwt.claims', true)`.

## Por qué firmar con `JWT_SECRET` de Supabase

Supabase / PostgREST validan automáticamente cualquier JWT que llegue en `Authorization: Bearer <token>` siempre que esté firmado con el `JWT_SECRET` del proyecto. Si el JWT es válido, los claims se inyectan en `request.jwt.claims` y las policies pueden leerlos.

Esto **evita migrar a Supabase Auth** y **evita instalar un JWT verifier custom**. El servidor de Postgres se encarga.

## Estructura del payload

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

- `role: "authenticated"` → PostgREST eleva la conexión de anon a authenticated.
- `aud: "authenticated"` → Supabase requiere este audience para validar.
- `sub` y `user_id` → redundancia útil; las policies leen `user_id`.
- `rol` → rol funcional MSO (admin / jefatura / participante).

## Secret necesario

Antes de desplegar (en F8):

```bash
# El JWT_SECRET se obtiene de:
# Supabase Dashboard → Project Settings → API → JWT Settings → JWT Secret
npx supabase secrets set JWT_SECRET=<valor del dashboard> --project-ref loezdutwrucnoebhofjt
```

## Contrato de la API

### Request
```
POST /functions/v1/auth-login
Content-Type: application/json

{
  "email": "ejemplo@msochile.cl",
  "password": "..."
}
```

### Response success (200)
```json
{
  "success": true,
  "token": "<JWT firmado>",
  "expiresAt": 1715373600000,
  "usuario": {
    "id": "uuid",
    "nombre": "Nombre Apellido",
    "email": "ejemplo@msochile.cl",
    "rol": "jefatura",
    "cargo": "...",
    "cliente_id": null
  }
}
```

### Response error
- 400: email o password faltantes
- 401: credenciales inválidas
- 403: cuenta inactiva
- 500: error de servidor (configuración)

## Cambios en el frontend (preview de F5)

`supabase-client.js` → `loginUsuario` cambia de query directa a llamada al Edge Function:

```javascript
// Antes (inseguro)
loginUsuario: async function(email, password) {
  var perfil = await _supabase.from('usuarios').select('*').ilike('email', email).eq('password_visible', password).maybeSingle();
  // ...
}

// Después
loginUsuario: async function(email, password) {
  var r = await fetch(SUPABASE_URL + '/functions/v1/auth-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
    body: JSON.stringify({ email: email, password: password })
  });
  var data = await r.json();
  if (!data.success) return { success: false, error: data.error };

  // Guardar token y usuario
  sessionStorage.setItem('tpt_jwt', data.token);
  sessionStorage.setItem('tpt_jwt_exp', String(data.expiresAt));
  sessionStorage.setItem('tpt_usuario', JSON.stringify(data.usuario));

  // Re-instanciar el cliente Supabase con el JWT custom como header global
  _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: 'Bearer ' + data.token } }
  });

  return { success: true, data: { token: data.token, usuario: data.usuario } };
}
```

## Refresh silencioso (F5)

En `supabase-client.js` se agrega un wrapper que verifica el TTL del JWT antes de cada query:

```javascript
async function ensureFreshToken() {
  var exp = parseInt(sessionStorage.getItem('tpt_jwt_exp') || '0', 10);
  var ahora = Date.now();
  // Si quedan <2h, refrescar
  if (exp - ahora < 2 * 60 * 60 * 1000) {
    // Llamar a auth-refresh (otra Edge Function chica que valida JWT actual y emite uno nuevo)
    // Si falla, redirigir a login
    // ...
  }
}
```

(Edge Function `auth-refresh` se construirá junto con F4 si decidimos implementar refresh; alternativa: que el usuario relogueé al expirar.)

## Validación local antes de F8

Antes de la activación productiva en agosto, el plan de testing incluye:

1. Llamar `auth-login` con credenciales válidas → recibo JWT.
2. Decodificar el JWT (en jwt.io o equivalente) → confirmar payload.
3. Hacer una query a Supabase con `Authorization: Bearer <jwt>` y RLS activado en TEST → verificar que el usuario solo ve sus filas.
4. Llamar `auth-login` con password incorrecto → recibo 401.
5. Llamar `auth-login` con email inexistente → recibo 401.
6. Llamar `auth-login` con cuenta inactiva (`estado = 'Inactivo'`) → recibo 403.
7. Esperar TTL + 1 segundo, hacer query con JWT vencido → recibo 401 de Supabase.

## Próximos pasos

- F4: 15 Edge Functions de escritura (cada una valida el JWT recibido en `Authorization` y opera con `service_role` interno).
- F5: refactor del frontend para guardar y enviar el JWT en lugar de solo la anon key.
