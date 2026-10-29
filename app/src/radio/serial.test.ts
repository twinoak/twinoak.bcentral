import { describe, expect, it, vi } from "vitest";
import {
  CMD_APP_START,
  CMD_DEVICE_QUERY,
  CMD_GET_CONTACTS,
  CMD_GET_DEVICE_TIME,
  CMD_SEND_TXT_MSG,
  CMD_SET_DEVICE_TIME,
  CompanionClosedError,
  CompanionError,
  CompanionLink,
  CompanionTimeoutError,
  MAX_FRAME_LEN,
  MAX_TEXT_LEN,
  PUSH_CODE_ADVERT,
  PUSH_CODE_MSG_WAITING,
  RESP_CODE_CURR_TIME,
  RESP_CODE_DEVICE_INFO,
  RESP_CODE_OK,
  RESP_CODE_SELF_INFO,
  TXT_TYPE_PLAIN,
  appStartPayload,
  companionGetContacts,
  companionQuery,
  companionSetTime,
  concatBytes,
  deviceQueryPayload,
  extractFrames,
  fromHex,
  getContactsPayload,
  getTimePayload,
  parseAck,
  parseContact,
  parseContactMessage,
  parseContactsStart,
  parseCurrTime,
  parseDeviceInfo,
  parseErr,
  parseSelfInfo,
  parseSent,
  serialFrame,
  setTimePayload,
  textMessagePayload,
  toHex,
} from "./serial.ts";
import { FakeTransport } from "../test-support/fakeTransport.ts";
import {
  EPOCH,
  HANS_KEY,
  PETER_KEY,
  STAFF_KEY,
  ackFrame,
  bytes,
  contactFrame,
  contactMessageV1Frame,
  contactMessageV3Frame,
  contactsStartFrame,
  currTimeFrame,
  deviceInfoFrame,
  endOfContactsFrame,
  errFrame,
  fromRadio,
  okFrame,
  scriptedCompanion,
  selfInfoFrame,
  sentFrame,
  text,
  u32,
} from "../test-support/companionFrames.ts";

const A = bytes(RESP_CODE_OK);
const B = currTimeFrame(EPOCH);

describe("hex helpers", () => {
  it("round-trips", () => {
    expect(toHex(fromHex(STAFF_KEY))).toBe(STAFF_KEY);
    expect(toHex(bytes(0, 15, 255))).toBe("000fff");
    expect(() => fromHex("abc")).toThrow(RangeError);
    expect(() => fromHex("zz")).toThrow(RangeError);
  });
});

describe("serialFrame", () => {
  it("prefixes '<' and a little-endian length", () => {
    expect([...serialFrame(bytes(1, 2, 3))]).toEqual([0x3c, 3, 0, 1, 2, 3]);
    expect([...serialFrame(new Uint8Array(0))]).toEqual([0x3c, 0, 0]);
  });

  it("refuses a payload over the firmware's frame size", () => {
    expect(() => serialFrame(new Uint8Array(MAX_FRAME_LEN + 1))).toThrow(RangeError);
    expect(serialFrame(new Uint8Array(MAX_FRAME_LEN)).length).toBe(MAX_FRAME_LEN + 3);
  });
});

