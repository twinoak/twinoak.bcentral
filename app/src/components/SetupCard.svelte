<script lang="ts">
  // First run (P2-03, docs/design.md §The shell): the card at the top of the journal while
  // no operator name is set — the name, the clock confirm and the radio connect, one Start
  // button. The name is the one thing that has to be there (every entry carries it); the
  // clock and the radio can wait and have their chips in the top bar. Saving the name is
  // what makes the card go: JournalPage shows it while hasOperatorName() is false.
  import { language, t } from "../i18n/index.svelte.ts";
  import { clockTrust, setClockConfirmed } from "../lib/clock.svelte.ts";
  import { updateSettings } from "../lib/settings.svelte.ts";
  import { showToast } from "../lib/toast.svelte.ts";
  import { capability, radio } from "../radio/index.ts";
  import type { TransportKind } from "../radio/serial.ts";
  import Icon from "./Icon.svelte";

  let name = $state("");
  let radioBusy = $state(false);
  let radioError: string | null = $state(null);

  const radioState = $derived(radio.state());
  const connected = $derived(radioState === "connected" || radioState === "blind");

  // The PC's clock, shown so the operator can judge it before ticking the box; ticks once a
  // second while the card is on the screen.
  function formatClock(date: Date): string {
    return date.toLocaleTimeString(language(), { timeStyle: "medium" });
  }
  let clockNow = $state(formatClock(new Date()));
  $effect(() => {
    const timer = setInterval(() => {
      clockNow = formatClock(new Date());
    }, 1000);
    return () => clearInterval(timer);
  });

  async function connect(kind: TransportKind) {
    radioError = null;
    radioBusy = true;
    try {
      await radio.connect(kind);
    } catch (failure) {
      radioError = t("radio.connectFailed", {
        error: failure instanceof Error ? failure.message : String(failure),
      });
    } finally {
      radioBusy = false;
    }
  }

  function start(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") {
      return;
    }
    updateSettings({ operatorName: trimmed });
    showToast(t("settings.saved"));
  }
</script>

<section class="card setup" aria-labelledby="setup-title" data-setup-card>
  <h2 class="card-title" id="setup-title">{t("setup.title")}</h2>
  <p class="msg intro">{t("setup.intro")}</p>
  <form onsubmit={start}>
    <div class="fields">
      <div class="field">
        <label for="setup-name">{t("settings.operatorName")}</label>
        <input id="setup-name" type="text" autocomplete="name" required bind:value={name} />
        <span class="field-help">{t("settings.operatorNameHelp")}</span>
      </div>

      <!-- Session state (lib/clock.svelte.ts), the same box as the clock chip's popover. -->
      <div class="field">
        <span class="field-label">{t("settings.clock")}</span>
        <label class="check">
          <input
            type="checkbox"
            checked={clockTrust() !== "unknown"}
            disabled={clockTrust() === "ntp"}
            onchange={(event) => setClockConfirmed(event.currentTarget.checked)}
          />
          {t("settings.clockConfirm")}
        </label>
        <span class="field-help">{t("settings.clockNow", { time: clockNow })}</span>
      </div>

      <div class="field">
        <span class="field-label">{t("topbar.radio")}</span>
        <div class="radio">
          {#if capability === "none"}
            <span class="chip chip-danger"><Icon name="radio" />{t("topbar.noRadioApi")}</span>
          {:else if connected}
            <span class="chip chip-ok"><Icon name="radio" />{t(`radio.status.${radioState}`)}</span>
          {:else if radioState === "connecting"}
            <span class="chip chip-warn"
              ><span class="chip-dot chip-dot-outline"></span>{t("radio.status.connecting")}</span
            >
          {:else}
            {#if capability !== "ble"}
              <button type="button" class="btn" disabled={radioBusy} onclick={() => connect("usb")}>
                <Icon name="radio" />{t("radio.connectUsb")}
              </button>
            {/if}
            {#if capability !== "usb"}
              <button type="button" class="btn" disabled={radioBusy} onclick={() => connect("ble")}>
                <Icon name="radio" />{t("radio.connectBle")}
              </button>
            {/if}
          {/if}
        </div>
        {#if radioError}
          <span class="field-error" role="alert"><Icon name="warning" />{radioError}</span>
        {:else}
          <span class="field-help">{t("setup.radioHelp")}</span>
        {/if}
      </div>
    </div>

    <div class="actions">
      <button type="submit" class="btn btn-primary" disabled={name.trim() === ""}>
        {t("setup.start")}
      </button>
    </div>
  </form>
</section>

<style>
  /* Layout only. */
  .intro {
    margin: 0 0 var(--s-4);
  }

  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: var(--s-4);
    align-items: start;
  }

  .radio {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-2);
    min-height: 2.25rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--s-4);
  }
</style>
