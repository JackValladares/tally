// Wires the catalogue's #lib section and the live chart mounts to the
// actual lib/ modules bundled into dist/tally.js, and replaces the
// dashboard mock's inline tab script with the reusable Tabs component.
// This file is intentionally the only place in the catalogue that
// imports from the built bundle rather than being pure markup — it is
// the demonstration that the library is real code, not just CSS. It
// renders through html()/render() itself, the same as any component
// under lib/components, rather than reaching for .innerHTML directly.
//
// Requires the fixture server (`npm run catalog`, not a bare file://
// open) so /api/v1/* and /__state/* resolve.

import { html, initTabs, mountChartFrame, query, render, resource } from "../dist/tally.js";

function mountLibHtmlDemo() {
  const el = document.getElementById("libHtmlDemo");
  if (!el) return;
  const params = query({ memberId: "clx8mem001", from: "2026-05-20", to: "2026-08-20" });
  const untrusted = `<img src="x" onerror="console.log(1)"> & "quotes"`;
  render(
    el,
    html`<div class="l-stack" style="--stack-gap: var(--space-2)">
      <div>
        <span class="t-eyebrow">query({ memberId, from, to })</span>
        <pre class="t-small u-num">/api/v1/summary?${params.toString()}</pre>
      </div>
      <div>
        <span class="t-eyebrow">html interpolating an untrusted string</span>
        <pre class="t-small">${untrusted}</pre>
        <span class="t-small t-muted">rendered as text, not executed — that is the whole point of escaping by default</span>
      </div>
    </div>`,
  );
}

function moneyRow(t) {
  // The one rule this row exists to demonstrate: merchantDisplay ?? description,
  // with no field, class or attribute anywhere saying whether a name was hidden.
  const label = t.merchantDisplay ?? t.description;
  const negative = t.direction === "EXPENSE";
  const amount = t.amount.toLocaleString("en-US", { minimumFractionDigits: 2 });
  return html`<div class="t-acct">
    <span class="t-badge" data-direction="${t.direction}">${t.direction}</span>
    <span>${label}</span>
    <span class="t-money t-money--sm" data-valence="${negative ? "" : "positive"}"
      >${negative ? html`<span class="t-money__sign">−</span>` : ""}<span class="t-money__cur">$</span>${amount}</span
    >
  </div>`;
}

function renderResourceState(el, state, lastGood) {
  if (state.status === "loading" && !lastGood) {
    render(
      el,
      html`<div class="l-stack" style="--stack-gap: var(--space-2)">
        <span class="t-skeleton" style="inline-size: 40%"></span>
        <span class="t-skeleton" style="inline-size: 70%"></span>
      </div>`,
    );
    return;
  }
  if (state.status === "loading" && lastGood) {
    // Sync running: the panel keeps its last data rather than blanking to a
    // skeleton (ten-state table, spec §5) — shown here as a caution status
    // rather than swapping the rows out from under the reader.
    render(
      el,
      html`<div class="l-stack" style="--stack-gap: var(--space-2)">
        <span class="t-status" data-health="caution">Refreshing · showing last synced data</span>
        ${lastGood.items.slice(0, 3).map(moneyRow)}
      </div>`,
    );
    return;
  }
  if (state.status === "error") {
    render(
      el,
      html`<div class="t-error">
        <span aria-hidden="true">◆</span>
        <div><strong>Couldn't reach the fixture server</strong>Try again, or check <code>npm run catalog</code> is running.</div>
      </div>`,
    );
    return;
  }
  if (state.status === "empty") {
    render(
      el,
      html`<div class="t-empty">
        <strong>No transactions for this range</strong>
        <span>The "empty" fixture state renders this instead of a blank list.</span>
      </div>`,
    );
    return;
  }
  if (state.status === "idle") {
    render(el, html`<span class="t-muted t-small">idle</span>`);
    return;
  }
  render(
    el,
    html`<div class="l-stack" style="--stack-gap: var(--space-1)">
      ${state.data.items.slice(0, 3).map(moneyRow)}
    </div>`,
  );
}

function mountLibResourceDemo() {
  const el = document.getElementById("libResourceDemo");
  const switcher = document.getElementById("libStateSwitch");
  if (!el || !switcher) return;
  let lastGood = null;
  const transactions = resource(
    "transactions",
    (signal) =>
      fetch(`/api/v1/transactions?${query({ from: "2026-05-20", to: "2026-08-20" }).toString()}`, {
        signal,
      }).then((r) => {
        if (!r.ok) throw new Error(`transactions: ${r.status}`);
        return r.json();
      }),
    { isEmpty: (data) => data.items.length === 0 },
  );
  transactions.subscribe((state) => {
    if (state.status === "ready") lastGood = state.data;
    renderResourceState(el, state, lastGood);
  });
  renderResourceState(el, transactions.get(), lastGood);

  switcher.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-fixture-state]");
    if (!button) return;
    const next = button.getAttribute("data-fixture-state");
    await fetch(`/__state/${next}`);
    // "midsync" has no transactions.json of its own — the fixture server
    // falls back to "populated" for it, same as the ten-state table's
    // "sync running: panels keep last data" row, so this reload is the
    // demo rather than a workaround for a missing fixture.
    transactions.reload();
  });
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function chartLoadError(container, what) {
  render(
    container,
    html`<div class="t-error">
      <span aria-hidden="true">◆</span>
      <div><strong>Couldn't load ${what}</strong>Run this page via <code>npm run catalog</code> so /api/v1 resolves.</div>
    </div>`,
  );
}

function mountLibChart() {
  const el = document.getElementById("libChartFrame");
  const note = document.getElementById("libChartNote");
  if (!el) return;
  const series = resource("transactions/series", (signal) =>
    fetch(
      `/api/v1/transactions/series?${query({ from: "2026-05-20", to: "2026-08-20" }).toString()}`,
      { signal },
    ).then((r) => {
      if (!r.ok) throw new Error(`series: ${r.status}`);
      return r.json();
    }),
  );
  series.subscribe((state) => {
    if (state.status === "error") {
      chartLoadError(el, "the trend");
      return;
    }
    if (state.status !== "ready") return;
    mountChartFrame(el, { kind: "series", data: state.data });
    if (note) {
      note.textContent = `bucketed by ${state.data.bucket}, ${state.data.expenseCumulative.length} points`;
    }
  });
}

function mountDashboardCharts() {
  const cash = document.getElementById("mockCashChart");
  const liq = document.getElementById("mockLiqChart");
  if (cash) {
    fetchJson("/api/v1/transactions/series")
      .then((data) => mountChartFrame(cash, { kind: "series", data }))
      .catch(() => chartLoadError(cash, "the trend"));
  }
  if (liq) {
    fetchJson("/api/v1/liquidity/history")
      .then((data) => mountChartFrame(liq, { kind: "liquidity", data }))
      .catch(() => chartLoadError(liq, "liquidity history"));
  }
}

function mountDashboardTabs() {
  const tablist = document.getElementById("mockTabs");
  if (tablist) initTabs(tablist);
}

window.addEventListener("DOMContentLoaded", () => {
  mountLibHtmlDemo();
  mountLibResourceDemo();
  mountLibChart();
  mountDashboardCharts();
  mountDashboardTabs();
});
