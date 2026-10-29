# Open questions for the users

Questions that only the staff can answer. Each one names what is built today, the options,
and what each costs. Take them to the association before the first drill.

## 1. One journal or one per incident? (raised 2026-10-29)

**Today:** several incidents can be open at once, and an incoming message lands in whichever
incident the operator happens to be looking at. That is a guess, and it is wrong: the radio
does not know which incident Hans is answering. Only roger is unambiguous (`R12` belongs to
`#12`, and `#12` has an incident). Free text has no deterministic home.

**Question for the staff:** when the power is out and three things are happening at once —
water in no. 4, a tree on Søndergade, a resident without medication — do you keep one journal
for the night, or three?

**Option A — one open journal at a time, incidents as labels.** One staff journal per operation
(the paper practice); the three things are cases inside it, set on an entry by the operator or
inherited from the `#n` a roger answers. Everything incoming lands in the open journal, always.
"Only case 2" is a filter. A message arriving with no journal open waits visibly in a queue.
Small change: the app allows one open incident per device, and a later optional `caseLabel`
on entries. One click fewer per incoming message.

**Option B — inbox and manual assignment.** Incoming messages land in an inbox with no
incident; the operator stamps each with one, like a message clerk with a case-number stamp.
Deterministic, but one more click on every incoming message at 03:00, and a contract change
(`incidentId` optional on `message_in`, a new `assign` entry type).

**Until decided:** nothing is changed in the app. Test with one incident open at a time.

## 2. (next)
