<script lang="ts">
  // Send to all (P0-08): the compose form with its recipient picker, and the queue the
  // staff watch drain. Totals and the time to drain on top; per recipient the label, #n,
  // the status chip (derived from the journal on every change), the attempt while the
  // outbox holds the message, and the earliest time of its transmission. Given-up ones
  // can be queued again, one or all. The batches are the queue's memory for this session;
  // after a reload the pending messages come back as a restored batch (src/radio/index.ts).
  import { t, language } from "../i18n/index.svelte.ts";
  import { currentIncidentId } from "../lib/currentIncident.svelte.ts";
  import { formatElapsed } from "../lib/elapsed.ts";
  import { hashFor } from "../lib/router.svelte.ts";
  import { settings } from "../lib/settings.svelte.ts";
  import { inbox, outbox, radio, sendQueue } from "../radio/index.ts";
  import type { Batch, QueueItem } from "../radio/sendQueue.svelte.ts";
  import { entriesForIncident, listIncidents, listRegister } from "../store/index.ts";
  import { sortedByLabel } from "../store/register.ts";
  import { statusOf } from "../store/status.ts";
  import type { Incident, JournalEntry, RegisterEntry, Status } from "../store/types.ts";
  import BatchComposeForm from "../components/BatchComposeForm.svelte";

  let incidents: Incident[] = $state([]);
  let register: RegisterEntry[] = $state([]);
  // The entries of every incident a queued message belongs to, by incident id.
  let entries: Map<string, JournalEntry[]> = $state.raw(new Map());
  let loadError: string | null = $state(null);
  let actionError: string | null = $state(null);
  let ownRevision = $state(0);
  // Ticks twice a second for the countdowns.
  let nowMs = $state(Date.now());

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

  const totals = $derived.by(() => {
    const counts = { pending: 0, sent: 0, delivered: 0, roger: 0, given_up: 0 };
    for (const status of statuses.values()) {
      if (status in counts) {
        counts[status as keyof typeof counts] += 1;
      }
    }
    return counts;
  });

  const givenUpIds = $derived(
    items
      .map((item) => item.messageId)
      .filter((id) => statuses.get(id) === "given_up" && !held(id)),
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

  // What the status column says for a row: the outbox's progress while it holds the
  // message, the queue's wait otherwise, else the derived status.
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

<h1>{t("queue.title")}</h1>
<p class="intro">{t("queue.intro", { gap: settings.sendGapSeconds })}</p>

{#if loadError}
  <p class="error" role="alert">{loadError}</p>
{/if}
{#if actionError}
  <p class="error" role="alert">{actionError}</p>
{/if}

<div class="layout">
  <section class="main" aria-labelledby="batch-compose-heading">
    <h2 id="batch-compose-heading">{t("queue.compose.title")}</h2>
    {#if current === null}
      <p class="notice">
        {t("queue.noIncident")}
        <a href={hashFor("journal")}>{t("nav.journal")}</a>
      </p>
    {:else}
      <p class="muted">{t("queue.compose.incident", { name: current.name })}</p>
      {#key current.id}
        <BatchComposeForm incidentId={current.id} register={sortedRegister} {onstored} />
      {/key}
    {/if}
  </section>

  <section class="queue" aria-labelledby="queue-heading">
    <h2 id="queue-heading">{t("queue.list.title")}</h2>

    <div class="totals" role="status">
      <span class="chip" data-status="pending"
        >{t("queue.totals.pending", { n: totals.pending })}</span
      >
      <span class="chip" data-status="sent">{t("queue.totals.sent", { n: totals.sent })}</span>
      <span class="chip" data-status="delivered"
        >{t("queue.totals.delivered", { n: totals.delivered })}</span
      >
      <span class="chip" data-status="roger">{t("queue.totals.roger", { n: totals.roger })}</span>
      <span class="chip" data-status="given_up"
        >{t("queue.totals.given_up", { n: totals.given_up })}</span
      >
    </div>

    <div class="state">
      {#if phase === "paused"}
        <span class="error">{t("queue.paused")}</span>
      {:else if phase === "gap" && countdownMs !== null}
        <span>{t("queue.next", { s: Math.ceil(countdownMs / 1000) })}</span>
      {:else if phase === "sending" && sending !== null}
        <span
          >{t("queue.sending", {
            label:
              labels.get(items.find((item) => item.messageId === sending)?.counterpartyId ?? "") ??
              "",
          })}</span
        >
      {:else if items.length > 0}
        <span class="muted">{t("queue.idle")}</span>
      {/if}
      {#if waiting.length > 0 && drainMs !== null}
        <span class="muted">
          {t("queue.drain", { count: waiting.length, time: formatElapsed(drainMs) })}
        </span>
      {/if}
      {#if givenUpIds.length > 0}
        <button type="button" class="secondary small" onclick={() => retry(givenUpIds)}>
          {t("queue.retryAll", { count: givenUpIds.length })}
        </button>
      {/if}
    </div>

    {#if items.length === 0}
      <p class="muted">{t("queue.list.empty")}</p>
    {:else}
      {#each batches as batch (batch.id)}
        <h3>{batchTitle(batch)}</h3>
        <table>
          <thead>
            <tr>
              <th scope="col">{t("queue.item.label")}</th>
              <th scope="col">{t("queue.item.seqNo")}</th>
              <th scope="col">{t("journal.entries.text")}</th>
              <th scope="col">{t("journal.timeline.status")}</th>
              <th scope="col">{t("queue.item.attempt")}</th>
              <th scope="col">{t("queue.item.next")}</th>
              <th scope="col"
                ><span class="visually-hidden">{t("journal.timeline.actions")}</span></th
              >
            </tr>
          </thead>
          <tbody>
            {#each batch.items as item (item.messageId)}
              {@const row = rowState(item)}
              {@const refusal = errors.get(item.messageId)}
              <tr data-status={row.status ?? "inflight"}>
                <td class="label">{labels.get(item.counterpartyId) ?? ""}</td>
                <td class="seq">#{item.seqNo}</td>
                <td class="text">{item.text}</td>
                <td>
                  <span class="chip" data-status={row.status ?? "inflight"}>{row.text}</span>
                  {#if refusal !== undefined}
                    <small class="error">{refusal}</small>
                  {/if}
                </td>
                <td class="num">{attemptText(item)}</td>
                <td class="num">{earliestText(item)}</td>
                <td class="actions">
                  {#if row.status === "given_up"}
                    <button
                      type="button"
                      class="secondary small"
                      onclick={() => retry([item.messageId])}
                    >
                      {t("send.retry")}
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/each}
    {/if}
    {#if radioState === "disconnected" && items.length === 0}
      <p class="muted">{t("queue.list.noRadio")}</p>
    {/if}
  </section>
</div>

<style>
  .intro {
    color: var(--muted);
    margin: 0 0 1rem;
  }

  .error {
    color: var(--error);
  }

  .muted {
    color: var(--muted);
  }

  .notice {
    padding: 0.75rem 1rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: #fff;
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 24rem) minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
  }

  @media (max-width: 60rem) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .main,
  .queue {
    min-width: 0;
  }

  h2 {
    font-size: 1.1rem;
    margin: 0 0 0.5rem;
  }

  h3 {
    font-size: 0.95rem;
    margin: 1rem 0 0.25rem;
  }

  .totals {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  .state {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    min-height: 2rem;
    margin-bottom: 0.5rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 6px;
  }

  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--line);
  }

  thead th {
    background: var(--light);
  }

  .label {
    font-weight: 600;
    white-space: nowrap;
  }

  .seq,
  .num {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .text {
    overflow-wrap: anywhere;
  }

  tr[data-status="given_up"] td {
    background: #fbeeec;
  }

  .chip {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    background: var(--light);
    color: var(--muted);
  }

  .chip[data-status="sent"] {
    color: var(--navy);
  }

  .chip[data-status="delivered"],
  .chip[data-status="roger"] {
    color: var(--ok);
  }

  .chip[data-status="given_up"] {
    color: var(--error);
  }

  .actions {
    white-space: nowrap;
  }

  .secondary {
    background: #fff;
    color: var(--navy);
  }

  .small {
    padding: 0.25rem 0.6rem;
  }
</style>
