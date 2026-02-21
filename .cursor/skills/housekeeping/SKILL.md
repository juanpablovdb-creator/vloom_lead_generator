---
name: housekeeping
description: Update project housekeeping docs. Use when completing work, when the user asks to document changes, or when adding technical debt. The agent MUST update HOUSEKEEPING and DEBT proactively when finishing a task.
---

# Housekeeping Skill

## CRITICAL: Agent Responsibility

**The agent MUST update `docs/HOUSEKEEPING.md` and `docs/DEBT.md` when completing work.** Do not leave this to the user. Do it as part of wrapping up the task.

## When to Use

- **Always** after completing significant work (features, fixes, refactors)
- User asks to document changes or update housekeeping
- Adding technical debt entries
- Cleaning up pending items

## Files

| File | Purpose |
|------|---------|
| `docs/HOUSEKEEPING.md` | Hecho recientemente, pendiente de limpieza, link a DEBT |
| `docs/DEBT.md` | Deuda técnica formal (Problema \| Solución \| Deadline) |

## Workflow

### After Completing Work

1. Add to **Hecho recientemente** in `docs/HOUSEKEEPING.md`
2. Move completed items from **Pendiente** to **Hecho** (or remove if done)

### Technical Debt

Add to `docs/DEBT.md` with format:

```markdown
### [Título]

**Problema:** Qué está mal.

**Solución propuesta:** Cómo arreglarlo.

**Deadline:** (opcional) Cuándo resolverlo.
```

### Pending Cleanup

Add concrete items to **Pendiente de limpieza** in HOUSEKEEPING (e.g. "Revisar imports en X", "Unificar estilos en Y").
