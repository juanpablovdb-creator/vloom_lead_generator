# Housekeeping

Registro de lo hecho, pendiente de limpieza y enlace a deuda técnica.

---

## Hecho recientemente

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

- [ ] Revisar imports no usados en componentes.
- [ ] Unificar clases Tailwind duplicadas (vloom-* vs gray-* residuales).
- [ ] Verificar que `supabase/migrations/001_initial_schema.sql` existe y está actualizado.
- [ ] Añadir `SearchConfigPage`, `HomePage`, `ErrorBoundary` a la estructura en README.
- [x] Resolver 14 warnings de ESLint (imports no usados, deps en hooks): corregidos.

---

## Deuda técnica

Ver [docs/DEBT.md](DEBT.md) para el registro formal (Problema | Solución | Deadline).
