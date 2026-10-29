// MeshCore companion over Web Bluetooth. The companion exposes the Nordic UART service: the
// app writes payloads to the RX characteristic and receives payloads as notifications on
// TX, one frame per notification (no '>' header, no length; the GATT packet is the frame).
// First connection bonds with the companion's PIN (default 123456); the OS asks for it.
//
// Lineage: meshguide.dk/lib/ble.js, same caveat as serial.ts (written from the protocol,
// not copied; reconcile before extraction).

import { deferred, type Deferred } from "./deferred.ts";
import { CompanionClosedError, describeError, type FrameTransport, type TransportKind } from "./serial.ts";

export const BLE_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
// App → companion.
export const BLE_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
// Companion → app, notifications.
export const BLE_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
export const BLE_NAME_PREFIX = "MeshCore";

export class MeshCoreBle implements FrameTransport {
  readonly kind: TransportKind = "ble";
  onLog: (line: string) => void = () => undefined;
  private device: BluetoothDevice | null = null;
  private rx: BluetoothRemoteGATTCharacteristic | null = null;
  private tx: BluetoothRemoteGATTCharacteristic | null = null;
  private readonly frames: Uint8Array[] = [];
  private waiter: Deferred<void> | null = null;
  private closed = false;

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && navigator.bluetooth !== undefined;
  }

  async connect(): Promise<void> {
    const bluetooth = typeof navigator === "undefined" ? undefined : navigator.bluetooth;
    if (bluetooth === undefined) {
      throw new Error("Web Bluetooth is not available in this browser");
    }
    const device = await bluetooth.requestDevice({
      filters: [{ services: [BLE_SERVICE_UUID] }, { namePrefix: BLE_NAME_PREFIX }],
      optionalServices: [BLE_SERVICE_UUID],
    });
    const gatt = device.gatt;
    if (gatt === undefined) {
      throw new Error("the chosen device has no GATT server");
    }
    device.addEventListener("gattserverdisconnected", this.onGattDisconnected);
    const server = await gatt.connect();
    const service = await server.getPrimaryService(BLE_SERVICE_UUID);
    const rx = await service.getCharacteristic(BLE_RX_UUID);
    const tx = await service.getCharacteristic(BLE_TX_UUID);
    tx.addEventListener("characteristicvaluechanged", this.onNotification);
    await tx.startNotifications();
    this.device = device;
    this.rx = rx;
    this.tx = tx;
    this.closed = false;
    this.onLog(`ble: connected to ${device.name ?? device.id}`);
  }

  private readonly onNotification = (event: Event): void => {
    const target = event.target as BluetoothRemoteGATTCharacteristic | null;
    const value = target?.value;
    if (value === undefined) {
      return;
    }
    // Copy: the DataView's buffer belongs to the browser and may be reused.
    this.frames.push(new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)));
    this.wake();
  };

  private readonly onGattDisconnected = (): void => {
    if (this.closed) {
      return;
    }
    this.onLog("ble: the companion disconnected");
    this.closed = true;
    this.wake();
  };

  private wake(): void {
    this.waiter?.resolve();
  }

  async disconnect(): Promise<void> {
    const { device, tx } = this;
    this.closed = true;
    this.wake();
    this.device = null;
    this.rx = null;
    this.tx = null;
    if (tx !== null) {
      tx.removeEventListener("characteristicvaluechanged", this.onNotification);
    }
    if (device !== null) {
      device.removeEventListener("gattserverdisconnected", this.onGattDisconnected);
      if (device.gatt?.connected) {
        try {
          device.gatt.disconnect();
          this.onLog("ble: disconnected");
        } catch (error) {
          this.onLog(`ble: disconnect failed: ${describeError(error)}`);
        }
      }
    }
  }

  async sendFrame(payload: Uint8Array): Promise<void> {
    const rx = this.rx;
    if (rx === null || this.closed) {
      throw new CompanionClosedError();
    }
    await rx.writeValueWithoutResponse(payload);
  }

  async receiveFrame(): Promise<Uint8Array | null> {
    while (this.frames.length === 0) {
      if (this.closed) {
        return null;
      }
      const waiter = deferred<void>();
      this.waiter = waiter;
      await waiter.promise;
      if (this.waiter === waiter) {
        this.waiter = null;
      }
    }
    return this.frames.shift() ?? null;
  }
}
