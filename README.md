# BCentral

**Be central. Beredskabscentral.**

BCentral is a communication desk with a journal for a local emergency preparedness group
(a Danish *grundejerforening*'s *beredskab*). It runs in a browser on a laptop, needs no
internet to work, and talks to the field over [MeshCore](https://meshcore.co.uk/) LoRa radios.

The assumption it is built for: the power goes out, the mobile network follows within a few
hours, and the only thing left is the mesh. A small staff (*stab*) sits at one PC, people in
the field carry MeshCore radios, and every message in both directions is logged.

## What it is

- 1:1 messages from staff to field and back, with delivery receipts from the radio and a
  human "roger" on top
- "send to all" as a visible queue, one receipt per recipient
- a register of radios, people and streets
- an append-only journal that survives browser restarts and exports with one click
- an optional, self-hostable hub the app syncs to whenever internet happens to be available

## What it is not

Not a situation board, not a map, not an action-card library, not a resource tracker. Those
live on a whiteboard and on paper, on purpose: they are the least fragile things in the room.
The rule for scope is simple — everything BCentral does must have a paper equivalent, because
in a total failure BCentral is replaced by people on bicycles carrying notes.

## Status

Brainstorm stage. No code yet. Start with [docs/brainstorm-2026-10-28.md](docs/brainstorm-2026-10-28.md).

## Layout

| Folder | Holds |
| --- | --- |
| `app/` | the staff's browser app (offline-first PWA) |
| `hub/` | the optional sync hub and internet-side bridges |
| `contract/` | the data format and protocols both sides build against |
| `docs/` | brainstorms, spec, decisions |
| `deploy/` | how to run a hub |
