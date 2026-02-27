# Salida a producción – Leadflow Vloom

Guía para desplegar el frontend (Vite + React) y dejar listo Supabase para producción.

---

## Resumen del stack

| Capa        | Tecnología        | Dónde se despliega                    |
|------------|-------------------|----------------------------------------|
| Frontend   | Vite + React + TS | **Vercel** o **Netlify** (recomendado) |
| Backend/DB | Supabase          | Ya en la nube (supabase.com)           |

El frontend es una SPA estática: no hay servidor propio. Las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` se inyectan en **build time** en la plataforma que elijas.

---

## Recomendación: dónde desplegar el frontend

### Opción A: **Vercel** (recomendada)

- **Pros:** Integración excelente con Vite, CI/CD con Git automático, previews por PR, tier gratuito generoso, dominio y SSL incluidos.
- **Contras:** Ninguno relevante para este proyecto.
- **Ideal si:** Quieres el camino más rápido y ya usas (o quieres usar) GitHub.

### Opción B: **Netlify**

- **Pros:** Muy similar a Vercel, buena documentación para Vite, drag-and-drop o Git, env vars en el dashboard.
- **Contras:** Límites del free tier un poco más estrictos en ancho de banda.
- **Ideal si:** Prefieres Netlify por experiencia previa o por integraciones concretas.

### Otras opciones (no detalladas aquí)

- **Cloudflare Pages:** Muy bueno y gratis; configuración un poco más manual.
- **GitHub Pages:** Gratis; requiere configurar base path si usas un repo no `username.github.io`.

**Recomendación:** Empezar con **Vercel** por simplicidad y detección automática de Vite. Los pasos para Netlify son casi idénticos; se indican al final.

---

## Checklist previo al despliegue

- [ ] **Build sin errores:** Ejecuta `npm run build` localmente y corrige cualquier error de TypeScript o lint antes de desplegar. Si el build falla, Vercel/Netlify también fallarán.
- [ ] **Supabase en producción:** Tienes un proyecto en [supabase.com](https://supabase.com) (no solo local).
- [ ] **Migraciones aplicadas:** En el proyecto Supabase, todas las migraciones de `supabase/migrations/` están ejecutadas (Dashboard → SQL Editor o `supabase db push` si usas CLI).
- [ ] **Edge Functions desplegadas:** Si usas `run-job-search` u otras, están desplegadas (`supabase functions deploy ...`).
- [ ] **Variables de entorno locales:** Tu `.env` tiene `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` y la app funciona en local (`npm run dev`).
- [ ] **Build local correcto:** `npm run build` termina sin errores y `npm run preview` abre la app bien.

---

## Paso a paso: Vercel

### 1. Cuenta y repo

1. Entra en [vercel.com](https://vercel.com) e inicia sesión (recomendado: **Sign in with GitHub**).
2. Asegúrate de que el código de Leadflow está en un repositorio de **GitHub** (público o privado).

### 2. Importar el proyecto

1. En el dashboard de Vercel: **Add New… → Project**.
2. **Import** el repo de Leadflow (GitHub).
3. Vercel detectará **Vite** y rellenará:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. No cambies nada de lo anterior a menos que uses monorepo o path distinto.

### 3. Variables de entorno (crítico)

1. En la misma pantalla (o después en **Project → Settings → Environment Variables**), añade:

   | Name                     | Value                    | Entorno   |
   |--------------------------|--------------------------|-----------|
   | `VITE_SUPABASE_URL`      | `https://TU_PROYECTO.supabase.co` | Production (y Preview si quieres) |
   | `VITE_SUPABASE_ANON_KEY` | Tu anon key de Supabase  | Production (y Preview si quieres) |

2. Los valores los obtienes en Supabase: **Project Settings → API → Project URL** y **anon public**.
3. **Deploy** (o **Redeploy** si ya desplegaste sin env): Vercel reconstruye con estas variables.

### 4. Dominio y HTTPS

- Vercel asigna una URL tipo `leadflow-xxx.vercel.app`. HTTPS viene por defecto.
- Para tu propio dominio: **Project → Settings → Domains** y sigue las instrucciones (DNS o CNAME).

### 5. Siguientes despliegues

- Cada **push** a la rama principal (p. ej. `main`) genera un deploy en producción.
- Cada **pull request** puede tener un preview URL automático (opcional).

---

## Paso a paso: Netlify

### 1. Cuenta y repo

1. Entra en [netlify.com](https://netlify.com) e inicia sesión (p. ej. con GitHub).
2. El código debe estar en un repo de GitHub (o GitLab/Bitbucket).

### 2. Crear el sitio desde Git

1. **Add new site → Import an existing project**.
2. Conecta GitHub y elige el repo de Leadflow.
3. Configuración de build:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Base directory:** (dejar vacío si el proyecto está en la raíz)
4. **Deploy** (primera vez puede fallar si faltan env vars; se corrige en el paso 3).

### 3. Variables de entorno

1. **Site settings → Environment variables → Add a variable** (o **Add multiple**).
2. Añade:
   - `VITE_SUPABASE_URL` = `https://TU_PROYECTO.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = tu anon key
3. **Trigger deploy** (o **Deploys → Trigger deploy**) para reconstruir con las variables.

### 4. Dominio

- Netlify asigna algo como `random-name-123.netlify.app`. HTTPS por defecto.
- Dominio propio: **Domain settings → Add custom domain**.

---

## Supabase en producción

- **URL y anon key:** Son las que ya usas en el dashboard de Supabase (proyecto de producción). No hace falta “desplegar” Supabase: el proyecto en supabase.com **es** producción.
- **Auth:** Si usas redirects (magic link, OAuth), en **Authentication → URL Configuration** añade la URL de tu frontend en producción (p. ej. `https://leadflow.vercel.app`) en **Site URL** y en **Redirect URLs**.
- **RLS:** Asegúrate de que las políticas RLS están aplicadas en todas las tablas que usa el frontend (leads, profiles, tasks, etc.).
- **API keys sensibles:** Apify, SendGrid, Anthropic, etc. siguen en la tabla `api_keys` en Supabase (por usuario); no se ponen en el frontend ni en Vercel/Netlify.

---

## Archivos de configuración en el repo

- **`vercel.json`** – Configuración opcional para Vercel (redirects, headers).
- **`netlify.toml`** – Configuración para Netlify (build, redirects por si en el futuro usas rutas tipo SPA).

Si añades rutas (p. ej. React Router) más adelante, en ambos se puede definir que todas las rutas sirvan `index.html` (SPA fallback). Para el estado actual de la app (sin rutas en URL) no es obligatorio.

---

## Resumen rápido (Vercel)

1. Sube el código a GitHub.
2. Vercel → Import repo → Leadflow.
3. Añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Environment Variables.
4. Deploy. La URL tipo `xxx.vercel.app` será tu app en producción.
5. (Opcional) En Supabase Auth → URL Configuration, pon la URL de Vercel como Site URL y en Redirect URLs.

Cuando quieras, puedes repetir el flujo con Netlify en paralelo (mismo repo, otra cuenta/sitio) para tener un segundo entorno de preview o producción.
