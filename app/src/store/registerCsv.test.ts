import { beforeAll, describe, expect, it } from "vitest";
import { setLanguage } from "../i18n/index.svelte.ts";
import {
  COMMA_LF,
  DUPLICATE_KEY,
  KEY_A,
  KEY_B,
  KEY_C,
  KEY_D,
  MISSING_KEYS,
  MIXED,
  ORIGIN_WITHOUT_KEY,
  SEMICOLON_BOM_CRLF,
  UNKNOWN_HEADER,
} from "../test-support/registerCsvFixtures.ts";
import {
  BOM,
  CSV_COLUMNS,
  csvErrorText,
  csvField,
  detectSeparator,
  matchHeader,
  parseCsvRecords,
  previewCounts,
  previewRegisterImport,
  registerCsv,
  stripBom,
  type CsvError,
} from "./registerCsv.ts";
import type { RegisterEntry } from "./types.ts";

const STAMP = { createdAt: "2026-10-28T18:00:00Z", createdOnDevice: "01JB8ZK3QX9V2M4N6P8R0T2W4Y" };

function hans(id = "01JB8ZK3QX9V2M4N6P8R0T2W50"): RegisterEntry {
  return { ...STAMP, id, publicKey: KEY_D, label: "Hans", origin: "adhoc" };
}

beforeAll(() => {
  setLanguage("en");
});

describe("the ; file with BOM and CRLF (Danish Excel)", () => {
  it("is read: headers case-insensitive, quotes unwrapped, origin defaulted, key folded, phone kept", () => {
    const preview = previewRegisterImport(SEMICOLON_BOM_CRLF, []);
    expect(preview.separator).toBe(";");
    expect(preview.errors).toStrictEqual([]);
    expect(preview.entries).toStrictEqual([
      {
        label: "Hans",
        person: "Hans Jensen",
        phone: "12 34 56 78",
        street: "Nørregade",
        role: "vejkontakt",
        origin: "adhoc",
        notes: "radio #7; handed out 18:05",
        publicKey: KEY_A,
      },
      {
        label: "Peter",
        person: 'Peter "Pete" Sørensen',
        phone: undefined,
        street: "Søndergade 4",
        role: undefined,
        origin: "issued",
        notes: undefined,
        publicKey: KEY_B,
      },
      {
        label: "Lise",
        person: "Lise Holm",
        phone: undefined,
        street: "Østergade 12",
        role: "suppleant",
        origin: "private",
        notes: "two\r\nlines",
        publicKey: KEY_C,
      },
    ]);
    // The line numbers name the file's lines, the header being line 1; the quoted line
    // break in Lise's notes does not shift them.
    expect(preview.rows.map((row) => row.line)).toStrictEqual([2, 3, 4]);
    expect(previewCounts(preview)).toStrictEqual({ withRadio: 3, withoutRadio: 0 });
  });

  it("the BOM is stripped before the header is read", () => {
    expect(stripBom(SEMICOLON_BOM_CRLF).startsWith("Label;")).toBe(true);
    expect(stripBom("label")).toBe("label");
    const withoutBom = stripBom(SEMICOLON_BOM_CRLF);
    expect(previewRegisterImport(withoutBom, []).entries).toStrictEqual(
      previewRegisterImport(SEMICOLON_BOM_CRLF, []).entries,
    );
  });
});

