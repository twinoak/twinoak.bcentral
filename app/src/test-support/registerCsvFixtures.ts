// The CSV fixtures of P1-06, built as strings so the bytes are exact: the repo normalizes
// line endings to LF (.gitattributes), so a CRLF file with a BOM could not be checked in as
// a file and stay what it is.

export const KEY_A = "7a".repeat(32);
export const KEY_B = "7b".repeat(32);
export const KEY_C = "7c".repeat(32);
export const KEY_D = "7d".repeat(32);

const BOM = "﻿";

function crlf(lines: readonly string[]): string {
  return lines.join("\r\n") + "\r\n";
}

function lf(lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

// `;`, BOM, CRLF, as Danish Excel saves it: headers in mixed case, a quoted field with a `;`
// and a doubled quote inside, an empty origin (issued), "Private" in capitals, a key in
// upper-case hex, a trailing blank line.
export const SEMICOLON_BOM_CRLF =
  BOM +
  crlf([
    "Label;Person;Street;Role;Origin;PublicKey;Notes",
    `Hans;Hans Jensen;Nørregade;vejkontakt;adhoc;${KEY_A};"radio #7; handed out 18:05"`,
    `Peter;Peter "Pete" Sørensen;Søndergade 4;;;${KEY_B.toUpperCase()};`,
    `Lise;Lise Holm;Østergade 12;suppleant;Private;${KEY_C};"two` + "\r\n" + `lines"`,
    "",
  ]);

// `,`, no BOM, LF: a different column order and only three of the columns.
export const COMMA_LF = lf([
  "publicKey,label,street",
  `${KEY_A},Hans,Nørregade`,
  `${KEY_B},Peter,Søndergade 4`,
]);

export const UNKNOWN_HEADER = crlf(["label;person;telefon", `Hans;Hans Jensen;12345678`]);

// The same key twice, once in capitals: lines 2 and 4.
export const DUPLICATE_KEY = crlf([
  "label;publicKey",
  `Hans;${KEY_A}`,
  `Peter;${KEY_B}`,
  `Lise;${KEY_A.toUpperCase()}`,
]);

// Two rows with a key, three without: the resident list before the radios are handed out.
export const MISSING_KEYS = crlf([
  "label;person;street;role;origin;publicKey;notes",
  `Hans;Hans Jensen;Nørregade;vejkontakt;issued;${KEY_A};`,
  "Peter;Peter Sørensen;Søndergade 4;;;;",
  "Lise;Lise Holm;Østergade 12;suppleant;;;ny beboer",
  `Ole;Ole Madsen;Vestergade 3;;private;${KEY_B};`,
  "Anna;Anna Berg;Nørregade 9;;;;",
]);
