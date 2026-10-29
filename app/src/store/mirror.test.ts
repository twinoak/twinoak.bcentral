// The journal mirror (P1-04) over a store on fake-indexeddb and an in-memory folder: one
// line per store write, a failing folder never fails the write, the lines re-import as the
// export does, the permission is re-asked with one call, the export file lands in the folder.

import { describe, expect, it } from "vitest";
import { FakeDirectory } from "../test-support/fakeDirectory.ts";
import { openTestStore, steppingClock, TEST_DEVICE_ID } from "../test-support/testStore.ts";
import { loadWalkthrough } from "../test-support/walkthrough.ts";
import { envelopeFilename, envelopeJson } from "./export.ts";
import type { JournalStore } from "./journalStore.ts";
import { createMirror, type Mirror } from "./mirror.svelte.ts";
import { mirrorEnvelope, mirrorFilename, parseMirror } from "./mirrorFile.ts";
import type { Envelope, NewRegisterEntry } from "./types.ts";

const INCIDENT_NAME = "Strømsvigt";
const FILE = mirrorFilename(TEST_DEVICE_ID);

interface Harness {
  store: JournalStore;
  mirror: Mirror;
  directory: FakeDirectory;
  // What the mirror has been told the stored folder is.
  saved: () => FakeDirectory | undefined;
  picks: FakeDirectory[];
}

async function setUp(
  options: { stored?: FakeDirectory | null; pick?: FakeDirectory } = {},
): Promise<Harness> {
  const store = await openTestStore();
  const directory = options.stored ?? new FakeDirectory("usb");
  let saved: FakeDirectory | undefined = options.stored === null ? undefined : directory;
  const picks: FakeDirectory[] = [];
  const clock = steppingClock(Date.parse("2026-10-29T10:00:00Z"));
  const mirror = createMirror<FakeDirectory>({
    store: async () => store,
    now: () => clock().timestamp,
    loadFolder: async () => saved,
    saveFolder: async (folder) => {
      saved = folder;
    },
    clearFolder: async () => {
      saved = undefined;
    },
    pickFolder:
      options.pick === undefined
        ? undefined
        : async () => {
            picks.push(options.pick as FakeDirectory);
            return options.pick as FakeDirectory;
          },
  });
  return { store, mirror, directory, saved: () => saved, picks };
}

function registerEntry(label: string, key: string): NewRegisterEntry {
  return { publicKey: key.repeat(32), label, origin: "adhoc" };
}

// Everything in the store, through the mirror file, into a fresh store: what comes out.
async function reimported(directory: FakeDirectory): Promise<Envelope> {
  const content = parseMirror(directory.text(FILE));
  const envelope = mirrorEnvelope(content, TEST_DEVICE_ID, "2026-10-29T12:00:00Z");
  const fresh = await openTestStore();
  await fresh.importEnvelope(envelope);
  const exported = await fresh.exportEnvelope();
  fresh.close();
  return exported;
}