describe("extractFrames", () => {
  const stream = concatBytes(fromRadio(A), fromRadio(B));

  it("takes two concatenated frames out of one chunk", () => {
    const { frames, rest } = extractFrames(stream);
    expect(frames).toEqual([A, B]);
    expect(rest.length).toBe(0);
  });

  it("reassembles frames split at every possible byte", () => {
    for (let cut = 0; cut <= stream.length; cut++) {
      const first = extractFrames(stream.slice(0, cut));
      const second = extractFrames(concatBytes(first.rest, stream.slice(cut)));
      expect([...first.frames, ...second.frames], `cut at ${cut}`).toEqual([A, B]);
      expect(second.rest.length, `cut at ${cut}`).toBe(0);
    }
  });

  it("reassembles a frame fed one byte at a time", () => {
    let rest: Uint8Array = new Uint8Array(0);
    const frames: Uint8Array[] = [];
    for (const byte of stream) {
      const result = extractFrames(concatBytes(rest, bytes(byte)));
      frames.push(...result.frames);
      rest = result.rest;
    }
    expect(frames).toEqual([A, B]);
    expect(rest.length).toBe(0);
  });

  it("skips bytes before the first marker", () => {
    const { frames, rest } = extractFrames(concatBytes(text("boot\r\n"), fromRadio(A)));
    expect(frames).toEqual([A]);
    expect(rest.length).toBe(0);
  });

  it("keeps a partial header and a partial body as rest", () => {
    expect(extractFrames(bytes(0x3e)).rest).toEqual(bytes(0x3e));
    expect(extractFrames(bytes(0x3e, 5)).rest).toEqual(bytes(0x3e, 5));
    const partial = fromRadio(B).slice(0, 4);
    const result = extractFrames(partial);
    expect(result.frames).toEqual([]);
    expect(result.rest).toEqual(partial);
  });

  it("treats a marker followed by an impossible length as noise and resyncs", () => {
    const { frames } = extractFrames(concatBytes(bytes(0x3e, 0xff, 0xff), fromRadio(A)));
    expect(frames).toEqual([A]);
  });

  it("accepts an empty frame", () => {
    const { frames, rest } = extractFrames(fromRadio(new Uint8Array(0)));
    expect(frames).toEqual([new Uint8Array(0)]);
    expect(rest.length).toBe(0);
  });

  it("copies frames instead of aliasing the stream", () => {
    const input = fromRadio(B);
    const { frames } = extractFrames(input);
    input.fill(0);
    expect(frames[0]).toEqual(B);
  });
});

describe("payload builders", () => {
  it("builds CMD_APP_START with the protocol version and the app name after 6 reserved bytes", () => {
    expect([...appStartPayload("BCentral")]).toEqual([CMD_APP_START, 3, 0, 0, 0, 0, 0, 0, ...text("BCentral")]);
  });

  it("builds the one-byte and uint32 commands", () => {
    expect([...deviceQueryPayload()]).toEqual([CMD_DEVICE_QUERY, 3]);
    expect([...getTimePayload()]).toEqual([CMD_GET_DEVICE_TIME]);
    expect([...getContactsPayload()]).toEqual([CMD_GET_CONTACTS]);
    expect([...getContactsPayload(EPOCH)]).toEqual([CMD_GET_CONTACTS, ...u32(EPOCH)]);
    expect([...setTimePayload(EPOCH)]).toEqual([CMD_SET_DEVICE_TIME, ...u32(EPOCH)]);
  });
});

describe("textMessagePayload", () => {
  it("lays out type, attempt, timestamp, key prefix and text", () => {
    const payload = textMessagePayload(HANS_KEY, "#1 Meld status", {
      attempt: 2,
      timestamp: EPOCH,
    });
    expect([...payload]).toEqual([
      CMD_SEND_TXT_MSG,
      TXT_TYPE_PLAIN,
      2,
      ...u32(EPOCH),
      ...fromHex(HANS_KEY).subarray(0, 6),
      ...text("#1 Meld status"),
    ]);
  });

  it("defaults to plain text and attempt 0", () => {
    const payload = textMessagePayload(HANS_KEY, "R1", { timestamp: EPOCH });
    expect(payload[1]).toBe(TXT_TYPE_PLAIN);
    expect(payload[2]).toBe(0);
  });

  it("counts UTF-8 bytes against the 160-byte limit", () => {
    expect(MAX_TEXT_LEN).toBe(160);
    expect(textMessagePayload(HANS_KEY, "a".repeat(160), { timestamp: EPOCH }).length).toBe(173);
    expect(() => textMessagePayload(HANS_KEY, "a".repeat(161), { timestamp: EPOCH })).toThrow(RangeError);
    // Danish letters cost two bytes each.
    expect(textMessagePayload(HANS_KEY, "ø".repeat(80), { timestamp: EPOCH }).length).toBe(173);
    expect(() => textMessagePayload(HANS_KEY, `${"ø".repeat(80)}a`, { timestamp: EPOCH })).toThrow(
      RangeError,
    );
  });

  it("refuses a key that is not 32 bytes", () => {
    expect(() => textMessagePayload("7a7a", "x", { timestamp: EPOCH })).toThrow(RangeError);
  });
});

