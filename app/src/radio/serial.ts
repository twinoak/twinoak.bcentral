// MeshCore companion protocol: constants, frame helpers, parsers, payload builders, the
// CompanionLink that runs commands over a frame transport, and the Web Serial transport.
// The Web Bluetooth transport is in ble.ts; both hand the link whole frames.
//
// Lineage: the public names follow meshguide.dk/lib/serial.js, which this file was meant to
// be a port of. The session that wrote it could not read that checkout, so the byte layouts
// below are written out per field from the MeshCore firmware's companion protocol
// (MyMesh.cpp / SerialInterface.cpp) and must be reconciled against meshguide before the
// package extraction (see tasks/phase-0/reports/P0-04.md). BCentral only talks to
// companions, so the text-CLI parts of the original are not here.
//
// Wire format over serial: one frame is a direction byte ('<' app → radio, '>' radio → app),
// a little-endian uint16 length, then that many payload bytes. Over BLE each notification or
// write is one payload. The first payload byte is the command, response or push code; codes
// >= 0x80 are pushes (unsolicited), everything below answers the last command.

import { deferred, type Deferred } from "./deferred.ts";

// --- constants ----------------------------------------------------------------------------

// A MeshCore text message is at most 160 bytes of UTF-8 (BaseChatMesh.h).
export const MAX_TEXT_LEN = 160;

// Largest frame the firmware's serial interface accepts or emits (SerialInterface.h).
export const MAX_FRAME_LEN = 172;

export const SERIAL_BAUD_RATE = 115200;
export const FRAME_TO_RADIO = 0x3c; // '<'
export const FRAME_FROM_RADIO = 0x3e; // '>'

// The companion-protocol version this app speaks; the firmware answers with v3 message
// frames (RESP_CODE_*_V3) once it has seen this in CMD_DEVICE_QUERY / CMD_APP_START.
export const APP_TARGET_VER = 3;

// Commands, app → companion.
export const CMD_APP_START = 1;
export const CMD_SEND_TXT_MSG = 2;
export const CMD_SEND_CHANNEL_TXT_MSG = 3;
export const CMD_GET_CONTACTS = 4;
export const CMD_GET_DEVICE_TIME = 5;
export const CMD_SET_DEVICE_TIME = 6;
export const CMD_SEND_SELF_ADVERT = 7;
export const CMD_SET_ADVERT_NAME = 8;
export const CMD_ADD_UPDATE_CONTACT = 9;
export const CMD_SYNC_NEXT_MESSAGE = 10;
export const CMD_SET_RADIO_PARAMS = 11;
export const CMD_SET_RADIO_TX_POWER = 12;
export const CMD_RESET_PATH = 13;
export const CMD_SET_ADVERT_LATLON = 14;
export const CMD_REMOVE_CONTACT = 15;
export const CMD_SHARE_CONTACT = 16;
export const CMD_EXPORT_CONTACT = 17;
export const CMD_IMPORT_CONTACT = 18;
export const CMD_REBOOT = 19;
export const CMD_GET_BATT_AND_STORAGE = 20;
export const CMD_SET_TUNING_PARAMS = 21;
export const CMD_DEVICE_QUERY = 22;

// Responses, companion → app, to the last command.
export const RESP_CODE_OK = 0;
export const RESP_CODE_ERR = 1;
export const RESP_CODE_CONTACTS_START = 2;
export const RESP_CODE_CONTACT = 3;
export const RESP_CODE_END_OF_CONTACTS = 4;
export const RESP_CODE_SELF_INFO = 5;
export const RESP_CODE_SENT = 6;
export const RESP_CODE_CONTACT_MSG_RECV = 7;
export const RESP_CODE_CHANNEL_MSG_RECV = 8;
export const RESP_CODE_CURR_TIME = 9;
export const RESP_CODE_NO_MORE_MESSAGES = 10;
export const RESP_CODE_EXPORT_CONTACT = 11;
export const RESP_CODE_BATT_AND_STORAGE = 12;
export const RESP_CODE_DEVICE_INFO = 13;
export const RESP_CODE_PRIVATE_KEY = 14;
export const RESP_CODE_DISABLED = 15;
export const RESP_CODE_CONTACT_MSG_RECV_V3 = 16;
export const RESP_CODE_CHANNEL_MSG_RECV_V3 = 17;

