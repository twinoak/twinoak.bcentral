# contract

The source of truth both `app/` and `hub/` build against. The schema is the law: both sides
validate against it, and nothing is inferred that is not in it.

| File | What |
| --- | --- |
| `text-protocol.md` | the in-message protocol between staff and field: `#n` numbering, `R`/`Rn` roger, the status chain |
| `journal.schema.json` | JSON Schema (2020-12) for incidents, the register and journal entries; also the export file format |
| `sync-api.openapi.yaml` | *not yet* — the app → hub sync API; written when the hub starts |

Rules the schema encodes:

- every id is a ULID minted at creation, so anything can be created offline on any device
- journal entries are append-only and immutable; a correction is a new entry
- status is never stored on a message, only derived from `status_change` entries
- every timestamp carries a clock trust (`ntp` / `manual` / `unknown`)
- incoming mesh messages carry a packet hash so the hub can dedupe what several devices heard
