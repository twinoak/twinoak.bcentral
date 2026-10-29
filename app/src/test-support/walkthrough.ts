// contract/examples/walkthrough.json as an Envelope, read from the repo so the tests always
// see the committed example.

import { readFileSync } from "node:fs";
import type { Envelope } from "../store/types.ts";

export function loadWalkthrough(): Envelope {
  const text = readFileSync(
    new URL("../../../contract/examples/walkthrough.json", import.meta.url),
    "utf8",
  );
  return JSON.parse(text) as Envelope;
}
