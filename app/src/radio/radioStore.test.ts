import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import {
  BLE_RECONNECT_GIVE_UP_MS,
  CLOCK_DRIFT_LIMIT_S,
  LINK_CHECK_TIMEOUT_MS,
  RECONNECT_DELAYS_MS,
  createRadioStore,
  disconnectReasonText,
  type PageEvents,
  type ReconnectTiming,
} from "./radioStore.svelte.ts";
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
import { setLanguage } from "../i18n/index.svelte.ts";
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

// Short waits so the reconnect loop runs within a test; the real values are asserted apart.
// The budget only counts on the real clock (the fake one stands still).
const FAST: ReconnectTiming = { delaysMs: [5, 10, 20], bleGiveUpMs: 80, linkCheckTimeoutMs: 50 };
// A first wait no test outlives, so the waiting phase can be looked at; the budget has to
// hold it, since the wait itself counts against the budget.
const PATIENT: ReconnectTiming = {
  delaysMs: [10_000],
  bleGiveUpMs: 600_000,
  linkCheckTimeoutMs: 50,
};

setLanguage("en");

function setUp(
  options: {
    blindAfterMs?: number;
    companionTime?: number;
    clock?: "fake" | "real";
    timing?: ReconnectTiming;
  } = {},
) {
  let now = EPOCH * 1000;
  let blindAfterMs = options.blindAfterMs ?? BLIND_AFTER;
  const transport = new FakeTransport();
  const companion = scriptedCompanion({ time: options.companionTime ?? EPOCH - 3600 });
  transport.autoReply = companion.reply;
  const page: PageEvents & { visible: boolean } = {
    document: new EventTarget(),
    window: new EventTarget(),
    visible: true,
    isVisible() {
      return this.visible;
    },
  };
  const store = createRadioStore({
    now: options.clock === "real" ? () => Date.now() : () => now,
    blindAfterMs: () => blindAfterMs,
    createTransport: () => transport,
    appName: "BCentral",
    reconnect: options.timing ?? FAST,
    page,
  });
  return {
    store,
    transport,
    companion,
    page,
    advance(ms: number) {
      now += ms;
      store.refreshNow();
    },
    setBlindAfter(ms: number) {
      blindAfterMs = ms;
    },
    now: () => now,
    logHas: (text: string) => store.log().some((line) => line.includes(text)),
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
    expect(store.log().some((line) => line.includes("connect (ble) failed: no port chosen"))).toBe(
      true,
    );
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
    expect(store.log().some((line) => line.includes("push listener failed: listener broke"))).toBe(
      true,
    );
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

  it("clearLog empties the log and the next line starts it afresh (P2-04)", async () => {
    const { store, transport } = setUp();
    transport.connectError = new Error("first");
    await expect(store.connect("usb")).rejects.toThrow();
    expect(store.log().length).toBeGreaterThan(0);
    store.clearLog();
    expect(store.log()).toEqual([]);
    transport.connectError = new Error("second");
    await expect(store.connect("usb")).rejects.toThrow();
    expect(store.log().some((line) => line.includes("second"))).toBe(true);
    expect(store.log().some((line) => line.includes("first"))).toBe(false);
  });
});

describe("companion clock drift (P1-07)", () => {
  it("logs and exposes a companion clock more than the limit behind the PC", async () => {
    const { store, logHas } = setUp({ companionTime: EPOCH - 3600 });
    await store.connect("usb");
    expect(store.clockDriftSeconds()).toBe(-3600);
    expect(logHas("clock drift: companion was 3600 s behind the PC (limit 60 s)")).toBe(true);
    await store.disconnect();
  });

  it("logs a companion more than the limit ahead, which the firmware does not turn back", async () => {
    const { store, companion, logHas } = setUp({ companionTime: EPOCH + 90 });
    await store.connect("usb");
    expect(store.clockDriftSeconds()).toBe(90);
    expect(logHas("clock drift: companion was 90 s ahead of the PC")).toBe(true);
    expect(companion.time).toBe(EPOCH + 90);
    await store.disconnect();
  });

  it("keeps quiet within the limit, and the limit is 60 s", async () => {
    const { store, logHas } = setUp({ companionTime: EPOCH + 60 });
    expect(store.clockDriftSeconds()).toBeNull();
    await store.connect("usb");
    expect(store.clockDriftSeconds()).toBe(60);
    expect(logHas("clock drift")).toBe(false);
    expect(CLOCK_DRIFT_LIMIT_S).toBe(60);
    await store.disconnect();
  });
});

