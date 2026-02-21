# Conectar a GitHub y sincronizar

## Paso 1: Crear el repositorio en GitHub

1. Ve a [github.com](https://github.com) e inicia sesión
2. Clic en **New repository** (o el botón "+" → New repository)
3. Nombre sugerido: `leadflow`
4. Elige **Private** (es interno para tu equipo)
5. **No** marques "Add a README" (ya tenemos uno)
6. Clic en **Create repository**
7. Copia la URL del repo (ej: `https://github.com/tu-usuario/leadflow.git`)

---

## Paso 2: Primer commit y conectar

Abre una terminal en la carpeta del proyecto y ejecuta:

```powershell
cd "d:\Vloom\Vloom Lead Generator\leadflow"

# 1. Añadir archivos (node_modules y .env se ignoran)
git add .

# 2. Ver qué se va a commitear
git status

# 3. Primer commit
git commit -m "Initial commit: LeadFlow - lead prospecting platform"

# 4. Conectar a GitHub (reemplaza TU-USUARIO con tu usuario de GitHub)
git remote add origin https://github.com/TU-USUARIO/leadflow.git

# 5. Subir
git push -u origin main
```

---

## Paso 3: Sincronizar después de cambios

```powershell
git add .
git status
git commit -m "descripción breve de los cambios"
git push
```

---

## Nota: .env no se sube

El archivo `.env` está en `.gitignore` porque contiene credenciales. Cada equipo debe crear su propio `.env` usando `.env.example` como plantilla.
