// The app's view of the companion radio: connection state, who it is, its contacts, when it
// was last heard. Built by createRadioStore() with its clock and transports injected, so the
// blind rule is tested with a fake clock and a fake transport; index.ts makes the app's one.
//
// state():
//   disconnected  no transport
//   connecting    transport opening, or identity not yet read
//   connected     identity read, and a frame has arrived within the blind time
//   blind         connected, but nothing heard for longer than the blind time (settings)
//
// lastHeardAt moves on every received frame, pushes and responses alike. "now" is the
// store's own reading of the clock, refreshed by refreshNow(); the app ticks it once a
// second so the top bar's elapsed time and the blind flip happen without a frame.

import { t } from "../i18n/index.svelte.ts";
import {
  CompanionLink,
  companionGetContacts,
  companionQuery,
  companionSetTime,
  describeError,
  hexCode,
  type CompanionContact,
  type DeviceInfo,
  type FrameTransport,
  type SelfInfo,
  type TransportKind,
} from "./serial.ts";

export type RadioState = "disconnected" | "connecting" | "connected" | "blind";
type Connection = "disconnected" | "connecting" | "connected";
export type PushListener = (frame: Uint8Array) => void;

export const LOG_LIMIT = 200;

export interface RadioStoreDeps {
  // Milliseconds since the epoch.
  now: () => number;
  // The blind time; read on every state() call so a settings change applies at once.
  blindAfterMs: () => number;
  createTransport: (kind: TransportKind) => FrameTransport;
  appName?: string;
  // Where log lines also go (the console in the app); the store keeps the last LOG_LIMIT.
  logSink?: (line: string) => void;
}

export interface RadioStore {
  state(): RadioState;
  kind(): TransportKind | null;
  selfInfo(): SelfInfo | null;
  deviceInfo(): DeviceInfo | null;
  contacts(): readonly CompanionContact[];
  lastHeardAt(): number | null;
  // now − lastHeardAt, or null when nothing has been heard yet.
  elapsedMs(): number | null;
  log(): readonly string[];
  // The live link, for the tasks that send and receive (P0-05, P0-06); null when not connected.
  link(): CompanionLink | null;
  // Every push frame (code >= 0x80) from whichever link is live, so a listener survives a
  // reconnect. Returns the unsubscribe. The outbox listens for PUSH_CODE_SEND_CONFIRMED here.
  onPush(listener: PushListener): () => void;
  connect(kind: TransportKind): Promise<void>;
  disconnect(): Promise<void>;
  // Reads the contact list from the companion again.
  refreshContacts(): Promise<CompanionContact[]>;
  refreshNow(): void;
}

function iso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

