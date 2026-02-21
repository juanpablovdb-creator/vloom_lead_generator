# Deuda técnica (DEBT)

Formato por entrada: **Problema** | **Solución propuesta** | **Deadline** (opcional).

> Referencia: [Why you should have a TECHNICALDEBT.md](https://medium.com/good-praxis/why-you-should-have-a-technicaldebt-md-in-your-repo-d9a8fdf87ff4)

---

## Entradas

### API keys en libs (ai-email, sendgrid, apify) asumen Supabase

**Problema:** Los clientes Apify, SendGrid y AI Email obtienen API keys desde la tabla `api_keys` de Supabase. Si Supabase no está configurado, esas llamadas fallarán sin mensaje claro.

**Solución propuesta:** Verificar `isSupabaseConfigured` antes de llamar a métodos que usan Supabase; devolver error amigable o usar fallback (ej: API key desde env en desarrollo).

**Deadline:** Antes de integrar Apify/SendGrid/Claude en producción.

---

### useLeads sin mock para desarrollo

**Problema:** Cuando Supabase no está configurado, useLeads devuelve lista vacía. No hay datos de ejemplo para desarrollar UI sin DB.

**Solución propuesta:** Añadir modo mock (ej: `VITE_USE_MOCK_LEADS=true`) que devuelva datos de ejemplo; o seed script para Supabase local.

**Deadline:** Cuando sea bloqueante para desarrollo de LeadsTable/FilterBar.
