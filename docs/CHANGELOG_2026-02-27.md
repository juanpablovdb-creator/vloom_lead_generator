# Resumen de cambios – 27 Feb 2026

Resumen de lo que se incluyó en las ramas **session/2026-02-27-Layout** y **session/2026-02-27-descripcion**, para comunicar a usuarios qué cambió en la plataforma.

---

## CRM (vista Kanban y tabla)

- **Tarjetas de lead en Kanban:** Cada tarjeta muestra ahora Role, Location, Score y cantidad de tags. Si el lead tiene notas, se muestra un resumen.
- **Botones Notes y Tasks en cada tarjeta:** Desde la tarjeta puedes abrir un modal para editar **Notes** del lead o crear una **tarea** asociada a ese lead sin salir del CRM.
- **Nueva etapa del pipeline: Disqualified:** El Kanban incluye la columna "Disqualified" para llevar ahí leads que descartas. La tabla de Leads también soporta este estado.
- **Columna Notes en la tabla de Leads:** En vista Table del CRM puedes activar la columna "Notes" desde la configuración de columnas.

---

## Tasks (vista Proyectos y tareas)

- **Tabla rediseñada:** Columnas Status, Title, Associated contact, Associated company, CRM status (estado del lead en el pipeline) y acciones. Buscador por título de tarea.
- **Panel lateral para ver/editar tarea:** Al hacer clic en el título de una tarea se abre un panel a la derecha para editar título, estado (Not started / Done / Cancelled) y ver el lead asociado con enlace "View lead".
- **Crear tarea manualmente:** Botón "Create task" para crear una tarea eligiendo el lead en un desplegable (solo leads marcados como lead). La nueva tarea se asocia al lead seleccionado.
- **Enlace "View job" en tareas:** En la lista de tareas y en la vista Todo, si la tarea tiene lead con URL del job, se muestra el enlace "View job" para abrir la oferta en otra pestaña.

---

## Autenticación y despliegue

- **Login obligatorio en producción:** Si la app está desplegada pero faltan las variables de Supabase, se muestra la pantalla "Configuración requerida" en lugar de permitir uso sin login.
- **Google Login en producción:** Documentado y soportado el flujo para que el redirect tras Google lleve a la URL de producción (o a localhost en desarrollo) según la configuración en Supabase (Site URL y Redirect URLs).

---

## Búsquedas guardadas (Saved searches)

- **Renombrar búsqueda en línea:** En la lista de Saved searches puedes editar el nombre haciendo clic y guardando con el botón de confirmar.
- Ajustes de UX y mensajes de error en la gestión de búsquedas guardadas.

---

## Correcciones técnicas (sin impacto visible)

- Build de producción corregido (TypeScript y Supabase) para que el deploy en Vercel funcione.
- Documentación de despliegue (DEPLOY.md) y flujo de ramas (skills session-git, cerrar-sesion) para el equipo.

---

*Si necesitas más detalle técnico por rama o por commit, se puede ampliar este documento.*
