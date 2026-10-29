// Frames a MeshCore companion would send, built field by field from the layouts documented
// in src/radio/serial.ts, plus a scripted companion for FakeTransport.autoReply.

import {
  CMD_APP_START,
  CMD_DEVICE_QUERY,
  CMD_GET_CONTACTS,
  CMD_GET_DEVICE_TIME,
  CMD_SEND_TXT_MSG,
  CMD_SET_DEVICE_TIME,
  CMD_SYNC_NEXT_MESSAGE,
  FRAME_FROM_RADIO,
  PUSH_CODE_MSG_WAITING,
  PUSH_CODE_SEND_CONFIRMED,
  RESP_CODE_CHANNEL_MSG_RECV,
  RESP_CODE_CHANNEL_MSG_RECV_V3,
  RESP_CODE_CONTACT,
  RESP_CODE_CONTACTS_START,
  RESP_CODE_CONTACT_MSG_RECV,
  RESP_CODE_CONTACT_MSG_RECV_V3,
  RESP_CODE_CURR_TIME,
  RESP_CODE_DEVICE_INFO,
  RESP_CODE_END_OF_CONTACTS,
  RESP_CODE_ERR,
  RESP_CODE_NO_MORE_MESSAGES,
  RESP_CODE_OK,
  RESP_CODE_SELF_INFO,
  RESP_CODE_SENT,
  fromHex,
} from "../radio/serial.ts";

const encoder = new TextEncoder();

type Part = number | number[] | Uint8Array;

export function bytes(...parts: Part[]): Uint8Array {
  const flat: number[] = [];
  for (const part of parts) {
    if (typeof part === "number") {
      flat.push(part);
    } else {
      flat.push(...part);
    }
  }
  return Uint8Array.from(flat);
}

export function u32(value: number): number[] {
  const unsigned = value >>> 0;
  return [unsigned & 0xff, (unsigned >>> 8) & 0xff, (unsigned >>> 16) & 0xff, (unsigned >>> 24) & 0xff];
}

export function i32(value: number): number[] {
  return u32(value);
}

export function readU32(frame: Uint8Array, offset: number): number {
  return new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(offset, true);
}

// A NUL-padded string in a fixed-size field.
export function fixed(text: string, size: number): number[] {
  const out = new Array<number>(size).fill(0);
  const encoded = encoder.encode(text);
  for (let i = 0; i < encoded.length && i < size; i++) {
    out[i] = encoded[i] ?? 0;
  }
  return out;
}

export function text(value: string): Uint8Array {
  return encoder.encode(value);
}

// Wraps a payload the way the companion's serial port does: '>', uint16 LE length, payload.
export function fromRadio(payload: Uint8Array): Uint8Array {
  return bytes(FRAME_FROM_RADIO, payload.length & 0xff, payload.length >> 8, payload);
}

export const STAFF_KEY = "0123456789abcdef".repeat(4);
export const HANS_KEY = "7a".repeat(32);
export const PETER_KEY = "b1".repeat(32);

export const EPOCH = 1793214220; // 2026-10-28T19:03:40Z

export interface SelfInfoFixture {
  name?: string;
  publicKey?: string;
  txPower?: number;
  lat?: number;
  lon?: number;
  freqKhz?: number;
  bwHz?: number;
  sf?: number;
  cr?: number;
}

export function selfInfoFrame(fixture: SelfInfoFixture = {}): Uint8Array {
  return bytes(
    RESP_CODE_SELF_INFO,
    1, // adv type: chat
    fixture.txPower ?? 22,
    22, // max tx power
    fromHex(fixture.publicKey ?? STAFF_KEY),
    i32(Math.round((fixture.lat ?? 55.7) * 1e6)),
    i32(Math.round((fixture.lon ?? 12.6) * 1e6)),
    [0, 0, 0], // three single-byte prefs
    u32(fixture.freqKhz ?? 869525),
    u32(fixture.bwHz ?? 62500),
    fixture.sf ?? 8,
    fixture.cr ?? 5,
    text(fixture.name ?? "Stab 1"),
  );
}

export function deviceInfoFrame(firmwareVersion = "v1.7.1"): Uint8Array {
  return bytes(
    RESP_CODE_DEVICE_INFO,
    7, // protocol version
    100, // max contacts / 2
    8, // max group channels
    u32(123456), // BLE pin
    fixed("19 Feb 2025", 12),
    fixed("Heltec V3", 40),
    text(firmwareVersion),
  );
}

