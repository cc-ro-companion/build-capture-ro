# ccRO Build Planner

A build planner for the ccRO Ragnarok Online server, inspired by Path of
Building. Plan a character in the browser, pick a target monster, and see
the damage dealt and taken. No login and no backend: everything runs in
the browser, and builds are shared as codes.

**Status: unfinished.** The app is under development and its numbers are
not validated yet. Version 1.0 is released once the formulas match ccRO's
training dummy.

## Disclaimer
This is an unofficial fan project. It is not affiliated with or endorsed
by ccRO or Gravity. All numbers are estimates.

## Credits
Based on [rAthena](https://github.com/rathena/rathena): game data and
formulas follow rAthena's pre-renewal implementation, with ccRO's changes
on top.

## Development
Requires Node.js 22.12 or newer. pnpm is pinned in `package.json` and run
through corepack, so no global install is needed.

```
corepack pnpm install
corepack pnpm dev        # dev server
corepack pnpm check      # type check (svelte-check)
corepack pnpm lint       # ESLint and Prettier check
corepack pnpm format     # apply Prettier
corepack pnpm test       # Vitest
corepack pnpm build      # production build into dist/
```

Run `corepack enable` once (as administrator on Windows) to type `pnpm`
without the `corepack` prefix.

### Layout
| Path | Contents |
| --- | --- |
| `data-pipeline/` | Scripts: rAthena data + ccRO overrides to typed JSON |
| `data-overrides/` | Hand-maintained ccRO differences |
| `src/engine/` | Formulas and effect model, plain TypeScript without UI |
| `src/build/` | Build state, share codes, storage |
| `src/app/` | Svelte UI |
| `tests/fixtures/` | Characters validated against the training dummy |

The project plan is in [docs/build-planner-plan.md](docs/build-planner-plan.md).

## License
[GPL-3.0](LICENSE).