describe("the , file without BOM, LF", () => {
  it("is read with the columns in its own order and the missing ones absent", () => {
    const preview = previewRegisterImport(COMMA_LF, []);
    expect(preview.separator).toBe(",");
    expect(preview.errors).toStrictEqual([]);
    expect(preview.entries).toStrictEqual([
      {
        label: "Hans",
        person: undefined,
        phone: undefined,
        street: "Nørregade",
        role: undefined,
        origin: "issued",
        notes: undefined,
        publicKey: KEY_A,
      },
      {
        label: "Peter",
        person: undefined,
        phone: undefined,
        street: "Søndergade 4",
        role: undefined,
        origin: "issued",
        notes: undefined,
        publicKey: KEY_B,
      },
    ]);
  });

  it("the separator is decided by the header line alone", () => {
    expect(detectSeparator("label;person\na,b")).toBe(";");
    expect(detectSeparator("label,person\na;b")).toBe(",");
    expect(detectSeparator("label")).toBe(",");
    expect(detectSeparator("label;person,notes")).toBe(";");
  });

  it("a header with both separators is split on ; and the rest is an unknown column", () => {
    const preview = previewRegisterImport("label;person,notes\nHans;x,y\n", []);
    expect(preview.errors).toStrictEqual([
      { kind: "unknownHeader", column: 2, name: "person,notes" },
    ]);
    expect(preview.entries).toStrictEqual([]);
  });
});

describe("the file with an unknown header", () => {
  it("is refused with the column named, and nothing is read", () => {
    const preview = previewRegisterImport(UNKNOWN_HEADER, []);
    expect(preview.errors).toStrictEqual([{ kind: "unknownHeader", column: 3, name: "telefon" }]);
    expect(preview.rows).toStrictEqual([]);
    expect(preview.entries).toStrictEqual([]);
    expect(csvErrorText(preview.errors[0] as CsvError)).toBe(
      "Unknown column “telefon” (column 3). The columns are label, person, street, role, phone, origin, publicKey, notes.",
    );
  });

  it("every header fault is named: empty, duplicate, no label", () => {
    expect(matchHeader(["label", "", "notes"]).errors).toStrictEqual([
      { kind: "emptyHeader", column: 2 },
    ]);
    expect(matchHeader(["label", "Notes", "notes"]).errors).toStrictEqual([
      { kind: "duplicateHeader", column: 3, name: "notes" },
    ]);
    expect(matchHeader(["person", "notes"]).errors).toStrictEqual([{ kind: "missingLabelHeader" }]);
    expect(matchHeader([" LABEL ", "PUBLICKEY", "Phone"])).toStrictEqual({
      columns: ["label", "publicKey", "phone"],
      errors: [],
    });
    expect(previewRegisterImport("", []).errors).toStrictEqual([{ kind: "empty" }]);
    expect(previewRegisterImport(BOM + "\r\n\r\n", []).errors).toStrictEqual([{ kind: "empty" }]);
  });
});

describe("the file with a duplicate key", () => {
  it("names both lines and adds nothing", () => {
    const preview = previewRegisterImport(DUPLICATE_KEY, []);
    expect(preview.errors).toStrictEqual([
      { kind: "duplicateKeyInFile", line: 4, otherLine: 2, publicKey: KEY_A },
    ]);
    expect(preview.entries).toStrictEqual([]);
    expect(preview.rows.map((row) => row.errors.length)).toStrictEqual([0, 0, 1]);
    expect(csvErrorText(preview.errors[0] as CsvError)).toBe(
      "Line 4: the same public key is on line 2.",
    );
  });

  it("a key already in the register names the entry that holds it; a keyless contact holds none", () => {
    const grethe: RegisterEntry = { ...STAMP, id: "01JB8ZK3QX9V2M4N6P8R0T2W60", label: "Grethe" };
    const preview = previewRegisterImport(COMMA_LF, [{ ...hans(), publicKey: KEY_B }, grethe]);
    expect(preview.errors).toStrictEqual([
      { kind: "duplicateKeyInStore", line: 3, label: "Hans", publicKey: KEY_B },
    ]);
    expect(preview.entries).toStrictEqual([]);
    expect(csvErrorText(preview.errors[0] as CsvError)).toBe(
      "Line 3: the public key is already in the register, on “Hans”.",
    );
  });
});

