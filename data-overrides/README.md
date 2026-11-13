# data-overrides

Hand-maintained differences between ccRO and rAthena pre-renewal: changed
items, monsters and jobs, and later ccRO-only content such as runes, the card
album and costumes.

Rules:
- Only ccRO differences live here; anything that matches rAthena comes from
  the generator.
- The generator in [`../data-pipeline`](../data-pipeline) merges these files
  on top of the rAthena data. After editing a file here, run `pnpm data` and
  commit the regenerated `src/data/generated/` together with the edit;
  `pnpm test` fails if you forget.
- Add a comment with the source (patch note, forum post, in-game check) next
  to every change.

## Files

| File | Applies to (rAthena `db/pre-re/`) | Entries keyed by |
| --- | --- | --- |
| `meta.yml` | – | – |
| `items.yml` | `item_db_equip.yml` | `Id` |
| `monsters.yml` | `mob_db.yml` | `Id` |
| `jobs.yml` | `job_stats.yml`, `job_aspd.yml`, `job_exp.yml` | `Job` |

`meta.yml` holds the data label shown in the app footer:
```yaml
Label: 'ccRO 2026-11'
```
Bump it when a change matters to users. The data hash next to it changes on
its own whenever the generated data changes.

## Format

Each override file has a `Body` list and, except `jobs.yml`, a `Remove` list.
Entries use rAthena's field names and values, exactly as in the rAthena file
they apply to:
```yaml
# items.yml
Body:
  - Id: 1101          # existing id: only the listed fields change
    Attack: 30        # source: ccRO patch notes 2026-10-01
  - Id: 1102
    Jobs:             # maps merge key by key, like rAthena's db/import
      Novice: false
  - Id: 990001        # unknown id: a new entry
    AegisName: Example_Sword
    Name: Example Sword
    Type: Weapon
    SubType: 1hSword
    Attack: 40
    Jobs:
      Swordman: true
    Locations:
      Right_Hand: true
Remove:
  - 1103              # dropped from the output
```

Merge rules:
- Scalars and lists replace the rAthena value. For example, `BonusStats` in
  `jobs.yml` must be given in full.
- Maps (`Jobs`, `Locations`, `Flags`, `BaseASPD`, `Modes`, ...) merge key by
  key; to turn a key off, set it to `false`.
- A new entry needs every required field: `AegisName`, `Name` and `Type` for
  items, `AegisName` and `Name` for monsters. Absent optional fields get
  rAthena's defaults.

`jobs.yml` patches one job at a time, by rAthena job name, even where rAthena
groups several jobs in one entry. Jobs cannot be added or removed; the
supported job list is fixed by the generator.
```yaml
# jobs.yml
Body:
  - Job: Knight
    BaseASPD:
      2hSword: 540
  - Job: Super_Novice
    MaxJobLevel: 70
```

## Errors

`pnpm data` stops with a message naming the file and the id when:
- a field name is not one of rAthena's (catches typos such as `Atack`),
- a new entry is missing a required field,
- `Remove` lists an id that does not exist,
- `jobs.yml` names a job that is not supported.
