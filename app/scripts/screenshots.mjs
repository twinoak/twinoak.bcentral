// Every screen as a PNG for review (P2-05): builds the app, serves dist/ locally, fills a
// fresh browser profile with contract/examples/walkthrough.json plus a register of 25 radios,
// open orders, given-up messages, unanswered incoming messages, a 25-recipient send-to-all
// half drained and a drill incident — through the `?seed` hook of src/main.ts — and captures
// every route at 1280 × 720 and 1440 × 900 at the normal text size, the journal also at the
// largest size and in high contrast, the two long pages whole, the three print pages as A4
// PDFs too. The files go to tasks/phase-2/reports/screens/ and are committed, so the reviewer
// can look at every screen without running the app.
//
// `npm run screenshots`. Not part of `npm run test`: it needs a browser and a build.
// playwright-core drives the first Chromium it finds: Playwright's own download when one is
// installed (`npx playwright install chromium`), else Edge, else Chrome — all Chromium, which
// is what the app targets. The clock is fixed at the walkthrough's evening, so every relative
// time on the screens ("open for 1 h 45 min", "25 min ago") is the same on every run.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { build, preview } from "vite";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const repoDir = join(appDir, "..");
const outDir = join(repoDir, "tasks", "phase-2", "reports", "screens");
const da = JSON.parse(readFileSync(join(appDir, "src", "i18n", "da.json"), "utf8"));

