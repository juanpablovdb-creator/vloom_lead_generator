# Proceso diario

Rituales y prácticas del equipo LeadFlow.

> **Guía paso a paso:** Ver [PASO_A_PASO.md](PASO_A_PASO.md) para los comandos y acciones que debes ejecutar después de cada sesión.

---

## Lint al cierre del día

Antes de cerrar el día:

1. Ejecutar `npm run lint:fix`
2. Resolver warnings que aparezcan
3. Si hay muchos warnings, crear item en [BACKLOG.md](BACKLOG.md) para la próxima wave

**Pre-commit:** Con husky + lint-staged, el lint se ejecuta automáticamente en archivos staged antes de cada commit. Config: `.husky/pre-commit` ejecuta `npx lint-staged`; `.lintstagedrc.json` define `eslint --fix` para `*.{ts,tsx}`.

---

## Wave planning

- **Wave actual:** Items en ejecución. Debe estar 80-90% claro.
- **Wave siguiente:** Items preparados. 40-60% claro.

**Ritual:** Al inicio de cada wave, dedicar tiempo a preparar la siguiente. No esperar a terminar la actual para planear.

Ver [docs/BACKLOG.md](BACKLOG.md).

---

## Pre-mortems

Antes de features o cambios importantes:

1. Añadir entrada en [docs/PRE_MORTEMS.md](PRE_MORTEMS.md)
2. Usar la plantilla: Contexto, Riesgos, Mitigaciones, Action items
3. Revisar el documento periódicamente

---

## Housekeeping

- **Hecho:** Registrar en [docs/HOUSEKEEPING.md](HOUSEKEEPING.md)
- **Deuda técnica:** Documentar en [docs/DEBT.md](DEBT.md) con Problema | Solución | Deadline
- **Limpieza pendiente:** Mantener lista actualizada en HOUSEKEEPING
