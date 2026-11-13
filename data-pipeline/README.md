# data-pipeline

Reads rAthena's `db/pre-re` data and the ccRO overrides in
[`../data-overrides`](../data-overrides) and writes typed JSON for the app to
[`../src/data/generated`](../src/data/generated).

Rules:
- Generated output is never edited by hand. Change the generator or an
  override file and regenerate.
- The generator records the rAthena commit it read, so every data version
  can be traced back to its source.

## Running it

```
pnpm data                          # uses ../rathena next to this repository
pnpm data --rathena D:\Gits\rathena
RATHENA_DIR=/path/to/rathena pnpm data
```

The rAthena checkout is chosen in this order: `--rathena <dir>`, the
`RATHENA_DIR` environment variable, then a `rathena` directory next to this
repository. It must contain `db/pre-re`. The generator reads `db/pre-re`,
plus `db/size_fix.yml`, the base file whose footer imports
`db/pre-re/size_fix.yml`. `db/import` is ignored, because ccRO differences
live in `data-overrides/`.

Note: rAthena also has base files directly in `db/` for other inputs
(`job_stats.yml`, `statpoint.yml`, `attr_fix.yml`, `mob_db.yml`,
`item_db.yml`, ...), and `db/pre-re` may only hold the pre-renewal changes on
top of them, as with `size_fix.yml`. Check each input against its `db/`
counterpart before relying on it.

Needs Node 22.18 or later: the generator is TypeScript run directly by Node's
type stripping, so it uses no enums or namespaces and imports with `.ts`
extensions.

After running it, commit the changed files in `src/data/generated/`. CI does
not run the generator; it uses the committed JSON. Running it twice on the
same inputs changes only `generatedAt` in `meta.json`.

The generator stops with a message naming the file and entry if an override
is invalid (see [`../data-overrides/README.md`](../data-overrides/README.md))
or if rAthena data has a value it does not know, such as a new job name or
element. It warns, but continues, if any rAthena file it reads has
uncommitted changes, and records `rathenaDirty: true`.

## Inputs and outputs

| Output | From rAthena `db/pre-re/` (unless a path is given) | Override |
| --- | --- | --- |
| `jobs.json` | `job_stats.yml`, `job_aspd.yml`, `job_exp.yml`, `statpoint.yml`; ids checked against `enum e_job` in `src/common/mmo.hpp` | `jobs.yml` |
| `items.json` | `item_db.yml` → `item_db_equip.yml` | `items.yml`, `hidden-items.yml` |
| `monsters.json` | `mob_db.yml` | `monsters.yml` |
| `tables.json` | `db/size_fix.yml` → `size_fix.yml`, `attr_fix.yml` | – |
| `names.en.json` | display names of the above | – |
| `meta.json` | data version, see below | `meta.yml` |

The shapes are defined in [`../src/data/types.ts`](../src/data/types.ts);
the app reads the data through [`../src/data/index.ts`](../src/data/index.ts).

Filters:
- Jobs: the 26 normal jobs in `jobs.ts`; no rebirth, baby or mounted
  variants.
- Items: weapons and armor only (no pet eggs or pet armor), wearable by
  normal (non-rebirth) characters, with at least one non-costume location
  and at least one supported job.
- Monsters: every entry in `mob_db.yml`.

## Data version

`meta.json` holds:
- `label` from `data-overrides/meta.yml`, shown in the app;
- `hash`: the first 8 hex characters of a SHA-256 over the other generated
  files. Share codes store it; it changes whenever the data changes;
- `rathenaCommit`, `rathenaCommitDate`, `rathenaDirty`;
- `overridesHash`: SHA-256 over `data-overrides/*.yml`;
- `generatedAt`.

`src/data/data.test.ts` recomputes both hashes, so `pnpm test` fails if an
override was edited without running `pnpm data`, or if a generated file was
edited by hand.

## Files

- `generate.ts`: entry point; runs every step and writes the output.
- `rathena.ts`: finds the checkout, loads db files including `Footer.Imports`,
  reads the commit.
- `overrides.ts`: loads and merges override files.
- `jobs.ts`, `items.ts`, `monsters.ts`, `tables.ts`: one converter per kind.
- `hash.ts`: overrides hash and data hash.
- `json.ts`: JSON formatting for small diffs.
- `fixtures/`: tiny YAML inputs for the unit tests (`*.test.ts`).