export interface ContactFixture {
  publicKey?: string;
  name?: string;
  type?: number;
  flags?: number;
  outPathLen?: number;
  outPath?: number[];
  lastAdvert?: number;
  lat?: number;
  lon?: number;
  lastMod?: number;
  code?: number;
}

export function contactFrame(fixture: ContactFixture = {}): Uint8Array {
  const path = new Array<number>(64).fill(0);
  const given = fixture.outPath ?? [];
  for (let i = 0; i < given.length && i < 64; i++) {
    path[i] = given[i] ?? 0;
  }
  return bytes(
    fixture.code ?? RESP_CODE_CONTACT,
    fromHex(fixture.publicKey ?? HANS_KEY),
    fixture.type ?? 1,
    fixture.flags ?? 0,
    (fixture.outPathLen ?? -1) & 0xff,
    path,
    fixed(fixture.name ?? "Hans", 32),
    u32(fixture.lastAdvert ?? EPOCH),
    i32(Math.round((fixture.lat ?? 55.7) * 1e6)),
    i32(Math.round((fixture.lon ?? 12.6) * 1e6)),
    u32(fixture.lastMod ?? EPOCH - 100),
  );
}

export function contactsStartFrame(count: number): Uint8Array {
  return bytes(RESP_CODE_CONTACTS_START, u32(count));
}

export function endOfContactsFrame(): Uint8Array {
  return bytes(RESP_CODE_END_OF_CONTACTS, u32(EPOCH));
}

export function currTimeFrame(epochSeconds: number): Uint8Array {
  return bytes(RESP_CODE_CURR_TIME, u32(epochSeconds));
}

export function okFrame(): Uint8Array {
  return bytes(RESP_CODE_OK);
}

export function errFrame(code?: number): Uint8Array {
  return code === undefined ? bytes(RESP_CODE_ERR) : bytes(RESP_CODE_ERR, code);
}

export function sentFrame(isFlood: boolean, expectedAck: number, estTimeoutMs: number): Uint8Array {
  return bytes(RESP_CODE_SENT, isFlood ? 1 : 0, u32(expectedAck), u32(estTimeoutMs));
}

export function ackFrame(ackCode: number, roundTripMs: number): Uint8Array {
  return bytes(PUSH_CODE_SEND_CONFIRMED, u32(ackCode), u32(roundTripMs));
}

export interface MessageFixture {
  senderKey?: string;
  pathLen?: number;
  txtType?: number;
  senderTimestamp?: number;
  text: string;
  // v3 only: SNR in dB, stored as int8 SNR * 4.
  snr?: number;
}

export function contactMessageV1Frame(fixture: MessageFixture): Uint8Array {
  return bytes(
    RESP_CODE_CONTACT_MSG_RECV,
    fromHex(fixture.senderKey ?? HANS_KEY).subarray(0, 6),
    fixture.pathLen ?? 0,
    fixture.txtType ?? 0,
    u32(fixture.senderTimestamp ?? EPOCH),
    text(fixture.text),
  );
}

export function contactMessageV3Frame(fixture: MessageFixture): Uint8Array {
  return bytes(
    RESP_CODE_CONTACT_MSG_RECV_V3,
    Math.round((fixture.snr ?? 0) * 4) & 0xff,
    [0, 0],
    fromHex(fixture.senderKey ?? HANS_KEY).subarray(0, 6),
    fixture.pathLen ?? 0,
    fixture.txtType ?? 0,
    u32(fixture.senderTimestamp ?? EPOCH),
    text(fixture.text),
  );
}

// RESP_CODE_CHANNEL_MSG_RECV (v1): code, channel index, path length, txt type, uint32 sender
// timestamp, text. v3 puts SNR and two reserved bytes after the code, as the contact form
// does. BCentral never parses either beyond the code; the fixture exists so the inbox can be
// shown to leave them out of the journal.
export function channelMessageV1Frame(text: string, channelIndex = 0): Uint8Array {
  return bytes(RESP_CODE_CHANNEL_MSG_RECV, channelIndex, 0, 0, u32(EPOCH), encoder.encode(text));
}

export function channelMessageV3Frame(text: string, channelIndex = 0): Uint8Array {
  return bytes(RESP_CODE_CHANNEL_MSG_RECV_V3, 0, [0, 0], channelIndex, 0, 0, u32(EPOCH), encoder.encode(text));
}

export function noMoreMessagesFrame(): Uint8Array {
  return bytes(RESP_CODE_NO_MORE_MESSAGES);
}

