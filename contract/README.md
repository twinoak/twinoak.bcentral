# contract

The source of truth both `app/` and `hub/` build against. The schema is the law: both sides
validate against it, and nothing is inferred that is not in it.

| File | What |
| --- | --- |
| `text-protocol.md` | the in-message protocol between staff and field: `#n` numbering, `R`/`Rn` roger, the status chain |
| `journal.schema.json` | JSON Schema (2020-12) for incidents, the register and journal entries; also the export file format |
| `sync-api.openapi.yaml` | *not yet* — the app → hub sync API; written when the hub starts |
| `examples/walkthrough.json` | a valid journal covering the phase-0 walkthrough: an order, delivery, roger, a free-text reply, a note, a courier record with a point opened and closed on it, a correction, incident closed |

Rules the schema encodes:

- every id is a ULID minted at creation, so anything can be created offline on any device
- journal entries are append-only and immutable; a correction is a new entry
- status is never stored on a message, only derived from `status_change` entries — and only mesh messages have one; `#n` and the chain are radio concepts, a phone/courier/verbal message is a plain record
- every timestamp carries a clock trust (`ntp` / `manual` / `unknown`)
- a register entry is a *contact* — a person the staff talk to; `publicKey` (and with it `origin`) only when they have a radio; `phone` optional
- a `point` (da: *punkt*) is something to follow up on, opened from any entry (`refersTo`), open until a `status_change` `closed` refers to it, reopened by `reopened`; one point per origin entry
- a send-to-all stamps one `batchId` on every `message_out` it creates; a single send has none
- incoming mesh messages carry a dedupe key (sender key + sender timestamp + text) so a radio retry or a sync replay never produces two entries
