<script lang="ts">
  import { t, language } from "../i18n/index.svelte.ts";
  import { settings } from "../lib/settings.svelte.ts";
  import { formatElapsed } from "../lib/elapsed.ts";
  import { radio, transportSupport } from "../radio/index.ts";
  import { ADV_TYPE_NONE, ADV_TYPE_SENSOR, type TransportKind } from "../radio/serial.ts";

  let busy = $state(false);
  let error: string | null = $state(null);

  const radioState = $derived(radio.state());
  const selfInfo = $derived(radio.selfInfo());
  const device = $derived(radio.deviceInfo());
  const contacts = $derived(radio.contacts());
  const elapsed = $derived(radio.elapsedMs());
  // Newest line on top (P1-01): the store keeps the log oldest first.
  const log = $derived([...radio.log()].reverse());
  const anySupport = transportSupport.usb || transportSupport.ble;

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

<h1>{t("radio.title")}</h1>
<p class="intro">{t("radio.intro")}</p>

{#if !anySupport}
  <p class="error" role="alert">{t("radio.unsupported")}</p>
{/if}

<p class="status" data-state={radioState}>
  <strong>{t(`radio.status.${radioState}`)}</strong>
  {#if elapsed !== null && radioState !== "connecting"}
    · {t("radio.heard", { elapsed: formatElapsed(elapsed) })}
  {/if}
</p>
<p class="muted">{t("radio.blindHelp", { minutes: settings.blindAfterMinutes })}</p>

<div class="actions">
  {#if radioState === "disconnected"}
    <button type="button" disabled={busy || !transportSupport.usb} onclick={() => connect("usb")}>
      {t("radio.connectUsb")}
    </button>
    <button type="button" disabled={busy || !transportSupport.ble} onclick={() => connect("ble")}>
      {t("radio.connectBle")}
    </button>
  {:else}
    <button type="button" class="secondary" disabled={busy} onclick={disconnect}>
      {t("radio.disconnect")}
    </button>
  {/if}
</div>

{#if error}
  <p class="error" role="alert">{error}</p>
{/if}

{#if selfInfo}
  <section aria-labelledby="self-heading">
    <h2 id="self-heading">{t("radio.self.title")}</h2>
    <dl>
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
  </section>
{/if}

{#if radioState !== "disconnected" && radioState !== "connecting"}
  <section aria-labelledby="contacts-heading">
    <div class="actions">
      <h2 id="contacts-heading">{t("radio.contacts.title")}</h2>
      <button type="button" class="secondary small" disabled={busy} onclick={refresh}>
        {t("radio.contacts.refresh")}
      </button>
    </div>
    {#if contacts.length === 0}
      <p class="muted">{t("radio.contacts.empty")}</p>
    {:else}
      <table>
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
              <td>{formatAdvert(contact.lastAdvert)}</td>
              <td>{typeName(contact.type)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
{/if}

<section aria-labelledby="log-heading">
  <h2 id="log-heading">{t("radio.log.title")}</h2>
  {#if log.length === 0}
    <p class="muted">{t("radio.log.empty")}</p>
  {:else}
    <pre class="log">{log.join("\n")}</pre>
  {/if}
</section>

<style>
  .intro,
  .muted {
    color: var(--muted);
  }

  .status[data-state="blind"] strong {
    color: var(--error);
  }

  .status[data-state="connected"] strong {
    color: var(--ok);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .actions h2 {
    margin: 0;
  }

  .error {
    color: var(--error);
  }

  section {
    margin-top: 1.5rem;
  }

  h2 {
    font-size: 1.1rem;
    margin: 0 0 0.5rem;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    margin: 0;
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
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

  .secondary {
    background: #fff;
    color: var(--navy);
  }

  .small {
    padding: 0.25rem 0.6rem;
  }

  .log {
    max-height: 20rem;
    overflow: auto;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: #fff;
    font-size: 0.85rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
