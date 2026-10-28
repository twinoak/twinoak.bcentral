# P0-03 — Register

**Depends on:** P0-02.

## Goal

The staff can keep the register: which radio belongs to which person, street and role.

## Scope

In:
- Register screen: list sorted by label, add, edit. Fields per the schema: label, person,
  street, role, origin (issued / adhoc / private), notes, public key.
- Public key entry: typed or pasted (validated: 64 lowercase hex), or — once P0-04 exists —
  picked from the radio's contact list. Build the picker against an interface
  `ContactSource { listContacts(): Promise<Contact[]> }` with a fake implementation for
  now; P0-04 provides the real one. Do not block on P0-04.
- Ad hoc flow: creating several entries at once as "radio #1 … #N" with keys, to be named at
  handout. Editing the label later is a normal edit.
- Register entries are mutable (the schema has no history for them); but every edit appends
  a `note` entry to the current incident, if one is open, saying what changed ("register:
  radio #7 → Hans, Nørregade"). If no incident is open, no note.
- A register entry cannot be deleted. It can be marked out of service via `notes` for now.

Out: the radio connection itself, any messaging.

## Read first

`contract/journal.schema.json` (`registerEntry`), `docs/brainstorm-2026-10-28.md` §4.

## Acceptance

- Adding, editing and listing work and persist across restart.
- An invalid public key cannot be saved.
- Two entries cannot share a public key (store-level check, tested).
- The ad hoc batch creates N entries with distinct labels.

## Verify

```
cd app && npm run check && npm run lint && npm run test && npm run build
```
