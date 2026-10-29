<script lang="ts">
  // The `?` overlay (P1-09): the one documented set of keyboard shortcuts, as a modal dialog.
  // Opened by ?, by the top bar's ? button and from the settings page; closed by Esc (the
  // dialog's own cancel, and the global cancel), its Close button, or a click outside.
  import { t } from "../i18n/index.svelte.ts";
  import { SHORTCUTS } from "../lib/shortcuts.ts";
  import { closeHelp, helpOpen } from "../lib/shortcutHelp.svelte.ts";

  let dialog: HTMLDialogElement | undefined = $state(undefined);

  $effect(() => {
    if (dialog === undefined) {
      return;
    }
    if (helpOpen() && !dialog.open) {
      dialog.showModal();
    } else if (!helpOpen() && dialog.open) {
      dialog.close();
    }
  });

  // A click on the backdrop (outside the panel) closes the overlay.
  function onclick(event: MouseEvent) {
    if (event.target === dialog) {
      closeHelp();
    }
  }
</script>

<dialog
  class="help no-print"
  bind:this={dialog}
  aria-labelledby="shortcuts-heading"
  onclose={closeHelp}
  {onclick}
>
  <div class="panel">
    <h2 id="shortcuts-heading">{t("shortcuts.title")}</h2>
    <p class="intro">{t("shortcuts.intro")}</p>
    <table>
      <tbody>
        {#each SHORTCUTS as shortcut (shortcut.action)}
          <tr>
            <td class="keys">
              {#each shortcut.keys as key, index (index)}
                {#if index > 0}<span class="then"
                    >{shortcut.action === "send" ? "+" : t("shortcuts.then")}</span
                  >{/if}<kbd>{key}</kbd>
              {/each}
            </td>
            <td>{t(`shortcuts.${shortcut.action}`)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <div class="actions">
      <button type="button" onclick={closeHelp}>{t("shortcuts.close")}</button>
    </div>
  </div>
</dialog>

<style>
  .help {
    padding: 0;
    border: 2px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
    max-width: min(36rem, calc(100vw - 2rem));
  }

  .help::backdrop {
    background: rgba(0, 0, 0, 0.45);
  }

  .panel {
    padding: 1rem 1.25rem 1.25rem;
  }

  h2 {
    font-size: 1.2rem;
    margin: 0 0 0.5rem;
  }

  .intro {
    margin: 0 0 0.75rem;
    color: var(--muted);
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  td {
    padding: 0.3rem 0.5rem 0.3rem 0;
    border-bottom: 1px solid var(--rule);
    vertical-align: baseline;
  }

  .keys {
    white-space: nowrap;
  }

  .then {
    margin: 0 0.35em;
    color: var(--muted);
    font-size: 0.9em;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
  }
</style>
