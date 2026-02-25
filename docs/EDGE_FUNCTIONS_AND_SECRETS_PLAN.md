# Plan: Edge Functions + Secrets (no exponer APIs críticas)

Objetivo: que **ninguna API key crítica** llegue al frontend. Todo lo que use secrets (Apify, SendGrid, Anthropic) se ejecuta en Supabase Edge Functions; las keys viven solo en **Edge Function Secrets**.

---

## Estado actual (riesgo)

- El frontend llama a `runJobSearch()` → `createApifyClient()` lee la key desde la tabla `api_keys` (Supabase) y luego llama a `api.apify.com` desde el **navegador**. La key viaja al cliente.
- SendGrid y Anthropic (email, IA) también leen desde `api_keys` en código que puede ejecutarse en el cliente. Cualquier key usada en el cliente puede ser inspeccionada.

---

## Arquitectura objetivo

```
Frontend (React)
    │  Solo envía: params de búsqueda + JWT de sesión
    ▼
Supabase Edge Function (run-job-search)
    │  1. Verifica JWT
    │  2. Lee APIFY_API_TOKEN desde Deno.env (Edge Function Secrets)
    │  3. Crea scraping_job en Supabase (con cliente que usa el JWT del usuario)
    │  4. Llama a Apify desde la Edge Function
    │  5. Normaliza resultados y guarda leads en Supabase (mismo cliente)
    │  6. Devuelve { scrapingJobId, imported, skipped, totalFromApify }
    ▼
Frontend recibe solo el resultado; nunca ve la key.
```

Las keys se configuran en **Supabase Dashboard → Edge Functions → Secrets** (por ejemplo `APIFY_API_TOKEN`). No se usan en el Table Editor para estos flujos.

---

## Pasos para la conexión (Apify primero)

### Paso 1 – Crear el secret en Supabase

1. En Supabase: **Edge Functions** → **Secrets** (Manage).
2. **Add new secret:**
   - **Name:** `APIFY_API_TOKEN`
   - **Value:** tu token de Apify (el mismo que hoy podrías tener en `api_keys`).
3. Guardar. Ese valor solo estará disponible en el entorno de ejecución de las Edge Functions, no en el cliente.

(Opcional más adelante: `SENDGRID_API_KEY`, `ANTHROPIC_API_KEY` para email e IA.)

---

### Paso 2 – Crear la Edge Function `run-job-search`

1. En el repo: crear `supabase/functions/run-job-search/index.ts` (Deno).
2. La función debe:
   - Recibir `POST` con body: `{ actorId: string; input?: Record<string, unknown>; savedSearchId?: string }`.
   - Leer el header `Authorization: Bearer <JWT>` y verificar la sesión con Supabase Auth.
   - Obtener `user.id` y `team_id` (desde `profiles`) usando el cliente de Supabase con ese JWT (así RLS se cumple).
   - Cargar input: si viene `savedSearchId`, leer `saved_searches.input`; si no, usar `input` del body.
   - Validar y construir params (solo LinkedIn por ahora: jobTitles, locations, postedLimit, maxItems, sort).
   - Insertar fila en `scraping_jobs` (status `running`) y obtener `scrapingJobId`.
   - Leer `APIFY_API_TOKEN` con `Deno.env.get('APIFY_API_TOKEN')`.
   - Llamar a la API de Apify:
     - `POST https://api.apify.com/v2/acts/{actorId}/runs` con token y input, `waitForFinish`.
     - Si hace falta, `GET .../actor-runs/{runId}` y `GET .../datasets/{datasetId}/items`.
   - Normalizar los items al mismo formato que hoy (HarvestAPI → título, company, url, location, etc.).
   - Obtener `job_url` existentes del team (query a `leads` por `team_id`) para dedup.
   - Insertar solo los leads nuevos en `leads` (con `scraping_job_id`, `user_id`, `team_id`).
   - Actualizar `scraping_jobs` (status `completed`, leads_imported, etc.).
   - Devolver JSON: `{ scrapingJobId, imported, skipped, totalFromApify }`.
   - En caso de error: actualizar `scraping_jobs` (status `failed`, error_message) y devolver error con status 4xx/5xx.

3. Usar **Supabase client en la Edge Function** con el JWT del request para todas las lecturas/escrituras a DB, así RLS sigue aplicando y no hace falta service role key en el cliente.

4. Desplegar: `supabase functions deploy run-job-search` (y configurar secrets si no se heredan).

