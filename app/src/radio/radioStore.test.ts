import { describe, expect, it, vi } from "vitest";
import { createRadioStore } from "./radioStore.svelte.ts";
import { CompanionContactSource } from "./contactSource.ts";
import {
  CMD_APP_START,
  CMD_DEVICE_QUERY,
  CMD_GET_CONTACTS,
  CMD_GET_DEVICE_TIME,
  CMD_SET_DEVICE_TIME,
  CompanionError,
  PUSH_CODE_MSG_WAITING,
} from "./serial.ts";
import { FakeTransport } from "../test-support/fakeTransport.ts";
import {
  EPOCH,
  HANS_KEY,
  PETER_KEY,
  bytes,
  contactFrame,
  scriptedCompanion,
} from "../test-support/companionFrames.ts";

const MINUTE = 60_000;
const BLIND_AFTER = 15 * MINUTE;

function setUp(options: { blindAfterMs?: number } = {}) {
  let now = EPOCH * 1000;
  let blindAfterMs = options.blindAfterMs ?? BLIND_AFTER;
  const transport = new FakeTransport();
  const companion = scriptedCompanion({ time: EPOCH - 3600 });
  transport.autoReply = companion.reply;
  const store = createRadioStore({
    now: () => now,
    blindAfterMs: () => blindAfterMs,
    createTransport: () => transport,
    appName: "BCentral",
  });
  return {
    store,
    transport,
    companion,
    advance(ms: number) {
      now += ms;
      store.refreshNow();
    },
    setBlindAfter(ms: number) {
      blindAfterMs = ms;
    },
    now: () => now,
  };
}