describe("reconnect after a lost link (P1-07)", () => {
  it("uses the task's backoff and budget by default", () => {
    expect(RECONNECT_DELAYS_MS).toEqual([2000, 5000, 10000, 30000]);
    expect(BLE_RECONNECT_GIVE_UP_MS).toBe(5 * MINUTE);
    expect(LINK_CHECK_TIMEOUT_MS).toBe(3000);
  });

  it("names every reason in a sentence", () => {
    expect(disconnectReasonText("unplugged")).toBe("radio unplugged");
    expect(disconnectReasonText("gaveUp")).toContain("5 min");
  });

  it("a lost Bluetooth link is tried again with backoff until it is back, every attempt logged", async () => {
    const { store, transport, logHas } = setUp();
    transport.device = new EventTarget();
    let connects = 0;
    store.onConnected(() => connects++);
    await store.connect("ble");
    expect(store.canReconnect()).toBe(true);

    transport.connectFailures = 2;
    transport.close();

    // The loss lands a few microtasks later; the log line stays, the states pass quickly.
    await vi.waitFor(() => expect(logHas("link closed by the companion")).toBe(true));
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    expect(store.disconnectReason()).toBeNull();
    expect(store.reconnecting()).toBeNull();
    expect(transport.connectCalls).toBe(4);
    expect(connects).toBe(2);
    for (const line of [
      "link closed by the companion",
      "reconnect (ble): attempt 1 in 5 ms",
      "reconnect (ble): attempt 1 failed: cannot open",
      "reconnect (ble): attempt 2 in 10 ms",
      "reconnect (ble): attempt 2 failed",
      "reconnect (ble): attempt 3 in 20 ms",
      "reconnect (ble): connected on attempt 3",
    ]) {
      expect(logHas(line), line).toBe(true);
    }
    await store.disconnect();
  });

  it("gives up Bluetooth after the budget, keeps the device, and Reconnect starts a fresh loop", async () => {
    const { store, transport, logHas } = setUp({ clock: "real" });
    transport.device = new EventTarget();
    await store.connect("ble");
    transport.connectFailures = 100;
    transport.close();

    await vi.waitFor(() => expect(store.disconnectReason()).toBe("gaveUp"), { timeout: 2000 });
    expect(store.state()).toBe("disconnected");
    expect(store.reconnecting()).toBeNull();
    expect(store.canReconnect()).toBe(true);
    expect(logHas("reconnect (ble): gave up after")).toBe(true);
    const attemptsSoFar = transport.connectCalls;
    expect(attemptsSoFar).toBeGreaterThan(2);

    transport.connectFailures = 0;
    store.reconnectNow();
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    expect(logHas("reconnect (ble): started by the operator")).toBe(true);
    expect(transport.connectCalls).toBe(attemptsSoFar + 1);
    await store.disconnect();
  });

  it("while the loop waits: disconnected with the reason and a countdown; Reconnect attempts at once", async () => {
    const { store, transport, now, logHas } = setUp({ timing: PATIENT });
    transport.device = new EventTarget();
    await store.connect("ble");
    transport.close();

    await vi.waitFor(() => expect(store.reconnecting()).not.toBeNull());
    expect(store.state()).toBe("disconnected");
    expect(store.disconnectReason()).toBe("bleLost");
    expect(store.reconnecting()).toEqual({ attempt: 1, nextAttemptAtMs: now() + 10_000 });
    expect(store.reconnectCountdownMs()).toBe(10_000);
    expect(logHas("reconnect (ble): attempt 1 in 10000 ms")).toBe(true);

    store.reconnectNow();
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    expect(logHas("trying now at the operator's request")).toBe(true);
    expect(logHas("reconnect (ble): connected on attempt 1")).toBe(true);
    expect(store.reconnecting()).toBeNull();
    await store.disconnect();
  });

  it("a manual disconnect or connect ends the loop", async () => {
    const { store, transport } = setUp();
    transport.device = new EventTarget();
    await store.connect("ble");
    transport.connectFailures = 100;
    transport.close();
    await vi.waitFor(() => expect(store.reconnecting()).not.toBeNull());
    await store.disconnect();
    expect(store.reconnecting()).toBeNull();
    expect(store.disconnectReason()).toBeNull();
    const calls = transport.connectCalls;
    await sleep(60);
    expect(transport.connectCalls).toBe(calls);
    expect(store.state()).toBe("disconnected");

    transport.connectFailures = 0;
    await store.connect("ble");
    transport.connectFailures = 100;
    transport.close();
    await vi.waitFor(() => expect(store.reconnecting()).not.toBeNull());
    transport.connectFailures = 0;
    await store.connect("ble");
    expect(store.reconnecting()).toBeNull();
    expect(store.state()).toBe("connected");
    await store.disconnect();
  });

  it("nothing kept means nothing to reconnect to: the chooser's cancel leaves no device", async () => {
    const { store, transport } = setUp();
    transport.connectError = new Error("no port chosen");
    await expect(store.connect("usb")).rejects.toThrow();
    expect(store.canReconnect()).toBe(false);
    store.reconnectNow();
    expect(store.reconnecting()).toBeNull();
  });
});

