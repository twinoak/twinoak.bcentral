<script lang="ts">
  // The journal screen (P0-07; on the design language in P2-03): the screen the staff live
  // on. The main column starts with one card with two tabs — New message (ComposeForm) and
  // Add by hand (ManualEntryForm) — above the newest-first row list (Timeline), where new
  // rows appear; the list takes the rest of the viewport and scrolls inside. The side
  // column holds two cards, open items and "last heard from", each with its count in the
  // title; under 60 rem it stacks under the main column. On first run (no operator name) a
  // setup card sits at the top of the main column and goes when the name is saved. The
  // incident itself — picking, creating, closing, export, print — is the switcher in the
  // top bar (P2-02). Everything shown is derived from the incident's entries on every reload
  // (store/journalView.ts); a reload runs on an incident change, when the switcher closes or
  // reopens the incident, on every entry the inbox or the outbox writes, and after every
  // write from this screen.
  import { t, language } from "../i18n/index.svelte.ts";
  import { currentIncidentId, incidentRevision } from "../lib/currentIncident.svelte.ts";
  import { openPopover } from "../lib/popover.svelte.ts";
  import { hasOperatorName } from "../lib/settings.svelte.ts";
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
  import Icon from "../components/Icon.svelte";
  import LastHeardPanel from "../components/LastHeardPanel.svelte";
  import ManualEntryForm from "../components/ManualEntryForm.svelte";
  import OpenItemsPanel from "../components/OpenItemsPanel.svelte";
  import SetupCard from "../components/SetupCard.svelte";
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
  // Which form the compose card shows. Both stay mounted, so a half-typed message survives
  // a look at the other tab; N and A (and a reply) switch to their form first.
  let tab: "compose" | "manual" = $state("compose");

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
    if (
      queued.includes(messageId) ||
      waitingInQueue.includes(messageId) ||
      handedToOutbox === messageId
    ) {
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
    tab = "compose";
    void compose?.replyTo(entry);
  }
</script>

<!-- The page heading is for assistive technology; the bar names the incident (P2-02). -->
<h1 class="visually-hidden">{t("journal.title")}</h1>

{#snippet setup()}
  {#if !hasOperatorName()}
    <SetupCard />
  {/if}
{/snippet}

{#if loadError}
  <p class="msg msg-danger" role="alert"><Icon name="warning" />{loadError}</p>
{/if}

{#if current === null}
  <!-- No incident: the setup card on first run, then one sentence and the switcher. -->
  {@render setup()}
  <div class="empty">
    <p>{t("journal.incident.none")}</p>
    <button type="button" class="btn btn-primary" onclick={() => openPopover("incident")}>
      {t("journal.incident.choose")}
    </button>
  </div>
{:else}
  <div class="layout">
    <div class="main">
      {@render setup()}

      <!-- One card, two tabs: the forms of the same kind, above the list where their rows
           appear. -->
      <section class="card compose-card">
        <div class="tabs" role="tablist">
          <button
            type="button"
            class="tab"
            role="tab"
            id="tab-compose"
            aria-selected={tab === "compose"}
            aria-controls="panel-compose"
            onclick={() => (tab = "compose")}>{t("journal.compose.title")}</button
          >
          <button
            type="button"
            class="tab"
            role="tab"
            id="tab-manual"
            aria-selected={tab === "manual"}
            aria-controls="panel-manual"
            onclick={() => (tab = "manual")}>{t("journal.add.title")}</button
          >
        </div>
        <div
          id="panel-compose"
          role="tabpanel"
          aria-labelledby="tab-compose"
          hidden={tab !== "compose"}
        >
          {#key current.id}
            <ComposeForm
              bind:this={compose}
              incidentId={current.id}
              {drill}
              register={sortedRegister}
              {onsent}
              onreveal={() => (tab = "compose")}
            />
          {/key}
        </div>
        <div
          id="panel-manual"
          role="tabpanel"
          aria-labelledby="tab-manual"
          hidden={tab !== "manual"}
        >
          {#key current.id}
            <ManualEntryForm
              incidentId={current.id}
              register={sortedRegister}
              onadded={changed}
              onreveal={() => (tab = "manual")}
            />
          {/key}
        </div>
      </section>

      {#if actionError}
        <p class="msg msg-danger" role="alert"><Icon name="warning" />{actionError}</p>
      {/if}

      <section class="list" aria-labelledby="timeline-heading">
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
    </div>

    <aside class="side">
      <OpenItemsPanel groups={open} {labels} onselect={showEntry} />
      <LastHeardPanel rows={heardRows} />
    </aside>
  </div>
{/if}

<style>
  /* Layout only (docs/design.md §Space: two columns minmax(0, 1fr) 320px, collapsing under
     60 rem). The layout is as tall as the viewport leaves under the bar and the gutters, so
     the list, not the page, scrolls; under 60 rem the page scrolls and the list is capped. */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: var(--s-5);
    align-items: stretch;
    height: calc(100vh - 3.5rem - 2 * var(--s-5));
    min-height: 24rem;
  }

  .main {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    min-width: 0;
    min-height: 0;
  }

  /* The compose card is padded s-4 top and bottom (the card's s-5 at the sides) and its
     tabs sit s-2 above the form: the rows under it are what the screen is for, and ten
     one-line rows have to fit under the card at 1280 × 720 (P1-09's rule). */
  .compose-card {
    flex: none;
    padding-top: var(--s-4);
    padding-bottom: var(--s-4);
  }

  .compose-card .tabs {
    margin-bottom: var(--s-2);
  }

  .list {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    min-height: 0;
    overflow-y: auto;
  }

  .msg {
    margin: 0 0 var(--s-4);
  }

  .main > .msg {
    margin: 0;
  }

  @media (max-width: 60rem) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
      height: auto;
    }

    .list {
      max-height: 60vh;
    }

    .side {
      overflow: visible;
    }
  }
</style>