const SIZES = [
  [1280, 720],
  [1440, 900],
];
// The moment every capture is taken at: the evening of the walkthrough.
const NOW = "2026-10-28T19:45:00Z";
const A4_MARGIN = { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" };

// --- the data ------------------------------------------------------------------------------

// The envelope the app is seeded with: the walkthrough as it is (its closing status change
// left out, so the incident is open), plus what every screen needs to show something.
function seedEnvelope() {
  const walkthrough = JSON.parse(
    readFileSync(join(repoDir, "contract", "examples", "walkthrough.json"), "utf8"),
  );
  const device = walkthrough.deviceId;
  const real = walkthrough.incidents[0];
  const hansId = walkthrough.register[0].id;

  // Ids in the ULID's alphabet, in order: the drill's (before the walkthrough's own
  // `…0T2W5x`), then the evening's (after them).
  let idCount = 0;
  const idAfter = () => "01JB8ZK3QX9V2M4N6P8R0T3" + String(++idCount).padStart(3, "0");
  const idBefore = () => "01JB8ZK3QX9V2M4N6P8R0T1" + String(++idCount).padStart(3, "0");
  let keyCount = 0;
  const dedupeKey = () => (++keyCount).toString(16).padStart(64, "0");
  const at = (time) => `2026-10-28T${time}Z`;
  const plusSeconds = (timestamp, seconds) =>
    new Date(Date.parse(timestamp) + seconds * 1000).toISOString().replace(".000Z", "Z");

  const streets = ["Nørregade", "Søndergade", "Østergade", "Kirkevej"];
  const names = [
    ["Peter", "Peter Holm"],
    ["Lise", "Lise Dahl"],
    ["Ole", "Ole Kjær"],
    ["Eva", "Eva Lund"],
    ["Bo", "Bo Madsen"],
    ["Mette", "Mette Friis"],
    ["Kurt", "Kurt Vang"],
    ["Anne", "Anne Skov"],
    ["Jens", "Jens Krog"],
    ["Rikke", "Rikke Bach"],
    ["Søren", "Søren Toft"],
    ["Ida", "Ida Lange"],
    ["Niels", "Niels Rask"],
    ["Maja", "Maja Bro"],
    ["Lars", "Lars Juhl"],
    ["Karen", "Karen Hoff"],
    ["Erik", "Erik Steen"],
    ["Pia", "Pia Nørgaard"],
    ["Henrik", "Henrik Dam"],
    ["Sofie", "Sofie Winther"],
    ["Jan", "Jan Bruun"],
  ];
  const register = [...walkthrough.register];
  names.forEach(([label, person], i) => {
    register.push({
      id: idAfter(),
      publicKey: (0x10 + i).toString(16).padStart(2, "0").repeat(32),
      label,
      person,
      street: streets[i % 4],
      ...(i % 5 === 0 ? { role: "vejkontakt" } : {}),
      origin: i % 6 === 0 ? "private" : "issued",
      createdAt: at("18:02:00"),
      createdOnDevice: device,
    });
  });
  for (let n = 5; n <= 7; n++) {
    register.push({
      id: idAfter(),
      publicKey: (0x40 + n).toString(16).padStart(2, "0").repeat(32),
      label: `radio #${n}`,
      origin: "adhoc",
      notes: "i stabens stak",
      createdAt: at("18:04:00"),
      createdOnDevice: device,
    });
  }
  const byLabel = (label) => register.find((entry) => entry.label === label).id;

  // #n per recipient never resets (text-protocol.md): one counter across both incidents.
  const seqNos = new Map();
  const nextSeq = (counterpartyId) => {
    const next = (seqNos.get(counterpartyId) ?? 0) + 1;
    seqNos.set(counterpartyId, next);
    return next;
  };

  let deviceSeq = 0;
  const entries = [];
  const add = (fields) => {
    const entry = { deviceId: device, clockTrust: "manual", operator: "Thomas", ...fields };
    entry.deviceSeq = ++deviceSeq;
    entries.push(entry);
    return entry;
  };
  // A message_out with its status chain, five seconds apart; `given_up` carries a reason.
  const out = (incidentId, makeId, label, timestamp, text, statuses, extra = {}) => {
    const counterpartyId = byLabel(label);
    const seqNo = nextSeq(counterpartyId);
    const message = add({
      id: makeId(),
      incidentId,
      timestamp,
      type: "message_out",
      transport: "mesh",
      counterpartyId,
      seqNo,
      text: `${extra.prefix ?? ""}#${seqNo} ${text}`,
      ...(extra.refersTo ? { refersTo: extra.refersTo } : {}),
      ...(extra.batchId ? { batchId: extra.batchId } : {}),
    });
    statuses.forEach((newStatus, i) => {
      add({
        id: makeId(),
        incidentId,
        timestamp: plusSeconds(timestamp, 5 * (i + 1)),
        type: "status_change",
        refersTo: message.id,
        newStatus,
        ...(newStatus === "given_up" ? { text: "ingen kvittering efter 3 forsøg" } : {}),
      });
    });
    return message;
  };
  const inbound = (incidentId, makeId, label, timestamp, text) =>
    add({
      id: makeId(),
      incidentId,
      timestamp,
      type: "message_in",
      transport: "mesh",
      counterpartyId: byLabel(label),
      text,
      dedupeKey: dedupeKey(),
    });
  // A roger: the "Rn" from the radio, then the status change that carries the incoming id.
  const roger = (incidentId, makeId, message, label, timestamp) => {
    const reply = inbound(incidentId, makeId, label, timestamp, `R${message.seqNo}`);
    add({
      id: makeId(),
      incidentId,
      timestamp,
      type: "status_change",
      refersTo: message.id,
      newStatus: "roger",
      text: reply.id,
    });
  };

  // The drill, three days before: a few lines, every outgoing text with the on-air prefix.
  const drill = {
    id: idBefore(),
    name: "Stormflodsøvelse",
    createdAt: "2026-10-25T10:00:00Z",
    clockTrust: "manual",
    createdOnDevice: device,
    createdBy: "Thomas",
    drill: true,
  };
  const drillAt = (time) => `2026-10-25T${time}Z`;
  add({
    id: idBefore(),
    incidentId: drill.id,
    timestamp: drillAt("10:02:00"),
    type: "note",
    text: "Øvelsen startet, tre radioer udleveret ved klubhuset",
  });
  const drillOrder = out(
    drill.id,
    idBefore,
    "Peter",
    drillAt("10:05:00"),
    "Meld status for Søndergade",
    ["sent", "delivered"],
    { prefix: "ØVELSE " },
  );
  roger(drill.id, idBefore, drillOrder, "Peter", drillAt("10:07:00"));
  out(
    drill.id,
    idBefore,
    "Lise",
    drillAt("10:08:00"),
    "Kør til Søndergade 2 og meld tilbage",
    ["sent"],
    { prefix: "ØVELSE " },
  );
  inbound(drill.id, idBefore, "Lise", drillAt("10:12:00"), "Er ved nr 2, alt roligt");

  // The walkthrough's own entries, re-numbered after the drill's; the closing left out.
  for (const entry of walkthrough.entries) {
    if (entry.newStatus === "closed") {
      continue;
    }
    add({ ...entry });
  }
  seqNos.set(hansId, 2);

  // The evening: open orders, given-up messages, unanswered and answered incoming messages,
  // a roger, a note, a phone call.
  const id = idAfter;
  out(real.id, id, "Peter", at("19:12:00"), "Meld status for Søndergade", ["sent", "delivered"]);
  out(real.id, id, "Lise", at("19:14:00"), "Er der strøm i nr 12?", ["sent"]);
  out(real.id, id, "Ole", at("19:15:00"), "Kør til Nørregade 4 med pumpen", ["sent", "delivered"]);
  out(real.id, id, "Eva", at("19:16:00"), "Meld status", ["sent", "given_up"]);
  out(real.id, id, "Kurt", at("19:18:00"), "Hent nøglen hos Peter", ["sent", "given_up"]);
  inbound(real.id, id, "Lise", at("19:20:00"), "Vi mangler lys i nr 12, kan I sende lygter");
  const fromAnne = inbound(
    real.id,
    id,
    "Anne",
    at("19:22:00"),
    "Kælderen i nr 8 har vand, hvad gør vi",
  );
  const mette = out(real.id, id, "Mette", at("19:25:00"), "Pumpe på vej til nr 4", [
    "sent",
    "delivered",
  ]);
  out(
    real.id,
    id,
    "Anne",
    at("19:26:00"),
    "Hold jer fra kælderen, Peter kommer med pumpen",
    ["sent"],
    {
      refersTo: fromAnne.id,
    },
  );
  roger(real.id, id, mette, "Mette", at("19:29:00"));
  add({
    id: id(),
    incidentId: real.id,
    timestamp: at("19:30:00"),
    type: "note",
    text: "Vagtskifte planlagt 22:00, Mette tager over",
  });

  // Send to all, half drained: three roger, five delivered, four sent, thirteen pending —
  // the pending ones come back as a restored batch in the queue after a reload.
  const batchId = id();
  register.forEach((entry, i) => {
    const statuses = i < 8 ? ["sent", "delivered"] : i < 12 ? ["sent"] : [];
    const message = out(
      real.id,
      id,
      entry.label,
      at("19:40:00"),
      "Meld status for jeres vej inden 21:00",
      statuses,
      { batchId },
    );
    if (i < 3) {
      roger(real.id, id, message, entry.label, at(`19:41:${String(10 + i * 7).padStart(2, "0")}`));
    }
  });
  add({
    id: id(),
    incidentId: real.id,
    timestamp: at("19:43:00"),
    type: "message_in",
    transport: "phone",
    counterpartyId: hansId,
    text: "Kommunens vagt ringede: pumpen er fremme 20:30",
  });

  return {
    envelope: {
      format: "bcentral-journal",
      version: 1,
      deviceId: device,
      exportedAt: NOW,
      incidents: [drill, real],
      register,
      entries,
    },
    realId: real.id,
    drillId: drill.id,
  };
}

// --- the browser ---------------------------------------------------------------------------

async function launch() {
  let lastError;
  for (const options of [{}, { channel: "msedge" }, { channel: "chrome" }]) {
    try {
      return await chromium.launch({ headless: true, ...options });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function pdfPageCount(bytes) {
  const match = /\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/.exec(bytes.toString("latin1"));
  return match === null ? null : Number(match[1]);
}

const pageErrors = [];
const written = [];

async function run() {
  // The build, as `npm run build` does it (the icons first), then dist/ served at the Pages
  // base the way `npm run preview` serves it.
  execFileSync(process.execPath, [join(appDir, "scripts", "make-icon.mjs")], { stdio: "inherit" });
  await build({ root: appDir, configFile: join(appDir, "vite.config.ts"), logLevel: "warn" });
  const server = await preview({
    root: appDir,
    configFile: join(appDir, "vite.config.ts"),
    logLevel: "warn",
    preview: { port: 4173, strictPort: false, open: false },
  });
  const base = server.resolvedUrls.local[0];
  console.log(`serving ${base}`);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const { envelope, realId, drillId } = seedEnvelope();
  const browser = await launch();
  console.log(`browser ${browser.version()}`);

  try {
    for (const [width, height] of SIZES) {
      await captureSize(browser, base, { envelope, realId, drillId }, width, height);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  for (const error of pageErrors) {
    console.error(`page error: ${error}`);
  }
  console.log(`${written.length} files in ${outDir}`);
  if (pageErrors.length > 0) {
    process.exit(1);
  }
}

async function captureSize(browser, base, data, width, height) {
  const size = `${width}x${height}`;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: "da-DK",
    timezoneId: "Europe/Copenhagen",
    reducedMotion: "reduce",
  });
  // What the staff's browser holds before the app starts: the operator, the device id (the
  // envelope's, so the store's counters follow its entries), Danish, the incident. Headless
  // Chromium refuses persistent storage, which an installed app on a laptop is granted, so
  // the promise is given here; the chip then says only that no journal folder is set.
  await context.addInitScript(
    ({ deviceId, incidentId }) => {
      if (localStorage.getItem("bcentral.settings") === null) {
        localStorage.setItem(
          "bcentral.settings",
          JSON.stringify({ operatorName: "Thomas", deviceId }),
        );
        localStorage.setItem("bcentral.language", "da");
        localStorage.setItem("bcentral.currentIncidentId", incidentId);
      }
      Object.defineProperty(navigator.storage, "persist", { value: async () => true });
    },
    { deviceId: data.envelope.deviceId, incidentId: data.realId },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => pageErrors.push(`${size}: ${error.message}`));
  await page.clock.setFixedTime(new Date(NOW));

  const shot = async (name, options = {}) => {
    await page.evaluate(() => document.fonts.ready);
    const file = join(outDir, `${name}-${size}.png`);
    await page.screenshot({ path: file, animations: "disabled", caret: "hide", ...options });
    written.push(file);
    console.log(file);
  };
  const pdf = async (name) => {
    const file = join(outDir, `${name}-A4.pdf`);
    const bytes = await page.pdf({ path: file, format: "A4", margin: A4_MARGIN });
    written.push(file);
    console.log(`${file} (${pdfPageCount(bytes) ?? "?"} pages)`);
  };
  const go = async (hash, ready) => {
    await page.goto(`${base}?seed${hash}`);
    await page.locator(ready).first().waitFor();
  };
  // The clock is session state, so it is confirmed again after every reload — through the
  // chip's popover, as the operator does it.
  const confirmClock = async () => {
    await page.locator('[data-chip="clock"] button.chip').click();
    await page.locator('[data-chip="clock"] .popover input[type="checkbox"]').check();
    await page.keyboard.press("Escape");
    await page.locator('[data-chip="clock"] .popover').waitFor({ state: "hidden" });
    // The chip got the focus back; a capture is of the screen, not of the keyboard's place.
    await page.evaluate(() => document.activeElement?.blur());
  };
  // The paper as a picture, at A4's width (210 mm at 96 dpi, the 15 mm margins inside),
  // since not every reviewer can open the PDF beside the report.
  const paper = async (name) => {
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    const file = join(outDir, `${name}-A4.png`);
    await page.screenshot({
      path: file,
      fullPage: true,
      animations: "disabled",
      caret: "hide",
      style: "main { padding: 15mm !important; }",
    });
    written.push(file);
    console.log(file);
    await page.emulateMedia({ media: "screen" });
    await page.setViewportSize({ width, height });
  };
  // Another incident, or other settings (the text size, the contrast), then a fresh start.
  const reloadWith = async (change, ready) => {
    await page.evaluate(({ incidentId, patch }) => {
      if (incidentId !== undefined) {
        localStorage.setItem("bcentral.currentIncidentId", incidentId);
      }
      if (patch !== undefined) {
        const stored = JSON.parse(localStorage.getItem("bcentral.settings") ?? "{}");
        localStorage.setItem("bcentral.settings", JSON.stringify({ ...stored, ...patch }));
      }
    }, change);
    await page.reload();
    await page.locator(ready).first().waitFor();
    await confirmClock();
  };

  // Seed, then start over on the seeded store.
  await go("#/journal", "main");
  await page.waitForFunction(() => window.__bcentral !== undefined);
  await page.evaluate((envelope) => window.__bcentral.seed(envelope), data.envelope);
  await page.reload();
  await page.locator(".rows-box .rows > li").first().waitFor();
  await confirmClock();

  await shot("journal");

  await go("#/handover", "[data-handover-head]");
  await shot("handover");

  // The queue holds the batch's pending messages, restored on load; the compose card is open
  // on load — a street ticked — and folded for the queue itself.
  await go("#/queue", ".queue-card tbody tr[data-message-id]");
  await page.locator('.picker th.pick[scope="rowgroup"] input').first().check();
  await shot("queue-compose");
  await page.getByRole("button", { name: da["queue.compose.hide"] }).click();
  await page.locator(".compose-card").waitFor({ state: "hidden" });
  await shot("queue");

  await go("#/register", ".register-box tbody tr");
  await page.getByRole("button", { name: da["register.add"], exact: true }).click();
  await page.locator("[data-register-form]").waitFor();
  await shot("register");

  await go("#/radio", ".card.state");
  await shot("radio");

  await go("#/settings", "main .card");
  await shot("settings");
  if (width === 1280) {
    await shot("settings-full", { fullPage: true });
  }

  await go("#/styleguide", "main .card");
  await shot("styleguide");
  if (width === 1280) {
    await shot("styleguide-full", { fullPage: true });
  }

  // The print pages: the screen with its toolbar, and the paper as A4.
  await go("#/print", ".doc .table tbody tr");
  await shot("print-journal");
  if (width === 1280) {
    await pdf("print-journal");
    await paper("print-journal");
  }
  await go("#/register/print", ".doc .table tbody tr");
  await shot("print-register");
  if (width === 1280) {
    await pdf("print-register");
    await paper("print-register");
  }
  await go("#/handover", "[data-handover-head]");
  await page.emulateMedia({ media: "print" });
  await shot("print-handover", { fullPage: true });
  await page.emulateMedia({ media: "screen" });
  if (width === 1280) {
    await pdf("print-handover");
    await paper("print-handover");
  }

  // The journal in a drill, at the largest size, in high contrast.
  await go("#/journal", ".rows-box");
  await reloadWith({ incidentId: data.drillId }, ".rows-box .rows > li");
  await shot("journal-drill");
  await reloadWith(
    { incidentId: data.realId, patch: { fontSize: "largest" } },
    ".rows-box .rows > li",
  );
  await shot("journal-largest");
  await reloadWith({ patch: { fontSize: "normal", highContrast: true } }, ".rows-box .rows > li");
  await shot("journal-contrast");

  await context.close();
}

await run();
