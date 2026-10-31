// The status cluster's rule (P2-02) over fakes of the four stores' states: which chip shows,
// in which tint, with which words, and what its popover says and offers.

import { describe, expect, it } from "vitest";
import {
  clockChip,
  radioChip,
  statusChips,
  storageChip,
  updateChip,
  type ChipInputs,
  type RadioInput,
  type StorageInput,
} from "./statusChips.ts";

const radioFine: RadioInput = {
  capability: "both",
  state: "connected",
  elapsedText: "3 min",
  reason: null,
  reconnectAttempt: null,
  reconnectInSeconds: null,
  canReconnect: true,
  blindAfterMinutes: 15,
};

const storageFine: StorageInput = {
  persisted: true,
  mirrorState: "ready",
  folderName: "USB",
  folderError: null,
  folderSupported: true,
};

const allFine: ChipInputs = {
  radio: radioFine,
  clock: { trust: "manual", timeText: "12:00:00" },
  storage: storageFine,
  update: { available: false },
};

describe("the radio chip", () => {
  it("connected: grey, the state and how long since the last frame; the popover says heard", () => {
    const chip = radioChip(radioFine);
    expect(chip.visible).toBe(true);
    expect(chip.tint).toBe("neutral");
    expect(chip.icon).toBe("dot");
    expect(chip.label).toEqual({ key: "radio.status.connected" });
    expect(chip.detail).toEqual({ key: "chip.radio.heard", params: { elapsed: "3 min" } });
    expect(chip.sentences).toEqual([{ key: "radio.heard", params: { elapsed: "3 min" } }]);
    expect(chip.action?.kind).toBe("openRadio");
  });

  it("connected with nothing heard yet says so and has no detail", () => {
    const chip = radioChip({ ...radioFine, elapsedText: null });
    expect(chip.detail).toBeNull();
    expect(chip.sentences).toEqual([{ key: "handover.radio.never" }]);
  });

  it("blind: danger, keeps the elapsed time, explains the blind time", () => {
    const chip = radioChip({ ...radioFine, state: "blind", elapsedText: "17 min" });
    expect(chip.tint).toBe("danger");
    expect(chip.label).toEqual({ key: "radio.status.blind" });
    expect(chip.detail).toEqual({ key: "chip.radio.heard", params: { elapsed: "17 min" } });
    expect(chip.sentences).toEqual([{ key: "radio.blindHelp", params: { minutes: 15 } }]);
  });

  it("connecting: warn, one sentence, the radio page as the action", () => {
    const chip = radioChip({ ...radioFine, state: "connecting", elapsedText: null });
    expect(chip.tint).toBe("warn");
    expect(chip.sentences).toEqual([{ key: "popover.radio.connecting" }]);
    expect(chip.action?.kind).toBe("openRadio");
  });

  it("disconnected with a reason and a running reconnect: danger, both sentences, Reconnect", () => {
    const chip = radioChip({
      ...radioFine,
      state: "disconnected",
      elapsedText: null,
      reason: "unplugged",
      reconnectAttempt: 2,
      reconnectInSeconds: 5,
    });
    expect(chip.tint).toBe("danger");
    expect(chip.label).toEqual({ key: "radio.status.disconnected" });
    expect(chip.sentences).toEqual([
      { key: "radio.reason.unplugged", params: { minutes: 5 } },
      { key: "radio.reconnecting", params: { attempt: 2, seconds: 5 } },
    ]);
    expect(chip.action).toEqual({ kind: "reconnectRadio", label: { key: "radio.reconnect" } });
  });

  it("disconnected by the operator, nothing kept: the plain sentence and the radio page", () => {
    const chip = radioChip({
      ...radioFine,
      state: "disconnected",
      elapsedText: null,
      canReconnect: false,
    });
    expect(chip.sentences).toEqual([{ key: "popover.radio.disconnected" }]);
    expect(chip.action?.kind).toBe("openRadio");
  });

  it("an attempt in progress says so without a countdown", () => {
    const chip = radioChip({
      ...radioFine,
      state: "disconnected",
      reason: "lost",
      reconnectAttempt: 1,
      reconnectInSeconds: null,
    });
    expect(chip.sentences[1]).toEqual({ key: "radio.reconnectingNow", params: { attempt: 1 } });
  });

  it("a browser without Web Serial and Web Bluetooth: danger and the one sentence", () => {
    const chip = radioChip({ ...radioFine, capability: "none", state: "disconnected" });
    expect(chip.tint).toBe("danger");
    expect(chip.sentences).toEqual([{ key: "radio.unsupported" }]);
  });
});

