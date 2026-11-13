# Phase 1: Foundation — plan

Status: approved

Parent: [build-planner-plan.md](build-planner-plan.md), phase 1.

## Goal
A Svelte 5 + TypeScript + Vite app that passes type check, lint, tests and
build locally and in CI, deploys to GitHub Pages with an "unfinished" banner,
and has the directory layout from the parent plan in place. No game logic.

## Decisions
| Decision | Choice | Reason |
| --- | --- | --- |
| pnpm | Pinned through `packageManager` in `package.json`, run via corepack | pnpm is not installed globally on the dev machine; corepack gives the same version locally and in CI. |
| Toolchain versions | TypeScript 6.0, Vite 8, Svelte 5, Vitest 5, ESLint 10 | typescript-eslint and svelte-check do not support TypeScript 7 yet. |
| Supply-chain guard | Keep pnpm's minimum release age; pin a dependency to an older line instead of excluding it | Prettier 3.10 was days old at scaffold time, so it is pinned to `~3.9.0`. |
| Pages base path | Vite `base: './'` | Works under any repo name and with a custom domain later; no remote exists yet. |
| Lint | `pnpm lint` runs ESLint (flat config, `typescript-eslint`, `eslint-plugin-svelte`, `eslint-config-prettier`) and `prettier --check` | Prettier does formatting, ESLint does correctness; one command covers both. Markdown is excluded from Prettier. |
| Deploy | `actions/deploy-pages` from `main` only, after the same checks as CI | Nothing broken reaches Pages. |

## Tasks
1. [x] Scaffold: `package.json`, Vite, Svelte 5, TypeScript, svelte-check,
   Vitest, ESLint, Prettier, `.gitignore`, `.editorconfig`. Check: the
   verification command passes with a minimal app and one trivial test.
2. [ ] Layout: `data-pipeline/`, `data-overrides/`, `src/engine/`,
   `src/build/`, `src/app/`, `tests/fixtures/`, each with a short README
   stating its purpose and rules (engine has no UI imports; generated data
   is not edited by hand). An ESLint rule forbids `src/engine` from
   importing Svelte or `src/app`. Check: verification passes; a test
   import violating the rule is reported by lint (tried once, not kept).
3. [ ] App shell: header with app name and version, "unfinished" banner,
   empty main area with placeholder regions (build, target, results),
   footer with disclaimer and rAthena credit. Check: verification passes;
   a component test renders banner and disclaimer.
4. [ ] License and docs: `LICENSE` (GPL-3.0 full text), `README.md` with
   purpose, disclaimer, "based on rAthena" credit, development commands.
   Check: verification passes.
5. [ ] CI and deploy: `.github/workflows/ci.yml` (check, lint, test, build
   on push and PR) and `.github/workflows/deploy.yml` (same checks, then
   upload `dist` and deploy to Pages, on push to `main` and manual
   trigger). Check: verification passes; workflow YAML parses. Running the
   workflows needs a GitHub remote, which is the maintainer's step.

## Verification
```
corepack pnpm check && corepack pnpm lint && corepack pnpm test && corepack pnpm build
```

## Maintainer steps (outside this phase's checks)
- Create the GitHub repo, push, set Pages source to "GitHub Actions".
- Open the deployed URL and confirm the banner and footer.

## Progress log
<!-- date · task · result · commit -->
