# Backlog (Sprint) y Waves

Modelo: **Sprint** = backlog priorizado. **Wave** = batch ejecutable en un periodo.

> Rolling wave: Wave actual 80-90% planificada; Wave siguiente 40-60%. Reservar tiempo para planear la siguiente wave mientras se ejecuta la actual.

---

## Sprint Goal (opcional)

> Plataforma interna de prospección de leads: buscar jobs, enriquecer, scoring, contactar con IA.

---

## Backlog (Sprint)

Items priorizados, sin fecha asignada.

- [ ] Integrar Apify con búsqueda real (llamar Actor, guardar resultados)
- [ ] Schema Supabase + migraciones ejecutadas
- [ ] Auth multi-usuario (Supabase Auth)
- [ ] Enriquecimiento de leads (compañía, contacto)
- [x] Personas: pipeline de enriquecimiento de personas (Edge Function + harvestapi/linkedin-company-employees por URL de compañía; crear un lead por persona encontrada)
- [ ] Scoring configurable con pesos
- [ ] Email con IA (Claude) + SendGrid
- [ ] Fuentes LinkedIn Jobs, Indeed, Glassdoor operativas
- [ ] Fuentes Google Maps, LinkedIn People (coming soon → activas)
- [ ] Tests unitarios / E2E
- [ ] CI/CD (lint, build en PR)
- [x] Deploy a producción (guía en docs/DEPLOY.md; build TS pasa; fix TS Supabase insert/update para Vercel)

---

## Wave actual

Items en ejecución esta semana. 80-90% claros.

- [x] Lint + housekeeping setup
- [x] Documentar Sprint/Wave
- [x] Pre-mortems iniciales
- [x] Proceso diario (PROCESS.md)
- [ ] Revisar y ejecutar migraciones Supabase
- [x] Guía de salida a producción (DEPLOY.md + vercel.json + netlify.toml)
- [x] Build de producción (TypeScript corregido; npm run build pasa)
- [x] Saved searches: quitar “Save this search” + renombrado inline sin bug de espacio
- [x] Saved Searches: vista Disqualified + Restore to Backlog (enlace Disqualified / Back to results, mensaje string)
- [x] CRM: reordenar columnas con drag handle (GripVertical) en lugar de flechas
- [x] Edge Functions: añadir `verify_jwt = false` en config por función para evitar 401/"Invalid JWT" en gateway tras migraciones de JWT signing keys
- [x] LinkedIn Post Feeds: ejecutar `harvestapi/linkedin-post-search` y soportar Saved Searches → seleccionar → Send to leads
- [x] Post Feeds: filtro `authorLocations` aplica ubicacion del autor vía `harvestapi/linkedin-profile-scraper`
- [x] Post Feeds: normalizar `postedAt` del actor para evitar `"[object Object]"` en `job_posted_at` (timestamp)
- [x] CRM: default “Marked leads only” + validar update en Send to leads (Post Feeds / Saved searches visibles en Backlog)

---

## Wave siguiente

Items preparados para la próxima. 40-60% claros.

- [ ] Integrar Apify: llamar Actor desde SearchConfigPage
- [ ] Guardar resultados de scraping en tabla `leads`
- [ ] Conectar Dashboard con datos reales de Supabase

---

## Completado

- [x] Canal LinkedIn Job Post: asignado al importar desde LinkedIn Jobs + backfill por `job_source` (migración 018).
- [x] KPIs: labels alineados con CRM (Invite sent, Connected · Companies, Negotiation · Companies) + filtro por canal para ver KPIs por canales.
- [x] KPIs: lista de personas detrás de cada número (click en celda → modal con nombres · compañía).
- [x] CRM: nuevo lead en Invite sent; first_contacted_at; ordenar por fecha / last contacted / first contacted; canales LinkedIn Job Post y LinkedIn Post Feeds; channel LinkedIn en enriquecimiento y LinkedIn Job Post en import.
- [x] KPIs: cohort y conteos para todos los contactados (migración 018 backfill etapas + fallback por status en kpiUtils).
- [x] KPIs: excluir Disqualified de todos los conteos (leads no contactados; no cuentan en Invite Sent ni en el funnel).
- [x] Personas enrichment: Edge Function enrich-lead-personas + botón "Enrich with personas" en CRM; un lead por persona encontrada.
- [x] Personas tab + API: tabla personas, usePersonas, PersonasView (CRUD), pestaña debajo de Tasks.
- [x] KPI tracking: tabla por semana (Mon–Sun), atribución al primer contacto del lead, vista KPIs en sidebar
- [x] CRM: Add new leads from CRM + Channel field (modal Add lead, channel en lead, filtro y columna)
- [x] CRM: fix drop en columna Disqualified (min-height drop zone)
- [x] Saved searches: quitar "New saved search" (solo runs desde New Search)
- [x] Enrichment: no re-enriquecer leads ya enriquecidos (skip por last_enriched_at)
- [x] Login obligatorio en producción: sin Supabase config en prod → pantalla "Configuración requerida"; con Supabase → AuthPage si no hay usuario.
- [x] Guía de deploy a producción (docs/DEPLOY.md, Vercel/Netlify, checklist Supabase)
- [x] Build TS corregido para deploy (vite-env.d.ts, SupabaseClient<any>, guards, aserciones)
- [x] Tasks al marcar job post como lead: crear tarea "Contactar a …" y conectar a la tarjeta del trabajo (tabla tasks, useTasks, vista Tasks)
- [x] Eliminación completa de teams (migración 008 + tipos + apify, sendgrid, ai-email, Edge Function, UI)
- [x] Team flow documentado (TEAM_FLOW.md); saved_searches con team opcional + backfill últimas 3 búsquedas
- [x] Saved searches nav from New Search shows list (set view to app on sidebar navigate)
- [x] Auto-save every search run to Saved searches (Edge Function creates saved_search + links job)
- [x] Results table shows imported leads after search (key by scrapingJobId + useLeads filter sync)
- [x] Sidebar visible al abrir LinkedIn Jobs en Discovery (SearchConfigPage dentro de AppLayout)
- [x] Comunicación de la plataforma en inglés (UI: filtros, CRM, leads, mensajes)
- [x] Estructura inicial (React, Supabase, Apify, SendGrid, Claude)
- [x] HomePage con fuentes (LinkedIn, Indeed, Glassdoor, etc.)
- [x] SearchConfigPage con parámetros por Actor
- [x] Dashboard con LeadsTable, FilterBar, ScoringConfig, EmailComposer
- [x] Supabase opcional (no lanzar si faltan env vars)
- [x] Tema oscuro Vloom (ideas.wearevloom.com)
- [x] Error Boundary
- [x] Lazy load Dashboard
- [x] docs/BACKLOG, PRE_MORTEMS, HOUSEKEEPING, DEBT, PROCESS
- [x] Setup GitHub: .gitignore, GITHUB_SETUP.md
