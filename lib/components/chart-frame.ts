// ChartFrame: the one shared frame behind the trend chart and the
// liquidity history chart. This exists because of audit finding F-05 —
// `preserveAspectRatio="none"` on the three dashboard charts stretched
// marks and axis text 2.8× horizontally, visible in every committed
// screenshot. The fix here is not "stop passing none" alone: the frame
// recomputes its own viewBox from the container's actual size on every
// resize, so the SVG's aspect ratio always matches what it is drawn
// into and nothing is ever non-uniformly scaled to fill a mismatched
// box. `preserveAspectRatio="none"` never appears in this file, or
// anywhere else in the client — scripts/check-tiers.mjs fails the build
// if it does.
//
// Two payload shapes come through the same frame:
//  - a pre-bucketed `Series` (both cumulative lines start at 0, spec §4)
//  - `LiquidityPoint[]`, irregularly spaced sync snapshots
//
// Components never fetch (scripts/check-tiers.mjs enforces it): a page
// resolves a `resource()` to one of these shapes and calls
// `mountChartFrame` with the result.

import { html, raw, render } from "../html.js";

export interface SeriesPoint {
  date: string;
  value: number;
}

/** A pre-bucketed trend series, per the backend spec: both cumulative
 * lines start at 0 so they are comparable without a client-side offset. */
export interface Series {
  from: string;
  to: string;
  bucket: string;
  actualThrough: string;
  expenseCumulative: SeriesPoint[];
  incomeCumulative: SeriesPoint[];
  /** Null when there is no prior period. A zero line would read as a
   *  claim that nothing was earned, which is why the server sends null. */
  referenceIncome: number | null;
  referenceLabel: string | null;
}

/** A liquidity snapshot captured at sync time. Spacing between points is
 * whatever the sync schedule produced — never assumed regular. */
export interface LiquidityPoint {
  capturedAt: string;
  totalSaved: number;
  totalDebt: number;
  netLiquidity: number;
}

export type ChartFrameInput =
  | { kind: "series"; data: Series }
  | { kind: "liquidity"; data: LiquidityPoint[] };

export interface ChartFrameHandle {
  /** Detach the ResizeObserver and event listeners. */
  destroy(): void;
}

const ASPECT = 720 / 230; // the frame's design ratio; height always follows width
const PAD = { top: 20, right: 12, bottom: 34, left: 52 };
const MIN_HISTORY_POINTS = 2; // fewer than this and the frame shows "not enough history yet"

interface Point {
  x: number;
  y: number;
  label: string;
  value: number;
}

function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function niceTicks(max: number, count: number): number[] {
  const step = max / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(step * i));
}

function toPoints(
  points: { date: string; value: number }[],
  xOf: (date: string) => number,
  yOf: (value: number) => number,
): Point[] {
  return points.map((p) => ({
    x: xOf(p.date),
    y: yOf(p.value),
    label: fmtDate(p.date),
    value: p.value,
  }));
}

function pathFor(points: Point[]): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
}

function areaFor(points: Point[], baselineY: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return "";
  return `${pathFor(points)} L${last.x.toFixed(1)},${baselineY} L${first.x.toFixed(1)},${baselineY} Z`;
}

/** The dashed "if this pace holds" tail, or null when the window has no
 *  unelapsed remainder to project into. */
interface Projection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
}