describe("parseSelfInfo", () => {
  it("reads every field from the documented layout", () => {
    const info = parseSelfInfo(selfInfoFrame({ name: "Stab 1", txPower: 20, lat: 55.7, lon: 12.6 }));
    expect(info).toEqual({
      advType: 1,
      txPower: 20,
      maxTxPower: 22,
      publicKey: STAFF_KEY,
      lat: 55.7,
      lon: 12.6,
      radioFreqKhz: 869525,
      radioBwHz: 62500,
      radioSf: 8,
      radioCr: 5,
      name: "Stab 1",
    });
  });

  it("reads a Danish name and a negative longitude", () => {
    const info = parseSelfInfo(selfInfoFrame({ name: "Stab Øst", lon: -0.5 }));
    expect(info.name).toBe("Stab Øst");
    expect(info.lon).toBe(-0.5);
  });

  it("rejects the wrong code and a short frame", () => {
    expect(() => parseSelfInfo(okFrame())).toThrow(RangeError);
    expect(() => parseSelfInfo(selfInfoFrame().slice(0, 40))).toThrow(RangeError);
  });
});

describe("parseDeviceInfo", () => {
  it("reads version, limits, pin, build date, board and version string", () => {
    expect(parseDeviceInfo(deviceInfoFrame("v1.7.1"))).toEqual({
      firmwareVer: 7,
      maxContacts: 200,
      maxGroupChannels: 8,
      blePin: 123456,
      firmwareBuildDate: "19 Feb 2025",
      manufacturerModel: "Heltec V3",
      firmwareVersion: "v1.7.1",
    });
  });

  it("tolerates the short answer of an old firmware", () => {
    expect(parseDeviceInfo(bytes(RESP_CODE_DEVICE_INFO, 1))).toEqual({
      firmwareVer: 1,
      maxContacts: 0,
      maxGroupChannels: 0,
      blePin: 0,
      firmwareBuildDate: "",
      manufacturerModel: "",
      firmwareVersion: "",
    });
  });
});

describe("parseContact", () => {
  it("reads a flood-path contact", () => {
    const contact = parseContact(contactFrame({ name: "Hans", lastAdvert: EPOCH, lastMod: EPOCH - 100 }));
    expect(contact).toEqual({
      publicKey: HANS_KEY,
      type: 1,
      flags: 0,
      outPathLen: -1,
      outPath: "",
      name: "Hans",
      lastAdvert: EPOCH,
      lat: 55.7,
      lon: 12.6,
      lastMod: EPOCH - 100,
    });
  });

  it("reads only the used part of the path, and a never-heard contact", () => {
    const contact = parseContact(
      contactFrame({ outPathLen: 2, outPath: [0xaa, 0xbb, 0xcc], lastAdvert: 0, type: 2 }),
    );
    expect(contact.outPathLen).toBe(2);
    expect(contact.outPath).toBe("aabb");
    expect(contact.lastAdvert).toBe(0);
    expect(contact.type).toBe(2);
  });

  it("accepts the same layout behind PUSH_CODE_NEW_ADVERT", () => {
    expect(parseContact(contactFrame({ code: 0x8a, name: "Peter", publicKey: PETER_KEY }))).toMatchObject({
      name: "Peter",
      publicKey: PETER_KEY,
    });
  });

  it("rejects a short frame", () => {
    expect(() => parseContact(contactFrame().slice(0, 147))).toThrow(RangeError);
  });

  it("reads the count from CONTACTS_START", () => {
    expect(parseContactsStart(contactsStartFrame(7))).toBe(7);
    expect(parseContactsStart(bytes(2))).toBe(0);
  });
});

