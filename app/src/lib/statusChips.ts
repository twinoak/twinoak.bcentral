// The status cluster (P2-02, docs/design.md §The shell): what each of the four chips — radio,
// clock, storage, update — says and in which tint, and what its popover says and offers, as
// one pure rule over the stores' states. No new logic: every state here is the one the
// stores already report (radio/radioStore, lib/clock, lib/persistence + store/mirror,
// lib/updates); this is only the surface. Texts are i18n keys with their params so
// components/StatusChips.svelte renders them through t() and a test needs no catalog.
//
// A chip that is fine is grey and short; a chip that needs a decision is tinted: warn for
// something to decide (clock unconfirmed, storage not persistent, folder permission, an
// update waiting), danger for something broken (no radio, blind, a folder write that failed).
// Storage is hidden while the browser keeps the storage and a journal folder is writing;
// update is hidden until a new build waits.

import { BLE_RECONNECT_GIVE_UP_MS } from "../radio/radioStore.svelte.ts";
import type { DisconnectReason, RadioState } from "../radio/radioStore.svelte.ts";
import type { RadioCapability } from "../radio/capability.ts";
import type { MirrorState } from "../store/mirror.svelte.ts";
import type { ClockTrust } from "../store/types.ts";
import type { IconName } from "./icons.ts";

export type ChipId = "radio" | "clock" | "storage" | "update";
export type ChipTint = "neutral" | "warn" | "danger";

export interface Text {
  key: string;
  params?: Record<string, string | number>;
}

export type ChipActionKind =
  | "reconnectRadio"
  | "openRadio"
  | "chooseFolder"
  | "reconnectFolder"
  | "retryFolder"
  | "openSettings"
  | "reload";

export interface ChipAction {
  kind: ChipActionKind;
  label: Text;
}

export interface ChipModel {
  id: ChipId;
  visible: boolean;
  tint: ChipTint;
  // The glyph on the chip: an icon, or the radio's dot.
  icon: IconName | "dot";
  // The chip's word, and a short detail after it ("heard 3 min").
  label: Text;
  detail: Text | null;
  // The popover: a title, the sentence(s), one action. The clock popover has no action
  // button; it carries the confirm checkbox itself (the component draws it).
  title: Text;
  sentences: Text[];
  action: ChipAction | null;
}

export interface RadioInput {
  capability: RadioCapability;
  state: RadioState;
  // "3 min", formatted by the caller (lib/elapsed.ts), or null when nothing was heard yet.
  elapsedText: string | null;
  reason: DisconnectReason | null;
  // The reconnect loop's attempt and the seconds to it; null while none runs.
  reconnectAttempt: number | null;
  reconnectInSeconds: number | null;
  canReconnect: boolean;
  blindAfterMinutes: number;
}

export interface ClockInput {
  trust: ClockTrust;
  // The PC's clock as the operator reads it, formatted by the caller.
  timeText: string;
}

export interface StorageInput {
  persisted: boolean | null;
  mirrorState: MirrorState;
  folderName: string | null;
  folderError: string | null;
  // Whether this browser can pick a folder at all.
  folderSupported: boolean;
}

export interface UpdateInput {
  available: boolean;
}

export interface ChipInputs {
  radio: RadioInput;
  clock: ClockInput;
  storage: StorageInput;
  update: UpdateInput;
}

function text(key: string, params?: Record<string, string | number>): Text {
  return params === undefined ? { key } : { key, params };
}

const OPEN_RADIO: ChipAction = { kind: "openRadio", label: text("popover.radio.open") };
const OPEN_SETTINGS: ChipAction = { kind: "openSettings", label: text("nav.settings") };