describe("the clock chip", () => {
  it("unconfirmed: warn with the clock icon; the popover shows the time and the trust", () => {
    const chip = clockChip({ trust: "unknown", timeText: "12:00:00" });
    expect(chip.tint).toBe("warn");
    expect(chip.icon).toBe("clock");
    expect(chip.label).toEqual({ key: "chip.clock.unconfirmed" });
    expect(chip.title).toEqual({ key: "settings.clock" });
    expect(chip.sentences).toEqual([
      { key: "settings.clockNow", params: { time: "12:00:00" } },
      { key: "settings.clockTrust.unknown" },
    ]);
    // The checkbox is the action; no button.
    expect(chip.action).toBeNull();
  });

  it("confirmed by hand or synced: grey with a check", () => {
    for (const trust of ["manual", "ntp"] as const) {
      const chip = clockChip({ trust, timeText: "12:00:00" });
      expect(chip.tint).toBe("neutral");
      expect(chip.icon).toBe("check");
      expect(chip.label).toEqual({ key: "chip.clock.confirmed" });
      expect(chip.sentences[1]).toEqual({ key: `settings.clockTrust.${trust}` });
    }
  });
});

describe("the storage chip", () => {
  it("is hidden while the storage is persistent and a folder is writing", () => {
    expect(storageChip(storageFine).visible).toBe(false);
  });

  it("folder needs permission: warn, Reconnect", () => {
    const chip = storageChip({ ...storageFine, mirrorState: "needsPermission" });
    expect(chip.visible).toBe(true);
    expect(chip.tint).toBe("warn");
    expect(chip.label).toEqual({ key: "chip.storage.needsPermission" });
    expect(chip.sentences).toEqual([{ key: "settings.journalFolder.needsPermission" }]);
    expect(chip.action?.kind).toBe("reconnectFolder");
  });

  it("a folder write failed: danger with the error, Try again", () => {
    const chip = storageChip({ ...storageFine, mirrorState: "error", folderError: "disk full" });
    expect(chip.tint).toBe("danger");
    expect(chip.label).toEqual({ key: "chip.storage.error" });
    expect(chip.sentences).toEqual([
      { key: "settings.journalFolder.error", params: { error: "disk full" } },
    ]);
    expect(chip.action?.kind).toBe("retryFolder");
  });

  it("no folder and the browser refused persistence: warn, Choose folder", () => {
    const chip = storageChip({
      ...storageFine,
      persisted: false,
      mirrorState: "off",
      folderName: null,
    });
    expect(chip.visible).toBe(true);
    expect(chip.tint).toBe("warn");
    expect(chip.label).toEqual({ key: "chip.storage.notPersisted" });
    expect(chip.sentences).toEqual([{ key: "settings.storage.notPersisted" }]);
    expect(chip.action).toEqual({
      kind: "chooseFolder",
      label: { key: "settings.journalFolder.choose" },
    });
  });

  it("no folder but persistent: grey, says a folder is missing, Choose folder", () => {
    const chip = storageChip({ ...storageFine, mirrorState: "off", folderName: null });
    expect(chip.visible).toBe(true);
    expect(chip.tint).toBe("neutral");
    expect(chip.label).toEqual({ key: "chip.storage.noFolder" });
    expect(chip.sentences).toEqual([{ key: "popover.storage.noFolder" }]);
    expect(chip.action?.kind).toBe("chooseFolder");
  });

  it("a browser that cannot pick a folder is sent to the settings instead", () => {
    const chip = storageChip({
      ...storageFine,
      persisted: false,
      mirrorState: "off",
      folderName: null,
      folderSupported: false,
    });
    expect(chip.action?.kind).toBe("openSettings");
  });

  it("a folder is set but persistence was refused: grey with the folder's name", () => {
    const chip = storageChip({ ...storageFine, persisted: false });
    expect(chip.visible).toBe(true);
    expect(chip.tint).toBe("neutral");
    expect(chip.label).toEqual({ key: "settings.journalFolder.current", params: { name: "USB" } });
    expect(chip.sentences).toEqual([
      { key: "popover.storage.folderNotPersisted", params: { name: "USB" } },
    ]);
    expect(chip.action?.kind).toBe("openSettings");
  });

  it("before the browser has answered, a set folder shows grey with 'not checked yet'", () => {
    const chip = storageChip({ ...storageFine, persisted: null });
    expect(chip.visible).toBe(true);
    expect(chip.tint).toBe("neutral");
    expect(chip.sentences[1]).toEqual({ key: "settings.storage.unknown" });
  });
});

describe("the update chip", () => {
  it("is hidden until an update waits, then warn with Reload", () => {
    expect(updateChip({ available: false }).visible).toBe(false);
    const chip = updateChip({ available: true });
    expect(chip.visible).toBe(true);
    expect(chip.tint).toBe("warn");
    expect(chip.icon).toBe("update");
    expect(chip.sentences).toEqual([{ key: "update.available" }]);
    expect(chip.action).toEqual({ kind: "reload", label: { key: "update.reload" } });
  });
});

describe("the cluster", () => {
  it("lists the four chips in the bar's order; a quiet desk shows radio and clock only", () => {
    const chips = statusChips(allFine);
    expect(chips.map((chip) => chip.id)).toEqual(["radio", "clock", "storage", "update"]);
    expect(chips.filter((chip) => chip.visible).map((chip) => chip.id)).toEqual(["radio", "clock"]);
    expect(chips.every((chip) => chip.visible === false || chip.tint === "neutral")).toBe(true);
  });
});
