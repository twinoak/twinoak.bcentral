// The Web Serial transport and the store's USB reconnect paths (P1-07) against a fake
// navigator.serial: granted ports, plug events, a port whose open() fails for a while.

import { describe, expect, it, vi } from "vitest";
import { createRadioStore, type ReconnectTiming } from "./radioStore.svelte.ts";
import { MeshCoreSerial } from "./serial.ts";
import { scriptedCompanion, EPOCH } from "../test-support/companionFrames.ts";
import { FakeSerial, FakeSerialPort } from "../test-support/fakeWebSerial.ts";

const FAST: ReconnectTiming = { delaysMs: [5, 10, 20], bleGiveUpMs: 80, linkCheckTimeoutMs: 50 };

function setUp(options: { ports?: number } = {}) {
  const serial = new FakeSerial();
  const companion = scriptedCompanion({ time: EPOCH });
  const ports: FakeSerialPort[] = [];
  for (let i = 0; i < (options.ports ?? 1); i++) {
    const port = new FakeSerialPort(companion);
    ports.push(port);
    serial.ports.push(port);
  }
  let connects = 0;
  const store = createRadioStore({
    now: () => Date.now(),
    blindAfterMs: () => 15 * 60_000,
    createTransport: (kind, port) => {
      if (kind !== "usb") {
        throw new Error("usb only here");
      }
      return new MeshCoreSerial({ serial, port });
    },
    serial,
    reconnect: FAST,
  });
  store.onConnected(() => connects++);
  return {
    serial,
    companion,
    port: ports[0] as FakeSerialPort,
    ports,
    store,
    connects: () => connects,
    logHas: (text: string) => store.log().some((line) => line.includes(text)),
  };
}

describe("USB auto-connect and reconnect (P1-07)", () => {
  it("start connects the one granted port without a gesture", async () => {
    const { store, serial, port, connects, logHas } = setUp();
    store.start();
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    expect(serial.requestPortCalls).toBe(0);
    expect(port.opens).toBe(1);
    expect(store.kind()).toBe("usb");
    expect(store.selfInfo()?.name).toBe("Stab 1");
    expect(store.contacts()).toHaveLength(2);
    expect(connects()).toBe(1);
    expect(logHas("start: looking for a granted USB port")).toBe(true);
    expect(logHas("serial: port open at 115200 baud (USB 0x303a:0x1001)")).toBe(true);
    await store.disconnect();
    expect(port.closes).toBe(1);
    expect(port.isOpen).toBe(false);
  });

  it("start with no granted port, or with two, waits for the operator", async () => {
    const none = setUp({ ports: 0 });
    none.store.start();
    await vi.waitFor(() => expect(none.logHas("no granted port present")).toBe(true));
    expect(none.store.state()).toBe("disconnected");
    expect(none.store.reconnecting()).toBeNull();

    const two = setUp({ ports: 2 });
    two.store.start();
    await vi.waitFor(() => expect(two.logHas("2 granted ports present")).toBe(true));
    expect(two.store.state()).toBe("disconnected");
    expect(two.ports.every((port) => port.opens === 0)).toBe(true);
  });

  it("the disconnect event makes it disconnected with the reason; the connect event brings it back", async () => {
    const { store, serial, port, connects, logHas } = setUp();
    store.start();
    await vi.waitFor(() => expect(store.state()).toBe("connected"));

    serial.unplug(port);
    expect(store.state()).toBe("disconnected");
    expect(store.disconnectReason()).toBe("unplugged");
    expect(store.reconnecting()).toBeNull();
    expect(logHas("usb: the port was unplugged")).toBe(true);
    await vi.waitFor(() => expect(port.closes).toBe(1));
    expect(store.link()).toBeNull();

    serial.plug(port);
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    expect(store.disconnectReason()).toBeNull();
    expect(port.opens).toBe(2);
    expect(serial.requestPortCalls).toBe(0);
    expect(connects()).toBe(2);
    expect(logHas("usb: a granted port was plugged in")).toBe(true);
    expect(logHas("reconnect (usb): connected on attempt 1")).toBe(true);
    await store.disconnect();
  });

  it("open() failing twice then succeeding: connected after the backoff, the attempts logged", async () => {
    const { store, port, logHas } = setUp();
    port.openFailures = 2;
    store.start();
    await vi.waitFor(() => expect(store.state()).toBe("connected"), { timeout: 2000 });
    expect(port.opens).toBe(3);
    for (const line of [
      "reconnect (usb): attempt 1 failed: Failed to open serial port.",
      "reconnect (usb): attempt 2 in 5 ms",
      "reconnect (usb): attempt 2 failed: Failed to open serial port.",
      "reconnect (usb): attempt 3 in 10 ms",
      "reconnect (usb): connected on attempt 3",
    ]) {
      expect(logHas(line), line).toBe(true);
    }
    await store.disconnect();
  });

  it("a read loop that ends with no event starts the loop, which stops while the port is gone", async () => {
    const { store, serial, port, logHas } = setUp();
    store.start();
    await vi.waitFor(() => expect(store.state()).toBe("connected"));

    port.unplug();
    await vi.waitFor(() => expect(store.state()).toBe("disconnected"));
    expect(store.disconnectReason()).toBe("lost");
    await vi.waitFor(() => expect(logHas("reconnect (usb): no granted port present")).toBe(true));
    expect(store.reconnecting()).toBeNull();
    expect(port.opens).toBe(1);

    serial.plug(port);
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    expect(port.opens).toBe(2);
    await store.disconnect();
  });

  it("a radio that comes back as a new port object is connected all the same", async () => {
    const { store, serial, port, companion } = setUp();
    store.start();
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    serial.unplug(port);
    serial.ports.length = 0;

    const replacement = new FakeSerialPort(companion);
    serial.plug(replacement);
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    expect(replacement.opens).toBe(1);
    expect(port.opens).toBe(1);
    await store.disconnect();
  });

  it("an unplug of another granted port is somebody else's", async () => {
    const { store, serial, port, companion } = setUp();
    store.start();
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    const other = new FakeSerialPort(companion);
    serial.ports.push(other);
    serial.unplug(other);
    expect(store.state()).toBe("connected");
    expect(store.link()).not.toBeNull();
    expect(port.isOpen).toBe(true);
    await store.disconnect();
  });

  it("the chooser path keeps the port: Reconnect reopens it without the chooser", async () => {
    const { store, serial, companion } = setUp({ ports: 0 });
    const chosen = new FakeSerialPort(companion);
    serial.chooserPick = chosen;
    await store.connect("usb");
    expect(serial.requestPortCalls).toBe(1);
    expect(store.canReconnect()).toBe(true);

    await store.disconnect();
    store.reconnectNow();
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    expect(serial.requestPortCalls).toBe(1);
    expect(chosen.opens).toBe(2);
    await store.disconnect();
  });

  it("a cancelled chooser is a failed connect and nothing kept", async () => {
    const { store, serial } = setUp({ ports: 0 });
    await expect(store.connect("usb")).rejects.toThrow("No port selected by the user.");
    expect(store.state()).toBe("disconnected");
    expect(store.canReconnect()).toBe(false);
    expect(serial.requestPortCalls).toBe(1);
  });

  it("a granted radio plugged in after start is connected without a gesture", async () => {
    const { store, serial, port, logHas } = setUp();
    port.present = false;
    store.start();
    await vi.waitFor(() => expect(logHas("no granted port present")).toBe(true));

    serial.plug(port);
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    expect(logHas("usb: a granted port was plugged in")).toBe(true);
    expect(serial.requestPortCalls).toBe(0);
    await store.disconnect();
  });
});