// Pushes, companion → app, unsolicited. Everything >= 0x80.
export const PUSH_CODE_ADVERT = 0x80;
export const PUSH_CODE_PATH_UPDATED = 0x81;
export const PUSH_CODE_SEND_CONFIRMED = 0x82;
export const PUSH_CODE_MSG_WAITING = 0x83;
export const PUSH_CODE_RAW_DATA = 0x84;
export const PUSH_CODE_LOGIN_SUCCESS = 0x85;
export const PUSH_CODE_LOGIN_FAIL = 0x86;
export const PUSH_CODE_STATUS_RESPONSE = 0x87;
export const PUSH_CODE_LOG_RX_DATA = 0x88;
export const PUSH_CODE_TRACE_DATA = 0x89;
export const PUSH_CODE_NEW_ADVERT = 0x8a;
export const PUSH_CODE_FIRST = 0x80;

// Error codes in the second byte of RESP_CODE_ERR (optional; older firmware sends none).
export const ERR_CODE_UNSUPPORTED_CMD = 1;
export const ERR_CODE_NOT_FOUND = 2;
export const ERR_CODE_TABLE_FULL = 3;
export const ERR_CODE_BAD_STATE = 4;
export const ERR_CODE_FILE_IO_ERROR = 5;
export const ERR_CODE_ILLEGAL_ARG = 6;

// Text types in CMD_SEND_TXT_MSG and the message frames.
export const TXT_TYPE_PLAIN = 0;
export const TXT_TYPE_CLI_DATA = 1;
export const TXT_TYPE_SIGNED_PLAIN = 2;

// Contact / advert types.
export const ADV_TYPE_NONE = 0;
export const ADV_TYPE_CHAT = 1;
export const ADV_TYPE_REPEATER = 2;
export const ADV_TYPE_ROOM = 3;
export const ADV_TYPE_SENSOR = 4;

export const PUB_KEY_SIZE = 32;
export const PUB_KEY_PREFIX_SIZE = 6;
export const MAX_PATH_SIZE = 64;
export const CONTACT_NAME_SIZE = 32;

export const DEFAULT_TIMEOUT_MS = 3000;

// --- byte helpers -------------------------------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new RangeError(`not a hex string: ${hex}`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function hexCode(code: number | undefined): string {
  return `0x${(code ?? 0).toString(16).padStart(2, "0")}`;
}

export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) {
    return b;
  }
  if (b.length === 0) {
    return a;
  }
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function dataView(frame: Uint8Array): DataView {
  return new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
}

function u32le(value: number): Uint8Array {
  const out = new Uint8Array(4);
  dataView(out).setUint32(0, value >>> 0, true);
  return out;
}

// A NUL-terminated string in a fixed or open-ended field.
function cString(frame: Uint8Array, start: number, end: number = frame.length): string {
  let stop = start;
  while (stop < end && frame[stop] !== 0) {
    stop++;
  }
  return decoder.decode(frame.subarray(start, stop));
}

function byteAt(frame: Uint8Array, index: number): number {
  return frame[index] ?? 0;
}

function expectCode(frame: Uint8Array, codes: readonly number[], parser: string): void {
  const code = frame[0];
  if (code === undefined || !codes.includes(code)) {
    throw new RangeError(`${parser}: unexpected code ${hexCode(code)}`);
  }
}

function expectLength(frame: Uint8Array, min: number, parser: string): void {
  if (frame.length < min) {
    throw new RangeError(`${parser}: frame is ${frame.length} bytes, need ${min}`);
  }
}

// --- frame helpers ------------------------------------------------------------------------

// Wraps a payload for the serial port: '<', uint16 LE length, payload.
export function serialFrame(payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_FRAME_LEN) {
    throw new RangeError(`payload is ${payload.length} bytes, max ${MAX_FRAME_LEN}`);
  }
  const out = new Uint8Array(3 + payload.length);
  out[0] = FRAME_TO_RADIO;
  out[1] = payload.length & 0xff;
  out[2] = payload.length >> 8;
  out.set(payload, 3);
  return out;
}

export interface ExtractedFrames {
  frames: Uint8Array[];
  // Bytes not yet forming a whole frame; prepend them to the next chunk.
  rest: Uint8Array;
}

