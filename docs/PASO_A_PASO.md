# Paso a paso: qué hacer cada vez que terminamos algo

Guía de los comandos y acciones que **tú** debes ejecutar después de cada sesión.

> **Nota:** El agente (IA) actualiza automáticamente `docs/HOUSEKEEPING.md` y `docs/BACKLOG.md` al terminar el trabajo. Tú solo ejecutas los comandos de abajo.

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
