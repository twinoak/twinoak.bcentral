<script lang="ts">
  // The radio (P0-04, P1-07; on the design language in P2-04): a state card — the state as a
  // chip in the title, the transport buttons, the reconnect loop's position, the clock drift
  // as an inline message, this radio's self info as a definition list — then the contacts
  // as a table and the log as a monospaced row list, newest first, with a Clear button.
  // Reached from the radio chip's popover and from Settings → Radio; not in the navigation.
  import { t, language } from "../i18n/index.svelte.ts";
  import { settings } from "../lib/settings.svelte.ts";
  import { formatElapsed } from "../lib/elapsed.ts";
  import { chipClass } from "../lib/journalRows.ts";
  import { capability, radio } from "../radio/index.ts";
  import { CLOCK_DRIFT_LIMIT_S, disconnectReasonText } from "../radio/radioStore.svelte.ts";
  import { ADV_TYPE_NONE, ADV_TYPE_SENSOR, type TransportKind } from "../radio/serial.ts";
  import Icon from "../components/Icon.svelte";

  let busy = $state(false);
  let error: string | null = $state(null);

  const radioState = $derived(radio.state());
  const selfInfo = $derived(radio.selfInfo());
  const device = $derived(radio.deviceInfo());
  const contacts = $derived(radio.contacts());
  const elapsed = $derived(radio.elapsedMs());
  // Why there is no radio, the reconnect loop's position and the companion's clock against
  // the PC's (P1-07).
  const reason = $derived(radioState === "disconnected" ? radio.disconnectReason() : null);
  const reconnecting = $derived(radio.reconnecting());
  const countdownMs = $derived(radio.reconnectCountdownMs());
  const clockDrift = $derived(radio.clockDriftSeconds());
  const driftTooLarge = $derived(clockDrift !== null && Math.abs(clockDrift) > CLOCK_DRIFT_LIMIT_S);
  const connected = $derived(radioState === "connected" || radioState === "blind");
  // The state chip's tint, as the bar's chip (lib/statusChips.ts): connected grey, connecting
  // warn, blind and disconnected danger.
  const tint = $derived(
    radioState === "connected" ? "neutral" : radioState === "connecting" ? "warn" : "danger",
  );
  // Newest line on top (P1-01): the store keeps the log oldest first.
  const log = $derived([...radio.log()].reverse());

  function describe(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }

  async function connect(kind: TransportKind) {
    error = null;
    busy = true;
    try {
      await radio.connect(kind);
    } catch (failure) {
      error = t("radio.connectFailed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  async function disconnect() {
    busy = true;
    try {
      await radio.disconnect();
    } finally {
      busy = false;
    }
  }

  function reconnect() {
    error = null;
    radio.reconnectNow();
  }

  async function refresh() {
    error = null;
    busy = true;
    try {
      await radio.refreshContacts();
    } catch (failure) {
      error = t("radio.contacts.refreshFailed", { error: describe(failure) });
    } finally {
      busy = false;
    }
  }

  function formatAdvert(epochSeconds: number): string {
    if (epochSeconds === 0) {
      return t("radio.contacts.never");
    }
    return new Date(epochSeconds * 1000).toLocaleString(language(), {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  function typeName(type: number): string {
    return type >= ADV_TYPE_NONE && type <= ADV_TYPE_SENSOR
      ? t(`radio.contactType.${type}`)
      : String(type);
  }
</script>

<!-- The page heading is for assistive technology; the state card's title names the screen. -->
<h1 class="visually-hidden">{t("radio.title")}</h1>

<div class="column">
  <section class="card state" aria-labelledby="radio-state-heading" data-radio-state>
    <h2 id="radio-state-heading" class="card-title">
      <span>{t("topbar.radio")}</span>
      <span class="chip {chipClass(tint)}" role="status" data-state={radioState}>
        <Icon name="radio" />{t(`radio.status.${radioState}`)}{#if reason !== null}
          · {disconnectReasonText(reason)}{/if}
      </span>
    </h2>
    <p class="msg">{t("radio.intro")}</p>

    <!-- One sentence when the browser has neither API; otherwise only the transport the
         browser lacks is replaced by its reason (P1-07). -->
    {#if capability === "none"}
      <p class="msg msg-danger" role="alert"><Icon name="warning" />{t("radio.unsupported")}</p>
    {:else}
      <div class="form-actions">
        {#if radioState === "disconnected"}
          {#if capability !== "ble"}
            <button
              type="button"
              class="btn btn-primary"
              disabled={busy}
              onclick={() => connect("usb")}
            >
              <Icon name="radio" />{t("radio.connectUsb")}
            </button>
          {:else}
            <span class="msg">{t("radio.noSerial")}</span>
          {/if}
          {#if capability !== "usb"}
            <button
              type="button"
              class="btn btn-primary"
              disabled={busy}
              onclick={() => connect("ble")}
            >
              <Icon name="radio" />{t("radio.connectBle")}
            </button>
          {:else}
            <span class="msg">{t("radio.noBluetooth")}</span>
          {/if}
          {#if radio.canReconnect()}
            <button type="button" class="btn" disabled={busy} onclick={reconnect}>
              <Icon name="retry" />{t("radio.reconnect")}
            </button>
          {/if}
        {:else}
          <button type="button" class="btn" disabled={busy} onclick={disconnect}>
            <Icon name="close" />{t("radio.disconnect")}
          </button>
        {/if}
      </div>
    {/if}

    {#if reconnecting !== null}
      <p class="msg msg-warn" role="status">
        <Icon name="retry" />
        {#if countdownMs !== null}
          {t("radio.reconnecting", {
            attempt: reconnecting.attempt,
            seconds: Math.ceil(countdownMs / 1000),
          })}
        {:else}
          {t("radio.reconnectingNow", { attempt: reconnecting.attempt })}
        {/if}
      </p>
    {/if}
    {#if elapsed !== null && radioState !== "connecting"}
      <p class="msg">{t("radio.heard", { elapsed: formatElapsed(elapsed) })}</p>
    {/if}
    <p class="msg">{t("radio.blindHelp", { minutes: settings.blindAfterMinutes })}</p>
    {#if error}
      <p class="msg msg-danger" role="alert"><Icon name="warning" />{error}</p>
    {/if}
    {#if clockDrift !== null && driftTooLarge}
      <p class="msg msg-warn" role="alert">
        <Icon name="clock" />{t(
          clockDrift > 0 ? "radio.clockDrift.ahead" : "radio.clockDrift.behind",
          { elapsed: formatElapsed(Math.abs(clockDrift) * 1000) },
        )}
      </p>
    {/if}

    {#if selfInfo}
      <h3 class="self-heading">{t("radio.self.title")}</h3>
      <dl class="dl">
        <dt>{t("radio.self.name")}</dt>
        <dd>{selfInfo.name}</dd>
        <dt>{t("radio.self.publicKey")}</dt>
        <dd><code>{selfInfo.publicKey}</code></dd>
        <dt>{t("radio.self.firmware")}</dt>
        <dd>
          {#if device}
            {device.firmwareVersion || t("radio.self.unknown")} ({device.firmwareBuildDate ||
              t("radio.self.unknown")})
          {:else}
            {t("radio.self.unknown")}
          {/if}
        </dd>
        <dt>{t("radio.self.model")}</dt>
        <dd>{device?.manufacturerModel || t("radio.self.unknown")}</dd>
        <dt>{t("radio.self.radio")}</dt>
        <dd>
          {t("radio.self.radioParams", {
            mhz: (selfInfo.radioFreqKhz / 1000).toFixed(3),
            khz: (selfInfo.radioBwHz / 1000).toFixed(0),
            sf: selfInfo.radioSf,
            cr: selfInfo.radioCr,
            dbm: selfInfo.txPower,
          })}
        </dd>
      </dl>
    {/if}
  </section>

  {#if connected}
    <section class="card" aria-labelledby="contacts-heading" data-radio-contacts>
      <h2 id="contacts-heading" class="card-title">
        <span>{t("radio.contacts.title")} <span class="count">{contacts.length}</span></span>
        <button type="button" class="btn btn-compact" disabled={busy} onclick={refresh}>
          <Icon name="retry" />{t("radio.contacts.refresh")}
        </button>
      </h2>
      {#if contacts.length === 0}
        <p class="msg">{t("radio.contacts.empty")}</p>
      {:else}
        <div class="table-box contacts">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">{t("radio.contacts.name")}</th>
                <th scope="col">{t("radio.contacts.publicKey")}</th>
                <th scope="col">{t("radio.contacts.lastAdvert")}</th>
                <th scope="col">{t("radio.contacts.type")}</th>
              </tr>
            </thead>
            <tbody>
              {#each contacts as contact (contact.publicKey)}
                <tr>
                  <td class="label">{contact.name}</td>
                  <td><code title={contact.publicKey}>{contact.publicKey.slice(0, 12)}…</code></td>
                  <td class="advert">{formatAdvert(contact.lastAdvert)}</td>
                  <td>{typeName(contact.type)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}

  <section class="card" aria-labelledby="log-heading" data-radio-log>
    <h2 id="log-heading" class="card-title">
      <span>{t("radio.log.title")} <span class="count">{log.length}</span></span>
      <button
        type="button"
        class="btn btn-quiet btn-compact"
        disabled={log.length === 0}
        onclick={() => radio.clearLog()}
      >
        <Icon name="close" />{t("radio.log.clear")}
      </button>
    </h2>
    {#if log.length === 0}
      <p class="msg">{t("radio.log.empty")}</p>
    {:else}
      <div class="rows-box log">
        <ol class="rows rows-log">
          {#each log as line, index (line + index)}
            <li>{line}</li>
          {/each}
        </ol>
      </div>
    {/if}
  </section>
</div>

<style>
  /* Layout only: one column of cards; the contacts and the log scroll in their boxes. */
  .column {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }

  .state {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }

  .state .card-title {
    margin-bottom: 0;
  }

  .self-heading {
    margin: var(--s-2) 0 0;
  }

  .msg {
    margin: 0;
  }

  .advert {
    white-space: nowrap;
  }

  .contacts {
    max-height: 24rem;
  }

  .log {
    max-height: 20rem;
  }
</style>
