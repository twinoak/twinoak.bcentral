// Web Serial as a test sees it (P1-07): a Serial with granted ports and the plug events, and
// ports whose streams carry companion frames, so MeshCoreSerial runs unchanged against it.
// Built on Node's web streams. A port answers through a scripted companion: every '<'-frame
// written to it is parsed and the companion's reply frames are enqueued as '>'-frames.

import { FRAME_TO_RADIO, concatBytes } from "../radio/serial.ts";
import { fromRadio, type ScriptedCompanion } from "./companionFrames.ts";

export class FakeSerialPort extends EventTarget implements SerialPort {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  // False once unplugged: open() fails and getPorts() leaves the port out.
  present = true;
  // open() throws this many more times (the companion still booting, the port busy).
  openFailures = 0;
  opens = 0;
  closes = 0;
  readonly companion: ScriptedCompanion;
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private pending: Uint8Array = new Uint8Array(0);

  constructor(companion: ScriptedCompanion) {
    super();
    this.companion = companion;
  }

  get isOpen(): boolean {
    return this.readable !== null;
  }

  async open(): Promise<void> {
    this.opens++;
    if (!this.present) {
      throw new DOMException("The port is not present.", "NetworkError");
    }
    if (this.openFailures > 0) {
      this.openFailures--;
      throw new DOMException("Failed to open serial port.", "NetworkError");
    }
    if (this.readable !== null) {
      throw new DOMException("The port is already open.", "InvalidStateError");
    }
    this.pending = new Uint8Array(0);
    this.readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
      },
    });
    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) => this.written(chunk),
    });
  }

  async close(): Promise<void> {
    this.closes++;
    const controller = this.controller;
    this.controller = null;
    this.readable = null;
    this.writable = null;
    if (controller !== null) {
      try {
        controller.close();
      } catch {
        // Already errored by unplug(); nothing to close.
      }
    }
  }

  getInfo(): SerialPortInfo {
    return { usbVendorId: 0x303a, usbProductId: 0x1001 };
  }

  // A frame from the companion, wrapped the way the serial port carries it.
  push(frame: Uint8Array): void {
    this.controller?.enqueue(fromRadio(frame));
  }

  // The cable comes out: the pending read fails as Chrome's does, and the port is gone until
  // it is plugged in again.
  unplug(): void {
    this.present = false;
    const controller = this.controller;
    this.controller = null;
    if (controller !== null) {
      controller.error(new DOMException("The device has been lost.", "NetworkError"));
    }
  }

  // App → radio: '<', uint16 LE length, payload; each payload is answered by the companion.
  private written(chunk: Uint8Array): void {
    let bytes = concatBytes(this.pending, chunk);
    for (;;) {
      if (bytes.length < 3) {
        break;
      }
      if (bytes[0] !== FRAME_TO_RADIO) {
        throw new Error(`unexpected byte ${bytes[0]} where a '<' frame should start`);
      }
      const length = (bytes[1] ?? 0) | ((bytes[2] ?? 0) << 8);
      if (bytes.length < 3 + length) {
        break;
      }
      const payload = bytes.slice(3, 3 + length);
      bytes = bytes.slice(3 + length);
      for (const frame of this.companion.reply(payload)) {
        this.push(frame);
      }
    }
    this.pending = bytes;
  }
}

type PlugEvent = "connect" | "disconnect";

// navigator.serial: the granted ports that are present, the chooser, and the plug events,
// which carry the port as their target the way the browser's do (they bubble from the port).
export class FakeSerial implements Serial {
  readonly ports: FakeSerialPort[] = [];
  requestPortCalls = 0;
  // What requestPort() hands out; null means the operator cancelled the chooser.
  chooserPick: FakeSerialPort | null = null;
  private readonly listeners: Record<PlugEvent, Set<EventListenerOrEventListenerObject>> = {
    connect: new Set(),
    disconnect: new Set(),
  };

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (listener !== null && (type === "connect" || type === "disconnect")) {
      this.listeners[type].add(listener);
    }
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (listener !== null && (type === "connect" || type === "disconnect")) {
      this.listeners[type].delete(listener);
    }
  }

  dispatchEvent(event: Event): boolean {
    if (event.type === "connect" || event.type === "disconnect") {
      this.deliver(event.type, event);
    }
    return true;
  }

  async getPorts(): Promise<SerialPort[]> {
    return this.ports.filter((port) => port.present);
  }

  async requestPort(): Promise<SerialPort> {
    this.requestPortCalls++;
    const pick = this.chooserPick;
    if (pick === null) {
      throw new DOMException("No port selected by the user.", "NotFoundError");
    }
    if (!this.ports.includes(pick)) {
      this.ports.push(pick);
    }
    return pick;
  }

  // A granted port arrives (or comes back): the `connect` event.
  plug(port: FakeSerialPort): void {
    port.present = true;
    if (!this.ports.includes(port)) {
      this.ports.push(port);
    }
    this.fire("connect", port);
  }

  // A granted port goes away: its stream fails, then the `disconnect` event.
  unplug(port: FakeSerialPort): void {
    port.unplug();
    this.fire("disconnect", port);
  }

  private fire(type: PlugEvent, port: FakeSerialPort): void {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, "target", { value: port });
    this.deliver(type, event);
  }

  private deliver(type: PlugEvent, event: Event): void {
    for (const listener of [...this.listeners[type]]) {
      if (typeof listener === "function") {
        listener.call(this, event);
      } else {
        listener.handleEvent(event);
      }
    }
  }
}
