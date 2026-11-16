// The register form's rule (P3-06), pure so the form and a test share it: what the drafts
// become when saved, and what is wrong with them. A contact has a radio when the key field
// is not empty; then the key has to be valid and free and the origin has to be chosen, and
// both are stored together. With the key field empty neither is stored — the form cannot
// produce the shape the schema refuses (a key without an origin, an origin without a key).

import { isValidPublicKey, normalizePublicKey } from "../store/register.ts";
import type { NewRegisterEntry, RegisterEntry, RegisterOrigin } from "../store/types.ts";

// The fields as typed. `origin` is "" while none is chosen.
export interface RegisterDrafts {
  label: string;
  person: string;
  street: string;
  role: string;
  phone: string;
  notes: string;
  publicKey: string;
  origin: RegisterOrigin | "";
}

export type RegisterDraftError = "labelMissing" | "keyInvalid" | "keyTaken" | "originMissing";

export interface RegisterDraftCheck {
  // The key field, trimmed and case-folded; "" when the contact has no radio.
  publicKey: string;
  hasRadio: boolean;
  labelError: "labelMissing" | null;
  // The radio section's one error, or null; always null without a radio.
  radioError: "keyInvalid" | "keyTaken" | "originMissing" | null;
}

// Optional fields: empty means absent, so the stored object has no empty strings.
function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function checkRegisterDrafts(
  drafts: RegisterDrafts,
  existing: readonly RegisterEntry[],
  ownId: string | undefined,
): RegisterDraftCheck {
  const publicKey = normalizePublicKey(drafts.publicKey);
  const hasRadio = publicKey !== "";
  const labelError = drafts.label.trim() === "" ? "labelMissing" : null;
  let radioError: RegisterDraftCheck["radioError"] = null;
  if (hasRadio) {
    if (!isValidPublicKey(publicKey)) {
      radioError = "keyInvalid";
    } else if (existing.some((other) => other.publicKey === publicKey && other.id !== ownId)) {
      radioError = "keyTaken";
    } else if (drafts.origin === "") {
      radioError = "originMissing";
    }
  }
  return { publicKey, hasRadio, labelError, radioError };
}

// The fields to store, from drafts that pass the check: the radio's two fields together or
// not at all. Throws on drafts that do not pass, so a caller cannot store the invalid shape.
export function registerFieldsFrom(
  drafts: RegisterDrafts,
  existing: readonly RegisterEntry[],
  ownId: string | undefined,
): NewRegisterEntry {
  const check = checkRegisterDrafts(drafts, existing, ownId);
  if (check.labelError !== null || check.radioError !== null) {
    throw new RangeError(`register drafts are not valid: ${check.labelError ?? check.radioError}`);
  }
  const fields: NewRegisterEntry = {
    label: drafts.label.trim(),
    person: optional(drafts.person),
    street: optional(drafts.street),
    role: optional(drafts.role),
    phone: optional(drafts.phone),
    notes: optional(drafts.notes),
  };
  if (check.hasRadio && drafts.origin !== "") {
    fields.publicKey = check.publicKey;
    fields.origin = drafts.origin;
  }
  return fields;
}
