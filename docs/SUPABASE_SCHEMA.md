# Esquema de Supabase (Leadflow)

## Cómo aplicar el esquema

El esquema del proyecto está en **migraciones incrementales** en `supabase/migrations/`:

- `001_initial_schema.sql` — tablas base (usa `CREATE TABLE IF NOT EXISTS`)
- `002_saved_searches_and_lead_run.sql`
- `003_leads_marked_as_lead.sql`
- `004_fix_profiles_rls_recursion.sql`
- `005_autorun_saved_searches.sql`
- `006_profiles_insert_policy_and_trigger_fix.sql`
- `007_saved_searches_optional_team_and_backfill.sql`
- `008_remove_teams.sql` — quita `team_id` y tabla `teams`; `api_keys` pasa a ser por `user_id`
- `009_ensure_no_team_id_reload_schema.sql` — vuelve a quitar `team_id` si quedara y lanza NOTIFY para recargar la caché de PostgREST (útil si sigue el error de schema cache)

**En una base ya existente** no uses un script “esquema completo” que haga `CREATE TABLE profiles` (sin `IF NOT EXISTS`). Eso produce *relation 'profiles' already exists*.

### Opción recomendada: migraciones desde el repo

En la raíz del proyecto:

```bash
npx supabase db push
```

Eso aplica las migraciones pendientes en orden.

### Opción manual en SQL Editor

1. Abre **Supabase Dashboard → SQL Editor**.
2. Ejecuta **cada** archivo de `supabase/migrations/` **en orden** (001, 002, 003, 004, 005, 006, 007, 008).
3. En cada archivo: selecciona todo (Ctrl+A) y Run.

No ejecutes un script guardado tipo “Leadflow Supabase Schema” que no sea una copia exacta de estas migraciones en secuencia. Si tienes uno antiguo (con `team_id` en `api_keys` o sin `IF NOT EXISTS` en las tablas), no lo uses en una base ya creada; usa solo las migraciones del repo.

## Error: "Could not find the 'team_id' column of 'scraping_jobs' in the schema cache"

Tras aplicar 008 (quitar `team_id`), PostgREST puede seguir usando una caché de esquema antigua.

**Pasos en orden:**

1. **Pausar y reanudar el proyecto**  
   Supabase Dashboard → **Project Settings** → **General** → **Pause project**, luego **Restore project**.  
   **Espera 2–3 minutos** hasta que el **STATUS** en Project Overview deje de decir "Checking..." y el proyecto esté estable.

2. **Ejecutar la migración 009** (fuerza que no quede `team_id` y pide recarga de caché):  
   En **SQL Editor**, abre o pega el contenido de `supabase/migrations/009_ensure_no_team_id_reload_schema.sql`, ejecuta todo (Run).  
   Espera **30–60 segundos**.

3. Vuelve a intentar la búsqueda en la app.

Si sigue fallando, ejecuta de nuevo en SQL Editor solo:  
`NOTIFY pgrst, 'reload schema';` y `NOTIFY pgrst, 'reload config';`, espera 1 minuto y prueba otra vez.

---

## Error: "Sesión caducada" / 401 en búsquedas (tras subir JWT expiry)

Si ya subiste "Access token expiry time" en **Project Settings → JWT Keys** y sigues viendo sesión caducada al lanzar una búsqueda, suele ser porque Supabase migró a **JWT Signing Keys** y el gateway de Edge Functions sigue verificando con el legacy secret, rechazando el token.

**Solución:** desplegar la Edge Function sin verificación JWT en el gateway (la función sigue validando el token por dentro):

```bash
npx supabase functions deploy run-job-search --no-verify-jwt
```

Luego cierra sesión en la app, vuelve a entrar y prueba la búsqueda.

---

## Error: "relation 'profiles' already exists"

Significa que se ejecutó un script que hace `CREATE TABLE profiles` sin `IF NOT EXISTS` en una base donde `profiles` ya existe.

**Solución:** deja de usar ese script. Aplica el esquema con las migraciones (001 → 008) como arriba. No hace falta borrar tablas; las migraciones usan `IF NOT EXISTS` o `DROP ... IF EXISTS` / `ADD COLUMN IF NOT EXISTS` donde corresponde.