// Pulls every complete '>'-frame out of a byte stream. Bytes before a marker are skipped
// (boot noise, CLI output); a length above MAX_FRAME_LEN is treated as a false marker and
// scanning resumes at the next byte. Copies each frame so it does not alias the stream.
export function extractFrames(bytes: Uint8Array): ExtractedFrames {
  const frames: Uint8Array[] = [];
  let pos = 0;
  for (;;) {
    while (pos < bytes.length && bytes[pos] !== FRAME_FROM_RADIO) {
      pos++;
    }
    if (pos + 3 > bytes.length) {
      break;
    }
    const length = byteAt(bytes, pos + 1) | (byteAt(bytes, pos + 2) << 8);
    if (length > MAX_FRAME_LEN) {
      pos++;
      continue;
    }
    if (pos + 3 + length > bytes.length) {
      break;
    }
    frames.push(bytes.slice(pos + 3, pos + 3 + length));
    pos += 3 + length;
  }
  return { frames, rest: bytes.slice(pos) };
}

// --- payload builders (app → companion) ---------------------------------------------------

// CMD_APP_START: code, app version, 6 reserved bytes, app name.
export function appStartPayload(appName: string, appVersion: number = APP_TARGET_VER): Uint8Array {
  const name = encoder.encode(appName);
  const out = new Uint8Array(8 + name.length);
  out[0] = CMD_APP_START;
  out[1] = appVersion;
  out.set(name, 8);
  return out;
}

// CMD_DEVICE_QUERY: code, the protocol version the app wants.
export function deviceQueryPayload(appVersion: number = APP_TARGET_VER): Uint8Array {
  return Uint8Array.of(CMD_DEVICE_QUERY, appVersion);
}

// CMD_GET_CONTACTS: code, optionally uint32 "only contacts modified since" (epoch seconds).
export function getContactsPayload(since?: number): Uint8Array {
  if (since === undefined) {
    return Uint8Array.of(CMD_GET_CONTACTS);
  }
  return concatBytes(Uint8Array.of(CMD_GET_CONTACTS), u32le(since));
}

export function getTimePayload(): Uint8Array {
  return Uint8Array.of(CMD_GET_DEVICE_TIME);
}

// CMD_SET_DEVICE_TIME: code, uint32 epoch seconds.
export function setTimePayload(epochSeconds: number): Uint8Array {
  return concatBytes(Uint8Array.of(CMD_SET_DEVICE_TIME), u32le(epochSeconds));
}

export function syncNextMessagePayload(): Uint8Array {
  return Uint8Array.of(CMD_SYNC_NEXT_MESSAGE);
}

export interface TextMessageOptions {
  txtType?: number;
  // 0 for the first try; a resend carries attempt + 1 and the same timestamp.
  attempt?: number;
  // Sender timestamp, epoch seconds; part of the message's identity on the mesh.
  timestamp: number;
}

// CMD_SEND_TXT_MSG: code, txt type, attempt, uint32 timestamp, 6-byte public key prefix,
// text. Refuses a text over MAX_TEXT_LEN bytes of UTF-8 (the app counts bytes, not
// characters; contract/text-protocol.md).
export function textMessagePayload(
  publicKey: string,
  text: string,
  options: TextMessageOptions,
): Uint8Array {
  const key = fromHex(publicKey);
  if (key.length !== PUB_KEY_SIZE) {
    throw new RangeError(`public key is ${key.length} bytes, need ${PUB_KEY_SIZE}`);
  }
  const body = encoder.encode(text);
  if (body.length > MAX_TEXT_LEN) {
    throw new RangeError(`text is ${body.length} bytes of UTF-8, max ${MAX_TEXT_LEN}`);
  }
  const out = new Uint8Array(3 + 4 + PUB_KEY_PREFIX_SIZE + body.length);
  out[0] = CMD_SEND_TXT_MSG;
  out[1] = options.txtType ?? TXT_TYPE_PLAIN;
  out[2] = options.attempt ?? 0;
  out.set(u32le(options.timestamp), 3);
  out.set(key.subarray(0, PUB_KEY_PREFIX_SIZE), 7);
  out.set(body, 13);
  return out;
}

// --- parsers (companion → app) ------------------------------------------------------------

