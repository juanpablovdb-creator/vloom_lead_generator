# Pre-Mortems

Un **pre-mortem** es una técnica donde el equipo imagina que el proyecto ya falló y trabaja hacia atrás para identificar qué pudo causarlo. Sirve para detectar riesgos antes de que ocurran.

> Referencia: [Atlassian Pre-Mortem Play](https://www.atlassian.com/team-playbook/plays/pre-mortem)

---

## Plantilla por entrada

```markdown
### [Título] — [Fecha/Wave]

**Contexto:** Qué estamos haciendo.

**Riesgos identificados:** Qué podría fallar.

**Impacto / Probabilidad:** (opcional, 1-5)

**Mitigaciones:** Qué hacemos para evitarlo.

**Action items:** (owner, deadline si aplica)
```

---

## Entradas

### Supabase opcional + pantalla en blanco — 2025-02

**Contexto:** La app lanzaba error si faltaban `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY`, dejando pantalla en blanco (especialmente en Lovable o sin .env).

**Riesgos identificados:**
- Usuario sin .env configurado no ve nada.
- Migración Lovable → Cursor más difícil si la app no arranca.

**Mitigaciones:**
- Supabase client opcional: crear solo si hay env vars; exportar `isSupabaseConfigured`.
- useLeads: si no hay Supabase, devolver datos vacíos y mensaje claro.
- Lazy load Dashboard para que Home cargue sin tocar Supabase.
- Error Boundary para mostrar errores en vez de pantalla en blanco.

**Action items:** Hecho.

---

### Tema oscuro Vloom — 2025-02

**Contexto:** Alinear layout, tipografía y colores con ideas.wearevloom.com. Usuario reportó que los colores no cambiaron.

**Riesgos identificados:**
- Tailwind no genera clases usadas en `@apply` si los CSS no están en `content`.
- Paleta light (gray/white) no coincide con Vloom (dark).

**Mitigaciones:**
- Añadir `./src/**/*.css` a `content` en tailwind.config.js.
- Paleta vloom oscura: bg `#0c0c0e`, surface `#16161a`, text `#fafafa`, accent `#8b5cf6`.
- Scrollbar y focus adaptados al tema oscuro.

**Action items:** Hecho.
