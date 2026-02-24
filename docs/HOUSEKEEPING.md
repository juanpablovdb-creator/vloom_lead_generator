# Housekeeping

Registro de lo hecho, pendiente de limpieza y enlace a deuda técnica.

---

## Hecho recientemente

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
