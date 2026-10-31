// The app's view of the companion radio: connection state, who it is, its contacts, when it
// was last heard, and why it is not connected. Built by createRadioStore() with its clock,
// transports and browser hooks injected, so the blind rule and the reconnect paths are
// tested with a fake clock, fake transports and fake Web Serial / Bluetooth; index.ts makes
// the app's one.
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
//
// Robustness (P1-07). The transport that carried the last link is kept for the session
// (its SerialPort or BluetoothDevice with it), so the store can open it again without a
// chooser. A link that is lost (the read loop ends, a USB `disconnect` event, no answer to
// the link check after a wake) leaves the store `disconnected` with a reason, and the
// reconnect loop tries the kept transport again with backoff (RECONNECT_DELAYS_MS, the last
// delay repeating). Over USB the loop runs while a granted port is present and gives the
// port up when it is gone; the `connect` event of a granted port starts it again. Over
// Bluetooth the loop gives up after BLE_RECONNECT_GIVE_UP_MS; the device stays kept and the
// Reconnect button (reconnectNow) starts a fresh loop. On start(), one granted USB port is
// connected without a gesture. A manual connect() or disconnect() ends any loop.

import { t } from "../i18n/index.svelte.ts";
import { deferred, type Deferred } from "./deferred.ts";
import {
  CompanionLink,
  companionGetContacts,
  companionGetTime,
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

// Why the store is disconnected, when it was not the operator's doing:
//   unplugged  the USB port's `disconnect` event (the cable, or the companion rebooting)
//   lost       the read loop ended on its own over USB, with no `disconnect` event (yet)
//   bleLost    the GATT server went away
//   silent     the companion did not answer the link check within LINK_CHECK_TIMEOUT_MS
//   gaveUp     the Bluetooth reconnect loop ran out of time
export type DisconnectReason = "unplugged" | "lost" | "bleLost" | "silent" | "gaveUp";

export interface ReconnectStatus {
  // The attempt about to be made (while waiting) or being made (while connecting), from 1.
  attempt: number;
  // When the next attempt starts, in the store's clock; null while an attempt is running.
  nextAttemptAtMs: number | null;
}

export const LOG_LIMIT = 200;

// The wait before each reconnect attempt after a lost link; the last one repeats.
export const RECONNECT_DELAYS_MS: readonly number[] = [2_000, 5_000, 10_000, 30_000];
// How long the Bluetooth loop keeps trying before it gives up (the device is kept).
export const BLE_RECONNECT_GIVE_UP_MS = 5 * 60_000;
// How long the link check after a wake waits for CMD_GET_DEVICE_TIME's answer.
export const LINK_CHECK_TIMEOUT_MS = 3_000;
// A companion clock further than this from the PC's is logged and shown on the radio page.
export const CLOCK_DRIFT_LIMIT_S = 60;

export interface ReconnectTiming {
  delaysMs: readonly number[];
  bleGiveUpMs: number;
  linkCheckTimeoutMs: number;
}

// Where "the laptop is back" comes from: visibilitychange and resume on the document,
// pageshow and online on the window. The store checks the link on each.
export interface PageEvents {
  document: EventTarget;
  window: EventTarget;
  isVisible(): boolean;
}

export interface RadioStoreDeps {
  // Milliseconds since the epoch.
  now: () => number;
  // The blind time; read on every state() call so a settings change applies at once.
  blindAfterMs: () => number;
  // A transport for the chooser, or for the given granted port (USB only).
  createTransport: (kind: TransportKind, port?: SerialPort) => FrameTransport;
  appName?: string;
  // Where log lines also go (the console in the app); the store keeps the last LOG_LIMIT.
  logSink?: (line: string) => void;
  // Web Serial as the browser has it; undefined without it. start() connects the one
  // granted port and listens to the plug events.
  serial?: Serial;
  // The page's wake events; undefined outside a browser.
  page?: PageEvents;
  // The reconnect timing; the defaults above unless a test shortens them.
  reconnect?: ReconnectTiming;
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
  // Empties the log (the radio page's Clear button, P2-04); the next line starts it afresh.
  clearLog(): void;
  // The live link, for the tasks that send and receive (P0-05, P0-06); null when not connected.
  link(): CompanionLink | null;
  // Why the link is down, or null after a manual disconnect and while connected.
  disconnectReason(): DisconnectReason | null;
  // The reconnect loop's position, or null while none runs.
  reconnecting(): ReconnectStatus | null;
  // Milliseconds until the next attempt by the store's clock; null when none is scheduled.
  reconnectCountdownMs(): number | null;
  // True when a transport with a device is kept, so reconnectNow() needs no chooser.
  canReconnect(): boolean;
  // The companion's clock minus the PC's at the last connect, in seconds; null before one.
  clockDriftSeconds(): number | null;
  // Every push frame (code >= 0x80) from whichever link is live, so a listener survives a
  // reconnect. Returns the unsubscribe. The outbox listens for PUSH_CODE_SEND_CONFIRMED here.
  onPush(listener: PushListener): () => void;
  // Called once per successful connect(), after identity, clock and contacts are done; the
  // inbox drains the companion's message queue on it (P0-06). Returns the unsubscribe.
  onConnected(listener: () => void): () => void;
  // Wires the plug and wake events and connects the one granted USB port, once.
  start(): void;
  // Through the browser's chooser. Ends any reconnect loop.
  connect(kind: TransportKind): Promise<void>;
  disconnect(): Promise<void>;
  // Tries the kept transport again now: wakes a waiting loop, or starts one.
  reconnectNow(): void;
  // Asks the companion for its time; false (and the reconnect path) when it does not answer.
  verifyLink(): Promise<boolean>;
  // Reads the contact list from the companion again.
  refreshContacts(): Promise<CompanionContact[]>;
  refreshNow(): void;
}

// The reason as a sentence for the top bar and the radio page.
export function disconnectReasonText(reason: DisconnectReason): string {
  return t(`radio.reason.${reason}`, { minutes: BLE_RECONNECT_GIVE_UP_MS / 60_000 });
}

function iso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

type AttemptOutcome = "connected" | "failed" | "noDevice";

export function createRadioStore(deps: RadioStoreDeps): RadioStore {
  const appName = deps.appName ?? "BCentral";
  const timing: ReconnectTiming = deps.reconnect ?? {
    delaysMs: RECONNECT_DELAYS_MS,
    bleGiveUpMs: BLE_RECONNECT_GIVE_UP_MS,
    linkCheckTimeoutMs: LINK_CHECK_TIMEOUT_MS,
  };

  let connection: Connection = $state("disconnected");
  let kind: TransportKind | null = $state(null);
  let selfInfo: SelfInfo | null = $state.raw(null);
  let deviceInfo: DeviceInfo | null = $state.raw(null);
  let contacts: CompanionContact[] = $state.raw([]);
  let lastHeardAt: number | null = $state(null);
  let nowMs: number = $state(deps.now());
  let logLines: string[] = $state.raw([]);
  let reason: DisconnectReason | null = $state(null);
  let reconnecting: ReconnectStatus | null = $state.raw(null);
  let clockDrift: number | null = $state(null);

  let link: CompanionLink | null = null;
  let transport: FrameTransport | null = null;
  // The last transport that had a device, and what kind it is; reused by the reconnect loop.
  let kept: FrameTransport | null = null;
  let keptKind: TransportKind | null = null;
  // The running loop's token: a manual action bumps it and the loop stops at its next check.
  let loopRun = 0;
  let loopWake: Deferred<void> | null = null;
  let started = false;
  const pushListeners = new Set<PushListener>();
  const connectedListeners = new Set<() => void>();

  function onPush(listener: PushListener): () => void {
    pushListeners.add(listener);
    return () => {
      pushListeners.delete(listener);
    };
  }

  function onConnected(listener: () => void): () => void {
    connectedListeners.add(listener);
    return () => {
      connectedListeners.delete(listener);
    };
  }

  // A listener that throws must not stop the others or fail connect().
  function connected(): void {
    for (const listener of [...connectedListeners]) {
      try {
        listener();
      } catch (error) {
        log(`connected listener failed: ${describeError(error)}`);
      }
    }
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
    const trimmed =
      logLines.length >= LOG_LIMIT ? logLines.slice(logLines.length - LOG_LIMIT + 1) : logLines;
    logLines = [...trimmed, stamped];
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

  function reconnectCountdownMs(): number | null {
    const at = reconnecting?.nextAttemptAtMs ?? null;
    return at === null ? null : Math.max(0, at - nowMs);
  }

  function refreshNow(): void {
    nowMs = deps.now();
  }

  function heard(): void {
    const now = deps.now();
    lastHeardAt = now;
    nowMs = now;
  }

  // --- opening and closing a link --------------------------------------------------------

  // Opens the link over `candidate`: transport, identity, clock, contacts, listeners. The
  // transport is kept as soon as it has a device, whether or not the open succeeds.
  async function openWith(candidate: FrameTransport, next: TransportKind): Promise<void> {
    if (connection !== "disconnected") {
      throw new Error(t("radio.error.alreadyConnected"));
    }
    connection = "connecting";
    kind = next;
    candidate.onLog = log;
    try {
      await candidate.connect();
    } catch (error) {
      connection = "disconnected";
      kind = null;
      keep(candidate, next);
      log(`connect (${next}) failed: ${describeError(error)}`);
      throw error;
    }
    keep(candidate, next);
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
      await teardown(reason);
      throw error;
    }
    connection = "connected";
    reason = null;
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
      // Companion minus PC before the sync. The firmware only moves its clock forward, so a
      // companion that is ahead stays ahead; the journal is stamped by the PC either way.
      const drift = result.before - result.requested;
      clockDrift = drift;
      if (Math.abs(drift) > CLOCK_DRIFT_LIMIT_S) {
        log(
          `clock drift: companion was ${Math.abs(drift)} s ${drift > 0 ? "ahead of" : "behind"} ` +
            `the PC (limit ${CLOCK_DRIFT_LIMIT_S} s); the journal keeps the PC's clock`,
        );
      }
    } catch (error) {
      log(`clock sync failed: ${describeError(error)}`);
    }

    try {
      await refreshContacts();
    } catch (error) {
      log(`contact list failed: ${describeError(error)}`);
    }

    // The companion may have gone away while the clock and contacts were read.
    if (link === opened) {
      connected();
    }
  }

  function keep(candidate: FrameTransport, next: TransportKind): void {
    if (candidate.device !== null) {
      kept = candidate;
      keptKind = next;
    }
  }

  // Closes whatever is open and records why. The transport stays kept.
  async function teardown(why: DisconnectReason | null): Promise<void> {
    const gone = transport;
    link = null;
    transport = null;
    connection = "disconnected";
    kind = null;
    reason = why;
    if (gone === null) {
      return;
    }
    try {
      await gone.disconnect();
    } catch (error) {
      log(`cleanup failed: ${describeError(error)}`);
    }
  }

  // The read loop ended on its own: the device went away. The loop tries it again; over
  // USB the first attempt finds out whether the port is still there.
  async function closedByLink(closed: CompanionLink): Promise<void> {
    if (link !== closed) {
      return;
    }
    const lostKind = kind;
    log("link closed by the companion");
    await teardown(lostKind === "ble" ? "bleLost" : "lost");
    if (lostKind !== null) {
      startReconnect(lostKind, false);
    }
  }

  // --- the reconnect loop ----------------------------------------------------------------

  function cancelReconnect(): void {
    loopRun += 1;
    reconnecting = null;
    loopWake?.resolve();
  }

  function startReconnect(next: TransportKind, immediate: boolean): void {
    cancelReconnect();
    void reconnectLoop(next, immediate);
  }

  // Waits `ms`, or less when cancelReconnect() or reconnectNow() wakes it.
  async function wait(ms: number): Promise<void> {
    const waiter = deferred<void>();
    loopWake = waiter;
    const timer = setTimeout(() => waiter.resolve(), ms);
    await waiter.promise;
    clearTimeout(timer);
    if (loopWake === waiter) {
      loopWake = null;
    }
  }

  function delayBefore(attempt: number, immediate: boolean): number {
    const index = immediate ? attempt - 2 : attempt - 1;
    if (index < 0) {
      return 0;
    }
    return timing.delaysMs[Math.min(index, timing.delaysMs.length - 1)] ?? 0;
  }

  async function reconnectLoop(next: TransportKind, immediate: boolean): Promise<void> {
    const run = loopRun;
    const startedAt = deps.now();
    for (let attempt = 1; ; attempt++) {
      const delay = delayBefore(attempt, immediate);
      if (next === "ble" && deps.now() + delay - startedAt > timing.bleGiveUpMs) {
        reconnecting = null;
        reason = "gaveUp";
        log(
          `reconnect (ble): gave up after ${attempt - 1} attempts and ` +
            `${Math.round((deps.now() - startedAt) / 1000)} s; the device is kept for Reconnect`,
        );
        return;
      }
      if (delay > 0) {
        reconnecting = { attempt, nextAttemptAtMs: deps.now() + delay };
        log(`reconnect (${next}): attempt ${attempt} in ${delay} ms`);
        await wait(delay);
        if (run !== loopRun) {
          return;
        }
      }
      reconnecting = { attempt, nextAttemptAtMs: null };
      const outcome = await attemptReconnect(next, attempt);
      if (run !== loopRun) {
        return;
      }
      if (outcome !== "failed") {
        reconnecting = null;
        return;
      }
    }
  }

  // One attempt. Over USB the port is looked up again each time: the kept one when it is
  // present, else the one granted port; none or several ends the loop (a plug event starts
  // it again). Over Bluetooth it is always the kept device.
  async function attemptReconnect(next: TransportKind, attempt: number): Promise<AttemptOutcome> {
    let candidate: FrameTransport;
    if (next === "usb") {
      const ports = await grantedPorts();
      const ours = kept !== null && keptKind === "usb" ? kept : null;
      if (ours !== null && ports.some((port) => port === ours.device)) {
        candidate = ours;
      } else if (ports.length === 1 && ports[0] !== undefined) {
        candidate = deps.createTransport("usb", ports[0]);
      } else {
        log(
          `reconnect (usb): ${ports.length === 0 ? "no granted port present" : `${ports.length} granted ports present`}; ` +
            "waiting for a plug event or the operator",
        );
        return "noDevice";
      }
    } else {
      if (kept === null || keptKind !== "ble") {
        log("reconnect (ble): no device kept; waiting for the operator");
        return "noDevice";
      }
      candidate = kept;
    }
    if (connection !== "disconnected") {
      return "noDevice";
    }
    try {
      await openWith(candidate, next);
    } catch (error) {
      log(`reconnect (${next}): attempt ${attempt} failed: ${describeError(error)}`);
      return "failed";
    }
    log(`reconnect (${next}): connected on attempt ${attempt}`);
    return "connected";
  }

  async function grantedPorts(): Promise<SerialPort[]> {
    if (deps.serial === undefined) {
      return [];
    }
    try {
      return await deps.serial.getPorts();
    } catch (error) {
      log(`getPorts failed: ${describeError(error)}`);
      return [];
    }
  }

  // --- the browser's events --------------------------------------------------------------

  // Whether an unplug event is about the port the kept transport holds. Only a known other
  // port is somebody else's; an unknown target counts as ours (one radio at a time).
  function isKeptPort(target: EventTarget | null): boolean {
    if (kept === null || keptKind !== "usb" || target === null) {
      return true;
    }
    return kept.device === target;
  }

  // A granted port was plugged in. The attempt looks the port up itself (the browser may
  // hand out a new SerialPort object for the same radio after a replug), so the event's
  // target is not compared. A Bluetooth loop that is running is left alone.
  function onSerialConnect(): void {
    log("usb: a granted port was plugged in");
    if (connection !== "disconnected") {
      return;
    }
    if (reconnecting !== null && keptKind === "ble") {
      return;
    }
    startReconnect("usb", true);
  }

  function onSerialDisconnect(event: Event): void {
    if (!isKeptPort(event.target)) {
      return;
    }
    if (kind === "usb") {
      log("usb: the port was unplugged");
      cancelReconnect();
      void teardown("unplugged");
      return;
    }
    if (connection === "disconnected" && keptKind === "usb") {
      log("usb: the port was unplugged");
      cancelReconnect();
      reason = "unplugged";
    }
  }

  function onWake(source: string): void {
    void verifyLink(source);
  }

  function start(): void {
    if (started) {
      return;
    }
    started = true;
    const serial = deps.serial;
    if (serial !== undefined) {
      serial.addEventListener("connect", () => onSerialConnect());
      serial.addEventListener("disconnect", onSerialDisconnect);
      log("start: looking for a granted USB port");
      startReconnect("usb", true);
    }
    const page = deps.page;
    if (page !== undefined) {
      page.document.addEventListener("visibilitychange", () => {
        if (page.isVisible()) {
          onWake("visible");
        }
      });
      page.document.addEventListener("resume", () => onWake("resume"));
      page.window.addEventListener("pageshow", () => onWake("pageshow"));
      page.window.addEventListener("online", () => onWake("online"));
    }
  }

  // --- the operator's actions and the link check -------------------------------------------

  async function connect(next: TransportKind): Promise<void> {
    cancelReconnect();
    await openWith(deps.createTransport(next), next);
  }

  async function disconnect(): Promise<void> {
    cancelReconnect();
    const open = transport;
    await teardown(null);
    if (open !== null) {
      log("disconnected");
    }
  }

  function reconnectNow(): void {
    if (connection !== "disconnected") {
      return;
    }
    if (reconnecting !== null && loopWake !== null) {
      log("reconnect: trying now at the operator's request");
      loopWake.resolve();
      return;
    }
    if (keptKind === null) {
      return;
    }
    log(`reconnect (${keptKind}): started by the operator`);
    startReconnect(keptKind, true);
  }

  async function verifyLink(source: string = "request"): Promise<boolean> {
    const open = link;
    if (open === null || connection !== "connected") {
      return false;
    }
    try {
      await companionGetTime(open, timing.linkCheckTimeoutMs);
    } catch (error) {
      if (link !== open) {
        return false;
      }
      const lostKind = kind;
      log(`link check (${source}): no answer: ${describeError(error)}; treating the link as lost`);
      cancelReconnect();
      await teardown("silent");
      if (lostKind !== null) {
        startReconnect(lostKind, true);
      }
      return false;
    }
    log(`link check (${source}): the companion answered`);
    return true;
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
    clearLog: () => {
      logLines = [];
    },
    link: () => link,
    disconnectReason: () => reason,
    reconnecting: () => reconnecting,
    reconnectCountdownMs,
    canReconnect: () => kept !== null,
    clockDriftSeconds: () => clockDrift,
    onPush,
    onConnected,
    start,
    connect,
    disconnect,
    reconnectNow,
    verifyLink: () => verifyLink(),
    refreshContacts,
    refreshNow,
  };
}
