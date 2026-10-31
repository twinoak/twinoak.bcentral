<script lang="ts">
  // The `?` overlay (P1-09): the one documented set of keyboard shortcuts, as a modal dialog
  // styled as a popover-sized card under the bar's ? button (P2-02, `.popover-dialog` in
  // components.css). Opened by ?, by the top bar's ? button and from the settings page;
  // closed by Esc (the dialog's own cancel, and the global cancel), its Close button, or a
  // click outside.
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

  // A click on the backdrop (outside the card) closes the overlay.
  function onclick(event: MouseEvent) {
    if (event.target === dialog) {
      closeHelp();
    }
  }
</script>

<dialog
  class="popover-dialog no-print"
  bind:this={dialog}
  aria-labelledby="shortcuts-heading"
  onclose={closeHelp}
  {onclick}
>
  <h2 class="popover-title" id="shortcuts-heading">{t("shortcuts.title")}</h2>
  <p>{t("shortcuts.intro")}</p>
  <table class="table">
    <tbody>
      {#each SHORTCUTS as shortcut (shortcut.action)}
        <tr>
          <td class="keys">
            {#each shortcut.keys as key, index (index)}
              {#if index > 0}<small class="then"
                  >{shortcut.action === "send" ? "+" : t("shortcuts.then")}</small
                >{/if}<kbd>{key}</kbd>
            {/each}
          </td>
          <td>{t(`shortcuts.${shortcut.action}`)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="popover-actions">
    <button type="button" class="btn" onclick={closeHelp}>{t("shortcuts.close")}</button>
  </div>
</dialog>

<style>
  /* Layout only: the key column stays on one line, the "then" between two keys has air. */
  .keys {
    white-space: nowrap;
  }

  .then {
    margin: 0 0.35em;
  }

  .popover-actions {
    margin-top: var(--s-4);
  }
</style>