describe("parseContactMessage", () => {
  it("reads a v1 frame", () => {
    const message = parseContactMessage(
      contactMessageV1Frame({ text: "R1", pathLen: 3, senderTimestamp: EPOCH }),
    );
    expect(message).toEqual({
      version: 1,
      snr: null,
      pubKeyPrefix: HANS_KEY.slice(0, 12),
      pathLen: 3,
      txtType: 0,
      senderTimestamp: EPOCH,
      text: "R1",
    });
  });

  it("reads a v3 frame with SNR and Danish text", () => {
    const message = parseContactMessage(
      contactMessageV3Frame({
        text: "vedr. #1 alle ok, kælder i nr 4 har vand",
        snr: -5.5,
        senderKey: PETER_KEY,
        senderTimestamp: EPOCH + 92,
      }),
    );
    expect(message).toEqual({
      version: 3,
      snr: -5.5,
      pubKeyPrefix: PETER_KEY.slice(0, 12),
      pathLen: 0,
      txtType: 0,
      senderTimestamp: EPOCH + 92,
      text: "vedr. #1 alle ok, kælder i nr 4 har vand",
    });
  });

  it("keeps an empty text and rejects a truncated header", () => {
    expect(parseContactMessage(contactMessageV1Frame({ text: "" })).text).toBe("");
    expect(() => parseContactMessage(contactMessageV3Frame({ text: "x" }).slice(0, 15))).toThrow(RangeError);
  });
});

describe("parseSent, parseAck, parseCurrTime, parseErr", () => {
  it("reads SENT", () => {
    expect(parseSent(sentFrame(false, 0xdeadbeef, 4500))).toEqual({
      isFlood: false,
      expectedAck: 0xdeadbeef,
      estTimeoutMs: 4500,
    });
    expect(parseSent(sentFrame(true, 1, 2)).isFlood).toBe(true);
    expect(() => parseSent(sentFrame(false, 1, 2).slice(0, 9))).toThrow(RangeError);
  });

  it("reads SEND_CONFIRMED", () => {
    expect(parseAck(ackFrame(0xdeadbeef, 1234))).toEqual({ ackCode: 0xdeadbeef, roundTripMs: 1234 });
    expect(() => parseAck(okFrame())).toThrow(RangeError);
  });

  it("reads CURR_TIME", () => {
    expect(parseCurrTime(currTimeFrame(EPOCH))).toBe(EPOCH);
    expect(parseCurrTime(currTimeFrame(0xffffffff))).toBe(0xffffffff);
    expect(() => parseCurrTime(bytes(RESP_CODE_CURR_TIME, 1, 2))).toThrow(RangeError);
  });

  it("reads ERR with and without a code", () => {
    expect(parseErr(errFrame(6))).toBe(6);
    expect(parseErr(errFrame())).toBeNull();
  });
});

// --- companionCommand over a fake transport -----------------------------------------------

function openLink(options: { inboxLimit?: number } = {}) {
  const transport = new FakeTransport();
  const frames: Uint8Array[] = [];
  const pushes: Uint8Array[] = [];
  const logged: string[] = [];
  const link = new CompanionLink(transport, {
    onFrame: (frame) => frames.push(frame),
    onPush: (frame) => pushes.push(frame),
    onLog: (line) => logged.push(line),
    inboxLimit: options.inboxLimit,
  });
  link.start();
  return { transport, link, frames, pushes, logged };
}

