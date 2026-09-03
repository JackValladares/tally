// Tabs: the ARIA tabs pattern with a roving tabindex, and the active tab
// kept in the URL hash so a reload or a shared link lands on the same
// panel. Takes an existing `[role="tablist"]` — each `[role="tab"]` names
// its panel with `aria-controls` — and wires the interaction; it does not
// render the markup (the catalogue and the dashboard pattern already
// compose Tabs from Button in CSS). Panels are matched by id and toggled
// with `hidden`, which the reset's `[hidden] { display: none !important }`
// guarantees stays hidden under a later layer's `display: grid`.

export interface TabsHandle {
  /** Select a tab by its panel id (the value of its `aria-controls`). */
  select(panelId: string): void;
  /** Remove the tablist's event listeners. */
  destroy(): void;
}

function panelFor(tab: Element): HTMLElement | null {
  const id = tab.getAttribute("aria-controls");
  return id ? document.getElementById(id) : null;
}

/** Wire up one `[role="tablist"]` element. Selecting a tab hides every
 * other panel, moves the roving `tabindex`, and replaces the URL hash
 * with the panel id (no history entry, so back/forward is unaffected). */
export function initTabs(tablist: HTMLElement): TabsHandle {
  const tabs = Array.from(tablist.querySelectorAll<HTMLElement>('[role="tab"]'));

  function selectTab(tab: HTMLElement, focus: boolean): void {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = panelFor(t);
      if (panel) panel.hidden = !on;
    }
    if (focus) tab.focus();
    const panelId = tab.getAttribute("aria-controls");
    if (panelId) {
      try {
        history.replaceState(null, "", `#${panelId}`);
      } catch {
        // history is unavailable (e.g. inside a sandboxed iframe); the tab
        // still switches, it just doesn't land in the URL.
      }
    }
  }

  function selectPanel(panelId: string): void {
    const tab = tabs.find((t) => t.getAttribute("aria-controls") === panelId);
    if (tab) selectTab(tab, false);
  }

  function onClick(event: MouseEvent): void {
    const tab = (event.target as Element).closest<HTMLElement>('[role="tab"]');
    if (tab && tabs.includes(tab)) selectTab(tab, false);
  }

  function onKeydown(event: KeyboardEvent): void {
    const active = document.activeElement;
    const index = active instanceof HTMLElement ? tabs.indexOf(active) : -1;
    if (index < 0) return;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : -1;
    if (next >= 0) {
      event.preventDefault();
      const tab = tabs[next];
      if (tab) selectTab(tab, true);
    }
  }

  tabs.forEach((tab, i) => {
    tab.tabIndex =
      i === 0 && !tabs.some((t) => t.getAttribute("aria-selected") === "true") ? 0 : -1;
    if (tab.getAttribute("aria-selected") === "true") tab.tabIndex = 0;
  });
  tablist.addEventListener("click", onClick);
  tablist.addEventListener("keydown", onKeydown);

  const fromHash = location.hash ? location.hash.slice(1) : "";
  if (fromHash && tabs.some((t) => t.getAttribute("aria-controls") === fromHash)) {
    selectPanel(fromHash);
  }

  return {
    select: selectPanel,
    destroy() {
      tablist.removeEventListener("click", onClick);
      tablist.removeEventListener("keydown", onKeydown);
    },
  };
}