describe("journal mirror", () => {
  it("is off without a stored folder and mirrors nothing", async () => {
    const h = await setUp({ stored: null });
    await h.mirror.start();
    expect(h.mirror.state()).toBe("off");
    expect(h.mirror.folderName()).toBeNull();
    await h.store.createIncident({ name: INCIDENT_NAME, createdBy: "Thomas" });
    await h.mirror.settled();
    expect(h.mirror.pending()).toBe(0);
    expect(h.directory.files.size).toBe(0);
    h.store.close();
  });

  it("appends exactly one line per store write: incident, register entry, entry, message_out, an edit", async () => {
    const h = await setUp();
    await h.mirror.start();
    expect(h.mirror.state()).toBe("ready");
    expect(h.mirror.folderName()).toBe("usb");
    expect(h.mirror.fileName()).toBe(FILE);

    const incident = await h.store.createIncident({ name: INCIDENT_NAME, createdBy: "Thomas" });
    const hans = await h.store.createRegisterEntry(registerEntry("Hans", "7a"));
    const note = await h.store.appendEntry({
      incidentId: incident.id,
      operator: "Thomas",
      type: "note",
      text: "Ringede til forsyningen",
    });
    const order = await h.store.appendMessageOut(
      { incidentId: incident.id, operator: "Thomas", transport: "mesh", counterpartyId: hans.id },
      (n) => `#${n} Meld status`,
    );
    const edited = await h.store.putRegisterEntry({ ...hans, label: "Hans Jensen" });
    await h.mirror.settled();

    const lines = h.directory
      .lines(FILE)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toStrictEqual([
      { kind: "incident", ...incident },
      { kind: "registerEntry", ...hans },
      { kind: "entry", ...note },
      { kind: "entry", ...order },
      { kind: "registerEntry", ...edited },
    ]);
    expect(h.directory.commits).toBe(5);
    expect(h.mirror.pending()).toBe(0);
    expect(h.mirror.lastWriteAt()).not.toBeNull();
    expect(h.mirror.error()).toBeNull();
    h.store.close();
  });

  it("a batch of register entries is one line each; a refused write is no line", async () => {
    const h = await setUp();
    await h.mirror.start();
    const batch = await h.store.createRegisterEntries([
      registerEntry("radio #1", "01"),
      registerEntry("radio #2", "02"),
    ]);
    await expect(
      h.store.createRegisterEntries([registerEntry("radio #3", "01")]),
    ).rejects.toThrow();
    await h.mirror.settled();
    const lines = h.directory
      .lines(FILE)
      .map((line) => JSON.parse(line) as { kind: string; id: string });
    expect(lines.map((line) => line.id)).toEqual(batch.map((entry) => entry.id));
    h.store.close();
  });

  it("a failing folder never fails the store write: the write lands, the state says error, the line waits", async () => {
    const h = await setUp();
    await h.mirror.start();
    const incident = await h.store.createIncident({ name: INCIDENT_NAME, createdBy: "Thomas" });
    await h.mirror.settled();
    expect(h.directory.lines(FILE)).toHaveLength(1);

    h.directory.failWith = new DOMException("The folder is gone", "NotFoundError");
    const note = await h.store.appendEntry({
      incidentId: incident.id,
      operator: "Thomas",
      type: "note",
      text: "written while the folder is gone",
    });
    await h.mirror.settled();
    expect(await h.store.getEntry(note.id)).toStrictEqual(note);
    expect(h.mirror.state()).toBe("error");
    expect(h.mirror.error()).toBe("The folder is gone");
    expect(h.mirror.pending()).toBe(1);
    expect(h.directory.lines(FILE)).toHaveLength(1);

    // The next write tries again: the folder is back, both lines land in order.
    h.directory.failWith = null;
    const second = await h.store.appendEntry({
      incidentId: incident.id,
      operator: "Thomas",
      type: "note",
      text: "after",
    });
    await h.mirror.settled();
    expect(h.mirror.state()).toBe("ready");
    expect(h.mirror.error()).toBeNull();
    expect(h.mirror.pending()).toBe(0);
    const ids = h.directory.lines(FILE).map((line) => (JSON.parse(line) as { id: string }).id);
    expect(ids).toEqual([incident.id, note.id, second.id]);
    h.store.close();
  });

  it("retry() writes the waiting lines, or reaches for the file when none wait", async () => {
    const h = await setUp();
    await h.mirror.start();
    h.directory.failWith = new DOMException("disk full", "QuotaExceededError");
    await h.store.createIncident({ name: INCIDENT_NAME, createdBy: "Thomas" });
    await h.mirror.settled();
    expect(h.mirror.state()).toBe("error");

    await h.mirror.retry();
    expect(h.mirror.state()).toBe("error");
    expect(h.mirror.pending()).toBe(1);

    h.directory.failWith = null;
    await h.mirror.retry();
    expect(h.mirror.state()).toBe("ready");
    expect(h.mirror.pending()).toBe(0);
    expect(h.directory.lines(FILE)).toHaveLength(1);

    h.directory.failWith = new DOMException("gone again", "NotFoundError");
    await h.mirror.retry();
    expect(h.mirror.state()).toBe("error");
    expect(h.mirror.error()).toBe("gone again");
    h.store.close();
  });

  it("a dropped permission is asked for again with one call and the waiting lines then land", async () => {
    const directory = new FakeDirectory("usb");
    directory.permission = "prompt";
    const h = await setUp({ stored: directory });
    await h.mirror.start();
    expect(h.mirror.state()).toBe("needsPermission");
    expect(h.mirror.error()).toBeNull();

    const incident = await h.store.createIncident({ name: INCIDENT_NAME, createdBy: "Thomas" });
    await h.mirror.settled();
    expect(h.mirror.pending()).toBe(1);
    expect(directory.files.size).toBe(0);

    // The click: the browser's prompt says no.
    await h.mirror.reconnect();
    expect(directory.requests).toBe(1);
    expect(h.mirror.state()).toBe("needsPermission");

    // The click: the browser's prompt says yes.
    directory.permission = "granted";
    await h.mirror.reconnect();
    await h.mirror.settled();
    expect(directory.requests).toBe(2);
    expect(h.mirror.state()).toBe("ready");
    expect(h.mirror.pending()).toBe(0);
    expect(directory.lines(FILE).map((line) => (JSON.parse(line) as { id: string }).id)).toEqual([
      incident.id,
    ]);
    h.store.close();
  });

  it("a permission lost while running shows as needsPermission, not as an error", async () => {
    const h = await setUp();
    await h.mirror.start();
    h.directory.permission = "prompt";
    await h.store.createIncident({ name: INCIDENT_NAME, createdBy: "Thomas" });
    await h.mirror.settled();
    expect(h.mirror.state()).toBe("needsPermission");
    expect(h.mirror.error()).toBeNull();
    expect(h.mirror.pending()).toBe(1);
    h.store.close();
  });

  it("the .ndjson lines re-import into a fresh store identically to the .json export", async () => {
    const h = await setUp();
    await h.mirror.start();
    const incident = await h.store.createIncident({ name: INCIDENT_NAME, createdBy: "Thomas" });
    const hans = await h.store.createRegisterEntry(registerEntry("Hans", "7a"));
    const peter = await h.store.createRegisterEntry(registerEntry("Peter", "7b"));
    const order = await h.store.appendMessageOut(
      { incidentId: incident.id, operator: "Thomas", transport: "mesh", counterpartyId: hans.id },
      (n) => `#${n} Meld status`,
    );
    await h.store.appendEntry({
      incidentId: incident.id,
      operator: "Thomas",
      type: "status_change",
      refersTo: order.id,
      newStatus: "sent",
    });
    await h.store.appendEntry({
      incidentId: incident.id,
      operator: "Thomas",
      type: "message_in",
      transport: "mesh",
      counterpartyId: hans.id,
      text: "R1",
      dedupeKey: "ab".repeat(32),
    });
    await h.store.putRegisterEntry({ ...peter, street: "Nørregade" });
    await h.store.appendEntry({
      incidentId: incident.id,
      operator: "Thomas",
      type: "note",
      text: "Strømmen tilbage",
    });
    await h.mirror.settled();

    const exported = await h.store.exportEnvelope();
    const fromMirror = await reimported(h.directory);
    expect(fromMirror.incidents).toStrictEqual(exported.incidents);
    expect(fromMirror.register).toStrictEqual(exported.register);
    expect(fromMirror.entries).toStrictEqual(exported.entries);
    expect(fromMirror.entries).toHaveLength(4);
    expect(fromMirror.register).toHaveLength(2);
    h.store.close();
  });

  it("an import is mirrored too: the walkthrough through the mirror is the walkthrough", async () => {
    const h = await setUp();
    await h.mirror.start();
    const walkthrough = loadWalkthrough();
    await h.store.importEnvelope(walkthrough);
    await h.mirror.settled();
    expect(h.directory.lines(FILE)).toHaveLength(
      walkthrough.incidents.length + walkthrough.register.length + walkthrough.entries.length,
    );
    const fromMirror = await reimported(h.directory);
    expect(fromMirror.incidents).toStrictEqual(walkthrough.incidents);
    expect(fromMirror.register).toStrictEqual(walkthrough.register);
    expect(fromMirror.entries).toStrictEqual(walkthrough.entries);
    h.store.close();
  });

  it("chooseFolder keeps the picked folder, writes an export file as the starting point, then mirrors", async () => {
    const usb = new FakeDirectory("usb");
    const h = await setUp({ stored: null, pick: usb });
    await h.mirror.start();
    expect(h.mirror.supported()).toBe(true);
    const incident = await h.store.createIncident({ name: INCIDENT_NAME, createdBy: "Thomas" });
    await h.mirror.settled();
    expect(usb.files.size).toBe(0);

    await h.mirror.chooseFolder();
    await h.mirror.settled();
    expect(h.picks).toHaveLength(1);
    expect(h.saved()).toBe(usb);
    expect(h.mirror.state()).toBe("ready");
    expect(h.mirror.folderName()).toBe("usb");
    const envelope = await h.store.exportEnvelope();
    const exportName = [...usb.files.keys()].find((name) => name.endsWith(".json"));
    expect(exportName).toBeDefined();
    const written = JSON.parse(usb.text(exportName ?? "")) as Envelope;
    expect(written.incidents).toStrictEqual([incident]);
    expect(written.entries).toEqual([]);
    expect(usb.files.has(FILE)).toBe(false);

    const note = await h.store.appendEntry({
      incidentId: incident.id,
      operator: "Thomas",
      type: "note",
      text: "after choosing",
    });
    await h.mirror.settled();
    expect(usb.lines(FILE).map((line) => (JSON.parse(line) as { id: string }).id)).toEqual([
      note.id,
    ]);
    void envelope;
    h.store.close();
  });

  it("a closed picker changes nothing; a browser without a picker is unsupported", async () => {
    const h = await setUp({ stored: null });
    await h.mirror.start();
    expect(h.mirror.supported()).toBe(false);
    await h.mirror.chooseFolder();
    expect(h.mirror.state()).toBe("off");

    const store = await openTestStore();
    let saved: FakeDirectory | undefined;
    const mirror = createMirror<FakeDirectory>({
      store: async () => store,
      now: () => "2026-10-29T10:00:00Z",
      loadFolder: async () => saved,
      saveFolder: async (folder) => {
        saved = folder;
      },
      clearFolder: async () => {
        saved = undefined;
      },
      pickFolder: async () => {
        throw new DOMException("The user aborted a request.", "AbortError");
      },
    });
    await mirror.start();
    await mirror.chooseFolder();
    expect(mirror.state()).toBe("off");
    expect(saved).toBeUndefined();
    store.close();
    h.store.close();
  });

  it("writeEnvelope puts the export file in the folder; null when off or failing", async () => {
    const h = await setUp();
    await h.mirror.start();
    const envelope = await h.store.exportEnvelope();
    expect(await h.mirror.writeEnvelope(envelope)).toBe(envelopeFilename(envelope));
    expect(h.directory.text(envelopeFilename(envelope))).toBe(envelopeJson(envelope));

    h.directory.failWith = new DOMException("gone", "NotFoundError");
    expect(await h.mirror.writeEnvelope(envelope)).toBeNull();
    expect(h.mirror.state()).toBe("error");

    h.directory.failWith = null;
    await h.mirror.forget();
    expect(h.mirror.state()).toBe("off");
    expect(h.saved()).toBeUndefined();
    expect(await h.mirror.writeEnvelope(envelope)).toBeNull();
    h.store.close();
  });

  it("forget drops the folder and the waiting lines; later writes are not mirrored", async () => {
    const h = await setUp();
    await h.mirror.start();
    h.directory.failWith = new DOMException("gone", "NotFoundError");
    await h.store.createIncident({ name: INCIDENT_NAME, createdBy: "Thomas" });
    await h.mirror.settled();
    expect(h.mirror.pending()).toBe(1);

    await h.mirror.forget();
    expect(h.mirror.pending()).toBe(0);
    expect(h.mirror.folderName()).toBeNull();
    h.directory.failWith = null;
    await h.store.createIncident({ name: "Another", createdBy: "Thomas" });
    await h.mirror.settled();
    expect(h.directory.files.size).toBe(0);
    h.store.close();
  });

  it("lines written during a drain are written after it, in order", async () => {
    const h = await setUp();
    await h.mirror.start();
    const incident = await h.store.createIncident({ name: INCIDENT_NAME, createdBy: "Thomas" });
    const ids = [incident.id];
    for (let i = 0; i < 5; i++) {
      const note = await h.store.appendEntry({
        incidentId: incident.id,
        operator: "Thomas",
        type: "note",
        text: `note ${i}`,
      });
      ids.push(note.id);
    }
    await h.mirror.settled();
    expect(h.directory.lines(FILE).map((line) => (JSON.parse(line) as { id: string }).id)).toEqual(
      ids,
    );
    h.store.close();
  });
});
