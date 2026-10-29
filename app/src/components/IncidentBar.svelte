<script lang="ts">
  // The incident bar (P0-07): which incident the journal shows, its name, when and by whom it
  // was opened and whether it is open or closed; switch, create, close / reopen; the export
  // button and the print button (P1-04). A new incident can be a drill (P1-05): a checkbox,
  // off by default, decided once; the switcher then lists drills under their own heading
  // with the drill prefix on the name. The parent owns the store calls and reloads; this
  // component holds the form state and shows the outcome.
  import { t, language } from "../i18n/index.svelte.ts";
  import { incidentName } from "../lib/journalText.ts";
  import { settings } from "../lib/settings.svelte.ts";
  import { isDrill, splitByDrill, type IncidentState } from "../store/incidents.ts";
  import type { ExportResult } from "../store/index.ts";
  import type { Incident } from "../store/types.ts";

  interface Props {
    incidents: readonly Incident[];
    current: Incident | null;
    // null while no incident is selected. (Not `state`: that name collides with the rune.)
    incidentState: IncidentState | null;
    onpick: (id: string | null) => void;
    oncreate: (name: string, drill: boolean) => Promise<void>;
    onclose: (reason: string) => Promise<void>;
    onreopen: (reason: string) => Promise<void>;
    onexport: () => Promise<ExportResult>;
    // Opens the print view of the current incident.
    onprint: () => void;
  }
  let {
    incidents,
    current,
    incidentState,
    onpick,
    oncreate,
    onclose,
    onreopen,
    onexport,
    onprint,
  }: Props = $props();

  let newName = $state("");
  let newDrill = $state(false);
  let reason = $state("");
  let busy = $state(false);
  let notice: string | null = $state(null);
  let error: string | null = $state(null);

  // Real incidents and drills, each newest first. The headings appear once there is a drill
  // to put under one; until then the list is as it was.
  const grouped = $derived(splitByDrill(incidents));

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  function formatDateTime(timestamp: string): string {
    return new Date(timestamp).toLocaleString(language(), {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  function pick(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    notice = null;
    error = null;
    onpick(value === "" ? null : value);
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (name === "" || busy) {
      return;
    }
    busy = true;
    error = null;
    try {
      const drill = newDrill;
      await oncreate(name, drill);
      notice = t(drill ? "journal.incident.createdDrill" : "journal.incident.created", { name });
      newName = "";
      newDrill = false;
    } catch (failure) {
      error = t("journal.incident.createFailed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  async function changeState() {
    if (current === null || incidentState === null || busy) {
      return;
    }
    busy = true;
    error = null;
    notice = null;
    try {
      if (incidentState === "open") {
        await onclose(reason);
      } else {
        await onreopen(reason);
      }
      reason = "";
    } catch (failure) {
      error = t("journal.incident.changeFailed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  async function exportNow() {
    busy = true;
    error = null;
    try {
      const result = await onexport();
      notice =
        result.inFolder === null
          ? t("journal.exported", { filename: result.filename })
          : t("journal.exportedToFolder", { filename: result.filename });
    } catch (failure) {
      error = t("journal.exportFailed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }
</script>

<section class="bar" aria-labelledby="incident-heading">
  <div class="row">
    <h2 id="incident-heading">{t("journal.incident.label")}</h2>
    <select aria-labelledby="incident-heading" value={current?.id ?? ""} onchange={pick}>
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
            <option value={incident.id}>{incidentName(incident)}</option>
          {/each}
        </optgroup>
      {/if}
    </select>

    {#if current !== null && isDrill(current)}
      <span class="drill" data-drill>{t("drill.band")}</span>
    {/if}

    {#if current !== null && incidentState !== null}
      <span class="opened">
        {t("journal.incident.openedAt", {
          time: formatDateTime(current.createdAt),
          operator: current.createdBy,
        })}
      </span>
      <span class="state" data-state={incidentState}
        >{t(`journal.incident.state.${incidentState}`)}</span
      >
    {/if}

    <span class="spacer"></span>

    {#if current !== null}
      <button type="button" class="secondary" onclick={onprint} disabled={busy}
        >{t("journal.print")}</button
      >
    {/if}
    <button type="button" class="secondary" onclick={exportNow} disabled={busy}
      >{t("journal.export")}</button
    >
  </div>

  <div class="row">
    <form class="row" onsubmit={create}>
      <input
        type="text"
        placeholder={t("journal.incident.newName")}
        aria-label={t("journal.incident.newName")}
        bind:value={newName}
      />
      <label class="check" title={t("journal.incident.drillHelp")}>
        <input type="checkbox" bind:checked={newDrill} />
        {t("journal.incident.drill")}
      </label>
      <button type="submit" class="secondary" disabled={busy || newName.trim() === ""}>
        {t("journal.incident.create")}
      </button>
      <small class="muted"
        >{t("journal.incident.createAs", { operator: settings.operatorName.trim() })}</small
      >
    </form>

    {#if current !== null && incidentState !== null}
      <span class="spacer"></span>
      <div class="row">
        <input
          type="text"
          placeholder={t("journal.incident.reason")}
          aria-label={t("journal.incident.reason")}
          bind:value={reason}
        />
        <button type="button" class="secondary" onclick={changeState} disabled={busy}>
          {incidentState === "open" ? t("journal.incident.close") : t("journal.incident.reopen")}
        </button>
      </div>
    {/if}
  </div>

  {#if current === null}
    <p class="muted">{t("journal.incident.none")}</p>
  {:else if incidentState === "closed"}
    <p class="closed" role="status">{t("journal.incident.closedNotice")}</p>
  {/if}
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
  {#if notice}
    <p class="ok" role="status">{notice}</p>
  {/if}
</section>

<style>
  .bar {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: #fff;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  h2 {
    font-size: 1.1rem;
    margin: 0;
  }

  .spacer {
    flex: 1;
  }

  .opened,
  .muted {
    color: var(--muted);
  }

  .state {
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    background: var(--light);
    color: var(--ok);
  }

  .state[data-state="closed"] {
    color: var(--error);
  }

  .drill {
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    background: #f2b705;
    color: var(--ink);
  }

  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    white-space: nowrap;
  }

  .check input {
    margin: 0;
  }

  .closed {
    margin: 0;
    color: var(--error);
    font-weight: 600;
  }

  .error {
    margin: 0;
    color: var(--error);
  }

  .ok {
    margin: 0;
    color: var(--ok);
  }

  p {
    margin: 0;
  }

  .secondary {
    background: #fff;
    color: var(--navy);
  }
</style>
