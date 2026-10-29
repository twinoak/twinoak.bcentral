// The Web Bluetooth transport and the store's Bluetooth reconnect path (P1-07) against a
// fake navigator.bluetooth: a chooser, a GATT server that drops and refuses, notifications.

import { describe, expect, it, vi } from "vitest";
import { MeshCoreBle } from "./ble.ts";
import { createRadioStore, type ReconnectTiming } from "./radioStore.svelte.ts";
import { scriptedCompanion, EPOCH } from "../test-support/companionFrames.ts";
import { FakeBluetooth, FakeBluetoothDevice } from "../test-support/fakeWebBluetooth.ts";

// Short waits so the loop runs within a test. The budget is measured on the real clock here,
// so a test that expects the link back gets one it cannot reach on a slow machine; only the
// give-up test shortens it.
const FAST: ReconnectTiming = {
  delaysMs: [5, 10, 20],
  bleGiveUpMs: 10_000,
  linkCheckTimeoutMs: 50,
};
const SHORT_BUDGET: ReconnectTiming = { ...FAST, bleGiveUpMs: 80 };

function setUp(timing: ReconnectTiming = FAST) {
  const bluetooth = new FakeBluetooth();
  const companion = scriptedCompanion({ time: EPOCH });
  const device = new FakeBluetoothDevice(companion);
  bluetooth.chooserPick = device;
  let connects = 0;
  const store = createRadioStore({
    now: () => Date.now(),
    blindAfterMs: () => 15 * 60_000,
    createTransport: (kind) => {
      if (kind !== "ble") {
        throw new Error("ble only here");
      }
      return new MeshCoreBle({ bluetooth });
    },
    reconnect: timing,
  });
  store.onConnected(() => connects++);
  return {
    bluetooth,
    device,
    companion,
    store,
    connects: () => connects,
    logHas: (text: string) => store.log().some((line) => line.includes(text)),
  };
}

describe("Bluetooth connect and reconnect (P1-07)", () => {
  it("connects through the chooser and talks over the UART characteristics", async () => {
    const { store, bluetooth, device, logHas } = setUp();
    await store.connect("ble");
    expect(store.state()).toBe("connected");
    expect(bluetooth.requestDeviceCalls).toBe(1);
    expect(device.gatt.connectCalls).toBe(1);
    expect(device.tx.notifying).toBe(true);
    expect(device.rx.writes.length).toBeGreaterThan(0);
    expect(store.selfInfo()?.name).toBe("Stab 1");
    expect(store.contacts()).toHaveLength(2);
    expect(logHas("ble: connected to MeshCore-Stab")).toBe(true);
    await store.disconnect();
    expect(device.gatt.connected).toBe(false);
    expect(logHas("ble: disconnected")).toBe(true);
  });

  it("gattserverdisconnected: disconnected with the reason while the loop tries the same device", async () => {
    const { store, bluetooth, device, logHas } = setUp();
    await store.connect("ble");
    device.gatt.connectFailures = 1000;
    device.drop();

    // The GATT keeps refusing, so the loss stays observable for as long as the poll needs.
    await vi.waitFor(() => expect(store.disconnectReason()).toBe("bleLost"));
    expect(store.link()).toBeNull();
    expect(logHas("ble: the companion disconnected")).toBe(true);
    expect(logHas("link closed by the companion")).toBe(true);
    await vi.waitFor(() => expect(store.reconnecting()).not.toBeNull());
    await vi.waitFor(() => expect(device.gatt.connectCalls).toBeGreaterThan(2));
    expect(bluetooth.requestDeviceCalls).toBe(1);
    await store.disconnect();
    expect(store.reconnecting()).toBeNull();
  });

  it("gattserverdisconnected: reconnect attempts with backoff on the same device, then connected", async () => {
    const { store, bluetooth, device, connects, logHas } = setUp();
    await store.connect("ble");
    device.gatt.connectFailures = 3;
    device.drop();

    // The loss lands a few microtasks later; the log line stays, the states pass quickly.
    await vi.waitFor(() => expect(logHas("link closed by the companion")).toBe(true));
    await vi.waitFor(() => expect(store.state()).toBe("connected"), { timeout: 2000 });
    expect(bluetooth.requestDeviceCalls).toBe(1);
    expect(device.gatt.connectCalls).toBe(5);
    expect(connects()).toBe(2);
    expect(store.disconnectReason()).toBeNull();
    expect(store.reconnecting()).toBeNull();
    for (const line of [
      "ble: the companion disconnected",
      "reconnect (ble): attempt 1 in 5 ms",
      "reconnect (ble): attempt 1 failed: Connection failed for unknown reason.",
      "reconnect (ble): attempt 2 in 10 ms",
      "reconnect (ble): attempt 3 in 20 ms",
      "reconnect (ble): attempt 4 in 20 ms",
      "reconnect (ble): connected on attempt 4",
    ]) {
      expect(logHas(line), line).toBe(true);
    }
    await store.disconnect();
  });

  it("after the budget of failures it is disconnected and gives up; Reconnect tries the kept device", async () => {
    const { store, bluetooth, device, logHas } = setUp(SHORT_BUDGET);
    await store.connect("ble");
    device.gatt.connectFailures = 1000;
    device.drop();

    await vi.waitFor(() => expect(store.disconnectReason()).toBe("gaveUp"), { timeout: 2000 });
    expect(store.state()).toBe("disconnected");
    expect(store.reconnecting()).toBeNull();
    expect(store.canReconnect()).toBe(true);
    expect(logHas("reconnect (ble): gave up after")).toBe(true);
    expect(logHas("the device is kept for Reconnect")).toBe(true);

    device.gatt.connectFailures = 0;
    store.reconnectNow();
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    expect(bluetooth.requestDeviceCalls).toBe(1);
    await store.disconnect();
  });

  it("a manual disconnect keeps the device for Reconnect, with no chooser", async () => {
    const { store, bluetooth, device } = setUp();
    await store.connect("ble");
    await store.disconnect();
    expect(store.canReconnect()).toBe(true);
    store.reconnectNow();
    await vi.waitFor(() => expect(store.state()).toBe("connected"));
    expect(bluetooth.requestDeviceCalls).toBe(1);
    expect(device.gatt.connectCalls).toBe(2);
    await store.disconnect();
  });

  it("a cancelled chooser keeps nothing; a device whose GATT refuses is kept", async () => {
    const cancelled = setUp();
    cancelled.bluetooth.chooserPick = null;
    await expect(cancelled.store.connect("ble")).rejects.toThrow("User cancelled");
    expect(cancelled.store.canReconnect()).toBe(false);

    const refused = setUp();
    refused.device.gatt.connectFailures = 1;
    await expect(refused.store.connect("ble")).rejects.toThrow("Connection failed");
    expect(refused.store.canReconnect()).toBe(true);
    refused.store.reconnectNow();
    await vi.waitFor(() => expect(refused.store.state()).toBe("connected"));
    expect(refused.bluetooth.requestDeviceCalls).toBe(1);
    await refused.store.disconnect();
  });
});