export interface SelfInfo {
  advType: number;
  txPower: number;
  maxTxPower: number;
  // 32 bytes as lowercase hex (contract: publicKey).
  publicKey: string;
  lat: number;
  lon: number;
  radioFreqKhz: number;
  radioBwHz: number;
  radioSf: number;
  radioCr: number;
  name: string;
}

// RESP_CODE_SELF_INFO layout:
//   0      code
//   1      adv type
//   2      tx power (dBm)
//   3      max tx power
//   4..36  public key
//   36..40 int32 lat * 1e6
//   40..44 int32 lon * 1e6
//   44..47 three single-byte prefs (reserved / manual add contacts), not used here
//   47..51 uint32 frequency in kHz
//   51..55 uint32 bandwidth in Hz
//   55     spreading factor
//   56     coding rate
//   57..   node name, NUL-terminated or to the end of the frame
export const SELF_INFO_MIN_LEN = 57;

export function parseSelfInfo(frame: Uint8Array): SelfInfo {
  expectCode(frame, [RESP_CODE_SELF_INFO], "parseSelfInfo");
  expectLength(frame, SELF_INFO_MIN_LEN, "parseSelfInfo");
  const view = dataView(frame);
  return {
    advType: byteAt(frame, 1),
    txPower: byteAt(frame, 2),
    maxTxPower: byteAt(frame, 3),
    publicKey: toHex(frame.subarray(4, 4 + PUB_KEY_SIZE)),
    lat: view.getInt32(36, true) / 1e6,
    lon: view.getInt32(40, true) / 1e6,
    radioFreqKhz: view.getUint32(47, true),
    radioBwHz: view.getUint32(51, true),
    radioSf: byteAt(frame, 55),
    radioCr: byteAt(frame, 56),
    name: cString(frame, 57),
  };
}

export interface DeviceInfo {
  firmwareVer: number;
  maxContacts: number;
  maxGroupChannels: number;
  blePin: number;
  firmwareBuildDate: string;
  manufacturerModel: string;
  firmwareVersion: string;
}

// RESP_CODE_DEVICE_INFO layout:
//   0      code
//   1      firmware protocol version
//   2      max contacts / 2
//   3      max group channels
//   4..8   uint32 BLE pin
//   8..20  firmware build date, e.g. "19 Feb 2025"
//   20..60 manufacturer / board model
//   60..   firmware version string, e.g. "v1.7.1"
// Firmware older than protocol 3 answers with fewer bytes; missing fields read as 0 / "".
export function parseDeviceInfo(frame: Uint8Array): DeviceInfo {
  expectCode(frame, [RESP_CODE_DEVICE_INFO], "parseDeviceInfo");
  expectLength(frame, 2, "parseDeviceInfo");
  const view = dataView(frame);
  return {
    firmwareVer: byteAt(frame, 1),
    maxContacts: byteAt(frame, 2) * 2,
    maxGroupChannels: byteAt(frame, 3),
    blePin: frame.length >= 8 ? view.getUint32(4, true) : 0,
    firmwareBuildDate: frame.length > 8 ? cString(frame, 8, 20) : "",
    manufacturerModel: frame.length > 20 ? cString(frame, 20, 60) : "",
    firmwareVersion: frame.length > 60 ? cString(frame, 60) : "",
  };
}

export interface CompanionContact {
  // 32 bytes as lowercase hex (contract: publicKey).
  publicKey: string;
  type: number;
  flags: number;
  // -1 means "flood", otherwise the number of hops in outPath.
  outPathLen: number;
  // The used part of the stored path, as hex.
  outPath: string;
  name: string;
  // Epoch seconds of the last advert heard from this contact; 0 when never.
  lastAdvert: number;
  lat: number;
  lon: number;
  // Epoch seconds of the last change to this contact on the companion.
  lastMod: number;
}

// RESP_CODE_CONTACT (and PUSH_CODE_NEW_ADVERT) layout:
//   0        code
//   1..33    public key
//   33       type
//   34       flags
//   35       int8 out path length (-1 = flood)
//   36..100  out path (64 bytes, only the first outPathLen used)
//   100..132 name, NUL-terminated
//   132..136 uint32 last advert timestamp
//   136..140 int32 lat * 1e6
//   140..144 int32 lon * 1e6
//   144..148 uint32 last modified
export const CONTACT_FRAME_LEN = 148;

