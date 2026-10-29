<script lang="ts">
  // Placeholder until P0-07: the export, and a plain list of the current incident's entries
  // so what the radio receives (P0-06) can be seen landing. The incident is picked on the
  // Send screen; the real journal screen with its own incident bar comes in P0-07.
  import { t, language } from "../i18n/index.svelte.ts";
  import { currentIncidentId } from "../lib/currentIncident.svelte.ts";
  import { inbox, outbox } from "../radio/index.ts";
  import { entriesForIncident, exportJournal, listRegister } from "../store/index.ts";
  import type { JournalEntry, RegisterEntry } from "../store/types.ts";

  let busy = $state(false);
  let message: string | null = $state(null);
  let failed = $state(false);
  let register: RegisterEntry[] = $state([]);
  let entries: JournalEntry[] = $state([]);
  let loadError: string | null = $state(null);

  const incidentId = $derived(currentIncidentId());
  const labels = $derived(new Map(register.map((entry) => [entry.id, entry.label])));
  const newestFirst = $derived([...entries].sort((a, b) => b.deviceSeq - a.deviceSeq));

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  async function reload(id: string | null) {
    if (id === null) {
      entries = [];
      return;
    }
    try {
      register = await listRegister();
      const loaded = await entriesForIncident(id);
      if (currentIncidentId() === id) {
        entries = loaded;
      }
    } catch (failure) {
      loadError = t("journal.loadFailed", { error: describe(failure) });
    }
  }

  // Reload on an incident change and after every entry the inbox or the outbox writes.
  $effect(() => {
    inbox.revision();
    outbox.revision();
    void reload(incidentId);
  });

  async function onExport() {
    busy = true;
    failed = false;
    message = null;
    try {
      const filename = await exportJournal();
      message = t("journal.exported", { filename });
    } catch (error) {
      failed = true;
      message = t("journal.exportFailed", { error: describe(error) });
    } finally {
      busy = false;
    }
  }

  function formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString(language(), { timeStyle: "short" });
  }

  // What the entry says, in one cell: the text, or for a status change the new status and
  // its text (a reason, a round trip, the id of the incoming message that was the roger).
  function detail(entry: JournalEntry): string {
    if (entry.type === "status_change") {
      const status = t(`journal.status.${entry.newStatus ?? "pending"}`);
      return entry.text === undefined ? status : `${status} · ${entry.text}`;
    }
    return entry.text ?? "";
  }
</script>

<h1>{t("journal.title")}</h1>
<p>{t("journal.placeholder")}</p>

<div class="actions">
  <button type="button" onclick={onExport} disabled={busy}>{t("journal.export")}</button>
  {#if message}
    <span class:error={failed} role="status">{message}</span>
  {/if}
</div>

<section aria-labelledby="entries-heading">
  <h2 id="entries-heading">{t("journal.entries.title")}</h2>
  {#if loadError}
    <p class="error" role="alert">{loadError}</p>
  {/if}
  {#if incidentId === null}
    <p class="muted">{t("journal.entries.noIncident")}</p>
  {:else if newestFirst.length === 0}
    <p class="muted">{t("journal.entries.empty")}</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th scope="col">{t("journal.entries.time")}</th>
          <th scope="col">{t("journal.entries.type")}</th>
          <th scope="col">{t("journal.entries.counterparty")}</th>
          <th scope="col">{t("journal.entries.text")}</th>
        </tr>
      </thead>
      <tbody>
        {#each newestFirst as entry (entry.id)}
          <tr data-type={entry.type}>
            <td>{formatTime(entry.timestamp)}</td>
            <td>{t(`journal.type.${entry.type}`)}</td>
            <td class="label">{labels.get(entry.counterpartyId ?? "") ?? ""}</td>
            <td class="text">{detail(entry)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .error {
    color: var(--error);
  }

  .muted {
    color: var(--muted);
  }

  section {
    margin-top: 1.5rem;
  }

  h2 {
    font-size: 1.1rem;
    margin: 0 0 0.5rem;
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

  tr[data-type="message_in"] {
    background: var(--highlight, #eef4fb);
  }
</style>
