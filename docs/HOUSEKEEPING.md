# Housekeeping

Registro de lo hecho, pendiente de limpieza y enlace a deuda técnica.

---

## Hecho recientemente

- **Saved searches: renombrado sin duplicados:** Quitado “Save this search” (creaba una búsqueda nueva aunque el run ya se auto-guardaba). Ahora cada run devuelve `savedSearchId`/`savedSearchName` desde la Edge Function y se puede **renombrar inline** el saved search creado automáticamente desde `SearchConfigPage`. En `SavedSearchesView` se arregla el bug de espacio al renombrar (se eliminó el `input` anidado dentro de un `button`, que activaba navegación al presionar Space).
- **Mejoras UI (Kanban, Discovery, Search):** (1) CRM Kanban: columnas más anchas (`w-64`, `min-w-[14rem]`) para menos scroll; tarjetas con nombre de compañía una sola vez, segunda línea con ubicación, puesto, contacto o industria en tipografía más pequeña (`text-[11px]`). (2) HomePage / fuentes: quitados los identificadores Apify de cada card y el footer "Apify Actors · Data in Supabase". (3) SearchConfigPage: quitados el bloque "Estimated cost" y el panel "These fields are sent to the job source..."; quitado el `apifyActorId` del encabezado de la página de búsqueda.
- **Login obligatorio en producción:** En producción, si Supabase no está configurado (env vars no disponibles en el build) ya no se muestra la app sin auth: se muestra una pantalla "Configuración requerida" con el hint de variables. Solo en desarrollo se permite entrar sin auth cuando no hay Supabase (preview local). Así, en producción siempre se exige iniciar sesión salvo que las env vars falten (en ese caso no se puede usar la app hasta configurar y redesplegar).
- **Build de producción corregido:** Errores de TypeScript que impedían el deploy resueltos: `src/vite-env.d.ts` para `import.meta.env`, imports React no usados eliminados, GoogleIcon con prop `className`, `updateSavedSearch` acepta `name`, parámetros no usados con prefijo `_`, LeadsTable sort key como `keyof Lead`, guards y aserciones para `supabase` posible null, cliente Supabase tipado como `SupabaseClient<any>` para que insert/update acepten payloads. `npm run build` pasa; Vercel deploy puede ejecutarse.
- **Salida a producción:** Guía completa en `docs/DEPLOY.md`: recomendación (Vercel preferido, Netlify alternativa), checklist previo, paso a paso para Vercel y Netlify, configuración Supabase en producción. Añadidos `vercel.json` y `netlify.toml` con build command, output `dist` y redirects SPA.
- **Tasks al marcar job post como lead:** Al incluir un Job Post como lead (`is_marked_as_lead: true`) se crea automáticamente una tarea tipo "Contactar a {empresa} – {contacto}" vinculada al lead. Migración `011_tasks.sql` (tabla `tasks` con `lead_id`, `title`, `status`). Hook `useTasks`, vista Tasks con lista de tareas y botón "Ver tarjeta" que lleva al CRM. La tarjeta del trabajo queda conectada vía `lead_id`.
- **Sesión caducada tras subir JWT expiry:** Documentada la causa (migración Legacy JWT → JWT Signing Keys; el gateway de Edge Functions puede rechazar el token). Solución: desplegar con `npx supabase functions deploy run-job-search --no-verify-jwt`. La función sigue validando el JWT con `getUser(jwt)`. Actualizados PASO_A_PASO (0c), SUPABASE_SCHEMA (sección 401/sesión), mensajes de error en `apify.ts` y patrón del botón "Actualizar sesión" en SearchConfigPage.
- **Eliminación de teams:** Migración `008_remove_teams.sql`: se elimina la tabla `teams` y todas las columnas `team_id` (profiles, leads, scoring_presets, email_templates, scraping_jobs, saved_searches, api_keys). `api_keys` pasa a ser por usuario (`user_id`). RLS simplificado a solo usuario (auth.uid()). Código: tipos sin Team/team_id, getCurrentTeam eliminado, apify/sendgrid/ai-email usan user_id para api_keys, Edge Function sin teamId, UI "Share with Team" → "Share", "Show Team Leads" → "Show shared leads". Ver `docs/TEAM_FLOW.md`.
- **Team y Saved searches:** Documentado en `docs/TEAM_FLOW.md` qué es un team, para qué sirve y el flujo actual. Migración `007_saved_searches_optional_team_and_backfill.sql`: `saved_searches.team_id` pasa a ser opcional; nueva política RLS para ver propias o del equipo; backfill que crea un `saved_search` por cada una de las **últimas 3** `scraping_jobs` sin `saved_search_id` por usuario y enlaza el job. Edge Function y frontend permiten crear/auto-guardar con `team_id` null.
- **Navegación Saved searches:** Al hacer clic en &quot;Saved searches&quot; desde New Search (SearchConfigPage), ahora se muestra la lista: al navegar se pone `view = 'app'` para que el contenido principal sea la sección elegida y no se quede en la página de búsqueda.
- **Guardar todas las búsquedas:** Cada ejecución desde New Search se guarda automáticamente en Saved searches (Edge Function crea un `saved_search` con nombre auto, ej. &quot;Video Editor – 23 Feb 2025, 15:42&quot;, y asocia el `scraping_job`). Solo si el usuario tiene equipo; si no, el run sigue sin `saved_search_id`. El botón &quot;Save search&quot; sigue permitiendo guardar con nombre personalizado para re-ejecutar.
- **Results (0) tras importar leads:** Tabla de resultados no se actualizaba con el `scrapingJobId` del run recién terminado. Se corrige con: (1) `key={scrapingJobId}` en `SearchResultsTable` para montar una instancia nueva por búsqueda; (2) en `useLeads`, efecto que sincroniza `scraping_job_id` y `saved_search_id` desde `initialFilters` cuando cambian, para que la query use siempre el id correcto.
- **Apify API docs alignment:** Edge Function y `src/lib/apify.ts` alineados con la documentación oficial: autenticación con `Authorization: Bearer` (sin token en URL), `waitForFinish` solo como query param (máx. 60s), body solo con input del Actor; normalización de actorId a formato tilde (`username~actor-name`) en las URLs a api.apify.com; polling en el cliente (searchLinkedInJobs, searchIndeedJobs, enrichLinkedInProfile) hasta SUCCEEDED/FAILED con timeout; parsing de errores Apify (`error.message`) para mensajes más claros.
- **Sidebar + LinkedIn Jobs:** SearchConfigPage se muestra dentro de AppLayout (no reemplaza la app), así el panel lateral sigue visible al abrir "LinkedIn Jobs" en Discovery.
- **Copy en inglés:** Toda la comunicación visible en la plataforma pasada a inglés (FilterBar: By people/companies, Leads only; CRMView: Table/Kanban, Marked leads only, Add VITE_SUPABASE…; CRMCard/LeadsTable: Mark as lead / Remove from leads, No name; CRMKanban: Loading…).
- **Supabase opcional:** No lanzar si faltan env vars; app renderiza siempre.
- **Tema oscuro Vloom:** Paleta dark, Inter, colores ideas.wearevloom.com.
- **Error Boundary:** Errores no capturados muestran mensaje en vez de pantalla en blanco.
- **Lazy load Dashboard:** Home carga sin importar useLeads/Supabase.
- **Estructura docs:** BACKLOG, PRE_MORTEMS, DEBT, PROCESS.
- **Lint:fix + pre-commit:** Script y hooks para lint automático.
- **GitHub setup:** .gitignore, docs/GITHUB_SETUP.md con pasos para conectar y sincronizar.

---

## Pendiente de limpieza

- [x] Corregir errores de TypeScript para que `npm run build` pase: hecho (vite-env.d.ts, supabase client any, guards, aserciones).
- [ ] Revisar imports no usados en componentes.
- [ ] Unificar clases Tailwind duplicadas (vloom-* vs gray-* residuales).
- [ ] Verificar que `supabase/migrations/001_initial_schema.sql` existe y está actualizado.
- [ ] Añadir `SearchConfigPage`, `HomePage`, `ErrorBoundary` a la estructura en README.
- [x] Resolver 14 warnings de ESLint (imports no usados, deps en hooks): corregidos.

---

## Deuda técnica

Ver [docs/DEBT.md](DEBT.md) para el registro formal (Problema | Solución | Deadline).