export function parseContact(frame: Uint8Array): CompanionContact {
  expectCode(frame, [RESP_CODE_CONTACT, PUSH_CODE_NEW_ADVERT], "parseContact");
  expectLength(frame, CONTACT_FRAME_LEN, "parseContact");
  const view = dataView(frame);
  const outPathLen = view.getInt8(35);
  const usedPath = Math.min(Math.max(outPathLen, 0), MAX_PATH_SIZE);
  return {
    publicKey: toHex(frame.subarray(1, 1 + PUB_KEY_SIZE)),
    type: byteAt(frame, 33),
    flags: byteAt(frame, 34),
    outPathLen,
    outPath: toHex(frame.subarray(36, 36 + usedPath)),
    name: cString(frame, 100, 100 + CONTACT_NAME_SIZE),
    lastAdvert: view.getUint32(132, true),
    lat: view.getInt32(136, true) / 1e6,
    lon: view.getInt32(140, true) / 1e6,
    lastMod: view.getUint32(144, true),
  };
}

// RESP_CODE_CONTACTS_START: code, uint32 number of contacts to follow.
export function parseContactsStart(frame: Uint8Array): number {
  expectCode(frame, [RESP_CODE_CONTACTS_START], "parseContactsStart");
  return frame.length >= 5 ? dataView(frame).getUint32(1, true) : 0;
}

export interface ContactMessage {
  version: 1 | 3;
  // Signal-to-noise ratio in dB; only in v3 frames.
  snr: number | null;
  // First 6 bytes of the sender's public key, as hex.
  pubKeyPrefix: string;
  pathLen: number;
  txtType: number;
  // The sender's timestamp, epoch seconds (part of the dedupe key, contract).
  senderTimestamp: number;
  // The text as received. For TXT_TYPE_SIGNED_PLAIN the first 4 bytes are a signature
  // prefix; nothing in BCentral sends that type.
  text: string;
}

// RESP_CODE_CONTACT_MSG_RECV (v1) layout:
//   0      code
//   1..7   sender public key prefix
//   7      path length
//   8      txt type
//   9..13  uint32 sender timestamp
//   13..   text
// RESP_CODE_CONTACT_MSG_RECV_V3 layout:
//   0      code
//   1      int8 SNR * 4
//   2..4   reserved
//   4..10  sender public key prefix
//   10     path length
//   11     txt type
//   12..16 uint32 sender timestamp
//   16..   text
export function parseContactMessage(frame: Uint8Array): ContactMessage {
  expectCode(
    frame,
    [RESP_CODE_CONTACT_MSG_RECV, RESP_CODE_CONTACT_MSG_RECV_V3],
    "parseContactMessage",
  );
  const view = dataView(frame);
  if (frame[0] === RESP_CODE_CONTACT_MSG_RECV_V3) {
    expectLength(frame, 16, "parseContactMessage");
    return {
      version: 3,
      snr: view.getInt8(1) / 4,
      pubKeyPrefix: toHex(frame.subarray(4, 10)),
      pathLen: byteAt(frame, 10),
      txtType: byteAt(frame, 11),
      senderTimestamp: view.getUint32(12, true),
      text: decoder.decode(frame.subarray(16)),
    };
  }
  expectLength(frame, 13, "parseContactMessage");
  return {
    version: 1,
    snr: null,
    pubKeyPrefix: toHex(frame.subarray(1, 7)),
    pathLen: byteAt(frame, 7),
    txtType: byteAt(frame, 8),
    senderTimestamp: view.getUint32(9, true),
    text: decoder.decode(frame.subarray(13)),
  };
}

export interface Sent {
  // true when the companion had no path and flooded the message.
  isFlood: boolean;
  // The ack code a PUSH_CODE_SEND_CONFIRMED will carry for this message.
  expectedAck: number;
  // The companion's estimate of how long the ack may take.
  estTimeoutMs: number;
}

// RESP_CODE_SENT layout: code, flood flag, uint32 expected ack, uint32 estimated timeout.
export function parseSent(frame: Uint8Array): Sent {
  expectCode(frame, [RESP_CODE_SENT], "parseSent");
  expectLength(frame, 10, "parseSent");
  const view = dataView(frame);
  return {
    isFlood: byteAt(frame, 1) !== 0,
    expectedAck: view.getUint32(2, true),
    estTimeoutMs: view.getUint32(6, true),
  };
}

