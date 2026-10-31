<script lang="ts">
  // The journal screen (P0-07): the screen the staff live on. The incident's timeline with
  // the compose form and the manual-entry form under it; open items and "last heard from"
  // at the side. The incident itself — picking, creating, closing, export, print — is the
  // switcher in the top bar (P2-02; the incident bar that sat here is gone). Everything
  // shown is derived from the incident's entries on every reload (store/journalView.ts); a
  // reload runs on an incident change, when the switcher closes or reopens the incident, on
  // every entry the inbox or the outbox writes, and after every write from this screen.
  import { t, language } from "../i18n/index.svelte.ts";
  import { currentIncidentId, incidentRevision } from "../lib/currentIncident.svelte.ts";
  import { openPopover } from "../lib/popover.svelte.ts";
  import { inbox, outbox, sendQueue } from "../radio/index.ts";
  import {
    addCorrection,
    entriesForIncident,
    lastHeardByCounterparty,
    listIncidents,
    listRegister,
    recordManualStatus,
  } from "../store/index.ts";
  import { isDrill } from "../store/incidents.ts";
  import {
    buildTimeline,
    entriesById,
    openItems,
    sortedByLastHeard,
  } from "../store/journalView.ts";
  import { sortedByLabel } from "../store/register.ts";
  import { statusOf } from "../store/status.ts";
  import type { Incident, JournalEntry, RegisterEntry, Status } from "../store/types.ts";
  import ComposeForm from "../components/ComposeForm.svelte";
  import LastHeardPanel from "../components/LastHeardPanel.svelte";
  import ManualEntryForm from "../components/ManualEntryForm.svelte";
  import OpenItemsPanel from "../components/OpenItemsPanel.svelte";
  import Timeline from "../components/Timeline.svelte";

  let incidents: Incident[] = $state([]);
  let register: RegisterEntry[] = $state([]);
  let entries: JournalEntry[] = $state([]);
  let heard: Map<string, string> = $state(new Map());
  let loadError: string | null = $state(null);
  let actionError: string | null = $state(null);
  // Bumped after every write from this screen, so the effect below reloads.
  let ownRevision = $state(0);
  let timeline: Timeline | undefined = $state(undefined);
  let compose: ComposeForm | undefined = $state(undefined);

  const incidentId = $derived(currentIncidentId());
  const current = $derived(incidents.find((incident) => incident.id === incidentId) ?? null);
  // A drill incident (P1-05): the compose forms show the ØVELSE prefix.
  const drill = $derived(isDrill(current));
  const sortedRegister = $derived(sortedByLabel(register, language()));
  const labels = $derived(new Map(register.map((entry) => [entry.id, entry.label])));
  const rows = $derived(buildTimeline(entries));
  const byId = $derived(entriesById(entries));
  const open = $derived(openItems(entries));
  const heardRows = $derived(sortedByLastHeard(register, heard));
  const active = $derived(outbox.active());
  const queued = $derived(outbox.queued());
  // Messages the send-to-all queue holds (P0-08) are in flight too: no Send / Retry on them.
  const waitingInQueue = $derived(sendQueue.waiting());
  const handedToOutbox = $derived(sendQueue.sending());

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
    incidentRevision();
    void ownRevision;
    void reload(incidentId);
  });

  async function changed() {
    ownRevision += 1;
    await reload(currentIncidentId());
  }

  // --- outgoing messages (P0-05's path) --------------------------------------------------

  async function transmit(message: JournalEntry) {
    try {
      await outbox.send(message.id);
    } catch (failure) {
      actionError = t("send.failed", { error: describe(failure) });
    }
    await changed();
  }

  async function onsent(message: JournalEntry) {
    actionError = null;
    await changed();
    if (message.transport === "mesh") {
      void transmit(message);
    }
  }

  function inflight(messageId: string): string | null {
    if (active?.messageId === messageId) {
      return t(`send.inflight.${active.phase}`, {
        attempt: active.attempt + 1,
        max: active.maxAttempts,
      });
    }
    if (queued.includes(messageId) || waitingInQueue.includes(messageId) || handedToOutbox === messageId) {
      return t("send.inflight.queued");
    }
    return null;
  }

  function canRetry(message: JournalEntry): boolean {
    if (message.transport !== "mesh" || inflight(message.id) !== null) {
      return false;
    }
    const status = statusOf(entries, message.id);
    return status === "given_up" || status === "pending";
  }

  // --- row actions -------------------------------------------------------------------------

  async function manual(message: JournalEntry, status: Status, reason: string) {
    await recordManualStatus(message, status, reason);
    await changed();
  }

  async function correct(entry: JournalEntry, text: string) {
    await addCorrection(entry, text);
    await changed();
  }

  function showEntry(id: string) {
    void timeline?.scrollToEntry(id);
  }

  // Reply from the row (P1-02): the compose form takes the incoming message's sender and
  // transport and links the answer to it.
  function reply(entry: JournalEntry) {
    actionError = null;
    void compose?.replyTo(entry);
  }
</script>

<!-- The page heading is for assistive technology; the bar names the incident (P2-02), and the
     timeline keeps its rows in view at 1280×720 (P1-09). -->
<h1 class="visually-hidden">{t("journal.title")}</h1>

{#if loadError}
  <p class="error" role="alert">{loadError}</p>
{/if}
{#if actionError}
  <p class="error" role="alert">{actionError}</p>
{/if}

{#if current === null}
  <!-- No incident: one sentence and the switcher (P2-03 puts the first-run setup card here). -->
  <div class="empty">
    <p>{t("journal.incident.none")}</p>
    <button type="button" class="btn btn-primary" onclick={() => openPopover("incident")}>
      {t("journal.incident.choose")}
    </button>
  </div>
{:else}
  <div class="layout">
    <div class="main">
      <section aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" class="visually-hidden">{t("journal.timeline.title")}</h2>
        <Timeline
          bind:this={timeline}
          {rows}
          {labels}
          {byId}
          {inflight}
          {canRetry}
          onretry={transmit}
          onmanual={manual}
          oncorrect={correct}
          onreply={reply}
        />
      </section>

      <div class="forms">
        <section aria-labelledby="compose-heading">
          <h2 id="compose-heading">{t("journal.compose.title")}</h2>
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

        <section aria-labelledby="manual-heading">
          <h2 id="manual-heading">{t("journal.add.title")}</h2>
          {#key current.id}
            <ManualEntryForm incidentId={current.id} register={sortedRegister} onadded={changed} />
          {/key}
        </section>
      </div>
    </div>

    <aside class="side">
      <OpenItemsPanel groups={open} {labels} onselect={showEntry} />
      <LastHeardPanel rows={heardRows} />
    </aside>
  </div>
{/if}

<style>
  .error {
    color: var(--error);
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 18rem;
    gap: 1rem;
    align-items: start;
  }

  .forms {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.5rem;
    align-items: start;
  }

  @media (max-width: 60rem) {
    .layout,
    .forms {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .main {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-width: 0;
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  h2 {
    font-size: 1.1rem;
    margin: 0 0 0.5rem;
  }
</style>
