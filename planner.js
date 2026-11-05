/* planner.js: the vote planner, run in your browser.
 * A line-for-line port of the planning model (optimize / value / chase / caps) that sizes a split of your sAERO
 * across Aero pools for one 47-hour window. Inputs come from data/plan.json, which a scanner publishes every hour:
 * each pool's expected fees and incentives for a window starting at each hour of the next two days. Nothing you
 * enter leaves your browser. MIT licensed; tools/check.js proves the port matches the reference plans.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Planner = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function poolRules(C, n) {
    if (!n) return [C.MIN_POOLS, C.MAX_POOLS, C.MAX_PCT, C.TYPE_MAX];
    n = Math.max(1, Math.min(C.MAX_POOLS, n | 0));
    const even = Math.ceil(100 / n);
    const cap = Math.max(C.MAX_PCT, Math.ceil(even / C.STEP) * C.STEP);
    return [n, n, Math.min(100, cap), n <= 3 ? null : C.TYPE_MAX];
  }

  function chaseFor(C, row, chase) {
    let base;
    if (row.alloc < C.SMALL_POOL && chase.small) base = chase.small;
    else base = row.type === "stream-led" ? chase.stream : chase.fee;
    const k = row.rank48, crowd = chase.crowd || {};
    const key = k && k <= 5 ? "top5" : k && k <= 20 ? "top20" : "";
    const f = key in crowd ? crowd[key] : 1.0;
    return base.map(c => c * f);
  }

  // your share of what the pool pays over the window, with your own AERO diluting it
  function value(row, x, c) { return x > 0 ? x / (row.alloc * c + x) * (row.fee_w + row.inc_w) : 0; }

  // first element with the largest key (Python max() semantics: ties keep the earliest)
  function argmax(list, key) { let best = null, bv = -Infinity; for (const r of list) { const v = key(r); if (best === null || v > bv) { best = r; bv = v; } } return best; }

  function optimize(C, rows, aero, chase, smallMax, n) {
    const [minPools, maxPools, maxPct, typeMax] = poolRules(C, n);
    const STEP = C.STEP;
    const fac = (r, k) => chaseFor(C, r, chase)[k];
    let live = rows.filter(r => !r.cut);
    const cap = new Map();
    for (const r of live) {
      const c = Math.min(r.alloc < C.SMALL_POOL ? C.SMALL_MAX_PCT : maxPct, Math.floor(C.SLICE_MAX * r.alloc / aero * 100 / STEP) * STEP);
      if (c >= STEP) cap.set(r.gid, c);
    }
    live = live.filter(r => cap.has(r.gid));
    const pct = new Map(live.map(r => [r.gid, 0]));
    const gain = r => { const x0 = aero * pct.get(r.gid) / 100, x1 = aero * (pct.get(r.gid) + STEP) / 100; return value(r, x1, fac(r, 1)) - value(r, x0, fac(r, 1)); };
    const typePct = t => live.reduce((s, r) => s + (r.type === t ? pct.get(r.gid) : 0), 0);
    const smallPct = () => live.reduce((s, r) => s + (r.alloc < C.SMALL_POOL ? pct.get(r.gid) : 0), 0);
    const used = () => { let u = 0; for (const v of pct.values()) if (v) u++; return u; };
    const reach = (r, opened) => {
      const rest = [...cap.entries()].filter(([g]) => g !== r.gid && !pct.get(g)).map(([, c]) => c).sort((a, b) => b - a).slice(0, Math.max(0, maxPools - opened - 1));
      let open = 0; for (const [g, p] of pct) if (p) open += cap.get(g);
      return Math.min(100, open + cap.get(r.gid) + rest.reduce((a, b) => a + b, 0));
    };
    const step = (pool, typeCap) => {
      const u = used();
      let ok = pool.filter(r => pct.get(r.gid) + STEP <= cap.get(r.gid)
        && (pct.get(r.gid) || u < maxPools)
        && (r.alloc >= C.SMALL_POOL || smallPct() + STEP <= smallMax)
        && (typeCap == null || typePct(r.type) + STEP <= typeCap));
      if (n && u < maxPools) {
        const fresh = ok.filter(r => !pct.get(r.gid));
        if (fresh.length) {
          const top = Math.max(...fresh.map(r => reach(r, u)));
          ok = ok.filter(r => pct.get(r.gid) || reach(r, u) >= top);
        }
      }
      const best = argmax(ok, gain);
      if (!best) return false;
      pct.set(best.gid, pct.get(best.gid) + STEP);
      return true;
    };
    const feeLed = live.filter(r => r.fee_led);
    const needFee = Math.round(C.FEE_LED_MIN * 100 / STEP + 0.4999) * STEP;
    let placed = 0;
    while (placed < needFee && step(feeLed, typeMax)) placed += STEP;
    while (placed < 100 && step(live, typeMax)) placed += STEP;
    let relaxed = false;
    while (typeMax != null && placed < 100 && step(live, null)) { placed += STEP; relaxed = true; }
    while (used() < minPools) {
      const unused = live.filter(r => pct.get(r.gid) === 0 && (r.alloc >= C.SMALL_POOL || smallPct() + STEP <= smallMax));
      let heavy = null, hv = -Infinity;
      for (const [g, p] of pct) if (p > STEP && p > hv) { heavy = g; hv = p; }
      if (!unused.length || heavy === null) break;
      const best = argmax(unused, gain);
      pct.set(heavy, pct.get(heavy) - STEP);
      pct.set(best.gid, pct.get(best.gid) + STEP);
    }
    const by = new Map(live.map(r => [r.gid, r]));
    const out = [...pct.entries()].filter(([, p]) => p).map(([g, p]) => [by.get(g), p]);
    out.sort((a, b) => (b[1] - a[1]) || ((b[0].fee_w + b[0].inc_w) - (a[0].fee_w + a[0].inc_w)));
    return { split: out, placed, relaxed };
  }

  /** Pick the exported start at or just before `ts` (the window opens at the later of your earliest lock and now). */
  function startIndex(D, ts) {
    let k = 0;
    for (let i = 0; i < D.starts.length; i++) if (D.starts[i] <= ts + 60) k = i;
    return k;
  }

  /** Rows for one start; `live` = {gauge address (lowercase): AERO allocated right now} replaces the scan's figure. */
  function rowsAt(D, si, live) {
    return D.rows[si].map(([gi, feeW, incW, t, fl]) => {
      const g = D.gauges[gi];
      const la = live && g.gauge ? live[g.gauge.toLowerCase()] : undefined;
      return { gid: g.gid, gauge: g.gauge, name: g.name, pool: g.pool, kind: g.kind, cut: g.cut, rank48: g.rank48,
               fading: g.fading, fee_day: g.fee_day, streams: g.streams, alloc: la != null && la > 0 ? la : g.alloc, scanAlloc: g.alloc,
               fee_w: feeW, inc_w: incW, type: D.types[t] || "thin-token", fee_led: !!fl };
    });
  }

  /** The plan for `aero` AERO allocated at `startTs`. Returns legs + expected / low / high dollars + APR + warnings. */
  function plan(D, aero, startTs, n, live) {
    const C = D.consts, si = startIndex(D, startTs);
    const rows = rowsAt(D, si, live);
    const { split, placed, relaxed } = optimize(C, rows, aero, D.chase, D.small_max, n || null);
    const minPools = poolRules(C, n || null)[0];
    const warnings = [];
    if (placed < 100) warnings.push(!n ? `Only ${placed}% could be placed under the rules.` :
      `Only ${placed}% fits in ${n} pool${n > 1 ? "s" : ""}: no pool may take more than 10% of its own size, so pick more pools.`);
    if (relaxed) warnings.push(`The ${C.TYPE_MAX}% per pool type cap was relaxed to place everything.`);
    const tot = { high: 0, expected: 0, low: 0 };
    const legs = split.map(([r, p]) => {
      const x = aero * p / 100, f = chaseFor(C, r, D.chase);
      const hi = value(r, x, f[0]), ex = value(r, x, f[1]), lo = value(r, x, f[2]);
      tot.high += hi; tot.expected += ex; tot.low += lo;
      return { pct: p, aero: x, row: r, label: r.name, gauge: r.gauge, pool: r.pool, type: r.type, fee_led: r.fee_led,
               expect_usd: ex, expect_low_usd: lo, expect_high_usd: hi, small: r.alloc < C.SMALL_POOL, slice: x / (r.alloc + x) };
    });
    const feeShare = legs.filter(l => l.fee_led).reduce((s, l) => s + l.pct, 0);
    if (feeShare < C.FEE_LED_MIN * 100 - 1) warnings.push(`Only ${feeShare}% sits in fee-led pools (the rule is at least a third).`);
    if (legs.length < minPools) warnings.push(`Only ${legs.length} pools passed the filters.`);
    const apr = aero && D.px ? tot.expected / (aero * D.px) * 365 / (C.H47 / 86400) * 100 : 0;
    return { legs, start: D.starts[si], expect_usd: tot.expected, expect_low_usd: tot.low, expect_high_usd: tot.high, apr, warnings, placed };
  }

  return { poolRules, chaseFor, value, optimize, rowsAt, startIndex, plan };
});
