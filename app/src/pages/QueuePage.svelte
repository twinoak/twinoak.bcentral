<script lang="ts">
  // Send to all (P0-08; on the design language in P2-04): the compose card on top, the queue
  // as a table below it, which the staff watch drain. The queue card's title carries the
  // progress line — the counts as counter chips (lib/queueRows.ts), the phase (the next
  // transmission's countdown, who is being sent to, the paused chip while no radio is
  // connected) and the time to drain — and Retry all; every given-up row has its own Retry.
  // Per recipient the label, #n, the text, the state chip (derived from the journal on every
  // change; warn with an outline dot while the queue or the outbox holds the message), the
  // attempt and the earliest time of its transmission. Once a batch is queued the compose
  // card closes and the queue takes the screen; "New message to many" in the queue's title
  // opens it again. The batches are the queue's memory for this session; after a reload the
  // pending messages come back as a restored batch (src/radio/index.ts).
  import { t, language } from "../i18n/index.svelte.ts";
  import { currentIncidentId } from "../lib/currentIncident.svelte.ts";
  import { formatElapsed } from "../lib/elapsed.ts";
  import { chipClass, counterChips } from "../lib/journalRows.ts";
  import { openPopover } from "../lib/popover.svelte.ts";
  import { queueCounters, queueRowChip } from "../lib/queueRows.ts";
  import { inbox, outbox, radio, sendQueue } from "../radio/index.ts";
  import type { Batch, QueueItem } from "../radio/sendQueue.svelte.ts";
  import { isDrill } from "../store/incidents.ts";
  import { entriesForIncident, listIncidents, listRegister } from "../store/index.ts";
  import { sortedByLabel } from "../store/register.ts";
  import { statusOf } from "../store/status.ts";
  import type { Incident, JournalEntry, RegisterEntry, Status } from "../store/types.ts";
  import BatchComposeForm from "../components/BatchComposeForm.svelte";
  import Icon from "../components/Icon.svelte";

  let incidents: Incident[] = $state([]);
  let register: RegisterEntry[] = $state([]);
  // The entries of every incident a queued message belongs to, by incident id.
  let entries: Map<string, JournalEntry[]> = $state.raw(new Map());
  let loadError: string | null = $state(null);
  let actionError: string | null = $state(null);
  let ownRevision = $state(0);
  // Ticks twice a second for the countdowns.
  let nowMs = $state(Date.now());
  // The compose card: open until a batch is queued, then opened again from the queue's title.
  let composeOpen = $state(true);

  const incidentId = $derived(currentIncidentId());
  const current = $derived(incidents.find((incident) => incident.id === incidentId) ?? null);
  const sortedRegister = $derived(sortedByLabel(register, language()));
  const labels = $derived(new Map(register.map((entry) => [entry.id, entry.label])));
  const batches = $derived(sendQueue.batches());
  const items = $derived(batches.flatMap((batch) => batch.items));
  const phase = $derived(sendQueue.phase());
  const waiting = $derived(sendQueue.waiting());
  const sending = $derived(sendQueue.sending());
  const errors = $derived(sendQueue.errors());
  const active = $derived(outbox.active());
  const queued = $derived(outbox.queued());
  const radioState = $derived(radio.state());

  // Re-read on every tick, so the countdowns move.
  const countdownMs = $derived.by(() => {
    void nowMs;
    return sendQueue.countdownMs();
  });
  const drainMs = $derived.by(() => {
    void nowMs;
    return sendQueue.drainEstimateMs();
  });

  const statuses = $derived.by(() => {
    const map = new Map<string, Status>();
    for (const item of items) {
      map.set(item.messageId, statusOf(entries.get(item.incidentId) ?? [], item.messageId));
    }
    return map;
  });

  const counters = $derived(counterChips(queueCounters(statuses.values())));

  const givenUpIds = $derived(
    items
      .map((item) => item.messageId)
      .filter((id) => statuses.get(id) === "given_up" && !held(id)),
  );

  const sendingLabel = $derived(
    labels.get(items.find((item) => item.messageId === sending)?.counterpartyId ?? "") ?? "",
  );

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  function held(messageId: string): boolean {
    return (
      waiting.includes(messageId) ||
      sending === messageId ||
      queued.includes(messageId) ||
      active?.messageId === messageId
    );
  }

  async function reload(ids: readonly string[]) {
    try {
      incidents = await listIncidents();
      register = await listRegister();
      const loaded = new Map<string, JournalEntry[]>();
      for (const id of ids) {
        loaded.set(id, await entriesForIncident(id));
      }
      entries = loaded;
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
    const ids = new Set<string>(items.map((item) => item.incidentId));
    if (incidentId !== null) {
      ids.add(incidentId);
    }
    void reload([...ids]);
  });

  $effect(() => {
    const timer = setInterval(() => {
      nowMs = Date.now();
    }, 500);
    return () => clearInterval(timer);
  });

  function onstored(messages: JournalEntry[]) {
    actionError = null;
    try {
      sendQueue.enqueue(messages);
      // The queue is what the operator watches now; the compose card gives it the screen.
      composeOpen = false;
    } catch (failure) {
      actionError = t("send.failed", { error: describe(failure) });
    }
    ownRevision += 1;
  }

  function retry(ids: readonly string[]) {
    actionError = null;
    try {
      sendQueue.retry(ids);
    } catch (failure) {
      actionError = t("send.failed", { error: describe(failure) });
    }
  }

  // What the state chip says for a row: the outbox's progress while it holds the message,
  // the queue's wait otherwise, else the derived status (null = held, the chip is warn).
  function rowState(item: QueueItem): { text: string; status: Status | null } {
    const id = item.messageId;
    if (active?.messageId === id) {
      return {
        text: t(`send.inflight.${active.phase}`, {
          attempt: active.attempt + 1,
          max: active.maxAttempts,
        }),
        status: null,
      };
    }
    if (queued.includes(id) || sending === id) {
      return { text: t("send.inflight.queued"), status: null };
    }
    if (waiting.includes(id)) {
      return { text: t("queue.item.waiting"), status: null };
    }
    const status = statuses.get(id) ?? "pending";
    return { text: t(`journal.status.${status}`), status };
  }

  function attemptText(item: QueueItem): string {
    if (active?.messageId === item.messageId) {
      return t("queue.item.attemptOf", { attempt: active.attempt + 1, max: active.maxAttempts });
    }
    return "";
  }

  // The earliest the message can go out, counting the gaps alone; nothing once it has gone.
  function earliestText(item: QueueItem): string {
    void nowMs;
    const ms = sendQueue.earliestStartMs(item.messageId);
    if (ms === null) {
      return "";
    }
    return t("queue.item.earliest", { time: formatElapsed(ms) });
  }

  function formatTime(ms: number): string {
    return new Date(ms).toLocaleTimeString(language(), { timeStyle: "short" });
  }

  function batchTitle(batch: Batch): string {
    const key = batch.restored ? "queue.batch.restored" : "queue.batch.title";
    return t(key, { time: formatTime(batch.createdAtMs), count: batch.items.length });
  }