function buildGeometry(input: ChartFrameInput, width: number) {
  const height = width / ASPECT;
  const innerLeft = PAD.left;
  const innerRight = width - PAD.right;
  const innerTop = PAD.top;
  const innerBottom = height - PAD.bottom;
  const xOf = (t: number) => innerLeft + t * (innerRight - innerLeft);

  if (input.kind === "series") {
    const { expenseCumulative, incomeCumulative, referenceIncome, referenceLabel } = input.data;
    const dates = expenseCumulative.map((p) => p.date);
    const first = dates[0];
    const last = dates[dates.length - 1];
    const t0 = first ? Date.parse(first) : 0;
    const t1 = last ? Date.parse(last) : 1;
    const span = t1 - t0 || 1;
    const xOfDate = (d: string) => xOf((Date.parse(d) - t0) / span);
    const maxValue = Math.max(
      referenceIncome ?? 0,
      ...expenseCumulative.map((p) => p.value),
      ...incomeCumulative.map((p) => p.value),
      1,
    );
    const yDomainMax = maxValue * 1.08;
    const yOf = scaleLinear([0, yDomainMax], [innerBottom, innerTop]);
    const expensePts = toPoints(expenseCumulative, xOfDate, yOf);

    // "If this pace holds", carried flat from the last real datum to the end
    // of the requested window. Deliberately not a forecast, and deliberately
    // computed here rather than on the server: it is a presentation
    // affordance, and the server should not appear to assert it -- which is
    // exactly what `actualThrough` marks the boundary of.
    const throughT = Date.parse(input.data.actualThrough);
    const endT = Date.parse(input.data.to);
    const lastReal = expensePts[expensePts.length - 1] ?? null;
    const DAY = 86_400_000;
    let projection: Projection | null = null;
    if (lastReal && endT > throughT && throughT > t0) {
      const elapsedDays = Math.max((throughT - t0) / DAY, 1);
      const remainingDays = (endT - throughT) / DAY;
      const projectedValue = lastReal.value + (lastReal.value / elapsedDays) * remainingDays;
      // The x-scale spans the *data* (first to last bucket), but the
      // projection runs to the end of the *requested* window, which is
      // later -- so its endpoint lands past innerRight and takes its label
      // off the edge with it. Clamped to the frame: the tail is a gesture
      // at a pace, not a position that has to be read off the axis.
      projection = {
        x1: lastReal.x,
        y1: lastReal.y,
        x2: Math.min(xOf((endT - t0) / span), innerRight),
        y2: yOf(Math.min(projectedValue, yDomainMax)),
        label: `≈${fmtMoney(projectedValue)} projected`,
      };
    }
    const ticks = niceTicks(yDomainMax, 5);
    const dateTicks = [
      first,
      ...(dates.length > 2 ? [dates[Math.floor(dates.length / 2)]] : []),
      last,
    ].filter((d): d is string => Boolean(d));
    return {
      width,
      height,
      innerLeft,
      innerRight,
      innerTop,
      innerBottom,
      valueTicks: ticks.map((v) => ({ y: yOf(v), label: fmtMoney(v) })),
      dateTicks: dateTicks.map((d) => ({ x: xOfDate(d), label: fmtDate(d) })),
      referenceY: referenceIncome === null ? null : yOf(referenceIncome),
      referenceLabel:
        referenceIncome === null
          ? ""
          : `${referenceLabel ?? "Reference"} ${fmtMoney(referenceIncome)}`,
      series: expensePts,
      areaPath: areaFor(expensePts, innerBottom),
      linePath: pathFor(expensePts),
      projection,
      end: expensePts[expensePts.length - 1] ?? null,
      endLabel: expensePts.length
        ? `${fmtMoney(expensePts[expensePts.length - 1]?.value ?? 0)} spent`
        : "",
      ariaLabel: `Cumulative spend against income, ${fmtDate(first ?? "")} to ${fmtDate(last ?? "")}.`,
    };
  }

  const points = input.data;
  const captured = points.map((p) => p.capturedAt);
  const first = captured[0];
  const last = captured[captured.length - 1];
  const t0 = first ? Date.parse(first) : 0;
  const t1 = last ? Date.parse(last) : 1;
  const span = t1 - t0 || 1;
  const xOfDate = (d: string) => xOf((Date.parse(d) - t0) / span);
  const values = points.map((p) => p.netLiquidity);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(...values, 1) * 1.08;
  const yOf = scaleLinear([minValue, maxValue], [innerBottom, innerTop]);
  const seriesPts = points.map((p) => ({
    x: xOfDate(p.capturedAt),
    y: yOf(p.netLiquidity),
    label: fmtDate(p.capturedAt),
    value: p.netLiquidity,
  }));
  const ticks = niceTicks(maxValue, 5);
  return {
    width,
    height,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    valueTicks: ticks.map((v) => ({ y: yOf(v), label: fmtMoney(v) })),
    dateTicks: seriesPts
      .filter(
        (_, i) => i === 0 || i === seriesPts.length - 1 || i === Math.floor(seriesPts.length / 2),
      )
      .map((p) => ({ x: p.x, label: p.label })),
    referenceY: null,
    referenceLabel: "",
    projection: null,
    series: seriesPts,
    areaPath: areaFor(seriesPts, yOf(0)),
    linePath: pathFor(seriesPts),
    end: seriesPts[seriesPts.length - 1] ?? null,
    endLabel: seriesPts.length ? fmtMoney(seriesPts[seriesPts.length - 1]?.value ?? 0) : "",
    ariaLabel: `Net liquidity, ${fmtDate(first ?? "")} to ${fmtDate(last ?? "")}.`,
  };
}