export interface Ack {
  ackCode: number;
  roundTripMs: number;
}

// PUSH_CODE_SEND_CONFIRMED layout: code, uint32 ack code, uint32 round trip in ms.
export function parseAck(frame: Uint8Array): Ack {
  expectCode(frame, [PUSH_CODE_SEND_CONFIRMED], "parseAck");
  expectLength(frame, 9, "parseAck");
  const view = dataView(frame);
  return { ackCode: view.getUint32(1, true), roundTripMs: view.getUint32(5, true) };
}

// RESP_CODE_CURR_TIME layout: code, uint32 epoch seconds.
export function parseCurrTime(frame: Uint8Array): number {
  expectCode(frame, [RESP_CODE_CURR_TIME], "parseCurrTime");
  expectLength(frame, 5, "parseCurrTime");
  return dataView(frame).getUint32(1, true);
}

// RESP_CODE_ERR layout: code, optional error code.
export function parseErr(frame: Uint8Array): number | null {
  expectCode(frame, [RESP_CODE_ERR], "parseErr");
  return frame.length >= 2 ? byteAt(frame, 1) : null;
}

export function isPushCode(code: number | undefined): boolean {
  return code !== undefined && code >= PUSH_CODE_FIRST;
}

// --- transport ----------------------------------------------------------------------------

export type TransportKind = "usb" | "ble";

// What CompanionLink needs from a transport: whole payloads in and out. receiveFrame()
// resolves with the next payload, or null once the transport is closed (by disconnect() or
// by the device going away); it never times out by itself.
export interface FrameTransport {
  readonly kind: TransportKind;
  onLog: (line: string) => void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendFrame(payload: Uint8Array): Promise<void>;
  receiveFrame(): Promise<Uint8Array | null>;
}

// --- companion link -----------------------------------------------------------------------

export class CompanionError extends Error {
  readonly code: number | null;
  constructor(code: number | null) {
    super(code === null ? "companion answered ERR" : `companion answered ERR ${code}`);
    this.name = "CompanionError";
    this.code = code;
  }
}

export class CompanionTimeoutError extends Error {
  constructor(expected: readonly number[], timeoutMs: number) {
    super(`no ${expected.map(hexCode).join("/")} within ${timeoutMs} ms`);
    this.name = "CompanionTimeoutError";
  }
}

export class CompanionClosedError extends Error {
  constructor() {
    super("the companion link is closed");
    this.name = "CompanionClosedError";
  }
}

export interface CompanionLinkOptions {
  onLog?: (line: string) => void;
  // Every frame the companion sends, pushes and responses alike; the blind timer hangs on it.
  onFrame?: (frame: Uint8Array) => void;
  // Push frames only (code >= 0x80). They also land in `inbox`.
  onPush?: (frame: Uint8Array) => void;
  // The transport has closed; no more frames will come.
  onClosed?: () => void;
  // How many pushes the inbox keeps when nobody drains it; the oldest are dropped.
  inboxLimit?: number;
}

export const DEFAULT_INBOX_LIMIT = 100;

// One command at a time over one transport. start() runs the read loop: pushes go to the
// inbox (and onPush), responses to whoever is waiting in awaitResponse(). A response that
// nobody waits for is logged and dropped, so a late answer never becomes the next command's.
export class CompanionLink {
  readonly transport: FrameTransport;
  readonly inbox: Uint8Array[] = [];
  private readonly options: CompanionLinkOptions;
  private readonly responses: Uint8Array[] = [];
  private waiter: Deferred<void> | null = null;
  private closed = false;
  private started = false;
  private locked = false;
  private unlocked: Deferred<void> = deferred<void>();

  constructor(transport: FrameTransport, options: CompanionLinkOptions = {}) {
    this.transport = transport;
    this.options = options;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  // Starts the read loop; returns at once.
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    void this.run();
  }

  private log(line: string): void {
    this.options.onLog?.(line);
  }

  private async run(): Promise<void> {
    for (;;) {
      let frame: Uint8Array | null;
      try {
        frame = await this.transport.receiveFrame();
      } catch (error) {
        this.log(`receive failed: ${describeError(error)}`);
        frame = null;
      }
      if (frame === null) {
        break;
      }
      this.handleFrame(frame);
    }
    this.closed = true;
    this.wake();
    this.options.onClosed?.();
  }

