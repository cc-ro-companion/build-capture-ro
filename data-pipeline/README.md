# data-pipeline

Scripts that read rAthena's `db/pre-re` data and the ccRO overrides in
[`../data-overrides`](../data-overrides) and write typed JSON for the app.

Rules:
- Generated output is never edited by hand. Change the generator or an
  override file and regenerate.
- The generator records the rAthena commit it read, so every data version
  can be traced back to its source.

Populated in phase 2.
