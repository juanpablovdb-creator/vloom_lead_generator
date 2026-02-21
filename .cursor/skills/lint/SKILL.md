---
name: lint
description: Run and fix ESLint in the project. Use when the user asks to lint, clean code, fix lint errors, run lint at end of day, or resolve ESLint warnings.
---

# Lint Skill

## When to Use

- User asks to lint, clean code, or fix lint errors
- End-of-day ritual: run lint before closing
- Resolving ESLint warnings or errors
- Pre-commit checks (husky + lint-staged)

## Commands

```bash
npm run lint        # Check only (fails on errors)
npm run lint:fix    # Auto-fix what ESLint can fix
```

## Workflow

1. Run `npm run lint:fix`
2. Fix remaining warnings manually (unused imports, etc.)
3. If many warnings remain, add item to `docs/BACKLOG.md` for next wave

## Project Config

- **ESLint config:** `.eslintrc.cjs`
- **Pre-commit:** `.husky/pre-commit` runs `npx lint-staged`
- **Lint-staged:** `.lintstagedrc.json` — runs `eslint --fix` on staged `*.{ts,tsx}`

## Common Fixes

- **Unused imports:** Remove them
- **Unused variables:** Remove or prefix with `_` (e.g. `_unused`)
- **Missing deps in useEffect:** Add to dependency array or add eslint-disable with comment explaining why
