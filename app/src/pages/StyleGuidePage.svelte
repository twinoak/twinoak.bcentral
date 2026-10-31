<script lang="ts">
  // The style guide (P2-01): every component of docs/design.md in every variant and state,
  // the colour pairs with the contrast ratios the test holds them to, the type scale, the
  // spacing and the icons — the page the reviewer looks at first. Reached by URL
  // (#/styleguide) and from Settings → About; not in the navigation. Every sample is the
  // component class as the screens use it; this file's own <style> only lays the samples
  // out. The sample words are the app's own strings, so the page reads in the UI language.
  import { CHROME_MIN, contrastRatio, PAIRS, TEXT_MIN } from "../../scripts/contrast.mjs";
  import Icon from "../components/Icon.svelte";
  import { t } from "../i18n/index.svelte.ts";
  import { ICON_NAMES } from "../lib/icons.ts";
  import { settings } from "../lib/settings.svelte.ts";

  const COLOUR_TOKENS = [
    "--bg",
    "--surface",
    "--surface-2",
    "--ink",
    "--ink-2",
    "--rule",
    "--rule-2",
    "--accent",
    "--accent-weak",
    "--on-accent",
    "--ok",
    "--ok-bg",
    "--warn",
    "--warn-bg",
    "--danger",
    "--danger-bg",
    "--drill",
    "--drill-bg",
    "--focus",
  ];
  const TYPE_SCALE = ["--fs-13", "--fs-14", "--fs-16", "--fs-18", "--fs-20", "--fs-24"];
  const WEIGHTS = [400, 500, 600];
  const SPACES = ["--s-1", "--s-2", "--s-3", "--s-4", "--s-5", "--s-6", "--s-7"];
  const RADII = ["--r-1", "--r-2"];

  // The token values as the browser resolves them now (the aliases followed), read again
  // when the contrast mode changes, so the ratios printed are the ones on screen.
  let values: Record<string, string> = $state({});
  $effect(() => {
    void settings.highContrast;
    const style = getComputedStyle(document.documentElement);
    const next: Record<string, string> = {};
    for (const token of [...COLOUR_TOKENS, ...TYPE_SCALE, ...SPACES, ...RADII]) {
      next[token] = style.getPropertyValue(token).trim();
    }
    values = next;
  });

  function ratio(fg: string, bg: string): string {
    const a = values[fg];
    const b = values[bg];
    if (a === undefined || b === undefined || a === "" || b === "") {
      return "";
    }
    return contrastRatio(a, b).toFixed(2);
  }

  const STATUSES = ["sent", "delivered", "roger", "pending", "given_up"] as const;
  const STATUS_CHIP: Record<(typeof STATUSES)[number], { variant: string; outline: boolean }> = {
    sent: { variant: "", outline: false },
    delivered: { variant: "chip-ok", outline: true },
    roger: { variant: "chip-ok", outline: false },
    pending: { variant: "chip-warn", outline: false },
    given_up: { variant: "chip-danger", outline: false },
  };

  let activeTab = $state(0);
</script>

<h1>{t("styleguide.title")}</h1>
<p>{t("styleguide.intro")}</p>
<p>{t("styleguide.interact")}</p>

