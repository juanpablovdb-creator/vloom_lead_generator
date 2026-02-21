# 🚀 Guía de Setup: LeadFlow en Cursor + Supabase

Esta guía te lleva paso a paso desde cero hasta tener la app corriendo.

---

## Paso 1: Crear Proyecto en Supabase (5 min)

### 1.1 Crear cuenta/proyecto
1. Ve a [supabase.com](https://supabase.com) y haz login (o crea cuenta)
2. Click en **"New Project"**
3. Completa:
   - **Name**: `leadflow` (o el nombre que quieras)
   - **Database Password**: genera una segura y GUÁRDALA
   - **Region**: elige la más cercana a ti
4. Click **"Create new project"** y espera ~2 minutos

### 1.2 Ejecutar el Schema SQL
1. En el menú lateral, ve a **SQL Editor**
2. Click en **"New query"**
3. Copia TODO el contenido del archivo `supabase/migrations/001_initial_schema.sql`
4. **IMPORTANTE**: Borra las últimas líneas desde `-- DATOS INICIALES` hasta el final
5. Pégalo en el editor y click **"Run"**
6. Verifica en **Table Editor** que se crearon las tablas

### 1.3 Obtener credenciales
1. Ve a **Settings** (engranaje) → **API**
2. Copia estos dos valores:

```
Project URL:     https://xxxxx.supabase.co
anon public key: eyJhbGciOiJI... (la key larga)
```

---

## Paso 2: Configurar Cursor (3 min)

### 2.1 Abrir el proyecto
1. Descarga y descomprime `leadflow-v2.zip`
2. Abre Cursor y ve a **File → Open Folder**
3. Selecciona la carpeta `leadflow`

### 2.2 Crear archivo .env
1. En Cursor, haz clic derecho en la raíz del proyecto
2. **New File** → nombra como `.env`
3. Pega esto y completa con tus valores de Supabase:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tu-key-aqui
```

⚠️ **Nota**: Las API keys de Apify, SendGrid y Anthropic se guardan en Supabase, NO en el .env

---

## Paso 3: Instalar y Correr (2 min)

### 3.1 Abrir terminal
En Cursor: **View → Terminal** (o `Ctrl + ``)

### 3.2 Instalar y correr
```bash
npm install
npm run dev
```

### 3.3 Abrir en navegador
Ve a http://localhost:5173

Deberías ver: **"Hola, ¿dónde quieres buscar leads?"** 🎉

---

## Paso 4: Configurar tu Usuario y Equipo (3 min)

### 4.1 Crear tu equipo
1. En Supabase → **Table Editor** → tabla `teams`
2. Click **Insert row**
3. Pon un nombre: "Mi Equipo"
4. **Copia el `id`** que se genera (lo necesitas después)

### 4.2 Crear usuario
1. Ve a **Authentication** → **Users** → **Add user**
2. Pon tu email y contraseña
3. Click **Create user**

### 4.3 Vincular usuario al equipo
1. Ve a **Table Editor** → tabla `profiles`
2. Encuentra tu usuario y edita:
   - `team_id`: pega el ID del equipo
   - `role`: `owner`

---

## Paso 5: Agregar API Key de Apify (5 min)

### 5.1 Obtener API key
1. Ve a [console.apify.com](https://console.apify.com)
2. **Settings** → **Integrations** → **API tokens**
3. Crea un token y cópialo

### 5.2 Guardar en Supabase
1. Ve a **Table Editor** → tabla `api_keys`
2. **Insert row** con:
   - `team_id`: tu team ID
   - `service`: `apify`
   - `api_key_encrypted`: pega tu token
   - `is_active`: `true`

---

## Paso 6: Probar la App

1. En la app, click en **"LinkedIn Jobs"**
2. Configura los parámetros:
   - Keywords: `Video Editor`
   - Location: `United States`
   - Date Posted: `Past week`
3. Click **"Start Search"**

---

## Estructura de la App

```
leadflow/
├── src/
│   ├── pages/
│   │   ├── HomePage.tsx         ← "¿Dónde quieres buscar?"
│   │   ├── SearchConfigPage.tsx ← Parámetros de búsqueda
│   │   └── Dashboard.tsx        ← Tabla de leads
│   ├── components/              ← Componentes UI
│   ├── lib/
│   │   ├── apify.ts            ← Cliente de Apify
│   │   ├── supabase.ts         ← Cliente de Supabase
│   │   └── ...
│   └── App.tsx                  ← Navegación principal
└── supabase/
    └── migrations/              ← Schema SQL
```

---

## Cómo Agregar Más Fuentes de Apify

Para agregar un nuevo Actor de Apify, edita `SearchConfigPage.tsx`:

```typescript
// En ACTOR_INPUT_SCHEMAS, agrega:
'nuevo-actor/id': [
  {
    key: 'parameterName',      // Nombre del parámetro en Apify
    label: 'Label Visible',
    type: 'text',              // text | select | number | location
    required: true,
    helpText: 'Descripción',
  },
  // ... más campos
],
```

Luego en `HomePage.tsx`, agrega la card:

```typescript
{
  id: 'nuevo-source',
  name: 'Nuevo Source',
  apifyActorId: 'nuevo-actor/id',
  // ...
}
```

---

## Troubleshooting

### "Cannot find module" al correr
```bash
rm -rf node_modules package-lock.json
npm install
```

### Error de Supabase/Auth
- Verifica que el `.env` tenga los valores correctos
- No debe haber espacios antes o después de los valores

### La búsqueda no hace nada
- Revisa la consola del navegador (F12)
- Verifica que la API key de Apify esté en la tabla `api_keys`

---

## Próximos Pasos

Una vez funcionando, puedes pedirme:

1. **Conectar Apify real** - Hacer que la búsqueda ejecute el Actor
2. **Login/Registro** - Agregar autenticación con Supabase Auth
3. **Enriquecimiento** - Buscar emails y datos de contacto
4. **Envío de emails** - Integrar SendGrid
5. **Generación con IA** - Integrar Claude para escribir emails

¿En cuál quieres que profundicemos primero?
