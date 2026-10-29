<script lang="ts">
  // The shift handover (P1-08): the screen a new operator opens first. The incident and how
  // long it has been open; the operator name field, where changing the name is the handover
  // (one note "handover: ‹old› → ‹new›", then the new name on everything); the clock-confirm
  // box from the settings; the radio's state; then four lists, each oldest first, derived
  // from the entries on every reload (store/handoverView.ts): open orders, given-up messages
  // with the three decisions on the row (retry, send by courier, close with a reason),
  // unanswered incoming messages with Reply (P1-02's compose form sits under the lists), and
  // quiet radios with "Send status request" ("#n Meld status"). The page reloads on every
  // entry the inbox, the outbox or the queue writes, and after every write from here.
  // Print handover prints this page: the lists as they are, under a header with the handover
  // time and both names (app.css hides the chrome, P1-04).
  import { tick } from "svelte";
  import { t, language } from "../i18n/index.svelte.ts";
  import { clockTrust, now, setClockConfirmed } from "../lib/clock.svelte.ts";
  import { currentIncidentId } from "../lib/currentIncident.svelte.ts";
  import { formatElapsed } from "../lib/elapsed.ts";
  import { formatDateTime, formatShortTime, incidentName, stripText } from "../lib/journalText.ts";
  import { hashFor } from "../lib/router.svelte.ts";
  import { hasOperatorName, settings } from "../lib/settings.svelte.ts";
  import { capability, inbox, outbox, radio, sendQueue } from "../radio/index.ts";
  import { disconnectReasonText } from "../radio/radioStore.svelte.ts";
  import { buildHandover, quietRadios } from "../store/handoverView.ts";
  import { incidentStateOf, isDrill } from "../store/incidents.ts";
  import {
    entriesForIncident,
    handOffToCourier,
    handOver,
    lastHeardByCounterparty,
    listIncidents,
    listRegister,
    recordManualStatus,
    sendStatusRequest,
  } from "../store/index.ts";
  import type { MessageView } from "../store/journalView.ts";
  import { sortedByLabel } from "../store/register.ts";
  import type { Incident, JournalEntry, RegisterEntry } from "../store/types.ts";
  import ComposeForm from "../components/ComposeForm.svelte";

  let incidents: Incident[] = $state([]);
  let register: RegisterEntry[] = $state([]);
  let entries: JournalEntry[] = $state([]);
  let heard: Map<string, string> = $state(new Map());
  let loadError: string | null = $state(null);
  let actionError: string | null = $state(null);
  let notice: string | null = $state(null);
  // Bumped after every write from this screen, so the effect below reloads.
  let ownRevision = $state(0);
  let busy = $state(false);
  // Ticks once a second: the ages and the incident's open time move without a reload.
  let nowMs = $state(Date.now());
  let compose: ComposeForm | undefined = $state(undefined);

  // The name typed for the operator taking over; the handover happens on Take over.
  let newOperator = $state(settings.operatorName);
  // The handover done on this visit, for the printed header; null until one is done.
  interface Handover {
    from: string;
    to: string;
    at: string;
  }
  let lastHandover = $state<Handover | null>(null);
  // The print time, taken when Print is pressed.
  let printedAt = $state("");
  // The given-up message whose close form is open, and the reason typed in it.
  let closing: string | null = $state(null);
  let reason = $state("");

  const incidentId = $derived(currentIncidentId());
  const current = $derived(incidents.find((incident) => incident.id === incidentId) ?? null);
  const incidentState = $derived(current === null ? null : incidentStateOf(entries, current.id));
  const drill = $derived(isDrill(current));
  const labels = $derived(new Map(register.map((entry) => [entry.id, entry.label])));
  const sortedRegister = $derived(sortedByLabel(register, language()));
  const lists = $derived(buildHandover(entries));
  const blindAfterMs = $derived(settings.blindAfterMinutes * 60_000);
  const quiet = $derived(quietRadios(register, heard, { nowMs, blindAfterMs }));
  const radioState = $derived(radio.state());
  const radioElapsed = $derived(radio.elapsedMs());
  const radioReason = $derived(radioState === "disconnected" ? radio.disconnectReason() : null);
  const radioReady = $derived(radioState === "connected" || radioState === "blind");
  const active = $derived(outbox.active());
  const queued = $derived(outbox.queued());
  const waitingInQueue = $derived(sendQueue.waiting());
  const handedToOutbox = $derived(sendQueue.sending());
  const canTakeOver = $derived(
    !busy && newOperator.trim() !== "" && newOperator.trim() !== settings.operatorName.trim(),
  );
  // The printed header: the handover done here, or else the names as they stand now.
  const printFrom = $derived(lastHandover?.from ?? settings.operatorName.trim());
  const printTo = $derived(lastHandover?.to ?? newOperator.trim());
  const printTime = $derived(lastHandover?.at ?? printedAt);

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  async function reload(id: string | null) {
    try {
      incidents = await listIncidents();
      register = await listRegister();
      heard = await lastHeardByCounterparty();
      if (id === null) {
        entries = [];
      } else {
        const loaded = await entriesForIncident(id);
        if (currentIncidentId() === id) {
          entries = loaded;
        }
      }
      loadError = null;
    } catch (failure) {
      loadError = t("journal.loadFailed", { error: describe(failure) });
    }
  }

  $effect(() => {
    inbox.revision();
    outbox.revision();
    sendQueue.revision();
    void ownRevision;
    void reload(incidentId);
  });

  $effect(() => {
    const timer = setInterval(() => {
      nowMs = Date.now();
    }, 1000);
    return () => clearInterval(timer);
  });

  async function changed() {
    ownRevision += 1;
    await reload(currentIncidentId());
  }

  function age(timestamp: string): string {
    return formatElapsed(nowMs - Date.parse(timestamp));
  }

  // --- the handover ----------------------------------------------------------------------

  async function takeOver(event: SubmitEvent) {
    event.preventDefault();
    if (!canTakeOver || current === null) {
      return;
    }
    busy = true;
    actionError = null;
    notice = null;
    const from = settings.operatorName.trim();
    try {
      const note = await handOver(current.id, newOperator);
      if (note !== null) {
        lastHandover = { from, to: note.operator, at: note.timestamp };
        newOperator = note.operator;
        notice = t("handover.operator.done", { from, to: note.operator });
      }
      await changed();
    } catch (failure) {
      actionError = t("handover.operator.failed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  // --- the rows' actions (the journal screen's paths, P0-05 / P0-07 / P1-02) --------------

  async function transmit(message: JournalEntry) {
    try {
      await outbox.send(message.id);
    } catch (failure) {
      actionError = t("send.failed", { error: describe(failure) });
    }
    await changed();
  }

  function inflight(messageId: string): string | null {
    if (active?.messageId === messageId) {
      return t(`send.inflight.${active.phase}`, {
        attempt: active.attempt + 1,
        max: active.maxAttempts,
      });
    }
    if (
      queued.includes(messageId) ||
      waitingInQueue.includes(messageId) ||
      handedToOutbox === messageId
    ) {
      return t("send.inflight.queued");
    }
    return null;
  }

  function canRetry(view: MessageView): boolean {
    return view.entry.transport === "mesh" && inflight(view.entry.id) === null && radioReady;
  }

  async function retry(view: MessageView) {
    actionError = null;
    notice = null;
    await transmit(view.entry);
  }

  async function courier(view: MessageView) {
    if (busy) {
      return;
    }
    busy = true;
    actionError = null;
    notice = null;
    try {
      const { copy } = await handOffToCourier(view.entry);
      notice = t("handover.givenUp.courierDone", { n: copy.seqNo ?? 0 });
      await changed();
    } catch (failure) {
      actionError = t("send.manual.failed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  function startClose(view: MessageView) {
    actionError = null;
    closing = view.entry.id;
    reason = "";
  }

  function cancelClose() {
    closing = null;
    reason = "";
  }

  async function close(view: MessageView, event: SubmitEvent) {
    event.preventDefault();
    if (busy || reason.trim() === "") {
      return;
    }
    busy = true;
    actionError = null;
    notice = null;
    try {
      await recordManualStatus(view.entry, "roger", reason);
      closing = null;
      reason = "";
      await changed();
    } catch (failure) {
      actionError = t("send.manual.failed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  function reply(entry: JournalEntry) {
    actionError = null;
    void compose?.replyTo(entry);
  }

  async function onsent(message: JournalEntry) {
    actionError = null;
    await changed();
    if (message.transport === "mesh") {
      void transmit(message);
    }
  }

  async function statusRequest(entry: RegisterEntry) {
    if (busy || current === null) {
      return;
    }
    busy = true;
    actionError = null;
    notice = null;
    try {
      const { message } = await sendStatusRequest(current.id, entry.id);
      notice = t("send.result", { n: message.seqNo ?? 0, label: entry.label });
      await changed();
      void transmit(message);
    } catch (failure) {
      actionError = t("send.failed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  // --- print -----------------------------------------------------------------------------

  // The page prints itself: the header below is print-only, the controls and forms are not
  // printed. The document title carries the incident while the dialog is open.
  async function print() {
    if (current === null) {
      return;
    }
    printedAt = now().timestamp;
    await tick();
    const title = document.title;
    document.title = t("handover.print.pageTitle", { incident: incidentName(current) });
    try {
      window.print();
    } finally {
      document.title = title;
    }
  }

  function stripLine(view: MessageView): string {
    const inflightText = inflight(view.entry.id);
    return view.strip.map((item) => stripText(item, inflightText)).join(" · ");
  }
</script>

<h1 class="no-print">{t("handover.title")}</h1>
<p class="intro no-print">{t("handover.intro")}</p>

{#if loadError}
  <p class="error no-print" role="alert">{loadError}</p>
{/if}

{#if current === null}
  <p class="notice no-print">
    {t("print.noIncident")}
    <a href={hashFor("journal")}>{t("nav.journal")}</a>
  </p>
{:else}
  <!-- The header on paper: the incident, the handover time and both names. -->
  <header class="print-only">
    <h1>{t("handover.print.title", { incident: incidentName(current) })}</h1>
    {#if drill}
      <p class="drill">{t("print.drill")}</p>
    {/if}
    <dl>
      <dt>{t("handover.print.time")}</dt>
      <dd>{printTime === "" ? "" : formatDateTime(printTime)}</dd>
      <dt>{t("handover.print.from")}</dt>
      <dd>{printFrom}</dd>
      <dt>{t("handover.print.to")}</dt>
      <dd>
        {#if printTo === ""}<span class="blank" aria-hidden="true"></span>{:else}{printTo}{/if}
      </dd>
    </dl>
  </header>

  <section class="head no-print" aria-labelledby="handover-incident-heading">
    <div class="row">
      <h2 id="handover-incident-heading">{incidentName(current)}</h2>
      {#if incidentState === "closed"}
        <span class="state" data-state="closed">{t("journal.incident.state.closed")}</span>
      {:else}
        <span class="muted">
          {t("handover.incident.openFor", {
            elapsed: formatElapsed(nowMs - Date.parse(current.createdAt)),
          })}
        </span>
      {/if}
      <span class="spacer"></span>
      <button type="button" class="secondary" onclick={print}>{t("handover.print")}</button>
    </div>

    <div class="row panels">
      <!-- Changing the name here is the handover. -->
      <form class="panel operator" onsubmit={takeOver}>
        <label for="handover-operator">{t("handover.operator.label")}</label>
        <div class="row">
          <input
            id="handover-operator"
            type="text"
            autocomplete="name"
            bind:value={newOperator}
            disabled={busy}
          />
          <button type="submit" disabled={!canTakeOver}>{t("handover.operator.takeOver")}</button>
        </div>
        <small>{t("handover.operator.current", { name: settings.operatorName })}</small>
        <small>{t("handover.operator.help")}</small>
      </form>

      <!-- The settings' clock box, repeated: an unconfirmed clock is the first thing to fix. -->
      <div class="panel clock">
        <span class="label">{t("settings.clock")}</span>
        <label class="check">
          <input
            type="checkbox"
            checked={clockTrust() !== "unknown"}
            disabled={clockTrust() === "ntp"}
            onchange={(event) => setClockConfirmed(event.currentTarget.checked)}
          />
          {t("settings.clockConfirm")}
        </label>
        <small class="trust" data-trust={clockTrust()} role="status"
          >{t(`settings.clockTrust.${clockTrust()}`)}</small
        >
      </div>

      <div class="panel radio">
        <span class="label">{t("topbar.radio")}</span>
        <a href={hashFor("radio")} data-state={radioState}>
          <span class="dot" aria-hidden="true"></span>
          <span role="status">
            {#if capability === "none"}
              {t("topbar.noRadioApi")}
            {:else}
              {t(`radio.status.${radioState}`)}{#if radioReason !== null}
                · {disconnectReasonText(radioReason)}{/if}
            {/if}
          </span>
        </a>
        <small>
          {#if radioElapsed === null}
            {t("handover.radio.never")}
          {:else}
            {t("radio.heard", { elapsed: formatElapsed(radioElapsed) })}
          {/if}
        </small>
      </div>
    </div>
  </section>

  {#if actionError}
    <p class="error no-print" role="alert">{actionError}</p>
  {/if}
  {#if notice}
    <p class="ok no-print" role="status">{notice}</p>
  {/if}

  <div class="lists">
    <section class="list" aria-labelledby="handover-open-heading">
      <h2 id="handover-open-heading" title={t("handover.open.help")}>
        {t("handover.open.title", { count: lists.open.length })}
      </h2>
      {#if lists.open.length === 0}
        <p class="muted">{t("handover.open.empty")}</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th scope="col">{t("journal.entries.time")}</th>
              <th scope="col">{t("journal.entries.counterparty")}</th>
              <th scope="col">{t("journal.entries.text")}</th>
              <th scope="col">{t("handover.column.age")}</th>
              <th scope="col">{t("journal.timeline.status")}</th>
            </tr>
          </thead>
          <tbody>
            {#each lists.open as view (view.entry.id)}
              <tr data-entry-id={view.entry.id}>
                <td class="time" title={formatDateTime(view.entry.timestamp)}>
                  {formatShortTime(view.entry.timestamp)}
                </td>
                <td class="label">
                  {labels.get(view.entry.counterpartyId ?? "") ?? ""}
                  {#if view.entry.transport !== undefined && view.entry.transport !== "mesh"}
                    <small class="muted">{t(`send.transport.${view.entry.transport}`)}</small>
                  {/if}
                </td>
                <td class="text">
                  {view.entry.text ?? ""}
                  <div class="strip">{stripLine(view)}</div>
                </td>
                <td class="num">{age(view.entry.timestamp)}</td>
                <td
                  ><span class="chip" data-status={view.status}
                    >{t(`journal.status.${view.status}`)}</span
                  ></td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <section class="list" aria-labelledby="handover-givenup-heading">
      <h2 id="handover-givenup-heading" title={t("handover.givenUp.help")}>
        {t("handover.givenUp.title", { count: lists.givenUp.length })}
      </h2>
      {#if lists.givenUp.length === 0}
        <p class="muted">{t("handover.givenUp.empty")}</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th scope="col">{t("journal.entries.time")}</th>
              <th scope="col">{t("journal.entries.counterparty")}</th>
              <th scope="col">{t("journal.entries.text")}</th>
              <th scope="col">{t("handover.column.age")}</th>
              <th scope="col" class="no-print"
                ><span class="visually-hidden">{t("journal.timeline.actions")}</span></th
              >
            </tr>
          </thead>
          <tbody>
            {#each lists.givenUp as view (view.entry.id)}
              <tr data-entry-id={view.entry.id} data-status="given_up">
                <td class="time" title={formatDateTime(view.entry.timestamp)}>
                  {formatShortTime(view.entry.timestamp)}
                </td>
                <td class="label">
                  {labels.get(view.entry.counterpartyId ?? "") ?? ""}
                  {#if view.entry.transport !== undefined && view.entry.transport !== "mesh"}
                    <small class="muted">{t(`send.transport.${view.entry.transport}`)}</small>
                  {/if}
                </td>
                <td class="text">
                  {view.entry.text ?? ""}
                  <div class="strip">{stripLine(view)}</div>
                </td>
                <td class="num">{age(view.entry.timestamp)}</td>
                <td class="actions no-print">
                  {#if canRetry(view)}
                    <button
                      type="button"
                      class="secondary small"
                      disabled={busy}
                      onclick={() => retry(view)}
                    >
                      {t("send.retry")}
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="secondary small"
                    title={t("handover.givenUp.courierHelp")}
                    disabled={busy}
                    onclick={() => courier(view)}
                  >
                    {t("handover.givenUp.courier")}
                  </button>
                  <button
                    type="button"
                    class="secondary small"
                    title={t("handover.givenUp.closeHelp")}
                    disabled={busy}
                    aria-expanded={closing === view.entry.id}
                    onclick={() => startClose(view)}
                  >
                    {t("handover.givenUp.close")}
                  </button>
                </td>
              </tr>
              {#if closing === view.entry.id}
                <tr class="form no-print">
                  <td colspan="5">
                    <form class="inline" onsubmit={(event) => close(view, event)}>
                      <input
                        type="text"
                        placeholder={t("journal.manual.reason")}
                        aria-label={t("journal.manual.reason")}
                        bind:value={reason}
                      />
                      <button type="submit" class="small" disabled={busy || reason.trim() === ""}>
                        {t("handover.givenUp.close")}
                      </button>
                      <button type="button" class="secondary small" onclick={cancelClose}>
                        {t("journal.action.cancel")}
                      </button>
                    </form>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <section class="list" aria-labelledby="handover-unanswered-heading">
      <h2 id="handover-unanswered-heading" title={t("handover.unanswered.help")}>
        {t("handover.unanswered.title", { count: lists.unanswered.length })}
      </h2>
      {#if lists.unanswered.length === 0}
        <p class="muted">{t("handover.unanswered.empty")}</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th scope="col">{t("journal.entries.time")}</th>
              <th scope="col">{t("journal.entries.counterparty")}</th>
              <th scope="col">{t("journal.entries.text")}</th>
              <th scope="col">{t("handover.column.age")}</th>
              <th scope="col" class="no-print"
                ><span class="visually-hidden">{t("journal.timeline.actions")}</span></th
              >
            </tr>
          </thead>
          <tbody>
            {#each lists.unanswered as entry (entry.id)}
              <tr data-entry-id={entry.id} data-type="message_in">
                <td class="time" title={formatDateTime(entry.timestamp)}>
                  {formatShortTime(entry.timestamp)}
                </td>
                <td class="label">
                  {labels.get(entry.counterpartyId ?? "") ?? ""}
                  {#if entry.transport !== undefined && entry.transport !== "mesh"}
                    <small class="muted">{t(`send.transport.${entry.transport}`)}</small>
                  {/if}
                </td>
                <td class="text">{entry.text ?? ""}</td>
                <td class="num">{age(entry.timestamp)}</td>
                <td class="actions no-print">
                  <button type="button" class="small" onclick={() => reply(entry)}>
                    {t("journal.action.reply")}
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

    <section class="list" aria-labelledby="handover-quiet-heading">
      <h2
        id="handover-quiet-heading"
        title={t("handover.quiet.help", { minutes: settings.blindAfterMinutes })}
      >
        {t("handover.quiet.title", { count: quiet.length })}
      </h2>
      {#if quiet.length === 0}
        <p class="muted">{t("handover.quiet.empty", { minutes: settings.blindAfterMinutes })}</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th scope="col">{t("journal.entries.counterparty")}</th>
              <th scope="col">{t("handover.column.lastHeard")}</th>
              <th scope="col" class="no-print"
                ><span class="visually-hidden">{t("journal.timeline.actions")}</span></th
              >
            </tr>
          </thead>
          <tbody>
            {#each quiet as row (row.entry.id)}
              <tr data-register-id={row.entry.id} class:never={row.at === null}>
                <td class="label">{row.entry.label}</td>
                <td class="when">
                  {#if row.at === null}
                    {t("journal.heard.never")}
                  {:else}
                    <span title={formatDateTime(row.at)}
                      >{t("journal.heard.ago", { elapsed: age(row.at) })}</span
                    >
                  {/if}
                </td>
                <td class="actions no-print">
                  <button
                    type="button"
                    class="secondary small"
                    title={radioReady ? t("handover.quiet.requestHelp") : t("send.noRadio")}
                    disabled={busy || !radioReady || !hasOperatorName()}
                    onclick={() => statusRequest(row.entry)}
                  >
                    {t("handover.quiet.request")}
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  </div>

  <!-- Reply lands here (P1-02): the form takes the sender and the transport from the row. -->
  <section class="compose no-print" aria-labelledby="handover-compose-heading">
    <h2 id="handover-compose-heading">{t("journal.compose.title")}</h2>
    {#key current.id}
      <ComposeForm
        bind:this={compose}
        incidentId={current.id}
        {drill}
        register={sortedRegister}
        {onsent}
      />
    {/key}
  </section>
{/if}

<style>
  .intro {
    color: var(--muted);
    margin: 0 0 1rem;
  }

  .error {
    color: var(--error);
  }

  .ok {
    color: var(--ok);
  }

  .muted {
    color: var(--muted);
  }

  .notice {
    padding: 0.75rem 1rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
  }

  .print-only {
    display: none;
  }

  .head {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    margin-bottom: 1rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .panels {
    align-items: stretch;
    gap: 1rem;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
    min-width: 16rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--light);
  }

  .panel label,
  .panel .label {
    font-weight: 600;
  }

  .panel small {
    color: var(--muted);
  }

  .operator input {
    flex: 1;
    min-width: 10rem;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.5rem;
  }

  .trust {
    color: var(--ink);
  }

  .trust[data-trust="unknown"] {
    color: var(--error);
    font-weight: 600;
  }

  .radio a {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.5rem;
    text-decoration: none;
    color: var(--ink);
  }

  /* The dot has an edge of its own, so it reads as a shape beside its word in every mode. */
  .dot {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    border: 2px solid var(--ink);
    background: var(--dot-idle);
  }

  .radio a[data-state="connecting"] .dot {
    background: var(--dot-connecting);
  }

  .radio a[data-state="connected"] .dot {
    background: var(--dot-connected);
  }

  .radio a[data-state="blind"] .dot {
    background: var(--dot-blind);
  }

  .radio a[data-state="blind"],
  .radio a[data-state="disconnected"] {
    font-weight: 700;
  }

  h2 {
    font-size: 1.1rem;
    margin: 0;
  }

  .spacer {
    flex: 1;
  }

  .state {
    padding: 0.1rem 0.5rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    background: var(--light);
    color: var(--error);
  }

  .state::before {
    content: "■ ";
  }

  /* Two columns on a wide screen; one under 80rem (1440 px at the 18 px base), so the
     tables with their row buttons fit at 1280 px without a horizontal scroll (P1-09). */
  .lists {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    align-items: start;
  }

  @media (max-width: 80rem) {
    .lists {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .list {
    padding: 0.75rem 1rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    min-width: 0;
  }

  .list h2 {
    margin-bottom: 0.5rem;
  }

  .list p {
    margin: 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 0.35rem 0.4rem;
    border-bottom: 1px solid var(--rule);
  }

  thead th {
    background: var(--light);
    border-bottom-color: var(--line);
  }

  .time,
  .num,
  .when {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .when {
    color: var(--muted);
  }

  tr.never .when {
    color: var(--error);
    font-weight: 600;
  }

  tr.never .when::before {
    content: "! ";
  }

  .label {
    font-weight: 600;
  }

  .text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    width: 50%;
  }

  .strip {
    margin-top: 0.15rem;
    font-size: 0.85rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  tr[data-status="given_up"] td {
    background: var(--surface-given-up);
  }

  tr[data-type="message_in"] td {
    background: var(--surface-in);
  }

  tr.form td {
    background: var(--light);
  }

  /* The row buttons wrap instead of widening the table past its section. */
  .actions {
    min-width: 10rem;
  }

  .actions button {
    margin: 0 0.25rem 0.25rem 0;
  }

  .inline {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .inline input {
    flex: 1;
    min-width: 12rem;
  }

  .compose {
    margin-top: 1.5rem;
  }

  .compose h2 {
    margin-bottom: 0.5rem;
  }

  /* On paper (P1-04's print rules in app.css hide the chrome): the header with the time and
     both names, then the four lists as plain tables, one after the other. */
  @media print {
    .print-only {
      display: block;
    }

    .print-only h1 {
      margin: 0 0 0.5rem;
    }

    .print-only .drill {
      margin: 0 0 0.75rem;
      padding: 0.3rem 0.6rem;
      border: 2px solid var(--ink);
      font-weight: 700;
      letter-spacing: 0.05em;
    }

    .print-only dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.1rem 1rem;
      margin: 0 0 1rem;
      font-size: 0.9rem;
    }

    .print-only dt {
      font-weight: 600;
    }

    .print-only dd {
      margin: 0;
    }

    .blank {
      display: inline-block;
      width: 12rem;
      border-bottom: 1px solid var(--ink);
    }

    .lists {
      display: block;
    }

    .list {
      padding: 0;
      border: none;
      margin-bottom: 1rem;
      break-inside: avoid;
    }

    thead th {
      background: none;
      border-bottom: 2px solid var(--ink);
    }

    tr {
      break-inside: avoid;
    }

    tr[data-status="given_up"] td,
    tr[data-type="message_in"] td {
      background: none;
    }

    .strip,
    .muted,
    .when {
      color: #444;
    }

    .chip {
      padding: 0;
      border: none;
      background: none;
      color: inherit;
      font-weight: 400;
    }
  }
</style>
