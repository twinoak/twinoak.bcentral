<script lang="ts">
  // The status cluster (P2-02, docs/design.md §The shell): four chips in the top bar — radio,
  // clock, storage, update — each a button that opens its popover with the sentence and the
  // one action. What each says is lib/statusChips.ts's rule over the stores' states; this
  // file only reads the stores, formats the times and runs the actions. The clock popover
  // carries the confirm checkbox itself (no trip to settings); storage is hidden while the
  // storage is kept and a folder is writing; update is hidden until a new build waits. This
  // replaces the P1-09 notices under the bar and the update banner.
  import { language, t } from "../i18n/index.svelte.ts";
  import { clockTrust, setClockConfirmed } from "../lib/clock.svelte.ts";
  import { formatElapsed } from "../lib/elapsed.ts";
  import { persistence } from "../lib/persistence.svelte.ts";
  import {
    closePopover,
    isPopoverOpen,
    popoverOpen,
    togglePopover,
  } from "../lib/popover.svelte.ts";
  import { navigate } from "../lib/router.svelte.ts";
  import { settings } from "../lib/settings.svelte.ts";
  import { statusChips, type ChipAction, type ChipId, type Text } from "../lib/statusChips.ts";
  import { updater } from "../lib/updates.svelte.ts";
  import { capability, radio } from "../radio/index.ts";
  import { mirror } from "../store/index.ts";
  import Icon from "./Icon.svelte";
  import Popover from "./Popover.svelte";

  // The PC's clock as the clock popover shows it; ticks while that popover is open.
  function formatClock(date: Date): string {
    return date.toLocaleTimeString(language(), { timeStyle: "medium" });
  }
  let clockNow = $state(formatClock(new Date()));
  $effect(() => {
    if (!isPopoverOpen("clock")) {
      return;
    }
    clockNow = formatClock(new Date());
    const timer = setInterval(() => {
      clockNow = formatClock(new Date());
    }, 1000);
    return () => clearInterval(timer);
  });

  const radioState = $derived(radio.state());
  const elapsed = $derived(radio.elapsedMs());
  const countdown = $derived(radio.reconnectCountdownMs());
  const chips = $derived(
    statusChips({
      radio: {
        capability,
        state: radioState,
        elapsedText:
          elapsed === null || radioState === "connecting" || radioState === "disconnected"
            ? null
            : formatElapsed(elapsed),
        reason: radioState === "disconnected" ? radio.disconnectReason() : null,
        reconnectAttempt: radio.reconnecting()?.attempt ?? null,
        reconnectInSeconds: countdown === null ? null : Math.ceil(countdown / 1000),
        canReconnect: radio.canReconnect(),
        blindAfterMinutes: settings.blindAfterMinutes,
      },
      clock: { trust: clockTrust(), timeText: clockNow },
      storage: {
        persisted: persistence.persisted(),
        mirrorState: mirror.state(),
        folderName: mirror.folderName(),
        folderError: mirror.error(),
        folderSupported: mirror.supported(),
      },
      update: { available: updater.updateAvailable() },
    }),
  );

  function say(text: Text): string {
    return t(text.key, text.params);
  }

  // The chip buttons, so a closed popover hands the focus back to its chip.
  const buttons: Partial<Record<ChipId, HTMLButtonElement>> = $state({});
  let busy = $state(false);
  let actionError: string | null = $state(null);

  function toggle(id: ChipId) {
    actionError = null;
    togglePopover(id);
  }

  function close(id: ChipId) {
    closePopover(id);
    buttons[id]?.focus();
  }

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  // The one action of a popover. The folder actions are user gestures the browser needs
  // (the picker, the permission); the popover stays open until they are done, and an error
  // is shown in it. The others close the popover first.
  async function act(id: ChipId, action: ChipAction) {
    if (action.kind === "openRadio" || action.kind === "openSettings") {
      close(id);
      navigate(action.kind === "openRadio" ? "radio" : "settings");
      return;
    }
    if (action.kind === "reconnectRadio") {
      close(id);
      radio.reconnectNow();
      return;
    }
    busy = true;
    actionError = null;
    try {
      if (action.kind === "chooseFolder") {
        await mirror.chooseFolder();
      } else if (action.kind === "reconnectFolder") {
        await mirror.reconnect();
      } else if (action.kind === "retryFolder") {
        await mirror.retry();
      } else {
        await updater.reload();
      }
      close(id);
    } catch (failure) {
      actionError = t("settings.journalFolder.chooseFailed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }
</script>

<div class="shell-chips" role="group" aria-label={t("chips.label")}>
  {#each chips as chip (chip.id)}
    {#if chip.visible}
      {@const action = chip.action}
      <div class="popover-host" data-chip={chip.id} data-tint={chip.tint}>
        <button
          type="button"
          class="chip"
          class:chip-warn={chip.tint === "warn"}
          class:chip-danger={chip.tint === "danger"}
          aria-expanded={popoverOpen() === chip.id}
          onclick={() => toggle(chip.id)}
          bind:this={buttons[chip.id]}
        >
          {#if chip.icon === "dot"}
            <span class="chip-dot" class:chip-dot-outline={radioState === "connecting"}></span>
          {:else}
            <Icon name={chip.icon} />
          {/if}
          <span class="chip-label">{say(chip.label)}</span>
          {#if chip.detail !== null}
            <span class="chip-detail">· {say(chip.detail)}</span>
          {/if}
        </button>
        {#if popoverOpen() === chip.id}
          <Popover
            id="popover-{chip.id}"
            title={say(chip.title)}
            sentences={chip.sentences.map(say)}
            action={action === null
              ? null
              : { label: say(action.label), onclick: () => act(chip.id, action), disabled: busy }}
            onclose={() => close(chip.id)}
          >
            {#if chip.id === "clock"}
              <!-- Session state (lib/clock.svelte.ts): ticking it stamps every entry from now
                   on as confirmed by hand; a clock synced against a source is not downgraded. -->
              <label class="check">
                <input
                  type="checkbox"
                  checked={clockTrust() !== "unknown"}
                  disabled={clockTrust() === "ntp"}
                  onchange={(event) => setClockConfirmed(event.currentTarget.checked)}
                />
                {t("settings.clockConfirm")}
              </label>
            {/if}
            {#if actionError !== null}
              <p class="msg msg-danger" role="alert"><Icon name="warning" />{actionError}</p>
            {/if}
          </Popover>
        {/if}
      </div>
    {/if}
  {/each}
</div>
