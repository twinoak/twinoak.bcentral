import { describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n/index.svelte.ts";
import { openTestStore } from "../test-support/testStore.ts";
import { FakeTransport } from "../test-support/fakeTransport.ts";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import {
  EPOCH,
  HANS_KEY,
  PETER_KEY,
  channelMessageV1Frame,
  channelMessageV3Frame,
  contactFrame,
  contactMessageV1Frame,
  contactMessageV3Frame,
  msgWaitingFrame,
  scriptedCompanion,
} from "../test-support/companionFrames.ts";
import { dedupeKey } from "../store/dedupeKey.ts";
import { composeMessage } from "../store/outgoing.ts";
import { CMD_GET_CONTACTS, CMD_SYNC_NEXT_MESSAGE, PUSH_CODE_MSG_WAITING } from "./serial.ts";
import { createInbox, findByKeyPrefix } from "./inbox.svelte.ts";
import { createOutbox } from "./outbox.svelte.ts";
import { createRadioStore } from "./radioStore.svelte.ts";

const INCIDENT = "01JB8ZK3QX9V2M4N6P8R0T2W4Z";
const OLE_KEY = "c3".repeat(32);

setLanguage("en");

async function setUp(options: { incidentId?: string | null } = {}) {
  let nowMs = EPOCH * 1000;
  let incidentId: string | null = options.incidentId === undefined ? INCIDENT : options.incidentId;
  const transport = new FakeTransport();
  const companion = scriptedCompanion();
  transport.autoReply = companion.reply;
  const radio = createRadioStore({
    now: () => nowMs,
    blindAfterMs: () => 15 * 60_000,
    createTransport: () => transport,
  });
  const store = await openTestStore();
  const hans = await store.createRegisterEntry({
    publicKey: HANS_KEY,
    label: "Hans",
    origin: "adhoc",
  });
  const log: string[] = [];
  const inbox = createInbox({
    store: async () => store,
    link: () => radio.link(),
    onPush: radio.onPush,
    contacts: radio.contacts,
    refreshContacts: radio.refreshContacts,
    incidentId: () => incidentId,
    operator: () => "Thomas",
    responseTimeoutMs: 200,
    log: (line) => log.push(line),
  });
  // As src/radio/index.ts wires it.
  radio.onConnected(() => void inbox.drain());
  const outbox = createOutbox({
    store: async () => store,
    link: () => radio.link(),
    onPush: radio.onPush,
    now: () => nowMs,
    maxAttempts: () => 3,
    operator: () => "Thomas",
    ackWindow: () => 25,
    responseTimeoutMs: 200,
  });

  async function incoming() {
    return (await store.allEntries()).filter((entry) => entry.type === "message_in");
  }

  return {
    store,
    radio,
    transport,
    companion,
    inbox,
    outbox,
    hans,
    log,
    incoming,
    setIncident(id: string | null) {
      incidentId = id;
    },
    advance(ms: number) {
      nowMs += ms;
    },
    syncsSent: () =>
      transport.sent.filter((payload) => payload[0] === CMD_SYNC_NEXT_MESSAGE).length,
    contactReads: () => transport.sent.filter((payload) => payload[0] === CMD_GET_CONTACTS).length,
  };
}

describe("findByKeyPrefix", () => {
  it("matches exactly one key by its hex prefix, else nothing", () => {
    const items = [
      { publicKey: HANS_KEY },
      { publicKey: PETER_KEY },
      { publicKey: "7a".repeat(5) + "ff".repeat(27) },
    ];
    expect(findByKeyPrefix(items, PETER_KEY.slice(0, 12))?.publicKey).toBe(PETER_KEY);
    expect(findByKeyPrefix(items, HANS_KEY.slice(0, 12))?.publicKey).toBe(HANS_KEY);
    // Two keys share the first five bytes: a five-byte prefix is ambiguous, so no match.
    expect(findByKeyPrefix(items, "7a".repeat(5))).toBeNull();
    expect(findByKeyPrefix(items, OLE_KEY.slice(0, 12))).toBeNull();
    expect(findByKeyPrefix([], "7a7a7a7a7a7a")).toBeNull();
  });
});

describe("inbox", () => {
  it("drains once right after connect: a message waiting on the companion lands as message_in", async () => {
    const { store, radio, companion, hans, incoming } = await setUp();
    companion.messages.push(
      contactMessageV3Frame({ text: "hej fra Hans", snr: 7.5, senderTimestamp: EPOCH + 5 }),
    );

    await radio.connect("usb");
    await vi.waitFor(async () => expect(await incoming()).toHaveLength(1));

    const [entry] = await incoming();
    expect(entry).toMatchObject({
      type: "message_in",
      transport: "mesh",
      incidentId: INCIDENT,
      operator: "Thomas",
      counterpartyId: hans.id,
      text: "hej fra Hans",
      dedupeKey: await dedupeKey(HANS_KEY, EPOCH + 5, "hej fra Hans"),
    });
    expect(entry?.seqNo).toBeUndefined();
    expect(entry?.refersTo).toBeUndefined();
    expect(companion.messages).toHaveLength(0);
    expect(await store.lastHeardAt(hans.id)).toBe(entry?.timestamp);
    await radio.disconnect();
  });

  it("drains on PUSH_CODE_MSG_WAITING, looping CMD_SYNC_NEXT_MESSAGE until the companion is empty", async () => {
    const { radio, transport, companion, incoming, syncsSent } = await setUp();
    await radio.connect("usb");
    await vi.waitFor(() => expect(syncsSent()).toBe(1)); // the connect drain: one sync, empty
    expect(await incoming()).toHaveLength(0);

    companion.messages.push(contactMessageV1Frame({ text: "første", senderTimestamp: EPOCH + 1 }));
    companion.messages.push(contactMessageV1Frame({ text: "anden", senderTimestamp: EPOCH + 2 }));
    transport.push(msgWaitingFrame());

    await vi.waitFor(async () => expect(await incoming()).toHaveLength(2));
    expect((await incoming()).map((entry) => entry.text)).toEqual(["første", "anden"]);
    // One sync per message plus the one that answered "no more".
    expect(syncsSent()).toBe(1 + 3);
    await radio.disconnect();
  });

  it("reproduces the walkthrough's dedupe key for Hans's R1", async () => {
    const { radio, companion, incoming } = await setUp();
    const walkthrough = loadWalkthrough();
    const r1 = walkthrough.entries.find(
      (entry) => entry.type === "message_in" && entry.text === "R1",
    );
    companion.messages.push(contactMessageV3Frame({ text: "R1", senderTimestamp: EPOCH }));
    await radio.connect("usb");
    await vi.waitFor(async () => expect(await incoming()).toHaveLength(1));
    expect((await incoming())[0]?.dedupeKey).toBe(r1?.dedupeKey);
    await radio.disconnect();
  });

  it("the same message delivered twice by the radio produces one message_in", async () => {
    const { radio, companion, inbox, incoming, log } = await setUp();
    await radio.connect("usb");
    const frame = contactMessageV3Frame({ text: "R1", senderTimestamp: EPOCH });
    companion.messages.push(frame, frame);
    const result = await inbox.drain();

    expect(result.stored).toHaveLength(1);
    expect(result.duplicates).toBe(1);
    expect(result.completed).toBe(true);
    expect(await incoming()).toHaveLength(1);

    // And again later, after a radio retry of the same packet.
    companion.messages.push(frame);
    const again = await inbox.drain();
    expect(again.stored).toHaveLength(0);
    expect(again.duplicates).toBe(1);
    expect(await incoming()).toHaveLength(1);
    expect(log.some((line) => line.includes("duplicate of"))).toBe(true);
    await radio.disconnect();
  });

  it("an unknown sender gets one register entry per key, not one per message", async () => {
    const { store, radio, companion, inbox, incoming } = await setUp();
    await radio.connect("usb");
    companion.messages.push(
      contactMessageV3Frame({
        senderKey: PETER_KEY,
        text: "hvem er I?",
        senderTimestamp: EPOCH + 1,
      }),
      contactMessageV3Frame({ senderKey: PETER_KEY, text: "hallo?", senderTimestamp: EPOCH + 2 }),
    );
    const result = await inbox.drain();
    expect(result.stored).toHaveLength(2);

    const register = await store.allRegisterEntries();
    expect(register).toHaveLength(2);
    const peter = register.find((entry) => entry.publicKey === PETER_KEY);
    expect(peter).toMatchObject({ label: `unknown ${PETER_KEY.slice(0, 12)}`, origin: "private" });
    expect((await incoming()).map((entry) => entry.counterpartyId)).toEqual([peter?.id, peter?.id]);

    // A third message later still goes to the same entry.
    companion.messages.push(
      contactMessageV3Frame({ senderKey: PETER_KEY, text: "igen", senderTimestamp: EPOCH + 3 }),
    );
    await inbox.drain();
    expect(await store.allRegisterEntries()).toHaveLength(2);
    expect(await store.lastHeardAt(peter?.id ?? "")).not.toBeNull();
    await radio.disconnect();
  });

  it("a sender missing from the contact list is looked for again before giving up", async () => {
    const { store, radio, companion, inbox, incoming, contactReads, log } = await setUp();
    await radio.connect("usb");
    const readsAfterConnect = contactReads();

    // Ole advertised after connect: the companion knows him, the store's list does not yet.
    companion.contacts.push(contactFrame({ publicKey: OLE_KEY, name: "Ole" }));
    companion.messages.push(
      contactMessageV3Frame({ senderKey: OLE_KEY, text: "Ole her", senderTimestamp: EPOCH + 1 }),
    );
    const result = await inbox.drain();
    expect(result.stored).toHaveLength(1);
    expect(contactReads()).toBe(readsAfterConnect + 1);
    expect(radio.contacts().map((contact) => contact.name)).toContain("Ole");
    const ole = await store.registerEntryByPublicKey(OLE_KEY);
    expect(ole?.label).toBe(`unknown ${OLE_KEY.slice(0, 12)}`);

    // A prefix nobody has: logged and dropped, the drain goes on to the next message.
    companion.messages.push(
      contactMessageV3Frame({
        senderKey: "d4".repeat(32),
        text: "spøgelse",
        senderTimestamp: EPOCH + 2,
      }),
      contactMessageV3Frame({ text: "Hans igen", senderTimestamp: EPOCH + 3 }),
    );
    const next = await inbox.drain();
    expect(next.skipped).toBe(1);
    expect(next.stored.map((entry) => entry.text)).toEqual(["Hans igen"]);
    expect(next.completed).toBe(true);
    expect(log.some((line) => line.includes("unknown prefix d4d4d4d4d4d4"))).toBe(true);
    expect((await incoming()).map((entry) => entry.text)).toEqual(["Ole her", "Hans igen"]);
    await radio.disconnect();
  });

  it("a sender the companion has forgotten but the register knows is still filed", async () => {
    const { store, radio, companion, inbox, hans } = await setUp();
    companion.contacts = [];
    await radio.connect("usb");
    companion.messages.push(
      contactMessageV3Frame({ text: "stadig her", senderTimestamp: EPOCH + 1 }),
    );
    const result = await inbox.drain();
    expect(result.stored[0]?.counterpartyId).toBe(hans.id);
    expect(await store.allRegisterEntries()).toHaveLength(1);
    await radio.disconnect();
  });

  it("channel messages go to the log, not to the journal", async () => {
    const { store, radio, companion, inbox, incoming, log } = await setUp();
    await radio.connect("usb");
    companion.messages.push(
      channelMessageV1Frame("public chatter"),
      contactMessageV3Frame({ text: "direkte", senderTimestamp: EPOCH + 1 }),
      channelMessageV3Frame("more chatter"),
    );
    const result = await inbox.drain();
    expect(result.skipped).toBe(2);
    expect(result.stored).toHaveLength(1);
    expect((await incoming()).map((entry) => entry.text)).toEqual(["direkte"]);
    expect(log.filter((line) => line.includes("channel message")).length).toBe(2);
    expect(await store.allRegisterEntries()).toHaveLength(1);
    await radio.disconnect();
  });

  it("R1 from the phone after a delivered #1: the message_in is stored, then roger", async () => {
    const { store, radio, companion, inbox, outbox, hans, incoming } = await setUp();
    await radio.connect("usb");
    const { message } = await composeMessage(store, {
      incidentId: INCIDENT,
      operator: "Thomas",
      counterpartyId: hans.id,
      transport: "mesh",
      body: "Meld status for Nørregade",
    });
    expect(await outbox.send(message.id)).toBe("delivered");

    companion.messages.push(contactMessageV3Frame({ text: "R1", senderTimestamp: EPOCH + 220 }));
    const result = await inbox.drain();

    expect(result.stored).toHaveLength(1);
    expect(result.rogers).toHaveLength(1);
    expect(await store.statusOf(message.id)).toBe("roger");
    const [r1] = await incoming();
    expect(result.rogers[0]).toMatchObject({
      refersTo: message.id,
      newStatus: "roger",
      text: r1?.id,
    });
    expect(r1?.deviceSeq).toBeLessThan(result.rogers[0]?.deviceSeq ?? 0);

    // A second R1 is a plain message: #1 is already roger.
    companion.messages.push(contactMessageV3Frame({ text: "R1", senderTimestamp: EPOCH + 221 }));
    const again = await inbox.drain();
    expect(again.stored).toHaveLength(1);
    expect(again.rogers).toHaveLength(0);
    expect(await incoming()).toHaveLength(2);
    await radio.disconnect();
  });

  it("syncs nothing while no incident is selected; the messages wait on the companion", async () => {
    const { radio, companion, inbox, incoming, syncsSent, setIncident, log } = await setUp({
      incidentId: null,
    });
    companion.messages.push(contactMessageV3Frame({ text: "venter", senderTimestamp: EPOCH + 1 }));
    await radio.connect("usb");
    const result = await inbox.drain();
    expect(result.completed).toBe(false);
    expect(syncsSent()).toBe(0);
    expect(companion.messages).toHaveLength(1);
    expect(await incoming()).toHaveLength(0);
    expect(log.some((line) => line.includes("no incident selected"))).toBe(true);

    setIncident(INCIDENT);
    const later = await inbox.drain();
    expect(later.completed).toBe(true);
    expect(later.stored.map((entry) => entry.text)).toEqual(["venter"]);
    await radio.disconnect();
  });

  it("does nothing without a link", async () => {
    const { inbox, syncsSent } = await setUp();
    const result = await inbox.drain();
    expect(result).toEqual({ stored: [], rogers: [], duplicates: 0, skipped: 0, completed: false });
    expect(syncsSent()).toBe(0);
  });

  it("a companion that answers ERR to the sync ends the drain, logged", async () => {
    const { radio, companion, inbox, log } = await setUp();
    await radio.connect("usb");
    companion.broken = true;
    const result = await inbox.drain();
    expect(result.completed).toBe(false);
    expect(result.stored).toHaveLength(0);
    expect(log.some((line) => line.includes("sync failed"))).toBe(true);
    companion.broken = false;
    await radio.disconnect();
  });

  it("overlapping drains share one pass and go round again for a push that lands meanwhile", async () => {
    const { radio, transport, companion, inbox, incoming, syncsSent } = await setUp();
    await radio.connect("usb");
    await vi.waitFor(() => expect(syncsSent()).toBe(1));

    companion.messages.push(contactMessageV3Frame({ text: "en", senderTimestamp: EPOCH + 1 }));
    const first = inbox.drain();
    const second = inbox.drain();
    companion.messages.push(contactMessageV3Frame({ text: "to", senderTimestamp: EPOCH + 2 }));
    transport.push(msgWaitingFrame());
    expect(await second).toBe(await first);
    expect((await incoming()).map((entry) => entry.text)).toEqual(["en", "to"]);
    await radio.disconnect();
  });

  it("bumps revision per journal write and stops listening on stop()", async () => {
    const { radio, transport, companion, inbox, incoming, syncsSent } = await setUp();
    await radio.connect("usb");
    await vi.waitFor(() => expect(syncsSent()).toBe(1));
    expect(inbox.revision()).toBe(0);

    companion.messages.push(
      contactMessageV3Frame({ senderKey: PETER_KEY, text: "ny", senderTimestamp: EPOCH + 1 }),
    );
    await inbox.drain();
    // One register entry, one message_in.
    expect(inbox.revision()).toBe(2);
    const syncsBeforeStop = syncsSent();

    inbox.stop();
    companion.messages.push(
      contactMessageV3Frame({ text: "efter stop", senderTimestamp: EPOCH + 2 }),
    );
    transport.push(msgWaitingFrame());
    await vi.waitFor(() =>
      expect(radio.link()?.inbox.map((frame) => frame[0])).toContain(PUSH_CODE_MSG_WAITING),
    );
    // A full command round trip after the push: any drain the push had started would have
    // sent its sync before this answer came back, since the link runs commands in order.
    await radio.refreshContacts();
    expect(syncsSent()).toBe(syncsBeforeStop);
    expect(await incoming()).toHaveLength(1);
    expect(companion.messages).toHaveLength(1);
    await radio.disconnect();
  });
});
