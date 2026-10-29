// TypeScript shapes of the objects in contract/journal.schema.json, written by hand from the
// schema. The schema is the law: every write is validated against it (schema.ts); these types
// only make the code readable. Field names are the contract's words.

export type ClockTrust = "ntp" | "manual" | "unknown";

// What the store stamps on everything it creates: the time it was taken and how far the
// device's clock could be trusted at that moment (src/lib/clock.svelte.ts in the app).
export interface ClockReading {
  timestamp: string;
  clockTrust: ClockTrust;
}

export type Clock = () => ClockReading;

export type Transport = "mesh" | "phone" | "courier" | "verbal";

export type EntryType = "message_out" | "message_in" | "note" | "status_change" | "correction";

export type Status = "pending" | "sent" | "delivered" | "roger" | "given_up" | "closed" | "reopened";

export type RegisterOrigin = "issued" | "adhoc" | "private";

export interface Incident {
  id: string;
  name: string;
  createdAt: string;
  clockTrust: ClockTrust;
  createdOnDevice: string;
  createdBy: string;
  drill?: boolean;
}

export interface RegisterEntry {
  id: string;
  publicKey: string;
  label: string;
  person?: string;
  street?: string;
  role?: string;
  origin: RegisterOrigin;
  notes?: string;
  createdAt: string;
  createdOnDevice: string;
}

export interface JournalEntry {
  id: string;
  incidentId: string;
  deviceId: string;
  deviceSeq: number;
  timestamp: string;
  clockTrust: ClockTrust;
  operator: string;
  type: EntryType;
  transport?: Transport;
  counterpartyId?: string;
  seqNo?: number;
  text?: string;
  refersTo?: string;
  newStatus?: Status;
  dedupeKey?: string;
}

// What a caller hands to appendEntry: everything the store does not assign itself.
export type NewJournalEntry = Omit<
  JournalEntry,
  "id" | "deviceId" | "deviceSeq" | "timestamp" | "clockTrust"
>;

// A message_out before its #n exists: what appendMessageOut takes (P0-05). The store assigns
// seqNo from the recipient's counter and the caller's compose() turns it into the text.
export interface NewMessageOut {
  incidentId: string;
  operator: string;
  transport: Transport;
  counterpartyId: string;
}

export type NewIncident = Omit<Incident, "id" | "createdAt" | "clockTrust" | "createdOnDevice">;

export type NewRegisterEntry = Omit<RegisterEntry, "id" | "createdAt" | "createdOnDevice">;

// The export file and the sync batch.
export interface Envelope {
  format: "bcentral-journal";
  version: 1;
  deviceId: string;
  exportedAt: string;
  incidents: Incident[];
  register: RegisterEntry[];
  entries: JournalEntry[];
}

export const ENVELOPE_FORMAT = "bcentral-journal";
export const ENVELOPE_VERSION = 1;
