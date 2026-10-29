// A FrameTransport for tests: records what was sent, hands out the frames a test pushes,
// and can answer every sent payload through `autoReply`. receiveFrame() blocks until a
// frame is pushed or the transport is closed, like the real ones.

import { deferred, type Deferred } from "../radio/deferred.ts";
import type { FrameTransport, TransportKind } from "../radio/serial.ts";

export class FakeTransport implements FrameTransport {
  readonly kind: TransportKind;
  onLog: (line: string) => void = () => undefined;
  readonly sent: Uint8Array[] = [];
  connectCalls = 0;
  disconnectCalls = 0;
  // Throw from connect() when set.
  connectError: Error | null = null;
  // Frames to deliver in answer to a payload, in order; null answers nothing.
  autoReply: ((payload: Uint8Array) => Uint8Array[]) | null = null;
  private readonly queue: Uint8Array[] = [];
  private waiter: Deferred<void> | null = null;
  private closed = false;

  constructor(kind: TransportKind = "usb") {
    this.kind = kind;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  async connect(): Promise<void> {
    this.connectCalls++;
    if (this.connectError !== null) {
      throw this.connectError;
    }
    this.closed = false;
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls++;
    this.close();
  }

  // The device side going away: receiveFrame() returns null from now on.
  close(): void {
    this.closed = true;
    this.waiter?.resolve();
  }

  async sendFrame(payload: Uint8Array): Promise<void> {
    this.sent.push(payload);
    if (this.autoReply !== null) {
      for (const frame of this.autoReply(payload)) {
        this.push(frame);
      }
    }
  }

  // A frame from the "companion".
  push(frame: Uint8Array): void {
    this.queue.push(frame);
    this.waiter?.resolve();
  }

  async receiveFrame(): Promise<Uint8Array | null> {
    while (this.queue.length === 0) {
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
    return this.queue.shift() ?? null;
  }
}
