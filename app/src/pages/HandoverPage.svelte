<script lang="ts">
  // The shift handover (P1-08; on the design language in P2-04): the screen a new operator
  // opens first. A slim card on top — the incident and how long it has been open, the
  // operator name field where changing the name is the handover (one note "handover: ‹old›
  // → ‹new›", then the new name on everything), the clock-confirm box from the settings, the
  // radio's state, Print — then four cards in a 2 × 2 grid, each a row list with its count
  // in the title, oldest first, derived from the entries on every reload
  // (store/handoverView.ts): open orders, given-up messages with the three decisions on the
  // row (retry, send by courier, close with a reason), unanswered incoming messages with
  // Reply, and quiet radios with "Send status request" ("#n Meld status"). Reply opens a
  // compose card between the head and the lists (P1-02's form); it closes on send or with
  // its ✕. The page reloads on every entry the inbox, the outbox or the queue writes, and
  // after every write from here. The handover done, a courier copy and a status request are
  // toasts; errors stay inline. Print handover prints this page: the lists as they are under
  // a header with the handover time and both names (the bar and the controls are no-print).
  import { tick } from "svelte";
  import { t, language } from "../i18n/index.svelte.ts";
  import { clockTrust, now, setClockConfirmed } from "../lib/clock.svelte.ts";
  import { currentIncidentId, incidentRevision } from "../lib/currentIncident.svelte.ts";
  import { formatElapsed } from "../lib/elapsed.ts";
  import { chipClass, DIRECTION_GLYPH, stripChip } from "../lib/journalRows.ts";
  import { formatDateTime, formatShortTime, incidentName, stripText } from "../lib/journalText.ts";
  import { openPopover } from "../lib/popover.svelte.ts";
  import { hashFor } from "../lib/router.svelte.ts";
  import { hasOperatorName, settings } from "../lib/settings.svelte.ts";
  import { showToast } from "../lib/toast.svelte.ts";
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
  import Icon from "../components/Icon.svelte";

  let incidents: Incident[] = $state([]);
  let register: RegisterEntry[] = $state([]);
  let entries: JournalEntry[] = $state([]);
  let heard: Map<string, string> = $state(new Map());
  let loadError: string | null = $state(null);
  let actionError: string | null = $state(null);
  // Bumped after every write from this screen, so the effect below reloads.
  let ownRevision = $state(0);
  let busy = $state(false);
  // Ticks once a second: the ages and the incident's open time move without a reload.
  let nowMs = $state(Date.now());
  let compose: ComposeForm | undefined = $state(undefined);
  // The compose card, shown while a reply is being written.
  let composeOpen = $state(false);

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
  // The radio chip's tint, as the bar's chip (lib/statusChips.ts): connected grey, connecting
  // warn, blind and disconnected danger.
  const radioTint = $derived(
    radioState === "connected" ? "neutral" : radioState === "connecting" ? "warn" : "danger",
  );
  const active = $derived(outbox.active());
  const queued = $derived(outbox.queued());
  const waitingInQueue = $derived(sendQueue.waiting());
  const handedToOutbox = $derived(sendQueue.sending());
  const canTakeOver = $derived(
    !busy && newOperator.trim() !== "" && newOperator.trim() !== settings.operatorName.trim(),
  );
  // The printed header: the handover done here, or else the operator now and the name typed
  // for the next one; while that is still the current name, "To" is a line to write on
  // (P2-05: the field starts with the current name, which is not a handover).
  const printFrom = $derived(lastHandover?.from ?? settings.operatorName.trim());
  const printTo = $derived(
    lastHandover?.to ??
      (newOperator.trim() === settings.operatorName.trim() ? "" : newOperator.trim()),
  );
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
    // The switcher in the top bar closed or reopened the incident (P2-02).
    incidentRevision();
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
    const from = settings.operatorName.trim();
    try {
      const note = await handOver(current.id, newOperator);
      if (note !== null) {
        lastHandover = { from, to: note.operator, at: note.timestamp };
        newOperator = note.operator;
        showToast(t("handover.operator.done", { from, to: note.operator }));
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
    await transmit(view.entry);
  }

  async function courier(view: MessageView) {
    if (busy) {
      return;
    }
    busy = true;
    actionError = null;
    try {
      const { copy } = await handOffToCourier(view.entry);
      showToast(t("handover.givenUp.courierDone", { n: copy.seqNo ?? 0 }));
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

  // Reply from the row (P1-02): the compose card opens between the head and the lists and
  // takes the sender and the transport from the row.
  async function reply(entry: JournalEntry) {
    actionError = null;
    composeOpen = true;
    await tick();
    void compose?.replyTo(entry);
  }

  function closeCompose() {
    composeOpen = false;
  }

  async function onsent(message: JournalEntry) {
    actionError = null;
    composeOpen = false;
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
    try {
      const { message } = await sendStatusRequest(current.id, entry.id);
      showToast(t("send.result", { n: message.seqNo ?? 0, label: entry.label }));
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

  function label(entry: JournalEntry): string {
    return labels.get(entry.counterpartyId ?? "") ?? "";
  }
</script>

<!-- The time of an entry, and the counterparty with the direction glyph and the transport
     when it is not the radio: the journal's cells (components/Timeline.svelte). -->
{#snippet timeCell(entry: JournalEntry)}
  <span class="row-time" title={formatDateTime(entry.timestamp)}>
    {formatShortTime(entry.timestamp)}
  </span>
{/snippet}

{#snippet whoCell(entry: JournalEntry, direction: "out" | "in")}
  <span class="row-who">
    <span class="row-dir" aria-hidden="true">{DIRECTION_GLYPH[direction]}</span><span
      class="visually-hidden"
      >{t(`journal.type.message_${direction}`)}
    </span>{label(entry)}
    {#if entry.transport !== undefined && entry.transport !== "mesh"}
      <span class="row-meta">· {t(`send.transport.${entry.transport}`)}</span>
    {/if}
  </span>
{/snippet}

<!-- An outgoing message's strip (a dot-chip per state, the in-flight words while the outbox
     or the queue holds it) with the age at its end. -->
{#snippet stripCell(view: MessageView)}
  {@const inflightText = inflight(view.entry.id)}
  <span class="row-strip strip">
    {#each view.strip as item, index (index)}
      {@const look = stripChip(item.kind)}
      <span
        class="chip {chipClass(look.tint)}"
        data-kind={item.kind}
        title={item.at === null ? undefined : formatDateTime(item.at)}
      >
        <span class="chip-dot" class:chip-dot-outline={look.dot === "outline"}></span>{stripText(
          item,
          inflightText,
        )}
      </span>
    {/each}
    <span class="row-time age" title={t("handover.column.age")}>{age(view.entry.timestamp)}</span>
  </span>
{/snippet}

<!-- The page heading is for assistive technology; the bar's navigation names the screen. -->
<h1 class="visually-hidden no-print">{t("handover.title")}</h1>

{#if loadError}
  <p class="msg msg-danger no-print" role="alert"><Icon name="warning" />{loadError}</p>
{/if}

{#if current === null}
  <div class="empty no-print">
    <p>{t("print.noIncident")}</p>
    <button type="button" class="btn btn-primary" onclick={() => openPopover("incident")}>
      {t("journal.incident.choose")}
    </button>
  </div>
{:else}
  <!-- The header on paper: the incident, the handover time and both names. -->
  <header class="print-only">
    <h1>{t("handover.print.title", { incident: incidentName(current) })}</h1>
    {#if drill}
      <p class="msg msg-drill"><Icon name="drill" />{t("print.drill")}</p>
    {/if}
    <dl class="dl">
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

  <div class="layout" class:replying={composeOpen}>
    <!-- The slim card: the incident, the operator change, the clock, the radio, Print. -->
    <section class="card head no-print" aria-label={t("handover.title")} data-handover-head>
      <div class="field">
        <span class="field-label">{t("journal.incident.label")}</span>
        <span class="value">
          {incidentName(current)}
          {#if incidentState === "closed"}
            <span class="chip"
              ><span class="chip-dot"></span>{t("journal.incident.state.closed")}</span
            >
          {/if}
        </span>
        <span class="field-help">
          {t("handover.incident.openFor", {
            elapsed: formatElapsed(nowMs - Date.parse(current.createdAt)),
          })}
        </span>
      </div>

      <!-- Changing the name here is the handover. -->
      <form class="field operator" onsubmit={takeOver}>
        <label for="handover-operator">{t("handover.operator.label")}</label>
        <div class="field-line">
          <input
            id="handover-operator"
            type="text"
            autocomplete="name"
            bind:value={newOperator}
            disabled={busy}
            aria-describedby="handover-operator-help"
          />
          <button type="submit" class="btn btn-primary" disabled={!canTakeOver}>
            {t("handover.operator.takeOver")}
          </button>
        </div>
        <span class="field-help" id="handover-operator-help" title={t("handover.operator.help")}>
          {t("handover.operator.current", { name: settings.operatorName })}
        </span>
      </form>

      <!-- The settings' clock box, repeated: an unconfirmed clock is the first thing to fix. -->
      <div class="field">
        <span class="field-label">{t("settings.clock")}</span>
        <label class="check">
          <input
            type="checkbox"
            checked={clockTrust() !== "unknown"}
            disabled={clockTrust() === "ntp"}
            onchange={(event) => setClockConfirmed(event.currentTarget.checked)}
          />
          {t("settings.clockConfirm")}
        </label>
        <span
          class="field-help"
          role="status"
          data-trust={clockTrust()}
          title={t(`settings.clockTrust.${clockTrust()}`)}
        >
          {t(`settings.clockTrust.${clockTrust()}`)}
        </span>
      </div>

      <div class="field">
        <span class="field-label">{t("topbar.radio")}</span>
        <span class="value">
          <a class="chip {chipClass(radioTint)}" href={hashFor("radio")} data-state={radioState}>
            <Icon name="radio" />
            {#if capability === "none"}
              {t("topbar.noRadioApi")}
            {:else}
              {t(`radio.status.${radioState}`)}{#if radioReason !== null}
                · {disconnectReasonText(radioReason)}{/if}
            {/if}
          </a>
        </span>
        <span class="field-help">
          {#if radioElapsed === null}
            {t("handover.radio.never")}
          {:else}
            {t("radio.heard", { elapsed: formatElapsed(radioElapsed) })}
          {/if}
        </span>
      </div>

      <div class="head-actions">
        <button type="button" class="btn" onclick={print}>
          <Icon name="print" />{t("handover.print")}
        </button>
      </div>
    </section>

    <!-- Reply lands here (P1-02): the form takes the sender and the transport from the row. -->
    {#if composeOpen}
      <section class="card compose-card no-print" aria-labelledby="handover-compose-heading">
        <h2 id="handover-compose-heading" class="card-title">
          <span>{t("journal.compose.title")}</span>
          <button
            type="button"
            class="btn btn-quiet btn-icon"
            aria-label={t("handover.compose.close")}
            title={t("handover.compose.close")}
            onclick={closeCompose}><Icon name="close" /></button
          >
        </h2>
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

    {#if actionError}
      <p class="msg msg-danger no-print" role="alert"><Icon name="warning" />{actionError}</p>
    {/if}

    <div class="lists">
      <section class="card list-card" aria-labelledby="handover-open-heading" data-list="open">
        <h2 id="handover-open-heading" class="card-title" title={t("handover.open.help")}>
          <span>{t("handover.open.title")} <span class="count">{lists.open.length}</span></span>
        </h2>
        {#if lists.open.length === 0}
          <p class="msg">{t("handover.open.empty")}</p>
        {:else}
          <div class="rows-box list-box">
            <ol class="rows">
              {#each lists.open as view (view.entry.id)}
                <li data-entry-id={view.entry.id}>
                  {@render timeCell(view.entry)}
                  {@render whoCell(view.entry, "out")}
                  <span class="row-body">{view.entry.text ?? ""}</span>
                  {@render stripCell(view)}
                </li>
              {/each}
            </ol>
          </div>
        {/if}
      </section>

      <section
        class="card list-card"
        aria-labelledby="handover-givenup-heading"
        data-list="givenUp"
      >
        <h2 id="handover-givenup-heading" class="card-title" title={t("handover.givenUp.help")}>
          <span
            >{t("handover.givenUp.title")} <span class="count">{lists.givenUp.length}</span></span
          >
        </h2>
        {#if lists.givenUp.length === 0}
          <p class="msg">{t("handover.givenUp.empty")}</p>
        {:else}
          <div class="rows-box list-box">
            <ol class="rows rows-actions-always">
              {#each lists.givenUp as view (view.entry.id)}
                <li data-entry-id={view.entry.id} data-status="given_up">
                  {@render timeCell(view.entry)}
                  {@render whoCell(view.entry, "out")}
                  <span class="row-body">{view.entry.text ?? ""}</span>
                  {@render stripCell(view)}
                  <span class="row-actions no-print">
                    {#if canRetry(view)}
                      <button
                        type="button"
                        class="btn btn-quiet"
                        disabled={busy}
                        onclick={() => retry(view)}
                      >
                        <Icon name="retry" />{t("send.retry")}
                      </button>
                    {/if}
                    <button
                      type="button"
                      class="btn btn-quiet"
                      title={t("handover.givenUp.courierHelp")}
                      disabled={busy}
                      onclick={() => courier(view)}
                    >
                      <Icon name="send" />{t("handover.givenUp.courier")}
                    </button>
                    <button
                      type="button"
                      class="btn btn-quiet"
                      title={t("handover.givenUp.closeHelp")}
                      disabled={busy}
                      aria-expanded={closing === view.entry.id}
                      onclick={() => startClose(view)}
                    >
                      <Icon name="check" />{t("handover.givenUp.close")}
                    </button>
                  </span>
                  {#if closing === view.entry.id}
                    <form class="row-form no-print" onsubmit={(event) => close(view, event)}>
                      <div class="field">
                        <input
                          type="text"
                          placeholder={t("journal.manual.reason")}
                          aria-label={t("journal.manual.reason")}
                          bind:value={reason}
                        />
                      </div>
                      <button
                        type="submit"
                        class="btn btn-primary"
                        disabled={busy || reason.trim() === ""}
                      >
                        {t("handover.givenUp.close")}
                      </button>
                      <button type="button" class="btn" onclick={cancelClose}>
                        {t("journal.action.cancel")}
                      </button>
                    </form>
                  {/if}
                </li>
              {/each}
            </ol>
          </div>
        {/if}
      </section>

      <section
        class="card list-card"
        aria-labelledby="handover-unanswered-heading"
        data-list="unanswered"
      >
        <h2
          id="handover-unanswered-heading"
          class="card-title"
          title={t("handover.unanswered.help")}
        >
          <span
            >{t("handover.unanswered.title")}
            <span class="count">{lists.unanswered.length}</span></span
          >
        </h2>
        {#if lists.unanswered.length === 0}
          <p class="msg">{t("handover.unanswered.empty")}</p>
        {:else}
          <div class="rows-box list-box">
            <ol class="rows rows-actions-always">
              {#each lists.unanswered as entry (entry.id)}
                <li data-entry-id={entry.id} data-type="message_in">
                  {@render timeCell(entry)}
                  {@render whoCell(entry, "in")}
                  <span class="row-body">{entry.text ?? ""}</span>
                  <span class="row-strip strip">
                    <span class="row-time age" title={t("handover.column.age")}
                      >{age(entry.timestamp)}</span
                    >
                  </span>
                  <span class="row-actions no-print">
                    <button type="button" class="btn btn-quiet" onclick={() => reply(entry)}>
                      <Icon name="reply" />{t("journal.action.reply")}
                    </button>
                  </span>
                </li>
              {/each}
            </ol>
          </div>
        {/if}
      </section>

      <section class="card list-card" aria-labelledby="handover-quiet-heading" data-list="quiet">
        <h2
          id="handover-quiet-heading"
          class="card-title"
          title={t("handover.quiet.help", { minutes: settings.blindAfterMinutes })}
        >
          <span>{t("handover.quiet.title")} <span class="count">{quiet.length}</span></span>
        </h2>
        {#if quiet.length === 0}
          <p class="msg">{t("handover.quiet.empty", { minutes: settings.blindAfterMinutes })}</p>
        {:else}
          <div class="rows-box list-box">
            <ol class="rows rows-2 rows-actions-always">
              {#each quiet as row (row.entry.id)}
                <li
                  data-register-id={row.entry.id}
                  data-never={row.at === null ? "true" : undefined}
                >
                  <span class="row-who">{row.entry.label}</span>
                  {#if row.at === null}
                    <span class="row-strip chip chip-danger"
                      ><span class="glyph">!</span>{t("journal.heard.never")}</span
                    >
                  {:else}
                    <span class="row-strip row-time" title={formatDateTime(row.at)}>
                      {t("journal.heard.ago", { elapsed: age(row.at) })}
                    </span>
                  {/if}
                  <span class="row-actions no-print">
                    <button
                      type="button"
                      class="btn btn-quiet"
                      title={radioReady ? t("handover.quiet.requestHelp") : t("send.noRadio")}
                      disabled={busy || !radioReady || !hasOperatorName()}
                      onclick={() => statusRequest(row.entry)}
                    >
                      <Icon name="send" />{t("handover.quiet.request")}
                    </button>
                  </span>
                </li>
              {/each}
            </ol>
          </div>
        {/if}
      </section>
    </div>
  </div>
{/if}

<style>
  /* Layout only (docs/design.md §Screens → Handover): the slim card, then the four cards in a
     2 × 2 grid that takes the rest of the viewport, each list scrolling in its card; one
     column under 60 rem, where the page scrolls. */
  .print-only {
    display: none;
  }

  .layout {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    height: calc(100vh - 3.5rem - 2 * var(--s-5));
    min-height: 24rem;
  }

  .head {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--s-3) var(--s-5);
    padding-top: var(--s-4);
    padding-bottom: var(--s-4);
  }

  .head > .field {
    flex: 1 1 11rem;
    min-width: 0;
  }

  .head > .operator {
    flex: 1.5 1 16rem;
  }

  .head .value {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2);
    min-height: 2.25rem;
    overflow-wrap: anywhere;
  }

  .head .field-help {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Print sits at the row's end, level with the controls. */
  .head-actions {
    display: flex;
    align-items: center;
    flex: none;
    margin-left: auto;
    margin-top: calc(var(--fs-14) * 1.45 + var(--s-1));
  }

  .compose-card {
    flex: none;
    padding-top: var(--s-4);
    padding-bottom: var(--s-4);
  }

  .compose-card .card-title {
    margin-bottom: var(--s-2);
  }

  .lists {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: var(--s-4);
    flex: 1 1 auto;
    min-height: 0;
  }

  .list-card {
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding-top: var(--s-4);
    padding-bottom: var(--s-4);
  }

  .list-card .card-title {
    margin-bottom: var(--s-2);
  }

  .list-card .msg {
    margin: 0;
  }

  .list-box {
    flex: 1 1 auto;
  }

  .age {
    margin-left: var(--s-2);
  }

  .msg {
    margin: 0;
  }

  /* While a reply is being written the compose card takes its room and the page scrolls,
     rather than the lists shrinking to their titles. */
  .layout.replying {
    height: auto;
  }

  .layout.replying .lists {
    grid-template-rows: auto;
  }

  .layout.replying .list-box {
    max-height: 40vh;
  }

  @media (max-width: 60rem) {
    .layout {
      height: auto;
    }

    .lists {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto;
    }

    .list-box {
      max-height: 50vh;
    }
  }

  /* On paper (styles/base.css hides the bar; the controls are no-print): the header with the
     time and both names, then the four lists one after the other, as plain rows. */
  @media print {
    .print-only {
      display: block;
    }

    .print-only h1 {
      margin: 0 0 var(--s-2);
    }

    .print-only .dl {
      margin: var(--s-2) 0 var(--s-4);
    }

    .blank {
      display: inline-block;
      width: 12rem;
      border-bottom: 1px solid var(--ink);
    }

    .layout {
      display: block;
      height: auto;
    }

    .lists {
      display: block;
    }

    .list-card {
      display: block;
      padding: 0;
      border-width: 0;
      margin-bottom: var(--s-4);
      break-inside: avoid;
    }

    .list-box {
      max-height: none;
      overflow: visible;
      border-width: 0;
    }

    .list-box li {
      break-inside: avoid;
    }
  }
</style>
