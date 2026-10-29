<script lang="ts">
  // Send to one recipient (P0-05): pick the incident the entries belong to, compose, and
  // watch the message walk pending -> sent -> delivered (or given_up) in the list below. The
  // list shows this incident's message_out entries with their derived status, what the
  // outbox is doing right now, Retry for a given-up mesh message, and the operator's own
  // status buttons for phone / courier / verbal messages. P0-07 replaces the incident row
  // with the journal screen's incident bar.
  import { t, language } from "../i18n/index.svelte.ts";
  import { currentIncidentId, setCurrentIncidentId } from "../lib/currentIncident.svelte.ts";
  import type { Incident, JournalEntry, RegisterEntry, Status } from "../store/types.ts";
  import {
    addIncident,
    entriesForIncident,
    listIncidents,
    listRegister,
    recordManualStatus,
  } from "../store/index.ts";
  import { MANUAL_STATUSES } from "../store/outgoing.ts";
  import { sortedByLabel } from "../store/register.ts";
  import { statusOf } from "../store/status.ts";
  import { inbox, outbox } from "../radio/index.ts";
  import ComposeForm from "../components/ComposeForm.svelte";

  let incidents: Incident[] = $state([]);
  let register: RegisterEntry[] = $state([]);
  let entries: JournalEntry[] = $state([]);
  let newIncidentName = $state("");
  let notice: string | null = $state(null);
  let error: string | null = $state(null);
  let reasons: Record<string, string> = $state({});

  const incidentId = $derived(currentIncidentId());
  const sortedRegister = $derived(sortedByLabel(register, language()));
  const labels = $derived(new Map(register.map((entry) => [entry.id, entry.label])));
  const messages = $derived(
    entries.filter((entry) => entry.type === "message_out").sort((a, b) => b.deviceSeq - a.deviceSeq),
  );
  const active = $derived(outbox.active());
  const queued = $derived(outbox.queued());

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  async function loadStatic() {
    try {
      incidents = await listIncidents();
      register = await listRegister();
    } catch (failure) {
      error = t("send.list.loadFailed", { error: describe(failure) });
    }
  }
  void loadStatic();

  async function reload(id: string | null) {
    if (id === null) {
      entries = [];
      return;
    }
    try {
      const loaded = await entriesForIncident(id);
      if (currentIncidentId() === id) {
        entries = loaded;
      }
    } catch (failure) {
      error = t("send.list.loadFailed", { error: describe(failure) });
    }
  }

  // Reload on an incident change and after every entry the outbox or the inbox writes (a
  // roger from the field moves a message's status).
  $effect(() => {
    outbox.revision();
    inbox.revision();
    void reload(incidentId);
  });

  function pickIncident(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    setCurrentIncidentId(value === "" ? null : value);
    notice = null;
  }

  async function createIncident(event: SubmitEvent) {
    event.preventDefault();
    const name = newIncidentName.trim();
    if (name === "") {
      return;
    }
    try {
      const incident = await addIncident(name);
      incidents = [...incidents, incident];
      setCurrentIncidentId(incident.id);
      newIncidentName = "";
      notice = t("send.incident.created", { name: incident.name });
    } catch (failure) {
      error = t("send.incident.failed", { error: describe(failure) });
    }
  }

  async function transmit(message: JournalEntry) {
    try {
      await outbox.send(message.id);
    } catch (failure) {
      error = t("send.failed", { error: describe(failure) });
    }
    await reload(message.incidentId);
  }

  async function onsent(message: JournalEntry) {
    error = null;
    notice = t("send.result", { n: message.seqNo ?? 0, label: labels.get(message.counterpartyId ?? "") ?? "" });
    await reload(message.incidentId);
    if (message.transport === "mesh") {
      void transmit(message);
    }
  }

  async function manual(message: JournalEntry, newStatus: Status) {
    error = null;
    try {
      await recordManualStatus(message, newStatus, reasons[message.id]);
      reasons = { ...reasons, [message.id]: "" };
    } catch (failure) {
      error = t("send.manual.failed", { error: describe(failure) });
    }
    await reload(message.incidentId);
  }

  function statusText(message: JournalEntry): string {
    if (active?.messageId === message.id) {
      return t(`send.inflight.${active.phase}`, { attempt: active.attempt + 1, max: active.maxAttempts });
    }
    if (queued.includes(message.id)) {
      return t("send.inflight.queued");
    }
    return t(`send.status.${statusOf(entries, message.id)}`);
  }

  function canRetry(message: JournalEntry): boolean {
    if (message.transport !== "mesh" || active?.messageId === message.id || queued.includes(message.id)) {
      return false;
    }
    const status = statusOf(entries, message.id);
    return status === "given_up" || status === "pending";
  }

  function formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString(language(), { timeStyle: "short" });
  }
