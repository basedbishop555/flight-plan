/* planner.js: the allocation planner, run in your browser.
 * A line-for-line port of the planning model (fee estimate / optimize / value / chase / caps) that sizes a split of
 * your sAERO across Aero pools for one 47-hour window. Inputs come from data/plan.json, which a scanner publishes
 * every hour: each pool's raw fee rates per horizon and, for a window starting at each hour of the next two days, the
 * window hour factor and incentive dollars. The strategy dial (DEFAULTS) re-blends those in your browser. Nothing you
 * enter leaves your browser. MIT licensed; tools/check.js proves the defaults match the reference plans.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Planner = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const PLAN_V = 3;   // the data/plan.json format this planner reads (the publisher refuses a mismatch)

  function poolRules(C, n) {
    if (!n) return [C.MIN_POOLS, C.MAX_POOLS, C.MAX_PCT, C.TYPE_MAX];
    n = Math.max(1, Math.min(C.MAX_POOLS, n | 0));
    const even = Math.ceil(100 / n);
    const cap = Math.max(C.MAX_PCT, Math.ceil(even / C.STEP) * C.STEP);
    return [n, n, Math.min(100, cap), n <= 3 ? null : C.TYPE_MAX];
  }

  function chaseFor(C, row, chase, caution) {
    let base;
    if (row.alloc < C.SMALL_POOL && chase.small) base = chase.small;
    else base = row.type === "stream-led" ? chase.stream : chase.fee;
    const k = row.rank48, crowd = chase.crowd || {};
    const key = k && k <= 5 ? "top5" : k && k <= 20 ? "top20" : "";
    const f = key in crowd ? crowd[key] : 1.0;
    const cau = caution == null ? 1 : caution;          // the Crowd caution dial scales the pile-on above 1x
    return base.map(c => 1 + (c * f - 1) * cau);
  }

  /* ---- the strategy dial (11/5/2026) ----
     memory  0..1  how much recent fees count: 0 = long memory, 0.5 = the fitted weights (today's plan), 1 = last 12h only
     trust   bool  trust a fresh spike: the uncapped 12h rate, and a fading pool is not clipped to its 12h rate
     caution 0..2  pile-on priced at this x the measured factor (1 = measured)
     streams 0..1  how much incentive streams count (1 = in full, 0 = fees only)
     n       pool count (null = Auto); exclude = a Set of gids to leave out (one pool per lock) */
  const DEFAULTS = { n: null, memory: 0.5, trust: false, caution: 1, streams: 1, exclude: null };
  const LONG = { "12": 0, "24": 0, "48": 0, "96": 1 }, SHORT = { "12": 1, "24": 0, "48": 0, "96": 0 };
  function weightsFor(D, m) {
    const F = D.tun.fee_weights, out = {};
    for (const h of ["12", "24", "48", "96"]) { const f = F[h] || 0; out[h] = m <= 0.5 ? LONG[h] + (f - LONG[h]) * (m / 0.5) : f + (SHORT[h] - f) * ((m - 0.5) / 0.5); }
    return out;
  }
  /** Fee $/day for one pool under the dial: the fitted estimator (weighted mix of the horizons that exist, fading
   *  clipped to the 12h rate) x realism x confidence. With the defaults this is the scanner's own number. */
  function feeDay(D, g, o) {
    const have = Object.assign({}, g.rates || {});
    if (o.trust && g.raw12 != null) have["12"] = g.raw12;
    const hs = Object.keys(have); if (!hs.length) return { fee: 0, fading: false };
    const W = weightsFor(D, o.memory);
    let wsum = 0; for (const h of hs) wsum += W[h] || 0;
    const longest = hs.reduce((a, b) => (+a > +b ? a : b));
    let e = wsum > 0 ? hs.reduce((acc, h) => acc + (W[h] || 0) * have[h], 0) / wsum : have[longest];
    let fading = false;
    if (!o.trust && "12" in have && have[longest] > 0 && longest !== "12" && have["12"] < D.tun.fade * have[longest]) { e = Math.min(e, have["12"]); fading = true; }
    return { fee: e * D.tun.fee_realism * (g.conf == null ? 1 : g.conf), fading };
  }

  // your share of what the pool pays over the window, with your own AERO diluting it
  function value(row, x, c) { return x > 0 ? x / (row.alloc * c + x) * (row.fee_w + row.inc_w) : 0; }

  // first element with the largest key (Python max() semantics: ties keep the earliest)
  function argmax(list, key) { let best = null, bv = -Infinity; for (const r of list) { const v = key(r); if (best === null || v > bv) { best = r; bv = v; } } return best; }

  function optimize(C, rows, aero, chase, smallMax, n) {
    const [minPools, maxPools, maxPct, typeMax] = poolRules(C, n);
    const STEP = C.STEP;
    const fac = (r, k) => chaseFor(C, r, chase, chase.caution)[k];
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

  /** Rows for one start under the dial `o`; `live` = {gauge address (lowercase): AERO allocated right now} replaces
   *  the scan's figure. Fee $ over the window = fee $/day x the window hour factor (hf) x the synth haircut; the pool
   *  type and fee-led flag follow the blend, as in the scanner. */
  function rowsAt(D, si, live, o) {
    o = Object.assign({}, DEFAULTS, o || {});
    const C = D.consts, out = [];
    for (const [gi, hf, incW] of D.rows[si]) {
      const g = D.gauges[gi];
      if (o.exclude && o.exclude.has(g.gid)) continue;
      const la = live && g.gauge ? live[g.gauge.toLowerCase()] : undefined;
      const fd = feeDay(D, g, o);
      const fee_w = fd.fee * hf * (1 - (g.synth || 0) / 2 * (1 - C.SYNTH_HAIRCUT));
      const inc_w = incW * o.streams;
      if (fee_w + inc_w < C.MIN_WINDOW_USD) continue;
      const type = g.stock ? "tokenized-stock" : inc_w > fee_w ? "stream-led" : g.alloc >= C.DEEP ? "deep fee" : "thin-token";
      out.push({ gid: g.gid, gauge: g.gauge, name: g.name, pool: g.pool, kind: g.kind, cut: g.cut, rank48: g.rank48,
                 fading: fd.fading, fee_day: fd.fee, streams: g.streams, alloc: la != null && la > 0 ? la : g.alloc, scanAlloc: g.alloc,
                 fee_w, inc_w, type, fee_led: fee_w >= inc_w, chain: g.chain || "base", chain_name: g.chain_name || "Base",
                 cost: g.cost || 0, age_h: g.age_h == null ? null : g.age_h });
    }
    return out;
  }

  /** The plan for `aero` AERO allocated at `startTs`. `n` = pool count (null/0 = Auto); `opts` = the dial (see DEFAULTS).
   *  Returns legs + expected / low / high dollars + APR + warnings. */
  function plan(D, aero, startTs, n, live, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    if (n) o.n = n;
    const C = D.consts, si = startIndex(D, startTs);
    if (o.n === 1) return onePool(D, aero, si, live, o);
    const rows = rowsAt(D, si, live, o).filter(r => r.chain === "base");
    const chase = { stream: D.chase.stream, fee: D.chase.fee, small: D.chase.small, crowd: D.chase.crowd, caution: o.caution };
    const { split, placed, relaxed } = optimize(C, rows, aero, chase, D.small_max, o.n || null);
    n = o.n || null;
    const minPools = poolRules(C, n || null)[0];
    const warnings = [];
    if (placed < 100) warnings.push(!n ? `Only ${placed}% could be placed under the rules.` :
      `Only ${placed}% fits in ${n} pool${n > 1 ? "s" : ""}: no pool may take more than 10% of its own size, so pick more pools.`);
    if (relaxed) warnings.push(`The ${C.TYPE_MAX}% per pool type cap was relaxed to place everything.`);
    const tot = { high: 0, expected: 0, low: 0 };
    const legs = split.map(([r, p]) => {
      const x = aero * p / 100, f = chaseFor(C, r, chase, chase.caution);
      const hi = value(r, x, f[0]), ex = value(r, x, f[1]), lo = value(r, x, f[2]);
      tot.high += hi; tot.expected += ex; tot.low += lo;
      return { pct: p, aero: x, row: r, label: r.name, gauge: r.gauge, pool: r.pool, type: r.type, fee_led: r.fee_led,
               expect_usd: ex, expect_low_usd: lo, expect_high_usd: hi, small: r.alloc < C.SMALL_POOL, slice: x / (r.alloc + x) };
    });
    const feeShare = legs.filter(l => l.fee_led).reduce((s, l) => s + l.pct, 0);
    if (feeShare < C.FEE_LED_MIN * 100 - 1) warnings.push(`Only ${feeShare}% sits in fee-led pools (the rule is at least a third).`);
    if (legs.length < minPools) warnings.push(`Only ${legs.length} pools passed the filters.`);
    const apr = aero && D.px ? tot.expected / (aero * D.px) * 365 / (C.H47 / 86400) * 100 : 0;
    return { legs, start: D.starts[si], expect_usd: tot.expected, expect_low_usd: tot.low, expect_high_usd: tot.high, apr, warnings, placed, opts: o };
  }

  /** One pool for `aero` (Pools = 1, and the Aggressive preset per lock): the single pool, on Base or on OP /
   *  Arbitrum / Ethereum, that pays the most over the window AFTER the cost of voting there (a pool elsewhere carries
   *  its per-window network cost). Only one limit, as on saero.org's method plus ours: your AERO in a pool, counting
   *  your other locks already placed there (`o.taken` {gid: AERO}), stays at most 10% of the pool. Pools whose votes
   *  doubled since the last scan stay out. */
  function onePool(D, aero, si, live, o) {
    const C = D.consts, taken = o.taken || {};
    const chase = { stream: D.chase.stream, fee: D.chase.fee, small: D.chase.small, crowd: D.chase.crowd, caution: o.caution };
    let best = null;
    for (const r0 of rowsAt(D, si, live, o)) {
      if (r0.cut || (o.baseOnly && r0.chain !== "base")) continue;     // "Base only": no picks on other networks
      const mine = taken[r0.gid] || 0;
      if (mine + aero > C.SLICE_MAX * r0.alloc) continue;
      const r = mine ? Object.assign({}, r0, { alloc: r0.alloc + mine }) : r0;      // your other locks dilute it too
      const f = chaseFor(C, r, chase, o.caution);
      const ex = value(r, aero, f[1]), net = ex - r.cost;
      if (!best || net > best.net) best = { r, f, ex, net };
    }
    const warnings = [];
    if (!best) return { legs: [], start: D.starts[si], expect_usd: 0, expect_low_usd: 0, expect_high_usd: 0, apr: 0, placed: 0, opts: o,
                        warnings: ["No single pool can take this lock: each would hold more than 10% of the pool."] };
    const { r, f } = best, hi = value(r, aero, f[0]) - r.cost, lo = value(r, aero, f[2]) - r.cost;
    const leg = { pct: 100, aero, row: r, label: r.name, gauge: r.gauge, pool: r.pool, type: r.type, fee_led: r.fee_led,
                  chain: r.chain, chain_name: r.chain_name, cost: r.cost, gross_usd: best.ex,
                  expect_usd: best.net, expect_low_usd: lo, expect_high_usd: hi, small: r.alloc < C.SMALL_POOL, slice: aero / (r.alloc + aero) };
    const apr = aero && D.px ? best.net / (aero * D.px) * 365 / (C.H47 / 86400) * 100 : 0;
    return { legs: [leg], start: D.starts[si], expect_usd: best.net, expect_low_usd: lo, expect_high_usd: hi, apr, warnings, placed: 100, opts: o };
  }

  /** What your CURRENT votes are expected to earn over the same window, with the same model and dial (the private
   *  page's compare_now). votes = {gauge address (lowercase): AERO}. When `live` is given its pool sizes already have
   *  your own votes taken out; otherwise they are taken out here. Returns {usd, priced, unpriced} (AERO). */
  function stay(D, votes, startTs, live, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {}, { exclude: null });
    const si = startIndex(D, startTs), C = D.consts;
    const byG = {};
    for (const r of rowsAt(D, si, live, o)) if (r.gauge && r.chain === "base") byG[r.gauge.toLowerCase()] = r;
    const chase = { stream: D.chase.stream, fee: D.chase.fee, small: D.chase.small, crowd: D.chase.crowd };
    let usd = 0, priced = 0, unpriced = 0;
    for (const [g, x] of Object.entries(votes || {})) {
      if (!(x > 0)) continue;
      const r = byG[g];
      if (!r) { unpriced += x; continue; }
      const row = live ? r : Object.assign({}, r, { alloc: Math.max(1, r.alloc - x) });
      usd += value(row, x, chaseFor(C, row, chase, o.caution)[1]);
      priced += x;
    }
    return { usd, priced, unpriced };
  }

  return { poolRules, chaseFor, value, optimize, rowsAt, startIndex, plan, onePool, stay, weightsFor, feeDay, DEFAULTS, PLAN_V };
});