export function radioChip(radio: RadioInput): ChipModel {
  const title = text("topbar.radio");
  const heard =
    radio.elapsedText === null ? null : text("chip.radio.heard", { elapsed: radio.elapsedText });
  if (radio.capability === "none") {
    return {
      id: "radio",
      visible: true,
      tint: "danger",
      icon: "dot",
      label: text("radio.status.disconnected"),
      detail: null,
      title,
      sentences: [text("radio.unsupported")],
      action: OPEN_RADIO,
    };
  }
  if (radio.state === "disconnected") {
    const sentences: Text[] = [];
    if (radio.reason !== null) {
      sentences.push(
        text(`radio.reason.${radio.reason}`, { minutes: BLE_RECONNECT_GIVE_UP_MS / 60_000 }),
      );
    }
    if (radio.reconnectAttempt !== null) {
      sentences.push(
        radio.reconnectInSeconds === null
          ? text("radio.reconnectingNow", { attempt: radio.reconnectAttempt })
          : text("radio.reconnecting", {
              attempt: radio.reconnectAttempt,
              seconds: radio.reconnectInSeconds,
            }),
      );
    }
    if (sentences.length === 0) {
      sentences.push(text("popover.radio.disconnected"));
    }
    return {
      id: "radio",
      visible: true,
      tint: "danger",
      icon: "dot",
      label: text("radio.status.disconnected"),
      detail: null,
      title,
      sentences,
      action: radio.canReconnect
        ? { kind: "reconnectRadio", label: text("radio.reconnect") }
        : OPEN_RADIO,
    };
  }
  if (radio.state === "connecting") {
    return {
      id: "radio",
      visible: true,
      tint: "warn",
      icon: "dot",
      label: text("radio.status.connecting"),
      detail: null,
      title,
      sentences: [text("popover.radio.connecting")],
      action: OPEN_RADIO,
    };
  }
  if (radio.state === "blind") {
    return {
      id: "radio",
      visible: true,
      tint: "danger",
      icon: "dot",
      label: text("radio.status.blind"),
      detail: heard,
      title,
      sentences: [text("radio.blindHelp", { minutes: radio.blindAfterMinutes })],
      action: OPEN_RADIO,
    };
  }
  return {
    id: "radio",
    visible: true,
    tint: "neutral",
    icon: "dot",
    label: text("radio.status.connected"),
    detail: heard,
    title,
    sentences: [
      radio.elapsedText === null
        ? text("handover.radio.never")
        : text("radio.heard", { elapsed: radio.elapsedText }),
    ],
    action: OPEN_RADIO,
  };
}

export function clockChip(clock: ClockInput): ChipModel {
  const confirmed = clock.trust !== "unknown";
  return {
    id: "clock",
    visible: true,
    tint: confirmed ? "neutral" : "warn",
    icon: confirmed ? "check" : "clock",
    label: text(confirmed ? "chip.clock.confirmed" : "chip.clock.unconfirmed"),
    detail: null,
    title: text("settings.clock"),
    sentences: [
      text("settings.clockNow", { time: clock.timeText }),
      text(`settings.clockTrust.${clock.trust}`),
    ],
    action: null,
  };
}

export function storageChip(storage: StorageInput): ChipModel {
  const base = {
    id: "storage" as const,
    icon: "storage" as const,
    title: text("settings.storage"),
  };
  const folderAction: ChipAction = storage.folderSupported
    ? { kind: "chooseFolder", label: text("settings.journalFolder.choose") }
    : OPEN_SETTINGS;
  if (storage.mirrorState === "needsPermission") {
    return {
      ...base,
      visible: true,
      tint: "warn",
      label: text("chip.storage.needsPermission"),
      detail: null,
      sentences: [text("settings.journalFolder.needsPermission")],
      action: { kind: "reconnectFolder", label: text("settings.journalFolder.reconnect") },
    };
  }
  if (storage.mirrorState === "error") {
    return {
      ...base,
      visible: true,
      tint: "danger",
      label: text("chip.storage.error"),
      detail: null,
      sentences: [text("settings.journalFolder.error", { error: storage.folderError ?? "" })],
      action: { kind: "retryFolder", label: text("settings.journalFolder.retry") },
    };
  }
  if (storage.mirrorState === "ready") {
    const name = storage.folderName ?? "";
    return {
      ...base,
      visible: storage.persisted !== true,
      tint: "neutral",
      label: text("settings.journalFolder.current", { name }),
      detail: null,
      sentences:
        storage.persisted === false
          ? [text("popover.storage.folderNotPersisted", { name })]
          : [text("settings.journalFolder.current", { name }), text("settings.storage.unknown")],
      action: OPEN_SETTINGS,
    };
  }
  if (storage.persisted === false) {
    return {
      ...base,
      visible: true,
      tint: "warn",
      label: text("chip.storage.notPersisted"),
      detail: null,
      sentences: [text("settings.storage.notPersisted")],
      action: folderAction,
    };
  }
  return {
    ...base,
    visible: true,
    tint: "neutral",
    label: text("chip.storage.noFolder"),
    detail: null,
    sentences: [text("popover.storage.noFolder")],
    action: folderAction,
  };
}

export function updateChip(update: UpdateInput): ChipModel {
  return {
    id: "update",
    visible: update.available,
    tint: "warn",
    icon: "update",
    label: text("chip.update"),
    detail: null,
    title: text("popover.update.title"),
    sentences: [text("update.available")],
    action: { kind: "reload", label: text("update.reload") },
  };
}

// The four chips in the bar's order; a hidden chip is in the list with visible false.
export function statusChips(inputs: ChipInputs): ChipModel[] {
  return [
    radioChip(inputs.radio),
    clockChip(inputs.clock),
    storageChip(inputs.storage),
    updateChip(inputs.update),
  ];
}