</script>

<h1>{t("send.title")}</h1>
<p class="intro">{t("send.intro")}</p>

<section class="incident" aria-labelledby="incident-heading">
  <h2 id="incident-heading">{t("send.incident.label")}</h2>
  <div class="row">
    <select aria-labelledby="incident-heading" value={incidentId ?? ""} onchange={pickIncident}>
      <option value="">{t("send.incident.choose")}</option>
      {#each incidents as incident (incident.id)}
        <option value={incident.id}>{incident.name}</option>
      {/each}
    </select>
    <form class="row" onsubmit={createIncident}>
      <input
        type="text"
        placeholder={t("send.incident.newName")}
        aria-label={t("send.incident.newName")}
        bind:value={newIncidentName}
      />
      <button type="submit" class="secondary" disabled={newIncidentName.trim() === ""}>
        {t("send.incident.create")}
      </button>
    </form>
  </div>
  {#if incidentId === null}
    <p class="muted">{t("send.incident.needed")}</p>
  {/if}
</section>

{#if error}
  <p class="error" role="alert">{error}</p>
{/if}
{#if notice}
  <p class="ok" role="status">{notice}</p>
{/if}

{#if incidentId !== null}
  {#key incidentId}
    <ComposeForm {incidentId} register={sortedRegister} {onsent} />
  {/key}

  <section aria-labelledby="outgoing-heading">
    <h2 id="outgoing-heading">{t("send.list.title")}</h2>
    {#if messages.length === 0}
      <p class="muted">{t("send.list.empty")}</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th scope="col">{t("send.list.time")}</th>
            <th scope="col">{t("send.list.recipient")}</th>
            <th scope="col">{t("send.list.transport")}</th>
            <th scope="col">{t("send.list.text")}</th>
            <th scope="col">{t("send.list.status")}</th>
            <th scope="col">{t("send.list.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {#each messages as message (message.id)}
            {@const status = statusOf(entries, message.id)}
            <tr>
              <td>{formatTime(message.timestamp)}</td>
              <td class="label">{labels.get(message.counterpartyId ?? "") ?? ""}</td>
              <td>{t(`send.transport.${message.transport}`)}</td>
              <td class="text">{message.text}</td>
              <td data-status={status}>{statusText(message)}</td>
              <td>
                {#if message.transport === "mesh"}
                  {#if canRetry(message)}
                    <button type="button" class="secondary small" onclick={() => transmit(message)}>
                      {status === "given_up" ? t("send.retry") : t("send.sendNow")}
                    </button>
                  {/if}
                {:else if status !== "roger"}
                  <div class="manual">
                    <input
                      type="text"
                      placeholder={t("send.manual.reason")}
                      aria-label={t("send.manual.reason")}
                      value={reasons[message.id] ?? ""}
                      oninput={(event) => (reasons = { ...reasons, [message.id]: event.currentTarget.value })}
                    />
                    {#each MANUAL_STATUSES as next (next)}
                      <button type="button" class="secondary small" onclick={() => manual(message, next)}>
                        {t(`send.manual.${next}`)}
                      </button>
                    {/each}
                  </div>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
{/if}

<style>
  .intro,
  .muted {
    color: var(--muted);
  }

  .error {
    color: var(--error);
  }

  .ok {
    color: var(--ok);
  }

  section {
    margin-top: 1.5rem;
  }

  h2 {
    font-size: 1.1rem;
    margin: 0 0 0.5rem;
  }

  .incident {
    margin-top: 0;
    margin-bottom: 1.5rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--line);
  }

  .label {
    font-weight: 600;
  }

  .text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  td[data-status="delivered"],
  td[data-status="roger"] {
    color: var(--ok);
  }

  td[data-status="given_up"] {
    color: var(--error);
    font-weight: 600;
  }

  .manual {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .secondary {
    background: #fff;
    color: var(--navy);
  }

  .small {
    padding: 0.25rem 0.6rem;
  }
</style>
