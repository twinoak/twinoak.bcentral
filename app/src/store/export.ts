// Export: the envelope as a downloadable .json file named
// bcentral-journal-<deviceId>-<timestamp>.json. The envelope itself is built and validated by
// JournalStore.exportEnvelope(); this module only turns it into a file.

import type { Envelope } from "./types.ts";

// exportedAt without fractional seconds and without colons, so the name is legal on Windows
// and still reads as a time: 2026-10-28T19:30:00.123Z -> 2026-10-28T193000Z.
export function filenameTimestamp(exportedAt: string): string {
  return exportedAt.replace(/\.\d+(?=Z$)/, "").replace(/:/g, "");
}

export function envelopeFilename(envelope: Envelope): string {
  return `bcentral-journal-${envelope.deviceId}-${filenameTimestamp(envelope.exportedAt)}.json`;
}

// Pretty-printed like contract/examples/walkthrough.json, so a human can read the file.
export function envelopeJson(envelope: Envelope): string {
  return JSON.stringify(envelope, null, 2) + "\n";
}

// Browser only: offers the file through a temporary <a download>.
export function downloadEnvelope(envelope: Envelope): string {
  const filename = envelopeFilename(envelope);
  const blob = new Blob([envelopeJson(envelope)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoke once the download has had a moment to start; revoking synchronously after click
  // is reported to cancel the download in some Chromium versions.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return filename;
}