describe("companionCommand", () => {
  it("sends the payload and returns the first expected response", async () => {
    const { transport, link } = openLink();
    transport.autoReply = () => [currTimeFrame(EPOCH)];
    const frame = await link.companionCommand(getTimePayload(), [RESP_CODE_CURR_TIME]);
    expect(parseCurrTime(frame)).toBe(EPOCH);
    expect(transport.sent).toEqual([getTimePayload()]);
  });

  it("never takes a push frame as the answer; pushes land in the inbox and in onPush", async () => {
    const { transport, link, frames, pushes } = openLink();
    transport.autoReply = () => [bytes(PUSH_CODE_MSG_WAITING), ackFrame(1, 2), currTimeFrame(EPOCH)];
    const frame = await link.companionCommand(getTimePayload(), [RESP_CODE_CURR_TIME]);
    expect(frame[0]).toBe(RESP_CODE_CURR_TIME);
    expect(link.inbox).toEqual([bytes(PUSH_CODE_MSG_WAITING), ackFrame(1, 2)]);
    expect(pushes).toEqual(link.inbox);
    expect(frames.length).toBe(3);
  });

  it("caps the inbox, dropping the oldest push", async () => {
    const { transport, link } = openLink({ inboxLimit: 2 });
    transport.autoReply = () => [bytes(0x80, 1), bytes(0x80, 2), bytes(0x80, 3), okFrame()];
    await link.companionCommand(getTimePayload(), [RESP_CODE_OK]);
    expect(link.inbox).toEqual([bytes(0x80, 2), bytes(0x80, 3)]);
  });

  it("throws CompanionError with the code on RESP_CODE_ERR", async () => {
    const { transport, link } = openLink();
    transport.autoReply = () => [errFrame(6)];
    const failure = await link.companionCommand(getTimePayload(), [RESP_CODE_CURR_TIME]).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(CompanionError);
    expect((failure as CompanionError).code).toBe(6);
  });

  it("times out when nothing expected arrives", async () => {
    const { transport, link } = openLink();
    transport.autoReply = () => [bytes(PUSH_CODE_ADVERT)];
    await expect(link.companionCommand(getTimePayload(), [RESP_CODE_CURR_TIME], 30)).rejects.toBeInstanceOf(
      CompanionTimeoutError,
    );
    expect(link.inbox.length).toBe(1);
  });

  it("drops an unexpected response and keeps waiting for the expected one", async () => {
    const { transport, link, logged } = openLink();
    transport.autoReply = () => [okFrame(), currTimeFrame(EPOCH)];
    const frame = await link.companionCommand(getTimePayload(), [RESP_CODE_CURR_TIME]);
    expect(frame[0]).toBe(RESP_CODE_CURR_TIME);
    expect(logged.some((line) => line.includes("dropped unexpected response 0x00"))).toBe(true);
  });

  it("does not let a late answer to a timed-out command answer the next one", async () => {
    const { transport, link, frames } = openLink();
    await expect(link.companionCommand(getTimePayload(), [RESP_CODE_CURR_TIME], 20)).rejects.toBeInstanceOf(
      CompanionTimeoutError,
    );
    transport.push(currTimeFrame(1)); // the late answer
    await vi.waitFor(() => expect(frames.length).toBe(1));
    transport.autoReply = () => [currTimeFrame(2)];
    const frame = await link.companionCommand(getTimePayload(), [RESP_CODE_CURR_TIME]);
    expect(parseCurrTime(frame)).toBe(2);
  });

  it("runs commands one at a time, in call order", async () => {
    const { transport, link } = openLink();
    transport.autoReply = (payload) =>
      payload[0] === CMD_GET_DEVICE_TIME ? [currTimeFrame(EPOCH)] : [deviceInfoFrame()];
    const first = link.companionCommand(getTimePayload(), [RESP_CODE_CURR_TIME]);
    const second = link.companionCommand(deviceQueryPayload(), [RESP_CODE_DEVICE_INFO]);
    expect((await first)[0]).toBe(RESP_CODE_CURR_TIME);
    expect((await second)[0]).toBe(RESP_CODE_DEVICE_INFO);
    expect(transport.sent.map((payload) => payload[0])).toEqual([CMD_GET_DEVICE_TIME, CMD_DEVICE_QUERY]);
  });

  it("rejects with CompanionClosedError when the transport closes mid-wait, and afterwards", async () => {
    const { transport, link } = openLink();
    const pending = link.companionCommand(getTimePayload(), [RESP_CODE_CURR_TIME]);
    transport.close();
    await expect(pending).rejects.toBeInstanceOf(CompanionClosedError);
    expect(link.isClosed).toBe(true);
    await expect(link.companionCommand(getTimePayload(), [RESP_CODE_CURR_TIME])).rejects.toBeInstanceOf(
      CompanionClosedError,
    );
  });

  it("calls onClosed once the read loop ends", async () => {
    const transport = new FakeTransport();
    let closedCalls = 0;
    const link = new CompanionLink(transport, { onClosed: () => closedCalls++ });
    link.start();
    transport.close();
    await vi.waitFor(() => expect(closedCalls).toBe(1));
  });
});