describe("the file with rows missing keys (P3-06: contacts without a radio)", () => {
  it("every row is an entry in file order; a row without a key has no key and no origin", () => {
    const preview = previewRegisterImport(MISSING_KEYS, []);
    expect(preview.errors).toStrictEqual([]);
    expect(preview.entries.map((entry) => entry.label)).toStrictEqual([
      "Hans",
      "Peter",
      "Lise",
      "Ole",
      "Anna",
    ]);
    expect(preview.entries[1]).toStrictEqual({
      label: "Peter",
      person: "Peter Sørensen",
      phone: "23 45 67 89",
      street: "Søndergade 4",
      role: undefined,
      notes: undefined,
    });
    expect(preview.entries[2]).toStrictEqual({
      label: "Lise",
      person: "Lise Holm",
      phone: undefined,
      street: "Østergade 12",
      role: "suppleant",
      notes: "ny beboer",
    });
    expect("publicKey" in (preview.entries[2] ?? {})).toBe(false);
    expect("origin" in (preview.entries[2] ?? {})).toBe(false);
    expect(preview.entries[3]).toMatchObject({ label: "Ole", publicKey: KEY_B, origin: "private" });
    expect(preview.rows.map((row) => row.publicKey === "")).toStrictEqual([
      false,
      true,
      true,
      false,
      true,
    ]);
    expect(preview.rows.map((row) => row.origin)).toStrictEqual([
      "issued",
      undefined,
      undefined,
      "private",
      undefined,
    ]);
    expect(previewCounts(preview)).toStrictEqual({ withRadio: 2, withoutRadio: 3 });
  });

  it("the acceptance file: two rows with keys and one without are three entries", () => {
    const preview = previewRegisterImport(MIXED, []);
    expect(preview.errors).toStrictEqual([]);
    expect(preview.entries).toStrictEqual([
      {
        label: "Hans",
        person: "Hans Jensen",
        phone: undefined,
        street: "Nørregade",
        role: undefined,
        notes: undefined,
        publicKey: KEY_A,
        origin: "adhoc",
      },
      {
        label: "Grethe",
        person: "Grethe Nielsen",
        phone: "12 34 56 78",
        street: "Nørregade 12",
        role: undefined,
        notes: undefined,
      },
      {
        label: "Ole",
        person: "Ole Madsen",
        phone: undefined,
        street: "Vestergade 3",
        role: undefined,
        notes: undefined,
        publicKey: KEY_B,
        origin: "private",
      },
    ]);
    expect(previewCounts(preview)).toStrictEqual({ withRadio: 2, withoutRadio: 1 });
  });

  it("an origin on a row without a key is an error naming the line, and nothing is handed out", () => {
    const preview = previewRegisterImport(ORIGIN_WITHOUT_KEY, []);
    expect(preview.errors).toStrictEqual([{ kind: "originWithoutKey", line: 3, value: "issued" }]);
    expect(preview.entries).toStrictEqual([]);
    expect(preview.rows[1]?.origin).toBeUndefined();
    expect(csvErrorText(preview.errors[0] as CsvError)).toBe(
      "Line 3: origin “issued” is given, but there is no public key. The origin is the radio's.",
    );
    // Case and whitespace do not make it a different fault; the value is named as typed.
    expect(
      previewRegisterImport("label;origin;publicKey\nX; Udleveret ;\n", []).errors,
    ).toStrictEqual([{ kind: "originWithoutKey", line: 2, value: "Udleveret" }]);
  });
});

