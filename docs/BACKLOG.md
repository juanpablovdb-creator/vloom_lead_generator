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
- [ ] Scoring configurable con pesos
- [ ] Email con IA (Claude) + SendGrid
- [ ] Fuentes LinkedIn Jobs, Indeed, Glassdoor operativas
- [ ] Fuentes Google Maps, LinkedIn People (coming soon → activas)
- [ ] Tests unitarios / E2E
- [ ] CI/CD (lint, build en PR)

---

## Wave actual

Items en ejecución esta semana. 80-90% claros.

- [x] Lint + housekeeping setup
- [x] Documentar Sprint/Wave
- [x] Pre-mortems iniciales
- [x] Proceso diario (PROCESS.md)
- [ ] Revisar y ejecutar migraciones Supabase

---

## Wave siguiente

Items preparados para la próxima. 40-60% claros.

- [ ] Integrar Apify: llamar Actor desde SearchConfigPage
- [ ] Guardar resultados de scraping en tabla `leads`
- [ ] Conectar Dashboard con datos reales de Supabase

---

## Completado

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
