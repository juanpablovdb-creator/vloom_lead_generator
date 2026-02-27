# Paso a paso: qué hacer cada vez que terminamos algo

Guía de los comandos y acciones que **tú** debes ejecutar después de cada sesión.

> **Nota:** El agente (IA) actualiza automáticamente `docs/HOUSEKEEPING.md` y `docs/BACKLOG.md` al terminar el trabajo. Tú solo ejecutas los comandos de abajo.

---

## 0. Si ves "team_id" o "schema cache" al buscar

Tras aplicar migraciones que quitan columnas (p. ej. 008_remove_teams), PostgREST puede seguir usando un esquema en caché antiguo.

1. **Primero:** En **Supabase Dashboard → SQL Editor** ejecuta `NOTIFY pgrst, 'reload schema';` y espera unos segundos. Vuelve a intentar la búsqueda.
2. **Si sigue fallando:** La forma más fiable de forzar la recarga del esquema es **pausar y reanudar el proyecto**: Dashboard → **Project Settings** (engranaje) → **General** → **Pause project**. Cuando termine, **Restore project**. Espera a que el proyecto esté en línea y vuelve a intentar.

---

## 0b. Si "Leadflow Supabase Schema" da "relation 'profiles' already exists"

Ese script guardado en el SQL Editor es una **copia antigua** del esquema (crea tablas sin `IF NOT EXISTS` y usa `team_id`). **No lo ejecutes** en una base que ya existe.

- **Base ya creada:** aplica el esquema con las **migraciones** en orden. En la raíz del proyecto: `npx supabase db push`. O en SQL Editor: ejecuta cada archivo de `supabase/migrations/` en orden (001, 002, 003, 004, 005, 006, 007, 008).
- **Proyecto nuevo:** ejecuta las migraciones en orden (001 → 008). No uses el script "Leadflow Supabase Schema" guardado en el dashboard.

Más detalle: `docs/SUPABASE_SCHEMA.md`.

---

## 0c. Si ves "Sesión caducada" y "Actualizar sesión" no basta

1. **JWT expiry** (opcional): En **Project Settings** → **JWT Keys** → "Access token expiry time" puedes subir el valor (p. ej. 3600 o 300000). Guarda.
2. **Si ya subiste el expiry y sigue fallando**: puede ser por la migración de Supabase de "Legacy JWT secret" a "JWT Signing Keys". El gateway de Edge Functions a veces rechaza el token. **Solución:** desplegar la función desactivando la verificación JWT en el gateway (la función sigue validando el token por dentro):

   En la raíz del proyecto:

   ```bash
   npx supabase functions deploy run-job-search --no-verify-jwt
   ```

   Luego cierra sesión en la app, vuelve a entrar y prueba la búsqueda.

---

## 1. Probar que todo funciona

```bash
npm run dev
```

- Abre http://localhost:5173
- Verifica que la app carga y que lo que cambiamos funciona

---

## 2. Lint (antes de cerrar o hacer commit)

```bash
npm run lint:fix
```

- Revisa los warnings que aparezcan
- Arregla los que puedas (imports no usados, variables sin usar, etc.)
- Si hay muchos, el agente puede añadirlos al backlog para la próxima wave

---

## 3. Git (si usas control de versiones)

```bash
git add .
git status          # Revisa qué vas a commitear
git commit -m "descripción breve de lo que hicimos"
```

- Si tienes Husky, el lint se ejecutará automáticamente antes del commit
- Si falla, arregla los errores y vuelve a intentar

---

## Resumen rápido (checklist)

Después de cada sesión:

- [ ] `npm run dev` — probar que funciona
- [ ] `npm run lint:fix` — limpiar código
- [ ] `git add .` + `git commit -m "..."` — guardar cambios (si usas Git)