  // Also the entry point for tests that feed frames without a transport loop.
  handleFrame(frame: Uint8Array): void {
    if (frame.length === 0) {
      return;
    }
    this.options.onFrame?.(frame);
    if (isPushCode(frame[0])) {
      this.inbox.push(frame);
      const limit = this.options.inboxLimit ?? DEFAULT_INBOX_LIMIT;
      while (this.inbox.length > limit) {
        this.inbox.shift();
      }
      this.options.onPush?.(frame);
      return;
    }
    this.responses.push(frame);
    this.wake();
  }

  private wake(): void {
    this.waiter?.resolve();
  }

  private async waitForFrame(timeoutMs: number): Promise<void> {
    const waiter = deferred<void>();
    this.waiter = waiter;
    const timer = setTimeout(() => waiter.resolve(), timeoutMs);
    try {
      await waiter.promise;
    } finally {
      clearTimeout(timer);
      if (this.waiter === waiter) {
        this.waiter = null;
      }
    }
  }

  // Serialises command exchanges: the holder may send and await several frames (the contact
  // list is one command and many responses). Always pair with release().
  async acquire(): Promise<void> {
    while (this.locked) {
      await this.unlocked.promise;
    }
    this.locked = true;
    this.unlocked = deferred<void>();
  }

  release(): void {
    this.locked = false;
    this.unlocked.resolve();
  }

  // Sends one payload. Responses still queued from an earlier exchange are dropped first.
  async sendFrame(payload: Uint8Array): Promise<void> {
    if (this.closed) {
      throw new CompanionClosedError();
    }
    this.responses.length = 0;
    await this.transport.sendFrame(payload);
  }

  // Waits for the next response whose code is in `expected`. RESP_CODE_ERR throws
  // CompanionError; other responses are logged and skipped; pushes never count (the read
  // loop routes them to the inbox before they get here).
  async awaitResponse(
    expected: readonly number[],
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (this.responses.length > 0) {
        const frame = this.responses.shift();
        if (frame === undefined) {
          break;
        }
        const code = frame[0];
        if (code !== undefined && expected.includes(code)) {
          return frame;
        }
        if (code === RESP_CODE_ERR) {
          throw new CompanionError(parseErr(frame));
        }
        this.log(`dropped unexpected response ${hexCode(code)} (${frame.length} bytes)`);
      }
      if (this.closed) {
        throw new CompanionClosedError();
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new CompanionTimeoutError(expected, timeoutMs);
      }
      await this.waitForFrame(remaining);
    }
  }

  // One command, one response: send, then wait for one of the expected codes.
  async companionCommand(
    payload: Uint8Array,
    expected: readonly number[],
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<Uint8Array> {
    await this.acquire();
    try {
      await this.sendFrame(payload);
      return await this.awaitResponse(expected, timeoutMs);
    } finally {
      this.release();
    }
  }

  async close(): Promise<void> {
    await this.transport.disconnect();
  }
}

// --- companion operations -----------------------------------------------------------------

export interface CompanionIdentity {
  // null when the firmware predates CMD_DEVICE_QUERY and answered ERR.
  device: DeviceInfo | null;
  self: SelfInfo;
}

