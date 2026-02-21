# ¿Qué es Husky? (Explicación para developers junior)

## En una frase

**Husky** es una herramienta que ejecuta comandos automáticamente **antes de que se complete un `git commit`**.

---

## Analogía simple

Imagina que tienes un portero en la puerta de un edificio. Antes de que alguien entre, el portero revisa que cumplan ciertas reglas (por ejemplo: llevar identificación, no traer mascotas, etc.).

**Husky** es como ese portero, pero para tus commits de Git. Antes de que tu commit se guarde, Husky ejecuta comandos que tú defines (como lint, tests, etc.). Si algo falla, el commit se cancela y tienes que arreglarlo antes de poder hacer commit.

---

## ¿Por qué usarlo?

Sin Husky:
- Puedes hacer commit de código con errores de lint
- Puedes olvidarte de ejecutar `npm run lint:fix` al final del día
- El código "sucio" llega al repositorio

Con Husky:
- Cada vez que haces `git commit`, se ejecuta el lint automáticamente
- Si hay errores, el commit no se completa hasta que los arregles
- El código que llega al repo está más limpio

---

## ¿Cómo funciona en este proyecto?

1. **Husky** está instalado como dependencia (`package.json`).
2. Cuando haces `npm install`, Husky configura un "hook" de Git llamado `pre-commit`.
3. Ese hook vive en `.husky/pre-commit` y ejecuta: `npx lint-staged`
4. **lint-staged** toma solo los archivos que vas a commitear (los "staged") y les aplica `eslint --fix`.
5. Si ESLint encuentra errores que no puede arreglar solo, el commit falla.

---

## Comandos que verás

```bash
git add .
git commit -m "mi mensaje"
# ↑ Aquí Husky corre automáticamente. Si lint falla, verás un error y el commit no se guarda.
```

---

## ¿Puedo saltarme Husky?

Sí, con `git commit --no-verify`. Pero no es recomendable hacerlo de forma habitual: el objetivo es mantener el código limpio. Úsalo solo en casos excepcionales (por ejemplo, un commit de emergencia).

---

## Resumen

| Concepto | Significado |
|----------|-------------|
| **Husky** | Herramienta que ejecuta comandos antes del commit |
| **pre-commit** | El momento exacto: justo antes de que Git guarde el commit |
| **lint-staged** | Ejecuta lint solo en los archivos que vas a commitear (más rápido) |
| **--no-verify** | Saltarse los hooks (no recomendado) |