function historyLength(input: ChartFrameInput): number {
  return input.kind === "series" ? input.data.expenseCumulative.length : input.data.length;
}

/** Mount a ChartFrame into `container`. Renders the "not enough history
 * yet" state itself when there are fewer than two points — ChartFrame's
 * row of the ten-state table (spec §5) — rather than an empty axis pair. */
export function mountChartFrame(container: HTMLElement, input: ChartFrameInput): ChartFrameHandle {
  if (historyLength(input) < MIN_HISTORY_POINTS) {
    // The two shapes run out of data for different reasons and deserve
    // different sentences. Liquidity history accrues one point per sync, so
    // a thin one really is "come back later". A series with one point means
    // the range simply has nothing in it yet -- which is an ordinary state
    // at the start of a month, not a wait.
    const empty =
      input.kind === "series"
        ? html`<div class="t-empty"><strong>Nothing in this range yet</strong><span>No income or spending has been recorded for the dates selected.</span></div>`
        : html`<div class="t-empty"><strong>Not enough history yet</strong><span>Two syncs are needed before a trend can be drawn. Check back after the next one.</span></div>`;
    render(container, empty);
    return { destroy() {} };
  }

  let geo = buildGeometry(input, 720);

  function draw(): void {
    const g = geo;
    const valueTicks = g.valueTicks
      .map(
        (t) =>
          `<text x="${g.innerLeft - 6}" y="${(t.y + 4).toFixed(1)}" text-anchor="end">${t.label}</text>`,
      )
      .join("");
    const gridLines = g.valueTicks
      .map(
        (t) =>
          `<line x1="${g.innerLeft}" x2="${g.innerRight}" y1="${t.y.toFixed(1)}" y2="${t.y.toFixed(1)}"/>`,
      )
      .join("");
    const dateTicks = g.dateTicks
      .map(
        (t, i, arr) =>
          `<text x="${t.x.toFixed(1)}" y="${g.height - 8}" text-anchor="${
            i === 0 ? "start" : i === arr.length - 1 ? "end" : "middle"
          }">${t.label}</text>`,
      )
      .join("");
    const reference =
      g.referenceY === null
        ? ""
        : `<line class="t-chart__ref" x1="${g.innerLeft}" x2="${g.innerRight}" y1="${g.referenceY.toFixed(1)}" y2="${g.referenceY.toFixed(1)}"/><text class="t-chart__ref-label" x="${g.innerRight}" y="${(g.referenceY - 6).toFixed(1)}" text-anchor="end">${g.referenceLabel}</text>`;
    // Dashed line, hollow dot: it must never read as recorded data.
    const projection = g.projection
      ? `<path class="t-chart__proj" d="M ${g.projection.x1.toFixed(1)} ${g.projection.y1.toFixed(1)} L ${g.projection.x2.toFixed(1)} ${g.projection.y2.toFixed(1)}"/>` +
        `<circle class="t-chart__proj-dot" cx="${g.projection.x2.toFixed(1)}" cy="${g.projection.y2.toFixed(1)}" r="4"/>` +
        `<text class="t-chart__proj-label" x="${g.projection.x2.toFixed(1)}" y="${(g.projection.y2 - 10).toFixed(1)}" text-anchor="end">${g.projection.label}</text>`
      : "";
    const end = g.end
      ? `<circle class="t-chart__end" cx="${g.end.x.toFixed(1)}" cy="${g.end.y.toFixed(1)}" r="4"/><text class="t-chart__end-label" x="${(g.end.x - 8).toFixed(1)}" y="${(g.end.y - 6).toFixed(1)}" text-anchor="end">${g.endLabel}</text>`
      : "";

    render(
      container,
      html`<div class="t-chart" data-chart-frame>
        <svg viewBox="0 0 ${g.width} ${g.height.toFixed(1)}" role="img" aria-label="${g.ariaLabel}">
          <title>${g.ariaLabel}</title>
          <g class="t-chart__grid">${raw(gridLines)}</g>
          <g class="t-chart__axis">${raw(valueTicks + dateTicks)}</g>
          ${raw(reference)}
          <path class="t-chart__area" d="${g.areaPath}"/>
          <path class="t-chart__series" d="${g.linePath}" fill="none"/>
          ${raw(projection)}
          ${raw(end)}
          <line class="t-chart__cross" data-cross-x x1="${g.innerLeft}" x2="${g.innerLeft}" y1="${g.innerTop}" y2="${g.innerBottom}"/>
          <circle class="t-chart__end" data-cross-dot cx="${g.innerLeft}" cy="${g.innerBottom}" r="4" style="opacity:0"/>
          <rect class="t-chart__hit" data-hit x="${g.innerLeft}" y="${g.innerTop}" width="${g.innerRight - g.innerLeft}" height="${g.innerBottom - g.innerTop}"/>
        </svg>
        <div class="t-chart__tip" data-tip></div>
      </div>`,
    );

    const el = container.querySelector<HTMLElement>("[data-chart-frame]");
    const svg = el?.querySelector<SVGSVGElement>("svg");
    const tip = el?.querySelector<HTMLElement>("[data-tip]");
    const crossX = el?.querySelector<SVGLineElement>("[data-cross-x]");
    const crossDot = el?.querySelector<SVGCircleElement>("[data-cross-dot]");
    if (!el || !svg || !tip || !crossX || !crossDot) return;

    function onMove(event: MouseEvent): void {
      const rect = svg?.getBoundingClientRect();
      if (!rect || !crossX || !crossDot || !tip || !el) return;
      const x = ((event.clientX - rect.left) / rect.width) * g.width;
      let best = g.series[0];
      for (const p of g.series) {
        if (best === undefined || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
      }
      if (!best) return;
      crossX.setAttribute("x1", String(best.x));
      crossX.setAttribute("x2", String(best.x));
      crossDot.setAttribute("cx", String(best.x));
      crossDot.setAttribute("cy", String(best.y));
      crossDot.style.opacity = "1";
      render(tip, html`<strong>${best.label}</strong>${fmtMoney(best.value)}`);
      tip.style.left = `${(best.x / g.width) * 100}%`;
      tip.style.top = `${(best.y / g.height) * 100}%`;
      el.classList.add("is-hover");
    }
    function onLeave(): void {
      if (!crossDot || !el) return;
      crossDot.style.opacity = "0";
      el.classList.remove("is-hover");
    }
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
  }

  draw();

  // The ResizeObserver, not a stretched preserveAspectRatio, is what keeps
  // this frame honest at every width: the viewBox is rebuilt from the
  // container's own size so nothing is ever scaled non-uniformly to fit.
  const observer = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width;
    if (!width || Math.abs(width - geo.width) < 1) return;
    geo = buildGeometry(input, width);
    draw();
  });
  observer.observe(container);

  return {
    destroy() {
      observer.disconnect();
    },
  };
}