---

### Paso 3 – Cliente Supabase en la Edge Function

- En la función, crear cliente con la URL y anon key del proyecto (por defecto en Supabase suelen inyectarse `SUPABASE_URL` y `SUPABASE_ANON_KEY`) y pasar el header `Authorization` del request para que las peticiones a DB vayan como el usuario logueado.
- Documentar en el plan o en el código que esos env vars están disponibles en el runtime de Edge Functions.

---

### Paso 4 – Frontend: llamar a la Edge Function en lugar de `runJobSearch` directo

1. En `src/lib/apify.ts` (o en un módulo tipo `src/lib/runJobSearch.ts`):
   - Crear una función `runJobSearchViaEdge(options)` que:
     - Llame a `supabase.functions.invoke('run-job-search', { body: { actorId, input, savedSearchId } })`.
     - El cliente de Supabase ya envía el JWT de la sesión si el usuario está logueado.
     - Mapee la respuesta (éxito o error) al mismo tipo `RunLinkedInSearchResult` que usa hoy el frontend.

2. En **AppContent** y **SavedSearchesView**: sustituir la llamada a `runJobSearch(...)` por `runJobSearchViaEdge(...)` (misma firma de entrada/salida para no tocar la UI).

3. Dejar en `apify.ts` la lógica que **solo** se use en el servidor (por ejemplo tipos, interfaces, `buildSearchParams` si se reutiliza en la Edge) o mover lo mínimo a la Edge y en el cliente solo quedar la llamada `invoke`.

---

### Paso 5 – Dejar de usar `api_keys` para Apify (opcional pero recomendado)

- Una vez que todo funcione vía Edge + Secrets, dejar de leer la key de Apify desde la tabla `api_keys` en el frontend.
- Puedes seguir usando `api_keys` para otras cosas (por ejemplo si quieres que cada equipo tenga su key y la Edge la lea por team_id), pero entonces la Edge leería `api_keys` con un cliente con permisos restringidos. La opción más simple es: **una sola key de Apify por proyecto**, en Edge Function Secrets, y que la Edge Function use esa key para todos los equipos (o más adelante introducir lógica por team si lo necesitas).

Para este plan inicial: **una key en Secret** y la Edge no toca `api_keys` para Apify.

---

### Paso 6 – Documentar y probar

1. Actualizar **docs/APIFY_SETUP.md**:
   - Indicar que la key de Apify debe configurarse en **Edge Function Secrets** con nombre `APIFY_API_TOKEN`.
   - Quitar o matizar la parte de “guardar en tabla api_keys” para el flujo de job search.

2. Probar de punta a punta:
   - Login → New Search → LinkedIn Jobs → Start Search.
   - Ver que la búsqueda corre, aparecen resultados y no hay llamadas a Apify desde el navegador (en pestaña Red solo debe verse la llamada a `functions/v1/run-job-search`).
   - Probar también Run desde Saved search.

---

## Orden recomendado

| Paso | Acción |
|------|--------|
| 1 | Crear secret `APIFY_API_TOKEN` en Edge Function Secrets |
| 2 | Implementar Edge Function `run-job-search` (auth, DB, Apify, normalizar, guardar leads) |
| 3 | Configurar cliente Supabase dentro de la función con JWT del request |
| 4 | En el frontend, llamar a la Edge con `supabase.functions.invoke` y reemplazar uso directo de `runJobSearch` |
| 5 | Dejar de usar `api_keys` para Apify en el cliente (y opcionalmente en la Edge) |
| 6 | Actualizar docs y probar flujo completo |

---

## Más adelante (SendGrid, Anthropic)

- Misma idea: **Edge Functions** que envíen emails o llamen a Claude, leyendo **Secrets** `SENDGRID_API_KEY` y `ANTHROPIC_API_KEY`.
- El frontend solo invoca esas funciones con los datos necesarios (destinatario, plantilla, texto, etc.) y nunca recibe las keys.
- Se puede detallar en un plan aparte o ampliar este mismo documento cuando toque integrar email e IA.

---

## Resumen

- **Secrets:** solo en **Edge Function Secrets** (no en Table Editor para estas keys).
- **Conexión:** el frontend solo habla con **Edge Functions**; las funciones leen los secrets y llaman a Apify (y luego SendGrid/Anthropic).
- **Nada crítico en el cliente:** las API keys no se envían al navegador ni se leen desde el frontend; todo lo crítico queda en el servidor (Edge).
