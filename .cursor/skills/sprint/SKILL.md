---
name: sprint
description: Manage Sprint backlog and Waves. Use when completing work, when the user asks to add backlog items, or when planning waves. The agent MUST update BACKLOG when finishing a task (mark completed items, add new items).
---

# Sprint Skill

## CRITICAL: Agent Responsibility

**The agent MUST update `docs/BACKLOG.md` when completing work.** Mark completed items with `[x]` in Wave actual. Add new items to Backlog or Wave if we started something new. Do not leave this to the user.

## Model

- **Sprint** = Backlog (lista priorizada de items)
- **Wave** = Batch de tareas ejecutables en un periodo (ej: esta semana)
- **Rolling wave:** Wave actual 80–90% planificada; Wave siguiente 40–60%

## File

`docs/BACKLOG.md`

## Structure

```markdown
## Backlog (Sprint)
Items priorizados, sin fecha. Usar `- [ ]` para pendiente.

## Wave actual
Items en ejecución. 80–90% claros. Usar `- [x]` cuando se complete.

## Wave siguiente
Items preparados para la próxima. 40–60% claros.

## Completado
Historial de items terminados.
```

## Workflow

### Adding a New Item

- Add to **Backlog** if not yet planned for a wave
- Add to **Wave actual** or **Wave siguiente** when pulling from backlog

### Completing an Item

- Change `- [ ]` to `- [x]` in Wave actual
- Optionally move to **Completado** when wave ends

### Wave Planning

- At start of each wave: dedicate time to prepare **Wave siguiente**
- Don't wait until current wave ends to plan the next
