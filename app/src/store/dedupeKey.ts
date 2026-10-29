// The dedupe key of an incoming mesh message, exactly as contract/journal.schema.json describes
// it: lowercase hex SHA-256 of "<sender public key hex>:<sender timestamp as decimal epoch
// seconds>:<text as received>". Nothing is trimmed or normalised; the text is hashed as the
// radio delivered it.

// Same pattern as $defs/publicKey in the contract.
export const PUBLIC_KEY_PATTERN = /^[0-9a-f]{64}$/;

export function dedupeInput(senderPublicKey: string, senderTimestamp: number, text: string): string {
  if (!PUBLIC_KEY_PATTERN.test(senderPublicKey)) {
    throw new Error("dedupeKey: sender public key must be 64 lowercase hex characters");
  }
  if (!Number.isInteger(senderTimestamp) || senderTimestamp < 0) {
    throw new Error("dedupeKey: sender timestamp must be a non-negative integer of epoch seconds");
  }
  return `${senderPublicKey}:${senderTimestamp}:${text}`;
}

export async function dedupeKey(
  senderPublicKey: string,
  senderTimestamp: number,
  text: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(dedupeInput(senderPublicKey, senderTimestamp, text));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
