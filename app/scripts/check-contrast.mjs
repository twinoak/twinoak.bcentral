// Runs the contrast check (contrast.mjs) over src/styles/tokens.css and prints every pair in
// both modes; exits 1 on the first failing pair or a base type under the document's numbers.
// Part of `npm run test` (package.json), so a token that drifts fails the build.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkCss, formatResult } from "./contrast.mjs";

const cssPath = fileURLToPath(new URL("../src/styles/tokens.css", import.meta.url));
const { modes, type, failures } = checkCss(readFileSync(cssPath, "utf8"));

for (const [mode, results] of Object.entries(modes)) {
  for (const result of results) {
    console.log(formatResult(mode, result));
  }
}
console.log(
  `type: font-size ${type.fontSizePx}px (${type.fontSizeOk ? "ok" : "FAIL"}), ` +
    `line-height ${type.lineHeight} (${type.lineHeightOk ? "ok" : "FAIL"})`,
);

if (failures.length > 0) {
  console.error(`\n${failures.length} contrast failure(s):`);
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}
console.log(`\ncontrast: ${modes.normal.length} pairs × 2 modes pass`);
