# BCentral — brainstorm, 28 October 2026

First design session. Nothing here is code, and a few things are proposals rather than
decisions; those are marked *proposed*. Danish terms are kept where they are the real words
the users will use.

## 1. What BCentral is

The name is a pun: *Be central* and *Beredskabscentral* (emergency command post).

The customer is a *grundejerforening* (homeowners' association) with a *beredskab*
(preparedness group). MeshCore was presented to them as a way to keep communicating in a
crisis, especially a power outage, where the mobile network is expected to fail within
3–4 hours of the lights going out. What remains is the LoRa mesh.

The working picture:

- A **staff** (*stab*) sits centrally at one PC running BCentral and coordinates the response
  to one or more incidents.
- **Field persons** (*felt*) are out in the streets with a MeshCore radio and a phone, and
  talk to the staff.
- The staff coordinates and **logs the incident as it happens**.

Two hard requirements: communication must work, and it must be logged.

## 2. Scope

**In scope:** communication between staff and field, and the journal of it.

**Out of scope, deliberately:** the situation overview, action cards, plans, maps, resource
lists. These belong on a whiteboard and on paper, because paper is the least fragile thing in
the room. They must not depend on a PC.

**The fallback principle:** in a total failure, BCentral is replaced by people on bicycles
carrying notes. So everything BCentral does must have a paper equivalent, and anything that
has none is out of scope. BCentral is a *meldingsekspedition med journal* — a message desk
with a journal — not a command post inside a screen.

One borderline thing kept for now: a "last heard from" column per radio. It is communication
status, not situation status, it is derived from the journal, and it costs nothing. Easy to
drop later.

## 3. Design principles

1. **Local-first.** The browser is the source of truth. The app works with zero connectivity.
   The hub is a sync partner, never a prerequisite.
2. **Paper-equivalent.** See scope.
3. **Deterministic.** No heuristics. Protocol tokens are exact matches. Unknown radios are bound
   to people by hand. Two incidents that turn out to be the same are merged by hand.
4. **Append-only.** Journal entries are never edited. A correction is a new entry that points at
   the old one.
5. **Honest status.** "Delivered" means delivered to the device. Never "read".
6. **Export early, export often.** If the PC dies, the last export should be minutes old.
7. **Say when blind.** Radio disconnected, nothing heard for a long time: the app says so.

## 4. Actors and equipment

### Staff

One PC, one MeshCore companion radio, one journal. Several people will operate it over a day,
so every entry carries the operator's name.

### Field

The standard MeshCore app on a phone plus a companion radio. **No custom field app initially.**
BCentral is one piece of software, not two.

What a custom field app would add, in order of value: a preconfigured radio, an automatic
"I am Hans from Nørregade" on startup, and structured replies as buttons (OK / need help /
on my way). The first two can be had almost for free with a "prepare this radio for BCentral"
page in meshguide/automagical that the staff runs before handing a radio out. The third is the
only one that really needs an app, and it can wait until the staff say they miss it.

### Radios: three origins, one register

The register binds a radio's public key to a person, a street and a role.

| Origin | How it enters the register |
| --- | --- |
| Issued per street by the association | pre-registered, key known |
| Ad hoc stack kept at the staff | pre-registered as "radio #7"; a name is set at handout, no technology involved |
| Privately bought | appears in the staff radio's contact list via advert; the staff binds it to a person by hand — the one place with a little work, and deliberately manual |

## 5. Communication model

### All traffic is 1:1

Originally channel messages (many-to-many) were considered. Dropped: it drowns, and the staff
want to control which communication goes where. Direct messages also give a delivery receipt
from the receiving radio; channel messages give nothing.

### "Send to all" is a queue, not a button

Send-to-all is an abstraction over N direct messages. Each recipient costs one packet of
airtime, and the mesh tolerates on the order of a handful of messages per minute. 25 streets =
25 packets = several minutes. So the screen shows a queue with a status per recipient
(pending / sent / delivered / roger / given up) that the staff can watch drain. This is one of
the most important screens in the tool.

### The status chain

```
sent  →  delivered (radio receipt)  →  roger (a human has seen it and has nothing further)
```

Roger closes the item in the staff's queue. That is its real value.

### The text protocol

Roger does not need a custom app. MeshCore gives no new packet types without firmware
changes, so even a custom app would send roger as a direct text message with agreed content —
and a user of the stock app can type that too. So the "extra layer" is a small application
protocol inside the message text:

- Outgoing staff messages carry a short **per-recipient sequence number** visible in the text:
  `#12 Kør til Nørregade 4 og tjek kælderen`
- `R12` is roger for #12. A bare `R` is roger for the latest open message.
- BCentral parses exactly that pattern and nothing else. Everything else is free text and
  lands in the journal as a reply. A field person can write "vedr. #12" so the staff can attach
  a reply to the right order.
- A later custom app turns `R12` into a button behind a "Received" tap. Same protocol, no
  rewrite.

### Transport is a field on every entry

`mesh` / `phone` / `courier` / `verbal`. A phone call is logged by hand. A note that went out
on a bicycle is typed in afterwards with transport = courier, and when the courier comes back
and says "delivered 14:40", the operator marks it delivered. The journal stays complete even
when the mesh is half down and half the traffic is on bikes.

### Roll call (*mønstring*)

"Report status" to everyone is just a run of the send-to-all queue; the staff watch the
replies come in and see who is missing. It is the first thing a staff does when the power
goes, and it needs no feature beyond the queue.

## 6. Data model (sketch)

Everything gets a **ULID** at creation, so it can be created with no connection to anything,
on any device, and merged later. ULID over GUID because it is time-ordered in the id itself:
a merged journal sorts correctly without extra fields.

**Incident** — ULID, name, device it was created on. *Proposed:* a drill flag (*øvelse*) so
drill journals stay separate and every outgoing message is prefixed ØVELSE.

**Journal entry** —

- ULID (time-ordered)
- incident id
- device id + device sequence number (which PC it came from, and whether anything is missing
  in the run)
- timestamp **and clock trust**: NTP-synced / set by hand / unknown. A PC without internet can
  have the wrong time, and a power outage is exactly when it happens. A merged journal must be
  able to show that two PCs disagreed about the clock.
- operator
- type: message out / message in / note / status change / correction
- transport (see above)
- counterparty (register id)
- text
- sequence number (`#12`) when it is an order
- refers-to (entry id) for replies and corrections
- status in the chain above

**Register** — radio public key, person, street, role, origin, label.

**Merge rules** — union by ULID; entries are immutable so there are no conflicts to resolve.
Several PCs on the same mesh hear the same radio packet: dedupe by a hash of the packet
contents. Two incidents created independently about the same event: manual "these two are the
same", never a guess.

**Storage** — IndexedDB, surviving browser restart. Weak point: a user who clears browser data
deletes the whole journal. So the app should also be able to write the journal to a local
folder (File System Access API) and must export with one click. *Proposed:* "print the journal
since last time" as a button pressed every hour as routine.

## 7. The hub (*knudepunkt*)

A self-hostable server (Docker) that the app **can** sync with. Thomas hosts one; the project
is open source, so there can be several hubs, each association or operator running their own.
The hub URL is a setting in the app — nothing hardcoded.

- Sync is **up only** for now: local → hub. Paused when the internet is gone, resumed when it
  comes back. Sync down (PC A sees what PC B logged) may come later; the ULID/append-only
  model makes that an addition, not a rewrite.
- Several users of the app may sync to the same hub, so the **hub does the merging**.
- The hub is where the internet-side platforms live: Discord, Signal, Facebook and the like
  only work with internet, so they are fair-weather channels by definition, and the hub is only
  alive when there is internet anyway. The browser app speaks MeshCore only. This keeps the
  browser part small.
- Buildability, for priority: Discord is trivial (bot/webhook). Facebook needs a page and
  Meta approval. Signal has no real official API for this.

Open: whether one hub serves several associations (multi-tenant) or one each.

## 8. Deployment

The goal is that it is easy to get the app onto the laptops that will run it.

- **Target device: laptops with Chrome or Edge.** Web Serial and Web Bluetooth exist only in
  Chromium browsers. Firefox has neither. **Safari on iPad has neither**, so a browser-only
  app on an iPad cannot reach a radio at all; iPads would need a native wrapper or a
  third-party WebBLE browser. Not worth it for v1 — laptops.
- **Distribution: a PWA at a fixed URL.** Installs to the desktop, and the service worker
  caches everything so it opens with no network. The trap: it must have been opened once with
  internet *before* the crisis. The app shows its version and "last updated", and opening it is
  a line on the drill checklist.
- *Proposed:* an "offline kit" as well — a single-file build on a USB stick that opens from
  `file://`. Verify Web Serial and IndexedDB behaviour on `file://` before relying on it.
- **Staff radio hardware:** prefer boards with native USB CDC (nRF52-based, e.g. RAK4631) so no
  driver needs installing. Boards with CH340/CP210x USB-serial chips may need a driver, which
  is deployment friction on a borrowed laptop.
- **The box:** laptop, radio, charged power bank, printed resident list, printed plan. If the
  PC does not turn on, the rest is irrelevant.

## 9. Repositories

**`twinoak.bcentral` — monorepo** (this repo)

| Folder | Holds |
| --- | --- |
| `app/` | the staff's browser app: PWA, TypeScript, offline-first, Web Serial/Web Bluetooth, IndexedDB, export, sync client |
| `hub/` | the hub: self-hostable, Docker, receives journals from many PCs, bridges to Discord etc. |
| `contract/` | the truth about the data format: JSON Schema for journal entries, the sync API (OpenAPI), the text protocol (`#12` / `R12`) as a short document. App and hub both build against it |
| `docs/` | this brainstorm, the spec, contributor notes |
| `deploy/` | docker-compose for a hub |

One repo because there is one developer, app and hub change in step, and a change in
`contract/` must land in app and hub in the same commit. The licence is one file.

**`meshcore-web` (name tbd) — separate repo.** A TypeScript library with the MeshCore
companion protocol over Web Serial and Web Bluetooth. It already exists in substance inside
meshguide/automagical, and BCentral needs exactly the same thing. Extracted as an npm package,
there is one copy instead of two drifting apart, and others in the MeshCore community can use
it. Two consumers = own repo.

**Hub language:** decided 28 Oct 2026 — C#/ASP.NET Core, packaged in Docker. Matches meshmaster
and the existing hosting, and `contract/` is the language-neutral link. Node/TypeScript would let app and hub share types
directly but means two stacks to host. Contract-first fits "nothing fuzzy": the schema is the
law, both sides validate against it.

**Later, not now:** a custom field app (own repo, own release cadence) and a "prepare radio
for BCentral" page, which probably belongs in meshguide, not here.

## 10. Questions raised tonight, and where they stand

| # | Question | Where it stands |
| --- | --- | --- |
| 1 | One central PC or several copies? | Several users may run the app; all must be able to merge. For now sync is up only. |
| 2 | What powers the PC when the grid is down? | Laptop battery and the box. Not settled beyond that. |
| 3 | Who reads the journal afterwards, in what form? | Export to file (PDF/markdown). Audience and required form not settled. |
| 4 | Sync down as well as up? | Not initially. May change. |
| 5 | Who hosts the hub? | Thomas hosts one; open source, so anyone can host. |
| 6 | What is "data"? | Messages and the journal. Situation overview is out of scope. |
| 7 | Channel or 1:1? | All 1:1. Send-to-all is an abstraction over it. |
| 8 | Who owns the field radios? | Mixed: per-street issued, ad hoc stack, privately bought. One register. |
| 9 | What does "delivered" mean? | Delivered to the device. Roger is the human layer on top. |

## 11. Still open

Decided the same evening (see `decisions.md`): MIT licence, C# hub in Docker, English
throughout with a translatable UI (Danish first), no radio spike needed.

- Drill mode (*øvelse*) — in or out?
- Multi-tenant hub or one hub per association?
- Does the "offline kit" single-file build actually work on `file://`?
- Which MeshCore companion hardware for the staff radio?
- Who the journal is for afterwards (board, general assembly, insurance, authorities?) and
  whether that puts requirements on the export format.
- Hub-to-hub: a neighbouring association also running BCentral can be reached over the wider
  Danish mesh — worth anything?

## 12. Parking lot — raised, then scoped out or deferred

- Situation board per street/zone (OK / need / unknown) → whiteboard
- Tasks with owner and status beyond the message queue → paper
- Map with field positions and incident markers → paper map
- Templates, action cards, the association's "first 30 minutes" checklist → paper
- Escalation contact list (112, municipality, utility) → paper; calls are still logged by hand
- Shift handover view (*vagtskifte*) with everything open → deferred; might be just a filter on the queue
- Self-diagnosis panel (radio connected, battery, repeaters heard recently) → deferred, but "say when blind" stays a principle