describe("row rules, each an error naming the line", () => {
  const header = "label;origin;publicKey";

  it("a bad key", () => {
    const preview = previewRegisterImport(`${header}\nHans;issued;0x${KEY_A}\n`, []);
    expect(preview.errors).toStrictEqual([{ kind: "badKey", line: 2, value: `0x${KEY_A}` }]);
    expect(
      previewRegisterImport(`${header}\nHans;;${KEY_A.slice(0, 63)}\n`, []).errors,
    ).toStrictEqual([{ kind: "badKey", line: 2, value: KEY_A.slice(0, 63) }]);
  });

  it("a bad origin; case is folded, nothing else", () => {
    expect(previewRegisterImport(`${header}\nHans;udleveret;${KEY_A}\n`, []).errors).toStrictEqual([
      { kind: "badOrigin", line: 2, value: "udleveret" },
    ]);
    expect(previewRegisterImport(`${header}\nHans;ADHOC;${KEY_A}\n`, []).entries[0]?.origin).toBe(
      "adhoc",
    );
    expect(
      previewRegisterImport(`${header}\nHans; private ;${KEY_A}\n`, []).entries[0]?.origin,
    ).toBe("private");
  });

  it("an empty label", () => {
    expect(previewRegisterImport(`${header}\n ;issued;${KEY_A}\n`, []).errors).toStrictEqual([
      { kind: "labelMissing", line: 2 },
    ]);
  });

  it("a wrong number of fields", () => {
    expect(previewRegisterImport(`${header}\nHans;issued\n`, []).errors).toStrictEqual([
      { kind: "fieldCount", line: 2, found: 2, expected: 3 },
    ]);
    expect(
      previewRegisterImport(`${header}\nHans;issued;${KEY_A};extra\n`, []).errors,
    ).toStrictEqual([{ kind: "fieldCount", line: 2, found: 4, expected: 3 }]);
  });

  it("a quote that is never closed", () => {
    expect(previewRegisterImport(`${header}\n"Hans;issued;${KEY_A}\n`, []).errors).toStrictEqual([
      { kind: "unterminatedQuote", line: 2 },
    ]);
  });

  it("several faults are all listed, and no entry is handed out while any remains", () => {
    const preview = previewRegisterImport(
      `${header}\nHans;issued;${KEY_A}\n;x;bad\nPeter;adhoc;${KEY_A}\nOle;issued;\n`,
      [],
    );
    expect(preview.errors.map((error) => error.kind)).toStrictEqual([
      "labelMissing",
      "badOrigin",
      "badKey",
      "duplicateKeyInFile",
      "originWithoutKey",
    ]);
    expect(preview.entries).toStrictEqual([]);
    expect(preview.rows.length).toBe(4);
  });

  it("blank lines and lines with nothing in them are not rows", () => {
    const preview = previewRegisterImport(`${header}\n\nHans;;${KEY_A}\n;;\n\r\n\n`, []);
    expect(preview.errors).toStrictEqual([]);
    expect(preview.rows.map((row) => row.line)).toStrictEqual([3]);
  });

  it("every error has a text with no placeholder left", () => {
    const errors: CsvError[] = [
      { kind: "empty" },
      { kind: "unterminatedQuote", line: 2 },
      { kind: "emptyHeader", column: 2 },
      { kind: "unknownHeader", column: 3, name: "telefon" },
      { kind: "duplicateHeader", column: 3, name: "notes" },
      { kind: "missingLabelHeader" },
      { kind: "fieldCount", line: 2, found: 2, expected: 3 },
      { kind: "labelMissing", line: 2 },
      { kind: "badOrigin", line: 2, value: "x" },
      { kind: "originWithoutKey", line: 2, value: "x" },
      { kind: "badKey", line: 2, value: "x" },
      { kind: "duplicateKeyInFile", line: 4, otherLine: 2, publicKey: KEY_A },
      { kind: "duplicateKeyInStore", line: 3, label: "Hans", publicKey: KEY_A },
    ];
    for (const error of errors) {
      const text = csvErrorText(error);
      expect(text).not.toMatch(/\{\w+\}/);
      expect(text).not.toBe("");
    }
  });
});

