<script lang="ts">
  // The incident in the top bar (P2-02, docs/design.md §The shell): a chip-styled button with
  // the incident's name and how long it has been open (or that it is closed), and the
  // switcher it opens — pick another incident, create one (a drill or not, decided once,
  // P1-05), close or reopen it with a reason, export, print. This is what IncidentBar.svelte
  // (P0-07, P1-04, P1-05) did at the top of the journal screen; the incident is what the
  // operator is working on and belongs in the bar, so the bar component is gone. The store
  // calls are the same ones (store/index.ts); the current incident is the id in
  // lib/currentIncident and the stored incident drillMode follows for it.
  import { t } from "../i18n/index.svelte.ts";
  import {
    bumpIncidentRevision,
    currentIncidentId,
    setCurrentIncidentId,
  } from "../lib/currentIncident.svelte.ts";
  import { formatElapsed } from "../lib/elapsed.ts";
  import { formatDateTime } from "../lib/journalText.ts";
  import { closePopover, popoverOpen, togglePopover } from "../lib/popover.svelte.ts";
  import { navigate } from "../lib/router.svelte.ts";
  import { hasOperatorName, settings } from "../lib/settings.svelte.ts";
  import { showToast } from "../lib/toast.svelte.ts";
  import { isDrill, splitByDrill, type IncidentState } from "../store/incidents.ts";
  import {
    addIncident,
    closeIncident,
    drillMode,
    exportJournal,
    isIncidentOpen,
    listIncidents,
    reopenIncident,
  } from "../store/index.ts";
  import type { Incident } from "../store/types.ts";
  import Icon from "./Icon.svelte";
  import Popover from "./Popover.svelte";

  const POPOVER = "incident";

  let incidents: Incident[] = $state([]);
  // Open or closed, from the store, for the current incident; null while none is selected.
  let incidentState: IncidentState | null = $state(null);
  let newName = $state("");
  let newDrill = $state(false);
  let reason = $state("");
  let busy = $state(false);
  let error: string | null = $state(null);
  // Ticks every ten seconds: the open duration on the chip (whole minutes; a bar that counts
  // seconds would flicker) moves without a reload.
  let nowMs = $state(Date.now());
  let button: HTMLButtonElement | undefined = $state(undefined);

  const incidentId = $derived(currentIncidentId());
  const current = $derived(drillMode.incident());
  const drill = $derived(isDrill(current));
  const grouped = $derived(splitByDrill(incidents));
  const open = $derived(popoverOpen() === POPOVER);
  const operator = $derived(settings.operatorName.trim());

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  async function reload() {
    try {
      incidents = await listIncidents();
      const id = currentIncidentId();
      incidentState = id === null ? null : (await isIncidentOpen(id)) ? "open" : "closed";
    } catch (failure) {
      error = t("journal.loadFailed", { error: describe(failure) });
    }
  }

  $effect(() => {
    void incidentId;
    void reload();
  });

  $effect(() => {
    const timer = setInterval(() => {
      nowMs = Date.now();
    }, 10_000);
    return () => clearInterval(timer);
  });

  function openFor(incident: Incident): string {
    return formatElapsed(Math.max(60_000, nowMs - Date.parse(incident.createdAt)));
  }

  function toggle() {
    error = null;
    togglePopover(POPOVER);
  }

  function close() {
    closePopover(POPOVER);
    button?.focus();
  }

  function pick(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    setCurrentIncidentId(value === "" ? null : value);
    close();
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (name === "" || busy || !hasOperatorName()) {
      return;
    }
    busy = true;
    error = null;
    try {
      const isDrillIncident = newDrill;
      const incident = await addIncident(name, isDrillIncident);
      setCurrentIncidentId(incident.id);
      newName = "";
      newDrill = false;
      showToast(
        t(isDrillIncident ? "journal.incident.createdDrill" : "journal.incident.created", { name }),
      );
      close();
    } catch (failure) {
      error = t("journal.incident.createFailed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  async function changeState(event: SubmitEvent) {
    event.preventDefault();
    if (current === null || incidentState === null || busy) {
      return;
    }
    busy = true;
    error = null;
    try {
      if (incidentState === "open") {
        await closeIncident(current, reason);
      } else {
        await reopenIncident(current, reason);
      }
      reason = "";
      // The journal and the handover derive the state from the entries; tell them.
      bumpIncidentRevision();
      await reload();
      close();
    } catch (failure) {
      error = t("journal.incident.changeFailed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  // The export file is the journal of the current incident's kind: drills only while a drill
  // is current, real incidents only while a real one is, everything while none is selected.
  async function exportNow() {
    busy = true;
    error = null;
    try {
      const result = await exportJournal(current === null ? undefined : { drill });
      showToast(
        result.inFolder === null
          ? t("journal.exported", { filename: result.filename })
          : t("journal.exportedToFolder", { filename: result.filename }),
      );
      close();
    } catch (failure) {
      error = t("journal.exportFailed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  function print() {
    close();
    navigate("print");
  }
</script>

<div class="popover-host" data-incident-state={incidentState ?? "none"}>
  <button
    type="button"
    class="chip"
    class:chip-warn={current === null}
    aria-expanded={open}
    title={t("journal.incident.label")}
    onclick={toggle}
    bind:this={button}
  >
    {#if current === null}
      <span class="chip-label">{t("journal.incident.choose")}</span>
    {:else}
      <span class="chip-label">{current.name}</span>
      <!-- Closed is said at every width; the open duration from 1440 px up (components.css). -->
      {#if incidentState === "closed"}
        <span>· {t("journal.incident.state.closed")}</span>
      {:else}
        <span class="chip-detail">
          · {t("handover.incident.openFor", { elapsed: openFor(current) })}
        </span>
      {/if}
    {/if}
  </button>

  <!-- The on-air word, next to the incident, while a drill is current (P1-05). -->
  {#if drill}
    <span class="chip chip-drill" title={t("journal.incident.drillHelp")}>
      <Icon name="drill" />{t("drill.onAir")}
    </span>
  {/if}

  {#if open}
    <Popover id="popover-incident" title={t("journal.incident.label")} onclose={close}>
      <div class="stack">
        <div class="field">
          <label for="incident-select">{t("switcher.current")}</label>
          <select id="incident-select" value={current?.id ?? ""} onchange={pick}>
            <option value="">{t("journal.incident.choose")}</option>
            {#if grouped.drills.length === 0}
              {#each grouped.real as incident (incident.id)}
                <option value={incident.id}>{incident.name}</option>
              {/each}
            {:else}
              {#if grouped.real.length > 0}
                <optgroup label={t("journal.incident.group.real")}>
                  {#each grouped.real as incident (incident.id)}
                    <option value={incident.id}>{incident.name}</option>
                  {/each}
                </optgroup>
              {/if}
              <optgroup label={t("journal.incident.group.drill")}>
                {#each grouped.drills as incident (incident.id)}
                  <option value={incident.id}
                    >{t("drill.incidentName", { name: incident.name })}</option
                  >
                {/each}
              </optgroup>
            {/if}
          </select>
        </div>

        {#if current !== null && incidentState !== null}
          <p>
            {t("journal.incident.openedAt", {
              time: formatDateTime(current.createdAt),
              operator: current.createdBy,
            })}
          </p>
          {#if incidentState === "closed"}
            <p class="msg msg-warn"><Icon name="warning" />{t("journal.incident.closedNotice")}</p>
          {/if}
          <form class="row" onsubmit={changeState}>
            <div class="field grow">
              <label for="incident-reason">{t("journal.incident.reason")}</label>
              <input id="incident-reason" type="text" bind:value={reason} disabled={busy} />
            </div>
            <button type="submit" class="btn" disabled={busy}>
              {incidentState === "open"
                ? t("journal.incident.close")
                : t("journal.incident.reopen")}
            </button>
          </form>
        {:else}
          <p>{t("journal.incident.none")}</p>
        {/if}

        <div class="row">
          <button type="button" class="btn" disabled={busy} onclick={exportNow}>
            <Icon name="export" />{t("journal.export")}
          </button>
          {#if current !== null}
            <button type="button" class="btn" disabled={busy} onclick={print}>
              <Icon name="print" />{t("journal.print")}
            </button>
          {/if}
        </div>

        <form class="stack" onsubmit={create}>
          <div class="field">
            <label for="incident-new">{t("journal.incident.newName")}</label>
            <input
              id="incident-new"
              type="text"
              bind:value={newName}
              disabled={busy || !hasOperatorName()}
            />
          </div>
          <label class="check" title={t("journal.incident.drillHelp")}>
            <input type="checkbox" bind:checked={newDrill} disabled={!hasOperatorName()} />
            {t("journal.incident.drill")}
          </label>
          {#if hasOperatorName()}
            <div class="row end">
              <span class="field-help">{t("journal.incident.createAs", { operator })}</span>
              <button
                type="submit"
                class="btn btn-primary"
                disabled={busy || newName.trim() === ""}
              >
                {t("journal.incident.create")}
              </button>
            </div>
          {:else}
            <p class="msg msg-warn"><Icon name="warning" />{t("send.noOperator")}</p>
          {/if}
        </form>

        {#if error !== null}
          <p class="msg msg-danger" role="alert"><Icon name="warning" />{error}</p>
        {/if}
      </div>
    </Popover>
  {/if}
</div>

<style>
  /* Layout of the switcher's rows only; every colour and size is a token via the classes. */
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }

  .row {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: var(--s-2);
  }

  .row.end {
    justify-content: flex-end;
    align-items: center;
  }

  .grow {
    flex: 1;
  }

  p {
    margin: 0;
  }
</style>