</script>

<!-- The page heading is for assistive technology; the bar's navigation names the screen. -->
<h1 class="visually-hidden">{t("queue.title")}</h1>

{#if loadError}
  <p class="msg msg-danger" role="alert"><Icon name="warning" />{loadError}</p>
{/if}

{#if current === null}
  <div class="empty">
    <p>{t("queue.noIncident")}</p>
    <button type="button" class="btn btn-primary" onclick={() => openPopover("incident")}>
      {t("journal.incident.choose")}
    </button>
  </div>
{:else}
  <div class="layout">
    {#if composeOpen}
      <section class="card compose-card" aria-labelledby="batch-compose-heading">
        <h2 id="batch-compose-heading" class="card-title">
          <span>{t("queue.compose.title")}</span>
          {#if items.length > 0}
            <button
              type="button"
              class="btn btn-quiet btn-compact"
              onclick={() => (composeOpen = false)}
            >
              <Icon name="close" />{t("queue.compose.hide")}
            </button>
          {/if}
        </h2>
        {#key current.id}
          <BatchComposeForm
            incidentId={current.id}
            drill={isDrill(current)}
            register={sortedRegister}
            {onstored}
          />
        {/key}
      </section>
    {/if}

    {#if actionError}
      <p class="msg msg-danger" role="alert"><Icon name="warning" />{actionError}</p>
    {/if}

    <section class="card queue-card" aria-labelledby="queue-heading">
      <h2 id="queue-heading" class="card-title">
        <span class="title-line">
          <span>{t("queue.list.title")}</span>
          <!-- The progress line: the counts, the phase, the time to drain. -->
          <span class="count progress" role="status">
            {#each counters as counter (counter.key)}
              <span class="chip {chipClass(counter.look.tint)}" data-kind={counter.key}>
                <span class="chip-dot" class:chip-dot-outline={counter.look.dot === "outline"}
                ></span>{t(`journal.batch.counter.${counter.key}`, { n: counter.n })}
              </span>
            {/each}
            {#if phase === "paused"}
              <span class="chip chip-warn" title={t("queue.paused")}>
                <span class="chip-dot chip-dot-outline"></span>{t("queue.pausedShort")}
              </span>
            {:else if phase === "gap" && countdownMs !== null}
              <span>{t("queue.next", { s: Math.ceil(countdownMs / 1000) })}</span>
            {:else if phase === "sending" && sending !== null}
              <span>{t("queue.sending", { label: sendingLabel })}</span>
            {:else if items.length > 0}
              <span>{t("queue.idle")}</span>
            {/if}
            {#if waiting.length > 0 && drainMs !== null}
              <span
                >{t("queue.drain", { count: waiting.length, time: formatElapsed(drainMs) })}</span
              >
            {/if}
          </span>
        </span>
        <span class="title-actions">
          {#if givenUpIds.length > 0}
            <button type="button" class="btn btn-compact" onclick={() => retry(givenUpIds)}>
              <Icon name="retry" />{t("queue.retryAll", { count: givenUpIds.length })}
            </button>
          {/if}
          {#if !composeOpen}
            <button
              type="button"
              class="btn btn-primary btn-compact"
              onclick={() => (composeOpen = true)}
            >
              <Icon name="send" />{t("queue.compose.open")}
            </button>
          {/if}
        </span>
      </h2>

      {#if items.length === 0}
        <div class="empty">
          <p>{t("queue.list.empty")}</p>
          {#if radioState === "disconnected"}
            <p class="msg"><Icon name="radio" />{t("queue.list.noRadio")}</p>
          {/if}
        </div>
      {:else}
        <div class="table-box">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">{t("queue.item.label")}</th>
                <th scope="col" class="num">{t("queue.item.seqNo")}</th>
                <th scope="col">{t("journal.entries.text")}</th>
                <th scope="col">{t("journal.timeline.status")}</th>
                <th scope="col" class="num">{t("queue.item.attempt")}</th>
                <th scope="col" class="num">{t("queue.item.next")}</th>
                <th scope="col"
                  ><span class="visually-hidden">{t("journal.timeline.actions")}</span></th
                >
              </tr>
            </thead>
            {#each batches as batch (batch.id)}
              <tbody data-batch-id={batch.id}>
                <tr>
                  <th scope="rowgroup" colspan="7">{batchTitle(batch)}</th>
                </tr>
                {#each batch.items as item (item.messageId)}
                  {@const row = rowState(item)}
                  {@const look = queueRowChip(row.status)}
                  {@const refusal = errors.get(item.messageId)}
                  <tr data-message-id={item.messageId} data-status={row.status ?? "inflight"}>
                    <td class="label">{labels.get(item.counterpartyId) ?? ""}</td>
                    <td class="num">#{item.seqNo}</td>
                    <td class="text">{item.text}</td>
                    <td class="state">
                      <span class="chip {chipClass(look.tint)}">
                        <span class="chip-dot" class:chip-dot-outline={look.dot === "outline"}
                        ></span>{row.text}
                      </span>
                      {#if refusal !== undefined}
                        <span class="field-error"><Icon name="warning" />{refusal}</span>
                      {/if}
                    </td>
                    <td class="num">{attemptText(item)}</td>
                    <td class="num">{earliestText(item)}</td>
                    <td class="actions">
                      {#if row.status === "given_up"}
                        <button
                          type="button"
                          class="btn btn-quiet btn-compact"
                          onclick={() => retry([item.messageId])}
                        >
                          <Icon name="retry" />{t("send.retry")}
                        </button>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            {/each}
          </table>
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  /* Layout only: the column is as tall as the viewport leaves under the bar and the
     gutters, the compose card keeps its size and the queue's table scrolls in the rest;
     under 60 rem the page scrolls and the table is capped. */
  .layout {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    height: calc(100vh - 3.5rem - 2 * var(--s-5));
    min-height: 24rem;
  }

  .compose-card {
    flex: none;
  }

  .queue-card {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }

  .queue-card .table-box {
    flex: 1 1 auto;
  }

  .card-title {
    flex-wrap: wrap;
    align-items: center;
  }

  .title-line,
  .title-actions,
  .progress {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2) var(--s-3);
  }

  .title-line {
    min-width: 0;
  }

  .progress {
    gap: var(--s-1) var(--s-2);
  }

  .text {
    overflow-wrap: anywhere;
  }

  .state {
    white-space: nowrap;
  }

  .state .field-error {
    white-space: normal;
  }

  .actions {
    width: 1px;
    white-space: nowrap;
  }

  .msg {
    margin: 0;
  }

  @media (max-width: 60rem) {
    .layout {
      height: auto;
    }

    .queue-card .table-box {
      max-height: 60vh;
    }
  }
</style>