export function createRadioStore(deps: RadioStoreDeps): RadioStore {
  const appName = deps.appName ?? "BCentral";

  let connection: Connection = $state("disconnected");
  let kind: TransportKind | null = $state(null);
  let selfInfo: SelfInfo | null = $state.raw(null);
  let deviceInfo: DeviceInfo | null = $state.raw(null);
  let contacts: CompanionContact[] = $state.raw([]);
  let lastHeardAt: number | null = $state(null);
  let nowMs: number = $state(deps.now());
  let logLines: string[] = $state.raw([]);

  let link: CompanionLink | null = null;
  let transport: FrameTransport | null = null;
  const pushListeners = new Set<PushListener>();

  function onPush(listener: PushListener): () => void {
    pushListeners.add(listener);
    return () => {
      pushListeners.delete(listener);
    };
  }

  // A listener that throws must not stop the others or the read loop.
  function pushed(frame: Uint8Array): void {
    log(`push ${hexCode(frame[0])} (${frame.length} bytes)`);
    for (const listener of [...pushListeners]) {
      try {
        listener(frame);
      } catch (error) {
        log(`push listener failed: ${describeError(error)}`);
      }
    }
  }

  function log(line: string): void {
    const stamped = `${new Date(deps.now()).toISOString()} ${line}`;
    const kept = logLines.length >= LOG_LIMIT ? logLines.slice(logLines.length - LOG_LIMIT + 1) : logLines;
    logLines = [...kept, stamped];
    deps.logSink?.(stamped);
  }

  function state(): RadioState {
    if (connection !== "connected") {
      return connection;
    }
    if (lastHeardAt === null) {
      return "connected";
    }
    return nowMs - lastHeardAt > deps.blindAfterMs() ? "blind" : "connected";
  }

  function elapsedMs(): number | null {
    return lastHeardAt === null ? null : Math.max(0, nowMs - lastHeardAt);
  }

  function refreshNow(): void {
    nowMs = deps.now();
  }

  function heard(): void {
    const now = deps.now();
    lastHeardAt = now;
    nowMs = now;
  }

  async function connect(next: TransportKind): Promise<void> {
    if (connection !== "disconnected") {
      throw new Error(t("radio.error.alreadyConnected"));
    }
    connection = "connecting";
    kind = next;
    const candidate = deps.createTransport(next);
    candidate.onLog = log;
    try {
      await candidate.connect();
    } catch (error) {
      connection = "disconnected";
      kind = null;
      log(`connect (${next}) failed: ${describeError(error)}`);
      throw error;
    }
    const opened = new CompanionLink(candidate, {
      onLog: log,
      onFrame: heard,
      onPush: pushed,
      onClosed: () => void closedByLink(opened),
    });
    link = opened;
    transport = candidate;
    opened.start();

    try {
      const identity = await companionQuery(opened, appName);
      selfInfo = identity.self;
      deviceInfo = identity.device;
      const device = identity.device;
      log(
        `companion: "${identity.self.name}" ${identity.self.publicKey.slice(0, 12)}…, ` +
          (device === null
            ? "firmware predates device query"
            : `firmware ${device.firmwareVersion || "?"} (${device.firmwareBuildDate || "?"}), ` +
              `board ${device.manufacturerModel || "?"}, protocol ${device.firmwareVer}`),
      );
    } catch (error) {
      log(`identity query failed: ${describeError(error)}`);
      await disconnect();
      throw error;
    }
    connection = "connected";
    refreshNow();

    try {
      const result = await companionSetTime(opened, Math.floor(deps.now() / 1000));
      const delta = result.after - result.before;
      const verdict =
        delta === 0
          ? "unchanged"
          : delta > 0
            ? `moved forward ${delta} s`
            : `moved back ${-delta} s`;
      log(
        `clock: companion had ${iso(result.before)}, PC sent ${iso(result.requested)}, ` +
          `companion now ${iso(result.after)} (${verdict})`,
      );
    } catch (error) {
      log(`clock sync failed: ${describeError(error)}`);
    }

    try {
      await refreshContacts();
    } catch (error) {
      log(`contact list failed: ${describeError(error)}`);
    }
  }

  // The read loop ended on its own: the device went away.
  async function closedByLink(closed: CompanionLink): Promise<void> {
    if (link !== closed) {
      return;
    }
    const gone = transport;
    link = null;
    transport = null;
    connection = "disconnected";
    kind = null;
    log("link closed by the companion");
    if (gone !== null) {
      try {
        await gone.disconnect();
      } catch (error) {
        log(`cleanup failed: ${describeError(error)}`);
      }
    }
  }

  async function disconnect(): Promise<void> {
    const open = transport;
    link = null;
    transport = null;
    connection = "disconnected";
    kind = null;
    if (open === null) {
      return;
    }
    try {
      await open.disconnect();
    } catch (error) {
      log(`disconnect failed: ${describeError(error)}`);
    }
    log("disconnected");
  }

  async function refreshContacts(): Promise<CompanionContact[]> {
    const open = link;
    if (open === null) {
      throw new Error(t("radio.error.notConnected"));
    }
    const list = await companionGetContacts(open);
    contacts = list;
    log(`contacts: ${list.length}`);
    return list;
  }

  return {
    state,
    kind: () => kind,
    selfInfo: () => selfInfo,
    deviceInfo: () => deviceInfo,
    contacts: () => contacts,
    lastHeardAt: () => lastHeardAt,
    elapsedMs,
    log: () => logLines,
    link: () => link,
    onPush,
    connect,
    disconnect,
    refreshContacts,
    refreshNow,
  };
}
