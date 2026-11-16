// The register form's rule (P3-06): a contact has a radio when the key field is not empty,
// and then the key and the origin are stored together; with the key empty neither is. The
// form cannot produce the shape the schema refuses.

import { describe, expect, it } from "vitest";
import type { RegisterEntry } from "../store/types.ts";
import { checkRegisterDrafts, registerFieldsFrom, type RegisterDrafts } from "./registerForm.ts";

const KEY_A = "7a".repeat(32);
const KEY_B = "7b".repeat(32);

const STAMP = { createdAt: "2026-10-28T18:00:00Z", createdOnDevice: "01JB8ZK3QX9V2M4N6P8R0T2W4Y" };
const hans: RegisterEntry = {
  ...STAMP,
  id: "01JB8ZK3QX9V2M4N6P8R0T2W50",
  label: "Hans",
  publicKey: KEY_A,
  origin: "adhoc",
};
const kurt: RegisterEntry = { ...STAMP, id: "01JB8ZK3QX9V2M4N6P8R0T2W51", label: "Kurt" };
const existing = [hans, kurt];

const empty: RegisterDrafts = {
  label: "",
  person: "",
  street: "",
  role: "",
  phone: "",
  notes: "",
  publicKey: "",
  origin: "issued",
};

describe("checkRegisterDrafts", () => {
  it("a contact without a radio needs only a label; the origin select's value is ignored", () => {
    expect(checkRegisterDrafts({ ...empty, label: "Grethe" }, existing, undefined)).toStrictEqual({
      publicKey: "",
      hasRadio: false,
      labelError: null,
      radioError: null,
    });
    expect(checkRegisterDrafts({ ...empty, label: "  " }, existing, undefined).labelError).toBe(
      "labelMissing",
    );
    expect(
      checkRegisterDrafts({ ...empty, label: "Grethe", origin: "" }, existing, undefined)
        .radioError,
    ).toBeNull();
  });

  it("a key makes it a radio: the key is folded and checked, the origin has to be chosen", () => {
    const typed = { ...empty, label: "Grethe", publicKey: ` ${KEY_B.toUpperCase()} ` };
    expect(checkRegisterDrafts(typed, existing, undefined)).toStrictEqual({
      publicKey: KEY_B,
      hasRadio: true,
      labelError: null,
      radioError: null,
    });
    expect(checkRegisterDrafts({ ...typed, publicKey: "7b" }, existing, undefined).radioError).toBe(
      "keyInvalid",
    );
    expect(
      checkRegisterDrafts({ ...typed, publicKey: KEY_A }, existing, undefined).radioError,
    ).toBe("keyTaken");
    // Editing Hans with his own key is not a clash.
    expect(
      checkRegisterDrafts({ ...typed, publicKey: KEY_A }, existing, hans.id).radioError,
    ).toBeNull();
    expect(checkRegisterDrafts({ ...typed, origin: "" }, existing, undefined).radioError).toBe(
      "originMissing",
    );
  });
});

describe("registerFieldsFrom", () => {
  it("stores no key and no origin for a contact without a radio, the optional fields trimmed or absent", () => {
    const fields = registerFieldsFrom(
      {
        ...empty,
        label: " Grethe ",
        person: "Grethe Nielsen",
        street: "Nørregade 12",
        phone: " 12 34 56 78 ",
        notes: "   ",
      },
      existing,
      undefined,
    );
    expect(fields).toStrictEqual({
      label: "Grethe",
      person: "Grethe Nielsen",
      street: "Nørregade 12",
      role: undefined,
      phone: "12 34 56 78",
      notes: undefined,
    });
    expect("publicKey" in fields).toBe(false);
    expect("origin" in fields).toBe(false);
  });

  it("stores the key and the origin together for a contact with a radio", () => {
    const fields = registerFieldsFrom(
      { ...empty, label: "Grethe", publicKey: KEY_B.toUpperCase(), origin: "private" },
      existing,
      undefined,
    );
    expect(fields).toMatchObject({ label: "Grethe", publicKey: KEY_B, origin: "private" });
  });

  it("refuses drafts that do not pass the check, so a key without an origin is never stored", () => {
    expect(() =>
      registerFieldsFrom(
        { ...empty, label: "Grethe", publicKey: KEY_B, origin: "" },
        existing,
        undefined,
      ),
    ).toThrow(RangeError);
    expect(() =>
      registerFieldsFrom({ ...empty, label: "Grethe", publicKey: KEY_A }, existing, undefined),
    ).toThrow(RangeError);
    expect(() =>
      registerFieldsFrom({ ...empty, label: "", publicKey: KEY_B }, existing, undefined),
    ).toThrow(RangeError);
  });
});