describe("link check after a wake (P1-07)", () => {
  // Answers every command except the next CMD_GET_DEVICE_TIME, which goes unanswered once.
  function silentOnce(transport: FakeTransport, reply: (payload: Uint8Array) => Uint8Array[]) {
    let silent = true;
    transport.autoReply = (payload) => {
      if (payload[0] === CMD_GET_DEVICE_TIME && silent) {
        silent = false;
        return [];
      }
      return reply(payload);
    };
  }

  it("a companion that answers keeps the link and counts as heard", async () => {
    const { store, advance, now } = setUp();
    await store.connect("usb");
    advance(2 * MINUTE);
    expect(await store.verifyLink()).toBe(true);
    expect(store.lastHeardAt()).toBe(now());
    expect(store.state()).toBe("connected");
    await store.disconnect();
  });

  it("a silent companion is a lost link: disconnected with the reason, then the reconnect path", async () => {
    const { store, transport, companion, logHas } = setUp();
    transport.device = new EventTarget();
    await store.connect("ble");
    silentOnce(transport, companion.reply);

    expect(await store.verifyLink()).toBe(false);
    expect(store.disconnectReason()).toBe("silent");
    expect(logHas("link check (request): no answer")).toBe(true);
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    expect(store.disconnectReason()).toBeNull();
    expect(transport.connectCalls).toBe(2);
    expect(logHas("reconnect (ble): connected on attempt 1")).toBe(true);
    await store.disconnect();
  });

  it("does nothing while disconnected", async () => {
    const { store, transport } = setUp();
    expect(await store.verifyLink()).toBe(false);
    expect(transport.sent).toEqual([]);
  });

  it("visibilitychange to visible, resume, pageshow and online each run the check", async () => {
    const { store, transport, companion, page, logHas } = setUp();
    transport.device = new EventTarget();
    store.start();
    await store.connect("ble");

    page.visible = false;
    page.document.dispatchEvent(new Event("visibilitychange"));
    expect(logHas("link check")).toBe(false);

    page.visible = true;
    page.document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() =>
      expect(logHas("link check (visible): the companion answered")).toBe(true),
    );
    page.document.dispatchEvent(new Event("resume"));
    await vi.waitFor(() => expect(logHas("link check (resume)")).toBe(true));
    page.window.dispatchEvent(new Event("pageshow"));
    await vi.waitFor(() => expect(logHas("link check (pageshow)")).toBe(true));

    silentOnce(transport, companion.reply);
    page.window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(logHas("link check (online): no answer")).toBe(true));
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    expect(transport.connectCalls).toBe(2);
    await store.disconnect();
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