describe("records", () => {
  it("quoted fields keep separators, doubled quotes and line breaks; CRLF and LF both end a record", () => {
    const parsed = parseCsvRecords('a;"b;c";"say ""hi"""\r\nd;"two\nlines";e\nf;g;h', ";");
    expect(parsed.error).toBeNull();
    expect(parsed.records).toStrictEqual([
      { line: 1, fields: ["a", "b;c", 'say "hi"'] },
      { line: 2, fields: ["d", "two\nlines", "e"] },
      { line: 4, fields: ["f", "g", "h"] },
    ]);
  });

  it("a quote inside an unquoted field is a character", () => {
    expect(parseCsvRecords('a;Peter "Pete";c\n', ";").records).toStrictEqual([
      { line: 1, fields: ["a", 'Peter "Pete"', "c"] },
    ]);
  });
});

describe("export", () => {
  const entries: RegisterEntry[] = [
    {
      ...STAMP,
      id: "01JB8ZK3QX9V2M4N6P8R0T2W50",
      publicKey: KEY_A,
      label: "Hans",
      person: "Hans Jensen",
      phone: "12 34 56 78",
      street: "Nørregade",
      role: "vejkontakt",
      origin: "adhoc",
      notes: 'radio #7; handed out "18:05"',
    },
    {
      ...STAMP,
      id: "01JB8ZK3QX9V2M4N6P8R0T2W51",
      publicKey: KEY_B,
      label: "Peter",
      origin: "issued",
    },
    {
      ...STAMP,
      id: "01JB8ZK3QX9V2M4N6P8R0T2W52",
      label: "Lise",
      person: "Lise Holm",
      street: "Østergade 12",
      notes: "two\r\nlines",
    },
  ];

  it("writes BOM, the eight columns, ;, CRLF, quotes only where needed, a keyless contact with an empty key and origin", () => {
    const text = registerCsv(entries);
    expect(text.startsWith(BOM)).toBe(true);
    expect(CSV_COLUMNS).toStrictEqual([
      "label",
      "person",
      "street",
      "role",
      "phone",
      "origin",
      "publicKey",
      "notes",
    ]);
    expect(text).toBe(
      BOM +
        [
          CSV_COLUMNS.join(";"),
          `Hans;Hans Jensen;Nørregade;vejkontakt;12 34 56 78;adhoc;${KEY_A};"radio #7; handed out ""18:05"""`,
          `Peter;;;;;issued;${KEY_B};`,
          `Lise;Lise Holm;Østergade 12;;;;;"two\r\nlines"`,
        ].join("\r\n") +
        "\r\n",
    );
    expect(text).not.toMatch(/[^\r]\n/);
  });

  it("csvField quotes on ; quote CR LF and nothing else", () => {
    expect(csvField("plain, with comma")).toBe("plain, with comma");
    expect(csvField("a;b")).toBe('"a;b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("a\nb")).toBe('"a\nb"');
    expect(csvField("")).toBe("");
  });

  it("import → export → import gives the same rows (round trip, mixed rows)", () => {
    const first = previewRegisterImport(MISSING_KEYS, []);
    const stamped = first.entries.map((entry, i) => ({
      ...entry,
      ...STAMP,
      id: `01JB8ZK3QX9V2M4N6P8R0T2W${50 + i}`,
    }));
    const text = registerCsv(stamped);
    const second = previewRegisterImport(text, []);
    expect(second.errors).toStrictEqual([]);
    expect(second.entries).toStrictEqual(first.entries);

    const third = previewRegisterImport(registerCsv(stamped), []);
    expect(third).toStrictEqual(second);
  });

  it("the Excel file round-trips too, quotes and line breaks included", () => {
    const first = previewRegisterImport(SEMICOLON_BOM_CRLF, []);
    const stamped = first.entries.map((entry, i) => ({
      ...entry,
      ...STAMP,
      id: `01JB8ZK3QX9V2M4N6P8R0T2W${50 + i}`,
    }));
    const second = previewRegisterImport(registerCsv(stamped), []);
    expect(second.entries).toStrictEqual(first.entries);
  });
});