export function msgWaitingFrame(): Uint8Array {
  return bytes(PUSH_CODE_MSG_WAITING);
}

// What a CMD_SEND_TXT_MSG payload carried, read back from its bytes (layout in serial.ts).
export interface SentText {
  txtType: number;
  attempt: number;
  timestamp: number;
  // The 6-byte recipient key prefix, as hex.
  keyPrefix: string;
  text: string;
}

export function decodeTextMessagePayload(payload: Uint8Array): SentText {
  if (payload[0] !== CMD_SEND_TXT_MSG) {
    throw new RangeError(`not a CMD_SEND_TXT_MSG payload: ${payload[0]}`);
  }
  let keyPrefix = "";
  for (const byte of payload.subarray(7, 13)) {
    keyPrefix += byte.toString(16).padStart(2, "0");
  }
  return {
    txtType: payload[1] ?? 0,
    attempt: payload[2] ?? 0,
    timestamp: readU32(payload, 3),
    keyPrefix,
    text: new TextDecoder().decode(payload.subarray(13)),
  };
}

// A scripted companion: answers the commands P0-04 to P0-06 send. Its clock starts at
// `time` and only moves forward, as the firmware's does. Every text message it is handed is
// recorded in `sends`; `onSendText` decides the answer (default: SENT with ack 0x1000 + n and
// the ack push right behind it, i.e. a delivered message). Received messages queue in
// `messages` (frames from contactMessageV*Frame / channelMessageV*Frame); each
// CMD_SYNC_NEXT_MESSAGE hands out the oldest, or NO_MORE_MESSAGES when the queue is empty,
// and `syncs` counts those commands. The MSG_WAITING push the firmware sends when a message
// lands is the test's to push on the transport (msgWaitingFrame()).
export interface ScriptedCompanion {
  reply: (payload: Uint8Array) => Uint8Array[];
  contacts: Uint8Array[];
  time: number;
  name: string;
  // When true every command is answered with ERR (a device that is not a companion).
  broken: boolean;
  sends: SentText[];
  onSendText: (sent: SentText, index: number) => Uint8Array[];
  messages: Uint8Array[];
  syncs: number;
}

export const FIRST_ACK = 0x1000;
export const EST_TIMEOUT_MS = 1500;

export function deliveredReply(sent: SentText, index: number): Uint8Array[] {
  return [sentFrame(false, FIRST_ACK + index, EST_TIMEOUT_MS), ackFrame(FIRST_ACK + index, 800)];
}

export function sentOnlyReply(sent: SentText, index: number): Uint8Array[] {
  return [sentFrame(false, FIRST_ACK + index, EST_TIMEOUT_MS)];
}

export function scriptedCompanion(
  options: {
    contacts?: Uint8Array[];
    time?: number;
    name?: string;
    onSendText?: (sent: SentText, index: number) => Uint8Array[];
  } = {},
): ScriptedCompanion {
  const companion: ScriptedCompanion = {
    contacts: options.contacts ?? [contactFrame(), contactFrame({ publicKey: PETER_KEY, name: "Peter" })],
    time: options.time ?? EPOCH,
    name: options.name ?? "Stab 1",
    broken: false,
    sends: [],
    onSendText: options.onSendText ?? deliveredReply,
    messages: [],
    syncs: 0,
    reply: (payload: Uint8Array): Uint8Array[] => {
      if (companion.broken) {
        return [errFrame(1)];
      }
      switch (payload[0]) {
        case CMD_SEND_TXT_MSG: {
          const sent = decodeTextMessagePayload(payload);
          const index = companion.sends.length;
          companion.sends.push(sent);
          return companion.onSendText(sent, index);
        }
        case CMD_SYNC_NEXT_MESSAGE: {
          companion.syncs += 1;
          const next = companion.messages.shift();
          return [next ?? noMoreMessagesFrame()];
        }
        case CMD_DEVICE_QUERY:
          return [deviceInfoFrame()];
        case CMD_APP_START:
          return [selfInfoFrame({ name: companion.name })];
        case CMD_GET_DEVICE_TIME:
          return [currTimeFrame(companion.time)];
        case CMD_SET_DEVICE_TIME: {
          const requested = readU32(payload, 1);
          if (requested > companion.time) {
            companion.time = requested;
          }
          return [okFrame()];
        }
        case CMD_GET_CONTACTS:
          return [contactsStartFrame(companion.contacts.length), ...companion.contacts, endOfContactsFrame()];
        default:
          return [errFrame(1)];
      }
    },
  };
  return companion;
}
