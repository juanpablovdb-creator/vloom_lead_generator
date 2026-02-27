---
name: session-git
description: Helper for daily Git session flow. When the user greets with “Buenos días”, suggest opening a new session branch. When the user closes with “Buenas noches”, suggest committing, pushing, and merging to main so Vercel deploys to production. This skill MUST NOT conflict with cerrar-sesion, which is triggered by goodbyes like adiós/bye/chao.
---

# Session Git Skill

## Palabras clave

- **Inicio de sesión de trabajo:** cuando el usuario diga literalmente **“Buenos días”** al empezar a trabajar en el repo.
- **Cierre de sesión de trabajo:** cuando el usuario diga literalmente **“Buenas noches”** al terminar su bloque de trabajo (aunque luego siga chateando un poco).

> Importante: este skill **no** se activa con “chao”, “adiós”, “bye”, “hasta luego”, etc. Esas frases siguen siendo responsabilidad del skill `cerrar-sesion` (recordar probar, lint y commit). Aquí solo reaccionamos a “Buenos días” / “Buenas noches”.

## Inicio de sesión (“Buenos días”)

Cuando el usuario salude con **“Buenos días”** y esté trabajando en este proyecto:

1. Asume que quiere empezar una **rama de sesión** para el lote de cambios del día.
2. Propón un nombre de rama con este patrón:

   - `session/YYYY-MM-DD-descripcion-corta`
   - Ejemplo: `session/2026-02-27-supabase-deploy`

3. Muestra los comandos para crear y preparar la rama **sin ejecutarlos tú**:

   ```bash
   git checkout main
   git pull origin main
   git checkout -b session/AAAA-MM-DD-descripcion
   ```

4. Adapta la `descripcion` a lo que vayamos a hacer (deploy, CRM, tasks, etc.) si el usuario lo ha descrito.

## Cierre de sesión (“Buenas noches”)

Cuando el usuario diga **“Buenas noches”**:

1. **No reemplaces** al skill `cerrar-sesion`. Complementa su checklist.
2. Primero recuerda brevemente que:
   - Es buena idea pasar por el checklist de cierre (probar, `npm run lint:fix`, commit).
3. Luego añade el flujo Git de sesión:

   - Mostrar, sin ejecutar:

   ```bash
   git status          # revisar cambios
   git add .
   git commit -m "chore: session AAAA-MM-DD descripcion"
   git push            # en la rama de sesión actual
   ```

4. Explica que, una vez subidos los cambios:
   - Debe abrir un **Pull Request** de `session/...` → `main` en GitHub.
   - Revisar el **Preview Deployment** que crea Vercel.
   - Hacer **Merge** a `main` para que Vercel despliegue a producción.

5. Opcionalmente, sugiere los comandos de limpieza **después** de merge:

   ```bash
   git checkout main
   git pull origin main
   git branch -d session/AAAA-MM-DD-descripcion   # borrar rama local (opcional)
   ```

## Notas de convivencia con otros skills

- `cerrar-sesion` sigue siendo el encargado de reaccionar a “adiós”, “me voy”, “hasta luego”, “cierro”, “bye”, “chao”, etc. No dupliques ese comportamiento aquí.
- `session-git` solo se activa con **“Buenos días”** y **“Buenas noches”**.
- En el cierre (“Buenas noches”), es correcto que se apliquen **ambos**:
  - `cerrar-sesion`: checklist de probar, lint, commit.
  - `session-git`: flujo de rama de sesión, push y recordatorio de PR/merge para desplegar en Vercel.