describe("companion operations", () => {
  it("companionQuery asks the device first, then starts the app", async () => {
    const { transport, link } = openLink();
    transport.autoReply = scriptedCompanion().reply;
    const identity = await companionQuery(link, "BCentral");
    expect(identity.device?.firmwareVersion).toBe("v1.7.1");
    expect(identity.self.name).toBe("Stab 1");
    expect(transport.sent.map((payload) => payload[0])).toEqual([CMD_DEVICE_QUERY, CMD_APP_START]);
    expect(transport.sent[1]).toEqual(appStartPayload("BCentral"));
  });

  it("companionQuery survives a firmware that answers ERR to the device query", async () => {
    const { transport, link } = openLink();
    transport.autoReply = (payload) =>
      payload[0] === CMD_DEVICE_QUERY ? [errFrame(1)] : [selfInfoFrame({ name: "Old" })];
    const identity = await companionQuery(link, "BCentral");
    expect(identity.device).toBeNull();
    expect(identity.self.name).toBe("Old");
  });

  it("companionSetTime reads before, sets, reads after", async () => {
    const { transport, link } = openLink();
    const companion = scriptedCompanion({ time: 100 });
    transport.autoReply = companion.reply;
    const forward = await companionSetTime(link, 500);
    expect(forward).toEqual({ before: 100, requested: 500, after: 500 });
    // The companion's clock only moves forward: a lower time is ignored and reported as such.
    const backward = await companionSetTime(link, 200);
    expect(backward).toEqual({ before: 500, requested: 200, after: 500 });
    expect(transport.sent.map((payload) => payload[0])).toEqual([
      CMD_GET_DEVICE_TIME,
      CMD_SET_DEVICE_TIME,
      CMD_GET_DEVICE_TIME,
      CMD_GET_DEVICE_TIME,
      CMD_SET_DEVICE_TIME,
      CMD_GET_DEVICE_TIME,
    ]);
  });

  it("companionGetContacts collects the stream between START and END, ignoring pushes", async () => {
    const { transport, link } = openLink();
    transport.autoReply = () => [
      contactsStartFrame(2),
      contactFrame({ name: "Hans" }),
      bytes(PUSH_CODE_ADVERT, ...fromHex(PETER_KEY)),
      contactFrame({ name: "Peter", publicKey: PETER_KEY }),
      endOfContactsFrame(),
    ];
    const contacts = await companionGetContacts(link);
    expect(contacts.map((contact) => contact.name)).toEqual(["Hans", "Peter"]);
    expect(link.inbox.length).toBe(1);
    expect(transport.sent).toEqual([getContactsPayload()]);
  });

  it("companionGetContacts returns an empty list and releases the link", async () => {
    const { transport, link } = openLink();
    transport.autoReply = (payload) =>
      payload[0] === CMD_GET_CONTACTS ? [contactsStartFrame(0), endOfContactsFrame()] : [currTimeFrame(EPOCH)];
    expect(await companionGetContacts(link)).toEqual([]);
    expect(parseCurrTime(await link.companionCommand(getTimePayload(), [RESP_CODE_CURR_TIME]))).toBe(EPOCH);
  });

  it("self info and app start agree on the protocol version", () => {
    expect(appStartPayload("x")[1]).toBe(deviceQueryPayload()[1]);
    expect(selfInfoFrame()[0]).toBe(RESP_CODE_SELF_INFO);
  });
});
