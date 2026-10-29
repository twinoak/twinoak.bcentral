// Web Bluetooth as a test sees it (P1-07): a Bluetooth with a chooser, a device with a GATT
// server that can refuse to connect, the Nordic UART service, and the two characteristics,
// so MeshCoreBle runs unchanged against it. A write to RX is answered by a scripted
// companion through notifications on TX, one frame per notification.

import { BLE_RX_UUID, BLE_SERVICE_UUID, BLE_TX_UUID } from "../radio/ble.ts";
import type { ScriptedCompanion } from "./companionFrames.ts";

export class FakeCharacteristic extends EventTarget implements BluetoothRemoteGATTCharacteristic {
  readonly uuid: string;
  value?: DataView;
  readonly writes: Uint8Array[] = [];
  notifying = false;
  private readonly device: FakeBluetoothDevice;

  constructor(uuid: string, device: FakeBluetoothDevice) {
    super();
    this.uuid = uuid;
    this.device = device;
  }

  async readValue(): Promise<DataView> {
    return this.value ?? new DataView(new ArrayBuffer(0));
  }

  async writeValue(value: Uint8Array): Promise<void> {
    await this.writeValueWithoutResponse(value);
  }

  async writeValueWithResponse(value: Uint8Array): Promise<void> {
    await this.writeValueWithoutResponse(value);
  }

  async writeValueWithoutResponse(value: Uint8Array): Promise<void> {
    if (!this.device.gatt.connected) {
      throw new DOMException("GATT Server is disconnected.", "NetworkError");
    }
    this.writes.push(value);
    for (const frame of this.device.companion.reply(value)) {
      this.device.tx.notify(frame);
    }
  }

  async startNotifications(): Promise<BluetoothRemoteGATTCharacteristic> {
    this.notifying = true;
    return this;
  }

  async stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic> {
    this.notifying = false;
    return this;
  }

  // A notification from the companion: the value is set, then the event fires.
  notify(frame: Uint8Array): void {
    const copy = Uint8Array.from(frame);
    this.value = new DataView(copy.buffer);
    this.dispatchEvent(new Event("characteristicvaluechanged"));
  }
}

export class FakeGattService implements BluetoothRemoteGATTService {
  readonly uuid = BLE_SERVICE_UUID;
  private readonly device: FakeBluetoothDevice;

  constructor(device: FakeBluetoothDevice) {
    this.device = device;
  }

  async getCharacteristic(
    uuid: BluetoothCharacteristicUUID,
  ): Promise<BluetoothRemoteGATTCharacteristic> {
    if (uuid === BLE_RX_UUID) {
      return this.device.rx;
    }
    if (uuid === BLE_TX_UUID) {
      return this.device.tx;
    }
    throw new DOMException(`No Characteristics matching UUID ${String(uuid)}`, "NotFoundError");
  }
}

export class FakeGattServer implements BluetoothRemoteGATTServer {
  readonly device: FakeBluetoothDevice;
  connected = false;
  connectCalls = 0;
  // connect() throws this many more times (the radio out of range or still booting).
  connectFailures = 0;

  constructor(device: FakeBluetoothDevice) {
    this.device = device;
  }

  async connect(): Promise<BluetoothRemoteGATTServer> {
    this.connectCalls++;
    if (this.connectFailures > 0) {
      this.connectFailures--;
      throw new DOMException("Connection failed for unknown reason.", "NetworkError");
    }
    this.connected = true;
    return this;
  }

  // Both the app's disconnect and a drop end here; the browser fires the event either way.
  disconnect(): void {
    if (!this.connected) {
      return;
    }
    this.connected = false;
    this.device.dispatchEvent(new Event("gattserverdisconnected"));
  }

  async getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService> {
    if (!this.connected) {
      throw new DOMException("GATT Server is disconnected.", "NetworkError");
    }
    if (service !== BLE_SERVICE_UUID) {
      throw new DOMException(`No Services matching UUID ${String(service)}`, "NotFoundError");
    }
    return this.device.service;
  }
}

export class FakeBluetoothDevice extends EventTarget implements BluetoothDevice {
  readonly id = "fake-meshcore";
  readonly name = "MeshCore-Stab";
  readonly companion: ScriptedCompanion;
  readonly gatt: FakeGattServer;
  readonly service: FakeGattService;
  readonly rx: FakeCharacteristic;
  readonly tx: FakeCharacteristic;

  constructor(companion: ScriptedCompanion) {
    super();
    this.companion = companion;
    this.gatt = new FakeGattServer(this);
    this.service = new FakeGattService(this);
    this.rx = new FakeCharacteristic(BLE_RX_UUID, this);
    this.tx = new FakeCharacteristic(BLE_TX_UUID, this);
  }

  // The link drops on the radio's side (out of range, radio off): gattserverdisconnected.
  drop(): void {
    this.gatt.disconnect();
  }
}

export class FakeBluetooth extends EventTarget implements Bluetooth {
  requestDeviceCalls = 0;
  // What requestDevice() hands out; null means the operator cancelled the chooser.
  chooserPick: FakeBluetoothDevice | null = null;

  async requestDevice(): Promise<BluetoothDevice> {
    this.requestDeviceCalls++;
    const pick = this.chooserPick;
    if (pick === null) {
      throw new DOMException("User cancelled the requestDevice() chooser.", "NotFoundError");
    }
    return pick;
  }

  async getAvailability(): Promise<boolean> {
    return true;
  }
}