<!-- Colour: every token with its value, then every checked pair with its ratio. -->
<section class="card">
  <h2 class="card-title">{t("styleguide.colour")}</h2>
  <div class="swatches">
    {#each COLOUR_TOKENS as token (token)}
      <div class="swatch">
        <span class="swatch-colour" style="background: var({token})"></span>
        <code>{token}</code>
        <span class="swatch-value">{values[token] ?? ""}</span>
      </div>
    {/each}
  </div>
  <div class="table-scroll">
    <table class="table">
      <thead>
        <tr>
          <th>fg</th>
          <th>bg</th>
          <th>Aa</th>
          <th class="num">:1</th>
          <th class="num">min</th>
          <th>kind</th>
          <th>what</th>
        </tr>
      </thead>
      <tbody>
        {#each PAIRS as pair (pair.fg + pair.bg + pair.kind)}
          <tr>
            <td><code>{pair.fg}</code></td>
            <td><code>{pair.bg}</code></td>
            <td>
              <span class="pair-sample" style="color: var({pair.fg}); background: var({pair.bg})"
                >Aa 0123</span
              >
            </td>
            <td class="num">{ratio(pair.fg, pair.bg)}</td>
            <td class="num">{pair.kind === "text" ? TEXT_MIN : CHROME_MIN}</td>
            <td>{pair.kind}</td>
            <td>{pair.what}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<!-- Type: the six sizes at the three weights, and tabular numbers lining up. -->
<section class="card">
  <h2 class="card-title">{t("styleguide.type")}</h2>
  <div class="type-scale">
    {#each TYPE_SCALE as token (token)}
      <div class="type-row">
        <code>{token} = {values[token] ?? ""}</code>
        {#each WEIGHTS as weight (weight)}
          <span style="font-size: var({token}); font-weight: {weight}">
            {t("handover.intro")}
          </span>
        {/each}
      </div>
    {/each}
    <div class="type-row">
      <code>tnum</code>
      <span>08:04:17 · 11:58:03 · 0123456789</span>
      <span>#7 #12 #99 · 160 / 160</span>
    </div>
  </div>
</section>

<!-- Space, radius, depth: the 4 px grid, the two radii, the one shadow. -->
<section class="card">
  <h2 class="card-title">{t("styleguide.space")}</h2>
  <div class="spaces">
    {#each SPACES as token (token)}
      <div class="space-row">
        <code>{token} = {values[token] ?? ""}</code>
        <span class="space-bar" style="width: var({token})"></span>
      </div>
    {/each}
  </div>
  <div class="samples">
    {#each RADII as token (token)}
      <div class="radius-sample" style="border-radius: var({token})">
        <code>{token} = {values[token] ?? ""}</code>
      </div>
    {/each}
    <div class="shadow-sample"><code>--shadow</code></div>
  </div>
</section>

<!-- Icons: the whole set, with its names. -->
<section class="card">
  <h2 class="card-title">{t("styleguide.icons")}</h2>
  <div class="icons">
    {#each ICON_NAMES as name (name)}
      <div class="icon-sample">
        <Icon {name} />
        <code>{name}</code>
      </div>
    {/each}
  </div>
</section>

<h2>{t("styleguide.components")}</h2>

<!-- Buttons: the four variants, each enabled and disabled, and the icon-only button. -->
<section class="card">
  <h2 class="card-title"><code>.btn</code></h2>
  <div class="samples">
    <button type="button" class="btn btn-primary">{t("send.send")}</button>
    <button type="button" class="btn">{t("journal.export")}</button>
    <button type="button" class="btn btn-quiet">{t("journal.action.reply")}</button>
    <button type="button" class="btn btn-danger">{t("send.manual.given_up")}</button>
    <button type="button" class="btn btn-primary btn-icon" aria-label={t("send.send")}>
      <Icon name="send" />
    </button>
    <button type="button" class="btn btn-icon" aria-label={t("print.print")}>
      <Icon name="print" />
    </button>
    <button type="button" class="btn btn-quiet btn-icon" aria-label={t("shortcuts.close")}>
      <Icon name="close" />
    </button>
    <button type="button" class="btn"><Icon name="export" />{t("journal.export")}</button>
  </div>
  <div class="samples">
    <button type="button" class="btn btn-primary" disabled>{t("send.send")}</button>
    <button type="button" class="btn" disabled>{t("journal.export")}</button>
    <button type="button" class="btn btn-quiet" disabled>{t("journal.action.reply")}</button>
    <button type="button" class="btn btn-danger" disabled>{t("send.manual.given_up")}</button>
    <button type="button" class="btn btn-icon" disabled aria-label={t("print.print")}>
      <Icon name="print" />
    </button>
  </div>
</section>

<!-- Fields: label, help, error; select, textarea, read-only, disabled, a checkbox. -->
<section class="card">
  <h2 class="card-title"><code>.field</code></h2>
  <div class="fields">
    <div class="field">
      <label for="sg-text">{t("settings.operatorName")}</label>
      <input id="sg-text" type="text" />
      <span class="field-help">{t("settings.operatorNameHelp")}</span>
    </div>
    <div class="field">
      <label for="sg-invalid">{t("settings.operatorName")}</label>
      <input id="sg-invalid" type="text" aria-invalid="true" aria-describedby="sg-invalid-error" />
      <span class="field-error" id="sg-invalid-error">
        <Icon name="warning" />{t("settings.operatorNameRequired")}
      </span>
    </div>
    <div class="field">
      <label for="sg-select">{t("send.recipient")}</label>
      <select id="sg-select">
        <option>{t("nav.journal")}</option>
        <option>{t("nav.handover")}</option>
        <option>{t("nav.register")}</option>
      </select>
    </div>
    <div class="field">
      <label for="sg-textarea">{t("send.text")}</label>
      <textarea id="sg-textarea" rows="3"></textarea>
      <span class="field-help">{t("send.textHelp", { prefix: "#12 " })}</span>
    </div>
    <div class="field">
      <label for="sg-readonly">{t("settings.deviceId")}</label>
      <input id="sg-readonly" type="text" readonly value="01JBQ6M3Z8K9X2Y4W5V6U7T8S9" />
      <span class="field-help">{t("settings.deviceIdHelp")}</span>
    </div>
    <div class="field">
      <label for="sg-disabled">{t("settings.operatorName")}</label>
      <input id="sg-disabled" type="text" disabled value={t("settings.operatorName")} />
    </div>
    <div class="field">
      <label class="check">
        <input type="checkbox" checked />
        {t("settings.clockConfirm")}
      </label>
      <label class="check">
        <input type="checkbox" />
        {t("settings.highContrast")}
      </label>
    </div>
  </div>
</section>

<!-- Chips: the status pairs with a dot, with a glyph, as a button, in high contrast. -->
<section class="card">
  <h2 class="card-title"><code>.chip</code></h2>
  <div class="samples">
    <span class="chip"><span class="chip-dot"></span>{t("journal.status.sent")}</span>
    <span class="chip chip-ok"
      ><span class="chip-dot chip-dot-outline"></span>{t("journal.status.delivered")}</span
    >
    <span class="chip chip-ok"><span class="chip-dot"></span>{t("journal.status.roger")}</span>
    <span class="chip chip-warn"><span class="chip-dot"></span>{t("journal.status.pending")}</span>
    <span class="chip chip-danger"
      ><span class="chip-dot"></span>{t("journal.status.given_up")}</span
    >
    <span class="chip chip-drill"><Icon name="drill" />{t("drill.onAir")}</span>
    <span class="chip chip-accent"><span class="chip-dot"></span>{t("nav.journal")}</span>
  </div>
  <div class="samples">
    <span class="chip"><span class="glyph">✓</span>{t("journal.status.delivered")}</span>
    <span class="chip chip-ok"><Icon name="check" />{t("radio.status.connected")}</span>
    <span class="chip chip-warn"><Icon name="clock" />{t("settings.clockTrust.unknown")}</span>
    <span class="chip chip-danger"><Icon name="warning" />{t("radio.status.blind")}</span>
    <button type="button" class="chip"><Icon name="radio" />{t("topbar.radio")}</button>
    <button type="button" class="chip chip-warn"
      ><Icon name="storage" />{t("settings.storage")}</button
    >
    <button type="button" class="chip chip-warn"><Icon name="update" />{t("update.reload")}</button>
    <span class="chip">{t("handover.open.title", { count: 3 })}</span>
  </div>
</section>

<!-- The status strip: the run of chips a journal row carries. -->
<section class="card">
  <h2 class="card-title"><code>.strip</code></h2>
  <div class="samples">
    <span class="strip">
      {#each STATUSES as status (status)}
        <span class="chip {STATUS_CHIP[status].variant}">
          <span class="chip-dot" class:chip-dot-outline={STATUS_CHIP[status].outline}></span>
          {t(`journal.status.${status}`)}
        </span>
      {/each}
    </span>
  </div>
</section>

<!-- Cards: a card with a count in its title, a card with an action in its title. -->
<section class="card">
  <h2 class="card-title"><code>.card</code></h2>
  <div class="samples cards">
    <div class="card">
      <h3 class="card-title">{t("journal.open.title")} <span class="count">3</span></h3>
      <p>{t("handover.open.help")}</p>
    </div>
    <div class="card">
      <h3 class="card-title">
        {t("journal.heard.title")}
        <button type="button" class="btn btn-quiet">{t("register.add")}</button>
      </h3>
      <p>{t("journal.heard.empty")}</p>
    </div>
  </div>
</section>

<!-- Tabs: two forms of the same kind in one card. -->
<section class="card">
  <h2 class="card-title"><code>.tabs</code></h2>
  <div class="tabs" role="tablist">
    <button
      type="button"
      class="tab"
      role="tab"
      aria-selected={activeTab === 0}
      onclick={() => (activeTab = 0)}>{t("journal.compose.title")}</button
    >
    <button
      type="button"
      class="tab"
      role="tab"
      aria-selected={activeTab === 1}
      onclick={() => (activeTab = 1)}>{t("journal.add.title")}</button
    >
  </div>
  <p>{activeTab === 0 ? t("send.textHelp", { prefix: "#12 " }) : t("journal.add.kind.note")}</p>
</section>

<!-- Table: header, numbers right, a selected row. -->
<section class="card">
  <h2 class="card-title"><code>.table</code></h2>
  <div class="table-scroll">
    <table class="table">
      <thead>
        <tr>
          <th>{t("journal.entries.time")}</th>
          <th>{t("register.field.label")}</th>
          <th>{t("register.field.street")}</th>
          <th>{t("journal.timeline.status")}</th>
          <th class="num">{t("handover.column.age")}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>08:04</td>
          <td>{t("register.field.person")} A</td>
          <td>{t("register.field.street")} 1</td>
          <td
            ><span class="chip chip-ok"
              ><span class="chip-dot"></span>{t("journal.status.roger")}</span
            ></td
          >
          <td class="num">3 min</td>
        </tr>
        <tr aria-selected="true">
          <td>08:12</td>
          <td>{t("register.field.person")} B</td>
          <td>{t("register.field.street")} 12</td>
          <td
            ><span class="chip chip-warn"
              ><span class="chip-dot"></span>{t("journal.status.pending")}</span
            ></td
          >
          <td class="num">11 min</td>
        </tr>
        <tr>
          <td>08:30</td>
          <td>{t("register.field.person")} C</td>
          <td>{t("register.field.street")} 4</td>
          <td
            ><span class="chip chip-danger"
              ><span class="chip-dot"></span>{t("journal.status.given_up")}</span
            ></td
          >
          <td class="num">1 h 5 min</td>
        </tr>
      </tbody>
    </table>
  </div>
</section>

<!-- Row list: time | who | body | strip, a current row, an expanded row with its history. -->
<section class="card">
  <h2 class="card-title"><code>.rows</code></h2>
  <ol class="rows">
    <li>
      <span class="row-time">08:30:12</span>
      <span class="row-who">{t("register.field.person")} C</span>
      <span class="row-body">#3 {t("handover.quiet.requestHelp")}</span>
      <span class="row-strip strip">
        <span class="chip"><span class="chip-dot"></span>{t("journal.status.sent")}</span>
        <span class="chip chip-warn"
          ><span class="chip-dot"></span>{t("journal.status.pending")}</span
        >
      </span>
    </li>
    <li aria-current="true">
      <span class="row-time">08:12:40</span>
      <span class="row-who">{t("register.field.person")} B</span>
      <span class="row-body">{t("handover.intro")}</span>
      <span class="row-strip">
        <button type="button" class="btn btn-quiet"
          ><Icon name="reply" />{t("journal.action.reply")}</button
        >
      </span>
    </li>
    <li>
      <span class="row-time">08:04:05</span>
      <span class="row-who">{t("register.field.person")} A</span>
      <span class="row-body">#1 {t("handover.quiet.requestHelp")}</span>
      <span class="row-strip strip">
        <span class="chip chip-ok"
          ><span class="chip-dot chip-dot-outline"></span>{t("journal.status.delivered")}</span
        >
        <span class="chip chip-ok"><span class="chip-dot"></span>{t("journal.status.roger")}</span>
      </span>
      <div class="row-detail">
        08:04:05 {t("journal.status.sent")} · 08:04:09 {t("journal.status.delivered")} · 08:06:51
        {t("journal.status.roger")}
      </div>
    </li>
  </ol>
</section>

<!-- Popover and toast: the two things that float. Shown in place here. -->
<section class="card">
  <h2 class="card-title"><span><code>.popover</code> <code>.toast</code></span></h2>
  <div class="samples floating">
    <div class="popover" role="group" aria-labelledby="sg-popover-title">
      <h3 class="popover-title" id="sg-popover-title">{t("topbar.radio")}</h3>
      <p>{t("send.noRadio")}</p>
      <div class="popover-actions">
        <button type="button" class="btn btn-primary">{t("radio.connectUsb")}</button>
      </div>
    </div>
    <div class="popover" role="group" aria-labelledby="sg-popover-clock">
      <h3 class="popover-title" id="sg-popover-clock">{t("settings.clock")}</h3>
      <p>{t("settings.clockTrust.unknown")}</p>
      <label class="check">
        <input type="checkbox" />
        {t("settings.clockConfirm")}
      </label>
    </div>
    <div class="toast" role="status"><Icon name="check" />{t("settings.saved")}</div>
  </div>
</section>

<!-- Inline messages: plain and the four status variants. -->
<section class="card">
  <h2 class="card-title"><code>.msg</code></h2>
  <div class="msgs">
    <p class="msg"><Icon name="history" />{t("settings.operatorNameHelp")}</p>
    <p class="msg msg-ok"><Icon name="check" />{t("settings.storage.persisted")}</p>
    <p class="msg msg-warn"><Icon name="clock" />{t("settings.clockTrust.unknown")}</p>
    <p class="msg msg-danger"><Icon name="warning" />{t("settings.operatorNameRequired")}</p>
    <p class="msg msg-drill"><Icon name="drill" />{t("journal.incident.drillHelp")}</p>
  </div>
</section>

<!-- Empty state: one sentence, one button. -->
<section class="card">
  <h2 class="card-title"><code>.empty</code></h2>
  <div class="empty">
    <p>{t("journal.entries.empty")}</p>
    <button type="button" class="btn btn-primary">{t("journal.compose.title")}</button>
  </div>
</section>

<style>
  /* Layout of the samples only: no colour, no size of its own. */
  section.card {
    margin-bottom: var(--s-5);
  }

  .samples {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-3);
    margin-bottom: var(--s-3);
  }

  .samples.cards {
    align-items: stretch;
  }

  .samples.cards > .card {
    flex: 1 1 18rem;
  }

  .samples.floating {
    align-items: flex-start;
  }

  .samples.floating > .popover,
  .samples.floating > .toast {
    position: static;
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: var(--s-3);
    margin-bottom: var(--s-4);
  }

  .swatch {
    display: grid;
    grid-template-columns: var(--s-7) 1fr;
    grid-template-rows: auto auto;
    column-gap: var(--s-2);
    align-items: center;
  }

  .swatch-colour {
    grid-row: 1 / 3;
    height: var(--s-7);
    border: 1px solid var(--rule);
    border-radius: var(--r-1);
  }

  .swatch-value {
    font-size: var(--fs-13);
    color: var(--ink-2);
  }

  .pair-sample {
    display: inline-block;
    padding: var(--s-1) var(--s-2);
    border-radius: var(--r-1);
  }

  .type-scale,
  .spaces,
  .fields,
  .msgs {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }

  .spaces {
    margin-bottom: var(--s-4);
  }

  .type-row,
  .space-row {
    display: grid;
    grid-template-columns: 10rem 1fr;
    gap: var(--s-2) var(--s-4);
    align-items: baseline;
  }

  .type-row > span {
    grid-column: 2;
  }

  .space-bar {
    height: var(--s-4);
    background: var(--accent);
  }

  .radius-sample,
  .shadow-sample {
    padding: var(--s-4);
    border: 1px solid var(--rule);
    background: var(--surface);
  }

  .shadow-sample {
    border-radius: var(--r-2);
    box-shadow: var(--shadow);
  }

  .icons {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
    gap: var(--s-3);
  }

  .icon-sample {
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }

  .fields {
    max-width: 28rem;
  }

  .field .check {
    color: var(--ink);
    font-size: var(--fs-16);
    font-weight: 400;
  }
</style>
