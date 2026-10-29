// Export: the envelope as a downloadable .json file named
// bcentral-journal-<deviceId>-<timestamp>.json, or …-<timestamp>-drill.json when the envelope
// holds drills only (P1-05). The envelope itself is built and validated by
// JournalStore.exportEnvelope(); this module only turns it into a file.

import { isDrill } from "./incidents.ts";
import type { Envelope } from "./types.ts";

// exportedAt without fractional seconds and without colons, so the name is legal on Windows
// and still reads as a time: 2026-10-28T19:30:00.123Z -> 2026-10-28T193000Z.
export function filenameTimestamp(exportedAt: string): string {
  return exportedAt.replace(/\.\d+(?=Z$)/, "").replace(/:/g, "");
}

// A drill export: every incident in the file is a drill, and there is at least one. A file
// with no incidents, or with a real incident among them, is a journal export.
export function isDrillEnvelope(envelope: Envelope): boolean {
  return envelope.incidents.length > 0 && envelope.incidents.every(isDrill);
}

export function envelopeFilename(envelope: Envelope): string {
  const suffix = isDrillEnvelope(envelope) ? "-drill" : "";
  return `bcentral-journal-${envelope.deviceId}-${filenameTimestamp(envelope.exportedAt)}${suffix}.json`;
}

// Pretty-printed like contract/examples/walkthrough.json, so a human can read the file.
export function envelopeJson(envelope: Envelope): string {
  return JSON.stringify(envelope, null, 2) + "\n";
}

// Browser only: offers a text file through a temporary <a download>. Also the register's CSV
// (P1-06).
export function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
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
}

export function downloadEnvelope(envelope: Envelope): string {
  const filename = envelopeFilename(envelope);
  downloadText(filename, envelopeJson(envelope), "application/json");
  return filename;
}