// Who the companion is: device query first (so the firmware knows the protocol version we
// speak), then app start for the self info.
export async function companionQuery(
  link: CompanionLink,
  appName: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<CompanionIdentity> {
  let device: DeviceInfo | null = null;
  try {
    const frame = await link.companionCommand(
      deviceQueryPayload(),
      [RESP_CODE_DEVICE_INFO],
      timeoutMs,
    );
    device = parseDeviceInfo(frame);
  } catch (error) {
    if (!(error instanceof CompanionError)) {
      throw error;
    }
  }
  const frame = await link.companionCommand(
    appStartPayload(appName),
    [RESP_CODE_SELF_INFO],
    timeoutMs,
  );
  return { device, self: parseSelfInfo(frame) };
}

export async function companionGetTime(
  link: CompanionLink,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<number> {
  const frame = await link.companionCommand(getTimePayload(), [RESP_CODE_CURR_TIME], timeoutMs);
  return parseCurrTime(frame);
}

export interface SetTimeResult {
  // The companion's clock before, what we sent, and what it reads afterwards, epoch seconds.
  before: number;
  requested: number;
  after: number;
}

// Sets the companion's clock and reads it back. The companion's clock only moves forward: a
// set that would turn it back is ignored by the firmware, which is why `after` is reported
// rather than assumed. The caller logs the result.
export async function companionSetTime(
  link: CompanionLink,
  epochSeconds: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<SetTimeResult> {
  const before = await companionGetTime(link, timeoutMs);
  await link.companionCommand(setTimePayload(epochSeconds), [RESP_CODE_OK], timeoutMs);
  const after = await companionGetTime(link, timeoutMs);
  return { before, requested: epochSeconds, after };
}

// The companion's whole contact list: CONTACTS_START, then one CONTACT per entry, then
// END_OF_CONTACTS. Holds the link for the whole stream.
export async function companionGetContacts(
  link: CompanionLink,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<CompanionContact[]> {
  const contacts: CompanionContact[] = [];
  await link.acquire();
  try {
    await link.sendFrame(getContactsPayload());
    await link.awaitResponse([RESP_CODE_CONTACTS_START], timeoutMs);
    for (;;) {
      const frame = await link.awaitResponse(
        [RESP_CODE_CONTACT, RESP_CODE_END_OF_CONTACTS],
        timeoutMs,
      );
      if (frame[0] === RESP_CODE_END_OF_CONTACTS) {
        break;
      }
      contacts.push(parseContact(frame));
    }
  } finally {
    link.release();
  }
  return contacts;
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// --- Web Serial transport -----------------------------------------------------------------

// A MeshCore companion on a USB serial port. connect() shows the browser's port chooser.
export class MeshCoreSerial implements FrameTransport {
  readonly kind: TransportKind = "usb";
  onLog: (line: string) => void = () => undefined;
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private buffer: Uint8Array = new Uint8Array(0);
  private readonly frames: Uint8Array[] = [];

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && navigator.serial !== undefined;
  }

  async connect(): Promise<void> {
    const serial = typeof navigator === "undefined" ? undefined : navigator.serial;
    if (serial === undefined) {
      throw new Error("Web Serial is not available in this browser");
    }
    const port = await serial.requestPort();
    await port.open({ baudRate: SERIAL_BAUD_RATE });
    if (port.readable === null || port.writable === null) {
      await port.close();
      throw new Error("the serial port opened without streams");
    }
    this.port = port;
    this.reader = port.readable.getReader();
    this.writer = port.writable.getWriter();
    const info = port.getInfo();
    this.onLog(
      `serial: port open at ${SERIAL_BAUD_RATE} baud` +
        (info.usbVendorId === undefined
          ? ""
          : ` (USB ${hexCode(info.usbVendorId)}:${hexCode(info.usbProductId)})`),
    );
  }

  async disconnect(): Promise<void> {
    const { port, reader, writer } = this;
    this.port = null;
    this.reader = null;
    this.writer = null;
    if (reader !== null) {
      try {
        await reader.cancel();
      } catch (error) {
        this.onLog(`serial: cancel failed: ${describeError(error)}`);
      }
      try {
        reader.releaseLock();
      } catch {
        // Already released by the stream erroring; nothing to do.
      }
    }
    if (writer !== null) {
      try {
        writer.releaseLock();
      } catch {
        // Same as above.
      }
    }
    if (port !== null) {
      try {
        await port.close();
        this.onLog("serial: port closed");
      } catch (error) {
        this.onLog(`serial: close failed: ${describeError(error)}`);
      }
    }
  }

  async sendFrame(payload: Uint8Array): Promise<void> {
    const writer = this.writer;
    if (writer === null) {
      throw new CompanionClosedError();
    }
    await writer.write(serialFrame(payload));
  }

  async receiveFrame(): Promise<Uint8Array | null> {
    while (this.frames.length === 0) {
      const reader = this.reader;
      if (reader === null) {
        return null;
      }
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (error) {
        // The device went away (unplugged) or the stream errored; the link closes.
        this.onLog(`serial: read failed: ${describeError(error)}`);
        return null;
      }
      if (result.done) {
        return null;
      }
      const extracted = extractFrames(concatBytes(this.buffer, result.value));
      this.buffer = extracted.rest;
      this.frames.push(...extracted.frames);
    }
    return this.frames.shift() ?? null;
  }
}
