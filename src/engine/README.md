# src/engine

Formulas and the effect model: damage dealt and taken, hit and crit chance,
ASPD, cast time, DPS.

Rules:
- Plain TypeScript, no UI. Importing Svelte or anything from `src/app` is a
  lint error, so the engine stays unit-testable and can move into a web
  worker later.
- Every formula validated against ccRO's training dummy gets a fixture in
  [`tests/fixtures`](../../tests/fixtures).