describe("radio store", () => {
  it("starts disconnected with nothing heard", () => {
    const { store } = setUp();
    expect(store.state()).toBe("disconnected");
    expect(store.lastHeardAt()).toBeNull();
    expect(store.elapsedMs()).toBeNull();
    expect(store.selfInfo()).toBeNull();
    expect(store.contacts()).toEqual([]);
    expect(store.link()).toBeNull();
  });

  it("connects: identity, clock forward, contacts, and logs the clock result", async () => {
    const { store, transport, companion, now } = setUp();
    const connecting = store.connect("usb");
    expect(store.state()).toBe("connecting");
    await connecting;

    expect(store.state()).toBe("connected");
    expect(store.kind()).toBe("usb");
    expect(store.selfInfo()?.name).toBe("Stab 1");
    expect(store.deviceInfo()?.firmwareVersion).toBe("v1.7.1");
    expect(store.contacts().map((contact) => contact.publicKey)).toEqual([HANS_KEY, PETER_KEY]);
    expect(store.lastHeardAt()).toBe(now());
    expect(store.elapsedMs()).toBe(0);
    expect(store.link()).not.toBeNull();
    expect(transport.sent.map((payload) => payload[0])).toEqual([
      CMD_DEVICE_QUERY,
      CMD_APP_START,
      CMD_GET_DEVICE_TIME,
      CMD_SET_DEVICE_TIME,
      CMD_GET_DEVICE_TIME,
      CMD_GET_CONTACTS,
    ]);
    expect(companion.time).toBe(EPOCH);
    const clockLine = store.log().find((line) => line.includes("clock:"));
    expect(clockLine).toContain("moved forward 3600 s");
    expect(store.log().some((line) => line.includes("contacts: 2"))).toBe(true);
    expect(store.log().some((line) => line.includes('"Stab 1"'))).toBe(true);
    await store.disconnect();
  });

  it("logs when the companion's clock did not move", async () => {
    const { store, companion } = setUp();
    companion.time = EPOCH + 60; // ahead of the PC; the firmware keeps it
    await store.connect("usb");
    expect(store.log().find((line) => line.includes("clock:"))).toContain("unchanged");
    await store.disconnect();
  });

  it("goes blind when nothing is heard for longer than the blind time, and back on the next frame", async () => {
    const { store, transport, advance, now } = setUp();
    await store.connect("usb");

    advance(BLIND_AFTER);
    expect(store.state()).toBe("connected");
    expect(store.elapsedMs()).toBe(BLIND_AFTER);

    advance(1);
    expect(store.state()).toBe("blind");

    transport.push(bytes(PUSH_CODE_MSG_WAITING));
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    expect(store.lastHeardAt()).toBe(now());
    expect(store.elapsedMs()).toBe(0);
    expect(store.link()?.inbox).toEqual([bytes(PUSH_CODE_MSG_WAITING)]);
    await store.disconnect();
  });

  it("applies a changed blind time at once", async () => {
    const { store, advance, setBlindAfter } = setUp();
    await store.connect("usb");
    advance(2 * MINUTE);
    expect(store.state()).toBe("connected");
    setBlindAfter(MINUTE);
    expect(store.state()).toBe("blind");
    setBlindAfter(BLIND_AFTER);
    expect(store.state()).toBe("connected");
    await store.disconnect();
  });

  it("a response frame counts as heard, not only a push", async () => {
    const { store, advance, now } = setUp();
    await store.connect("usb");
    advance(BLIND_AFTER + 1);
    expect(store.state()).toBe("blind");
    await store.refreshContacts();
    expect(store.state()).toBe("connected");
    expect(store.lastHeardAt()).toBe(now());
    await store.disconnect();
  });

  it("disconnects on request and keeps when it last heard something", async () => {
    const { store, transport, advance, now } = setUp();
    await store.connect("usb");
    const heardAt = now();
    await store.disconnect();
    expect(store.state()).toBe("disconnected");
    expect(store.kind()).toBeNull();
    expect(store.link()).toBeNull();
    expect(transport.disconnectCalls).toBe(1);
    expect(store.lastHeardAt()).toBe(heardAt);
    advance(5 * MINUTE);
    expect(store.elapsedMs()).toBe(5 * MINUTE);
    expect(store.state()).toBe("disconnected");
  });

  it("becomes disconnected when the companion goes away", async () => {
    const { store, transport } = setUp();
    await store.connect("usb");
    transport.close();
    await vi.waitFor(() => expect(store.state()).toBe("disconnected"));
    expect(store.link()).toBeNull();
    expect(transport.disconnectCalls).toBe(1);
    expect(store.log().some((line) => line.includes("link closed"))).toBe(true);
  });

  it("stays disconnected when the transport cannot open", async () => {
    const { store, transport } = setUp();
    transport.connectError = new Error("no port chosen");
    await expect(store.connect("ble")).rejects.toThrow("no port chosen");
    expect(store.state()).toBe("disconnected");
    expect(store.kind()).toBeNull();
    expect(store.log().some((line) => line.includes("connect (ble) failed: no port chosen"))).toBe(true);
  });

  it("drops the connection when the device is not a companion", async () => {
    const { store, transport, companion } = setUp();
    companion.broken = true;
    await expect(store.connect("usb")).rejects.toBeInstanceOf(CompanionError);
    expect(store.state()).toBe("disconnected");
    expect(store.selfInfo()).toBeNull();
    expect(transport.disconnectCalls).toBe(1);
  });

  it("tells onConnected listeners once per successful connect, after the contacts are read", async () => {
    const { store, transport, companion } = setUp();
    const seen: number[] = [];
    const stop = store.onConnected(() => seen.push(store.contacts().length));
    store.onConnected(() => {
      throw new Error("boom");
    });

    companion.broken = true;
    await expect(store.connect("usb")).rejects.toBeInstanceOf(CompanionError);
    expect(seen).toEqual([]);

    companion.broken = false;
    await store.connect("usb");
    expect(seen).toEqual([2]);
    expect(store.log().some((line) => line.includes("connected listener failed: boom"))).toBe(true);
    await store.disconnect();

    await store.connect("usb");
    expect(seen).toEqual([2, 2]);
    await store.disconnect();

    stop();
    await store.connect("usb");
    expect(seen).toEqual([2, 2]);
    expect(transport.connectCalls).toBe(4);
    await store.disconnect();
  });

  it("refuses a second connect while connected", async () => {
    const { store } = setUp();
    await store.connect("usb");
    await expect(store.connect("usb")).rejects.toThrow();
    expect(store.state()).toBe("connected");
    await store.disconnect();
  });

  it("can connect again after disconnecting", async () => {
    const { store } = setUp();
    await store.connect("usb");
    await store.disconnect();
    await store.connect("usb");
    expect(store.state()).toBe("connected");
    await store.disconnect();
  });

  it("refreshContacts reads the companion again and rejects when disconnected", async () => {
    const { store, companion } = setUp();
    await expect(store.refreshContacts()).rejects.toThrow();
    await store.connect("usb");
    companion.contacts = [contactFrame({ name: "Ny", publicKey: "cc".repeat(32) })];
    const list = await store.refreshContacts();
    expect(list.map((contact) => contact.name)).toEqual(["Ny"]);
    expect(store.contacts()).toEqual(list);
    await store.disconnect();
  });

  it("fans pushes out to listeners until they unsubscribe, across a reconnect, and survives a throwing one", async () => {
    const { store, transport } = setUp();
    const seen: number[] = [];
    const unsubscribe = store.onPush((frame) => seen.push(frame[0] ?? 0));
    store.onPush(() => {
      throw new Error("listener broke");
    });
    await store.connect("usb");

    transport.push(bytes(PUSH_CODE_MSG_WAITING));
    await vi.waitFor(() => expect(seen).toEqual([PUSH_CODE_MSG_WAITING]));
    expect(store.log().some((line) => line.includes("push listener failed: listener broke"))).toBe(true);
    // The response frames of connect() did not reach the listener: pushes only.
    expect(seen).toHaveLength(1);

    await store.disconnect();
    await store.connect("usb");
    transport.push(bytes(PUSH_CODE_MSG_WAITING));
    await vi.waitFor(() => expect(seen).toHaveLength(2));

    unsubscribe();
    transport.push(bytes(PUSH_CODE_MSG_WAITING));
    // The new link's inbox has both pushes since the reconnect; the listener saw only one.
    await vi.waitFor(() => expect(store.link()?.inbox.length).toBe(2));
    expect(seen).toHaveLength(2);
    await store.disconnect();
  });

  it("keeps the last 200 log lines", async () => {
    const { store, transport } = setUp();
    for (let i = 0; i < 230; i++) {
      transport.connectError = new Error(`attempt ${i}`);
      await expect(store.connect("usb")).rejects.toThrow();
    }
    expect(store.log().length).toBe(200);
    expect(store.log()[0]).toContain("attempt 30");
    expect(store.log()[199]).toContain("attempt 229");
  });
});

describe("CompanionContactSource", () => {
  it("lists the companion's contacts as the picker's shape, refreshed on every call", async () => {
    const { store, companion } = setUp();
    const source = new CompanionContactSource(store);
    await expect(source.listContacts()).rejects.toThrow();
    await store.connect("usb");
    expect(await source.listContacts()).toEqual([
      { publicKey: HANS_KEY, name: "Hans" },
      { publicKey: PETER_KEY, name: "Peter" },
    ]);
    companion.contacts = [];
    expect(await source.listContacts()).toEqual([]);
    await store.disconnect();
  });
});
