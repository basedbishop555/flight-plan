/* app.js: the Flight Plan page (moved out of index.html so the page can run under a strict Content-Security-Policy:
   no inline script runs here, so text injected into the page can never become code). MIT licensed. */
(() => {
"use strict";
const A = window.AeroAlloc, XA = window.AeroX, C = A.C, P = window.Planner, R = window.SWEEP_ROUTES || { meta: {}, tokens: {}, universe: {} }, M = R.meta || {};
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// a transaction hash exactly, or "" (hashes come back from the wallet or from storage and go into links)
const txh = h => /^0x[0-9a-fA-F]{64}$/.test(String(h)) ? String(h) : "";
const needHash = h => { if (!txh(h)) throw new Error("the wallet did not return a transaction hash; check its activity before trying again"); return h; };
// only a plain https link from the data files ever becomes a link
const httpsUrl = u => /^https:\/\/[A-Za-z0-9.-]+(\/[^\s"'<>]*)?$/.test(String(u || "")) ? String(u) : "#";
const short = a => a ? a.slice(0, 6) + "…" + a.slice(-4) : "";
const fmt = (n, d = 2) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
const fmtA = x => Number(x).toLocaleString(undefined, { maximumFractionDigits: 0 });
const money = x => x == null ? "-" : "$" + Number(x).toLocaleString(undefined, { minimumFractionDigits: Math.abs(x) >= 100 ? 0 : 2, maximumFractionDigits: Math.abs(x) >= 100 ? 0 : 2 });
const fmtTs = ts => ts ? new Date(ts * 1000).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "";
const ago = ts => { const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60)); return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`; };
const ET = "America/New_York";
const clock = ts => new Date(ts * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: ET }).replace(" ", "").toLowerCase() + " ET";
const store = { get(k, d) { try { const v = localStorage.getItem("fp:" + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem("fp:" + k, v); } catch (e) {} } };
const NET = { 10: "OP", 1: "Ethereum", 42161: "Arbitrum", 4663: "Robinhood", 57073: "Ink", 5042: "Arc", 99901: "Elysium" };
const TYPE_NAME = { "deep fee": "Deep fee", "stream-led": "Stream", "tokenized-stock": "Stock", "thin-token": "Thin token" };
const TYPEC = { "deep fee": "var(--t-fee)", "stream-led": "var(--t-stream)", "tokenized-stock": "var(--t-stock)", "thin-token": "var(--t-thin)" };
const typeColor = t => TYPEC[t] || "var(--mut2)";
function log(s, cls) { const d = document.createElement("div"); if (cls) d.className = cls; d.textContent = new Date().toLocaleTimeString() + "  " + s; $("log").appendChild(d); $("log").scrollTop = $("log").scrollHeight; }
function toast(t) { const el = $("toast"); el.textContent = t || "copied"; el.style.opacity = 1; setTimeout(() => el.style.opacity = 0, 1000); }
async function copy(t) { try { await navigator.clipboard.writeText(t); toast("copied"); } catch (e) { toast("copy failed"); } }

// ---------- chain reads (public RPC) ----------
async function rpc(method, params) {
  const SNb = window.SweepNets && window.SweepNets.byId(C.CHAIN_ID);
  if (SNb) return window.SweepNets.rpc(SNb, method, params);      // every public Base RPC in turn, 15s each
  const r = await fetch(C.RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(method + ": HTTP " + r.status);
  const j = await r.json(); if (j.error) throw new Error(method + ": " + JSON.stringify(j.error).slice(0, 200)); return j.result;
}
const ethCall = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
const I = {
  mc3: new ethers.Interface(A.ABI.mc3), voter: new ethers.Interface(A.ABI.voter), leaf: new ethers.Interface(A.ABI.leaf), saero: new ethers.Interface(A.ABI.saero),
  en: new ethers.Interface(["function balanceOf(address) view returns (uint256)", "function tokenOfOwnerByIndex(address,uint256) view returns (uint256)"]),
  ch: new ethers.Interface(["function allocationChainIds(uint256) view returns (uint256[])"]),
  fr: new ethers.Interface(["function gaugeToRewards(address) view returns (address)"]),
  ts: new ethers.Interface(["function totalSupply() view returns (uint256)"]),
  erc20: new ethers.Interface(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"]),
  mq: new ethers.Interface(["function quoteExactInput(address[] pools, address tokenIn, uint256 amountIn) returns (uint256 amountOut, uint160[] a, uint32[] b)"]),
  mr: new ethers.Interface(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]),
};
async function multicall(calls) {
  const out = [];
  for (let i = 0; i < calls.length; i += 60) {
    const raw = await ethCall(C.MC3, I.mc3.encodeFunctionData("tryAggregate", [false, calls.slice(i, i + 60)]));
    out.push(...I.mc3.decodeFunctionResult("tryAggregate", raw)[0].map(r => ({ success: r[0], returnData: r[1] })));
  }
  return out;
}
const dec = (iface, fn, r) => (r && r.success && r.returnData.length >= 66) ? iface.decodeFunctionResult(fn, r.returnData) : null;
async function waitReceipt(hash) {
  for (let i = 0; i < 150; i++) { const r = await rpc("eth_getTransactionReceipt", [hash]); if (r) return r; await new Promise(s => setTimeout(s, 2000)); }
  throw new Error("timed out waiting for " + hash);
}

// ---------- state ----------
const S = { empty: 0, D: null, RK: null, H: null, histBusy: false, CR: null, addr: null, account: null, provider: null, locks: [], live: null, plan: null,
            dial: null, ST: null, winsBr: null, mode: store.get("mode", "lock"), aprv: store.get("aprv", "week"), logv: store.get("logv", "week") === "day" ? "day" : "week",
            bracket: null, busy: false, cool: 169200 };
const LOCK_MAX = 60;          // locks read per wallet (6 chain calls each; the biggest wallets hold hundreds)
const viewer = () => S.addr;
const owns = L => !!(S.account && L.owner && L.owner.toLowerCase() === S.account.toLowerCase());

/* ---------- where the data files come from (11/11/2026) ----------
   The hourly pool data can live in its own data-only repository (DATA_ALT), so the key that publishes data every hour
   can never change this page's code. The page asks there first and falls back to the copy beside the page ("data/");
   whichever answers is used for the rest of the visit. Data is never trusted as code: every address in it is checked
   for shape below, names only ever reach the page as text, and the signing guards don't read these files at all
   except for the list of pools a split may name. */
const DATA_ALT = "https://basedbishop555.github.io/flight-plan-data/";
let DATA_BASE = null;
async function dataBase() {
  if (DATA_BASE) return DATA_BASE;
  let b = null; try { b = sessionStorage.getItem("fp:data"); } catch (e) {}
  if (b !== DATA_ALT && b !== "data/") {
    try { const r = await fetch(DATA_ALT + "plan.json?probe=" + Math.floor(Date.now() / 600000), { method: "HEAD", signal: AbortSignal.timeout(4000) }); b = r.ok ? DATA_ALT : "data/"; }
    catch (e) { b = "data/"; }
    try { sessionStorage.setItem("fp:data", b); } catch (e) {}
  }
  return (DATA_BASE = b);
}
async function dataJson(name, v) {
  const base = await dataBase();
  const r = await fetch(base + name + "?v=" + (v || Math.floor(Date.now() / 600000)), { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json();
}
// plan.json names the pools a split may use, so its shape is checked before anything is planned from it
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/, CHAINS_OK = new Set(["base", "optimism", "ethereum", "arbitrum", "ink", "robinhood", "arc", "elysium"]);
function checkPlanData(d) {
  const bad = why => { throw new Error("pool data failed its checks (" + why + ")"); };
  const num = x => typeof x === "number" && Number.isFinite(x);
  if (!d || typeof d !== "object" || !Array.isArray(d.gauges) || !Array.isArray(d.rows) || !Array.isArray(d.starts) || !d.consts || !d.tun || !d.chase) bad("shape");
  if (!num(d.px) || !(d.px > 0) || !num(d.scan_ts) || d.rows.length !== d.starts.length || !d.starts.every(num)) bad("numbers");
  if (M.factoryRegistry && String(d.factory_registry).toLowerCase() !== String(M.factoryRegistry).toLowerCase()) bad("registry address");
  for (const k of ["STEP", "MAX_PCT", "MIN_POOLS", "MAX_POOLS", "SLICE_MAX", "SMALL_POOL", "H47"]) if (!num(d.consts[k]) || !(d.consts[k] > 0)) bad("consts." + k);
  if (d.consts.SLICE_MAX > 0.25 || d.consts.H47 !== 169200) bad("consts range");
  const seen = new Set();
  for (const g of d.gauges) {
    if (!g || typeof g !== "object") bad("gauge row");
    if (g.gauge != null && !ADDR_RE.test(g.gauge)) bad("gauge address");
    if (g.pool && !ADDR_RE.test(g.pool)) bad("pool address");
    if (g.chain != null && !CHAINS_OK.has(g.chain)) bad("network " + String(g.chain).slice(0, 20));
    if (typeof g.name !== "string" || g.name.length > 120 || !num(g.alloc) || g.alloc < 0) bad("gauge fields");
    if (g.gauge) { const k = (g.chain || "base") + ":" + g.gauge.toLowerCase(); if (seen.has(k)) bad("a pool listed twice"); seen.add(k); }
  }
  for (const rows of d.rows) { if (!Array.isArray(rows)) bad("rows"); for (const r of rows) if (!Array.isArray(r) || !(r[0] >= 0 && r[0] < d.gauges.length) || !num(r[1]) || !num(r[2])) bad("row"); }
  const X = d.ext || {};
  if (X.jpn) for (const r of X.jpn.rows || []) if (!ADDR_RE.test(r[0]) || (r[7] != null && !CHAINS_OK.has(r[7]))) bad("JPN row");
  if (X.cypher) for (const rs of Object.values(X.cypher.ladder || {})) for (const r of rs) if (!ADDR_RE.test(r[0]) || !num(r[1])) bad("Cypher row");
  return d;
}
async function loadData() {
  const v = Math.floor(Date.now() / 600000);         // refresh at most every 10 min
  // open-time load is plan + crowd only (~55KB gz); the every-lock rank file (~480KB gz) and history (~620KB gz)
  // are fetched only once someone looks a wallet up, in parallel with the chain reads
  const [d, c, st, bt] = await Promise.all([dataJson("plan.json", v), dataJson("crowd.json", v).catch(() => null), dataJson("strategy.json", v).catch(() => null),
    dataJson("backtest.json", v).catch(() => null)]);
  S.ST = st; renderWins();
  S.BT = bt; renderTested();
  const want = P.PLAN_V || 1;
  if ((d.v || 1) !== want) {          // a cached file from before/after a format change: never plan from it
    S.D = null; S.CR = c; renderCrowd();
    const stale = (d.v || 1) > want;     // the data is newer than the scripts this browser kept: a reload fixes it
    $("fresh").textContent = stale ? "This page is out of date: reload it" : "Pool data is being refreshed; reload in a few minutes";
    log(`Pool data format v${d.v || 1} does not match this page (v${want}). ${stale ? "Your browser kept an old copy of the page: reload." : "Waiting for the refresh."}`, "warn");
    throw new Error(stale ? "this page is out of date; reload it (your browser kept an old copy)" : "pool data is being refreshed; reload in a few minutes");
  }
  S.D = checkPlanData(d); S.CR = c;
  $("fresh").textContent = `Pool data from ${ago(d.scan_ts)}`;
  log(`Pool data from ${new Date(d.scan_ts * 1000).toLocaleString()} · ${d.gauges.length} pools · AERO $${d.px.toFixed(4)}`);
  renderCrowd();
}
function loadRank() {
  if (!S.rankP) {
    const v = Math.floor(Date.now() / 600000);
    S.rankP = dataJson("rank.json", v).then(r => { S.RK = decodeRank(r); }).catch(e => { S.rankP = null; log("Rank unavailable: " + e.message, "warn"); });
  }
  return S.rankP;
}
async function loadHist() {
  if (S.H || S.histBusy) return;
  S.histBusy = true;
  try { const v = Math.floor(Date.now() / 600000); S.H = decodeHist(await dataJson("history.json", v)); log(`History loaded: ${S.H.weeks.length} weeks, ${S.H.days.length} days.`); }
  catch (e) { log("History unavailable: " + e.message, "warn"); }
  S.histBusy = false; renderRank();
}

async function discover(addr) {
  const r = await multicall([{ target: C.SAERO, callData: I.en.encodeFunctionData("balanceOf", [addr]) }]);
  const n = Number(dec(I.en, "balanceOf", r[0])?.[0] ?? 0n);
  S.total = n;
  const idx = await multicall(Array.from({ length: Math.min(n, LOCK_MAX) }, (_, i) => ({ target: C.SAERO, callData: I.en.encodeFunctionData("tokenOfOwnerByIndex", [addr, i]) })));
  const ids = idx.map(x => dec(I.en, "tokenOfOwnerByIndex", x)).filter(Boolean).map(x => Number(x[0]));
  log(`${short(addr)} holds ${n} sAERO lock${n === 1 ? "" : "s"}${n > LOCK_MAX ? ` (showing the first ${LOCK_MAX})` : ""}.`);
  return ids;
}

async function readLocks(ids) {
  const calls = ids.flatMap(id => [
    { target: C.SAERO, callData: I.saero.encodeFunctionData("ownerOf", [id]) },
    { target: C.SAERO, callData: I.saero.encodeFunctionData("staked", [id]) },
    { target: C.VOTER, callData: I.voter.encodeFunctionData("allocationChainAmounts", [id, C.CHAIN_ID]) },
    { target: C.LEAF, callData: I.leaf.encodeFunctionData("tokenStates", [id]) },
    { target: C.LEAF, callData: I.leaf.encodeFunctionData("allocatedGauges", [id]) },
    { target: C.VOTER, callData: I.ch.encodeFunctionData("allocationChainIds", [id]) }]);
  calls.push({ target: C.LEAF, callData: I.leaf.encodeFunctionData("allocationCooldown", []) });
  const res = await multicall(calls);
  S.cool = Number(dec(I.leaf, "allocationCooldown", res[res.length - 1])?.[0] ?? 169200);
  const out = ids.map((id, k) => {
    const r = res.slice(6 * k, 6 * k + 6);
    const st = dec(I.saero, "staked", r[1]), ts = dec(I.leaf, "tokenStates", r[3]);
    const la = ts ? Number(ts[1]) : null;
    return { id, owner: dec(I.saero, "ownerOf", r[0])?.[0] || null, staked: st ? st[0] : 0n, permanent: st ? !!st[2] : false, booked: dec(I.voter, "allocationChainAmounts", r[2])?.[0] ?? 0n,
             la, next: la ? la + S.cool : null, gauges: (dec(I.leaf, "allocatedGauges", r[4])?.[0] || []).map(g => g.toLowerCase()),
             elsewhere: (dec(I.ch, "allocationChainIds", r[5])?.[0] || []).map(Number).filter(c => c && c !== C.CHAIN_ID), current: {}, read: Date.now() };
  });
  const q = [], qi = [];
  for (const L of out) for (const g of L.gauges) { q.push({ target: C.LEAF, callData: I.leaf.encodeFunctionData("allocations", [L.id, g]) }); qi.push([L, g]); }
  const r2 = q.length ? await multicall(q) : [];
  r2.forEach((r, i) => { const v = dec(I.leaf, "allocations", r); if (v) qi[i][0].current[qi[i][1]] = v[0]; });
  return out;
}

// how crowded each pool is RIGHT NOW (its rewards contract's total voting power), minus your own current votes
async function readLive() {
  const gs = S.D.gauges.filter(g => g.gauge);
  const rw = await multicall(gs.map(g => ({ target: S.D.factory_registry, callData: I.fr.encodeFunctionData("gaugeToRewards", [g.gauge]) })));
  const rewards = rw.map(r => dec(I.fr, "gaugeToRewards", r)?.[0] || null);
  const sup = await multicall(rewards.map(a => ({ target: a || C.MC3, callData: I.ts.encodeFunctionData("totalSupply", []) })));
  const live = {};
  gs.forEach((g, i) => { const v = rewards[i] ? dec(I.ts, "totalSupply", sup[i]) : null; if (v) live[g.gauge.toLowerCase()] = Number(ethers.formatUnits(v[0], 18)); });
  for (const L of S.locks) for (const [g, v] of Object.entries(L.current)) if (live[g] != null) live[g] = Math.max(1, live[g] - Number(ethers.formatUnits(v, 18)));
  log(`Live pool sizes read for ${Object.keys(live).length} pools.`);
  return live;
}

const lockAero = L => Number(ethers.formatUnits(L.staked, 18));
const totalAero = () => S.locks.reduce((n, L) => n + lockAero(L), 0);
const openTs = () => { const now = Date.now() / 1000, nx = S.locks.map(L => L.next).filter(Boolean); return Math.max(nx.length ? Math.min(...nx) : now, now); };
/* ---------- the strategy dial: presets move four sliders; any drag = Custom; the split recalculates ---------- */
/* 11/6/2026: two "pure" presets from friends' tools (JPN's screener, NYCypher's saero.org). Their splits come from the
   outside method itself (planner.js external()); the knobs move to the closest match to that method, the Pools knob
   changes how many of JPN's picks you take, and turning any other knob switches to Custom (our model). Aggressive (one
   pool per lock, our model of saero.org's method) came back the same evening ("a fun option to test"). */
const PRESETS = {
  steady:     { n: 0, memory: 0.25, trust: false, caution: 1.4, streams: 1 },
  balanced:   { n: 0, memory: 0.5,  trust: false, caution: 1,   streams: 1 },
  aggressive: { n: 1, memory: 0,    trust: false, caution: 1,   streams: 1 },
  jpn:        { n: 0, memory: 0.75, trust: false, caution: 1,   streams: 1, src: "jpn" },     // his reads lean on 6-48h fees, crowd x0.85 on the apps' top 5, incentives ahead in full
  cypher:     { n: 0, memory: 0,    trust: false, caution: 1,   streams: 1, src: "cypher" },  // his 4-day fee read, incentives in full
};
const PRESET_NAME = { steady: "Steady", balanced: "Balanced", aggressive: "Aggressive", jpn: "JPN's picks", cypher: "Cypher's picks", custom: "Custom" };
const PRESET_BTN = { steady: "Steady", balanced: "Balanced", aggressive: "Aggressive", jpn: "JPN", cypher: "Cypher", custom: "Custom" };
function loadDial() {
  let d = null; try { d = JSON.parse(store.get("dial", "null")); } catch (e) {}
  if (!d || typeof d !== "object") { d = { ...PRESETS.balanced, baseOnly: true }; const old = Number(store.get("pools", 0)) || 0; if (old) d.n = old; }   // first visit: Base only (11/6/2026)
  const v = { n: Math.max(0, Math.min(10, Math.round(Number(d.n) || 0))), memory: clamp(d.memory, 0, 1, 0.5), trust: !!d.trust, caution: clamp(d.caution, 0, 2, 1), streams: clamp(d.streams, 0, 1, 1), baseOnly: !!d.baseOnly,
              src: d.src === "jpn" || d.src === "cypher" ? d.src : null };
  v.preset = matchPreset(v); return v;
}
function clamp(x, lo, hi, dflt) { x = Number(x); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : dflt; }
function matchPreset(v) { if (v.src) return v.src; for (const [k, q] of Object.entries(PRESETS)) if (!q.src && q.n === v.n && Math.abs(q.memory - v.memory) < 1e-9 && q.trust === v.trust && Math.abs(q.caution - v.caution) < 1e-9 && Math.abs(q.streams - v.streams) < 1e-9) return k; return "custom"; }
function setDial(v) { S.dial = { ...v, preset: matchPreset(v) }; store.set("dial", JSON.stringify(S.dial)); replan(); render(); }
const dialOpts = () => ({ n: S.dial.n || null, memory: S.dial.memory, trust: S.dial.trust, caution: S.dial.caution, streams: S.dial.streams, baseOnly: !!S.dial.baseOnly });
const perLock = () => (S.dial.n === 1 && S.locks.length > 1) || (S.dial.src === "cypher" && S.locks.length > 0);   // Cypher's advice is per lock
/* Backtest calibration (data/backtest.json, 11/5/2026). Replayed on past scans, forecasts barely predicted payouts, so
   each setting's expected dollars are pulled toward what that setting typically paid: per 1k AERO,
   shown = rm + b x (forecast - fm), where fm / rm are the setting's typical forecast and payout and b how far its
   forecasts tracked payouts (0 = not at all). Never above the forecast. Presets use their own measurements; Custom
   uses the nearest tested dial setting. A pool on another network keeps its full cost: the model runs on gross dollars. */
function gridKey(A, d) {
  const near = (xs, v) => xs.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
  return [near(A.m, d.memory), d.trust ? 1 : 0, near(A.c, d.caution), near(A.s, d.streams), d.n === 1 ? "1" : "a"].join(",");
}
function calModel() {
  const B = S.BT, M = B && B.calmodel; if (!M || !S.dial) return null;
  const p = S.dial.preset;
  if (S.dial.src) return (M.presets || {}).balanced || null;     // pure presets are priced by our default model
  if (p !== "custom" && M.presets && !S.dial.baseOnly && (p === "balanced" || p === "steady") && M.presets[p + "_x"]) return M.presets[p + "_x"];   // Base only off: its own measurement
  if (p !== "custom" && M.presets && M.presets[p]) return M.presets[p];
  if (M.grid && B.calgrid && B.calgrid.axes) { const m = M.grid[gridKey(B.calgrid.axes, S.dial)]; if (m) return m; }
  return (M.presets || {}).balanced || null;
}
function calib(pl) {
  const m = calModel(); if (!pl || !m || !pl.legs.length) return pl;
  const [fm, rm, b] = m;
  const aero = pl.legs.reduce((a, l) => a + l.aero, 0), gross = pl.legs.reduce((a, l) => a + l.expect_usd + (l.cost || 0), 0);
  if (!(aero > 0 && gross > 0)) return pl;
  const per = gross / aero * 1000, f = Math.max(0.2, Math.min(1, (rm + b * (per - fm)) / per));
  const ex0 = pl.expect_usd;
  for (const l of pl.legs) { const c = l.cost || 0; for (const k of ["expect_usd", "expect_low_usd", "expect_high_usd"]) l[k] = (l[k] + c) * f - c; if (l.gross_usd != null) l.gross_usd *= f; }
  for (const k of ["expect_usd", "expect_low_usd", "expect_high_usd"]) pl[k] = pl.legs.reduce((a, l) => a + l[k], 0);
  pl.apr = ex0 ? pl.apr * pl.expect_usd / ex0 : pl.apr; pl.cal = f;
  return pl;
}
/* ---------- Cypher's picks, exactly (11/6/2026 pm: "exactly what his app would pick across all networks and the
   exact number of pools"). saero.org's own planner runs in a sandboxed frame (cypher-frame.html: scripts only, no
   access to this page, your wallet, storage or the network) on THESE locks with his own data (data/saero/, copied
   from saero.org every hour; since 11/13/2026 that copy carries his planner too, code.json, because his site went
   private and a visitor's browser can't load it from there) and the same lock details his site reads: amount, every network's
   allocations, cooldown. His answer comes back as plain data and is checked before use. Until it's back (or if it
   fails) the split is his advice for the nearest lock size, from the scanner's hourly run. ---------- */
const CY = { ready: null, data: null, seq: 0, wait: {}, res: null, key: "", busy: false, err: null };
const CY_NET = { 8453: "base", 10: "optimism", 1: "ethereum", 42161: "arbitrum", 57073: "ink", 4663: "robinhood", 5042: "arc", 99901: "elysium" };
const CY_POOL = /^(base|optimism|ethereum|arbitrum|ink|robinhood|arc|elysium):0x[0-9a-f]{40}$/;
const CY_FRAME_V = "3";                         // bump whenever cypher-frame.html changes
const CY_MAX_POOLS = 8, CY_MIN_SIZE = 100000;   // his Plan tab's defaults ("Most pools" 8, "Smallest pool" 100k sAERO)
// sha256 of his page's Plan-tab function the frame's planTab() was matched against (saero_track.py writes the live one
// to data/saero/meta.json plan_sha); a mismatch means his site changed and the note says picks may differ slightly
const CY_PLAN_SHA = "40b7db8a336afd66";   // app.js?v=20261113lbl1
const CY_CODE_MAX = 400000;                // his plan.js is ~47k characters; anything far past that isn't it
function cyFrame() {
  if (CY.ready) return CY.ready;
  CY.ready = new Promise((ok, no) => {
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-scripts"); f.src = "cypher-frame.html?v=" + CY_FRAME_V;   // versioned: a cached old frame can't linger
    f.hidden = true; f.title = "saero.org planner (sandboxed)";
    const onMsg = e => {
      if (e.source !== f.contentWindow) return;
      const m = e.data || {};
      if (m.type === "frame-ready") { clearTimeout(t); ok(f); }
      else if (m.type === "advice" && CY.wait[m.id]) { CY.wait[m.id](m); delete CY.wait[m.id]; }
    };
    // didn't start: drop this frame and its listener, so each retry starts clean instead of piling up dead frames
    const t = setTimeout(() => { window.removeEventListener("message", onMsg); f.remove(); CY.ready = null; no(new Error("saero.org's planner frame didn't start")); }, 20000);
    window.addEventListener("message", onMsg);
    document.body.appendChild(f);
  });
  return CY.ready;
}
async function cyData() {
  if (CY.data && Date.now() / 1000 - CY.data.got < 300) return CY.data;
  const v = Math.floor(Date.now() / 600000);
  const [sum, cal, meta, code] = await Promise.all(["pools", "calendar", "meta", "code"].map(n => dataJson(`saero/${n}.json`, v)));
  // his planner travels as text and only ever runs inside the sealed frame; it must be the version his data came with
  if (!code || typeof code.js !== "string" || !code.js || code.js.length > CY_CODE_MAX || code.code_v !== meta.code_v) throw new Error("saero.org's planner wasn't in this hour's data");
  CY.data = { sum, cal, meta, code: code.js, got: Date.now() / 1000 };
  return CY.data;
}
// a lock in saero.org's own shape (his wallet.js): amount, allocs [{pool "network:gauge", weight}] on every network read
// (1% specks left out, as his site does), elsewhere = sAERO on a network that couldn't be read, per-network cooldowns
function cyLock(L) {
  const amt = lockAero(L), allocs = [];
  for (const [g, v] of Object.entries(L.current || {})) { const w = Number(ethers.formatUnits(v, 18)); if (w > 0.01 * amt) allocs.push({ pool: "base:" + g, weight: w }); }
  for (const lf of L.leaf || []) if (!lf.unread) for (const [g, w] of Object.entries(lf.allocs)) if (w > 0.01 * amt) allocs.push({ pool: lf.chain + ":" + g, weight: w });
  const chains = [{ chain: "base", budget: Number(ethers.formatUnits(L.booked || 0n, 18)), lastAllocated: L.la || null, cooldownEnd: L.next || null }]
    .concat((L.leaf || []).filter(lf => !lf.unread).map(lf => ({ chain: lf.chain, budget: lf.budget, lastAllocated: lf.la, cooldownEnd: lf.next })));
  const cools = chains.filter(c => c.budget > 0 && c.cooldownEnd).map(c => c.cooldownEnd), las = chains.map(c => c.lastAllocated || 0);
  return { id: String(L.id), name: "#" + L.id, amount: amt, permanent: !!L.permanent, lastAllocated: Math.max(...las) || null,
           cooldownEnd: cools.length ? Math.max(...cools) : (L.next || null), chains, elsewhere: (L.leaf || []).filter(lf => lf.unread).reduce((a, lf) => a + lf.budget, 0),
           allocs: allocs.sort((a, b) => b.weight - a.weight) };
}
// what each lock holds on its other networks (his site reads these too): budget from the Root Voter on Base, then the
// LeafVoter (same address on every network) on that network; a network that doesn't answer counts as `elsewhere`
async function readLeaf(locks) {
  const SN = window.SweepNets, todo = locks.filter(L => L.elsewhere.length);
  for (const L of locks) L.leaf = [];
  if (!todo.length) return;
  const bq = todo.flatMap(L => L.elsewhere.map(c => ({ L, c, call: { target: C.VOTER, callData: I.voter.encodeFunctionData("allocationChainAmounts", [L.id, c]) } })));
  const br = await multicall(bq.map(x => x.call));
  const by = {};
  bq.forEach((x, i) => { const v = dec(I.voter, "allocationChainAmounts", br[i]); x.L.leaf = x.L.leaf || []; const lf = { chain: CY_NET[x.c] || "chain" + x.c, cid: x.c, budget: v ? Number(ethers.formatUnits(v[0], 18)) : 0, bookedRaw: v ? v[0] : 0n, allocs: {}, allocsRaw: {}, la: null, next: null, unread: true }; x.L.leaf.push(lf); (by[x.c] = by[x.c] || []).push([x.L, lf]); });
  await Promise.all(Object.entries(by).map(async ([cid, list]) => {
    const net = SN && SN.byId(Number(cid));
    if (!net || !CY_NET[cid]) return;
    try {
      const r1 = await SN.multicall(net, list.flatMap(([L]) => [{ target: C.LEAF, callData: I.leaf.encodeFunctionData("tokenStates", [L.id]) }, { target: C.LEAF, callData: I.leaf.encodeFunctionData("allocatedGauges", [L.id]) }]));
      const q = [];
      list.forEach(([L, lf], k) => {
        const ts = dec(I.leaf, "tokenStates", r1[2 * k]), gs = dec(I.leaf, "allocatedGauges", r1[2 * k + 1]);
        if (!ts || !gs) return;
        lf.la = Number(ts[1]) || null; lf.next = lf.la ? lf.la + S.cool : null; lf.leafBudget = ts[3]; lf.unread = false;
        for (const g of gs[0]) q.push([lf, g.toLowerCase(), { target: C.LEAF, callData: I.leaf.encodeFunctionData("allocations", [L.id, g]) }]);
      });
      const r2 = q.length ? await SN.multicall(net, q.map(x => x[2])) : [];
      r2.forEach((r, i) => { const v = dec(I.leaf, "allocations", r); if (v) { q[i][0].allocs[q[i][1]] = Number(ethers.formatUnits(v[0], 18)); q[i][0].allocsRaw[q[i][1]] = v[0]; } });
    } catch (e) { log(`${NET[cid] || "chain " + cid} allocations unreadable (${e.message}); counted the way saero.org does.`, "warn"); }
  }));
}
const cyKey = () => S.locks.map(L => L.id + ":" + L.read).join(",") + "|" + (S.dial && S.dial.baseOnly ? "base" : "all");
async function cyAdvise() {
  const key = cyKey(); CY.busy = true; CY.err = null;
  try {
    const [f, D] = await Promise.all([cyFrame(), cyData()]);
    const id = ++CY.seq;
    const m = await new Promise((ok, no) => {
      CY.wait[id] = ok; setTimeout(() => { delete CY.wait[id]; no(new Error("saero.org's planner took too long")); }, 30000);
      f.contentWindow.postMessage({ type: "advise", id, code: D.code, sum: D.sum, cal: D.cal, locks: S.locks.map(cyLock), now: Math.floor(Date.now() / 1000), nets: S.dial.baseOnly ? ["base"] : null,
                                    maxPools: CY_MAX_POOLS, minSize: CY_MIN_SIZE }, "*");
    });
    if (m.error) throw new Error(m.error);
    if (!m.plan) throw new Error("his Plan tab didn't run (" + (m.planErr || "no answer") + ")");
    const verdict = {};
    for (const e of m.locks || []) verdict[e.name] = { move: e.wouldMove, gain: e.gain, state: e.state };
    const byName = {};
    // the split = his Plan tab (the lock cards on saero.org): pools moved now + any part that stays on another network
    for (const e of m.plan) {
      const rows = (e.items || []).concat((e.kept || []).filter(k => k.pool).map(k => ({ pool: k.pool, pct: k.pct, name: "", kept: true })));
      const away = (e.kept || []).filter(k => !k.pool).reduce((t, k) => t + k.pct, 0);
      const ok = rows.every(r => CY_POOL.test(r.pool) && r.pct >= 0 && r.pct <= 100), tot = rows.reduce((t, r) => t + r.pct, 0) + away;
      if (!rows.length || !ok || tot < 99 || tot > 101) continue;                                            // anything odd: that lock falls back
      byName[e.name] = { picks: rows.filter(r => r.pct > 0).map(r => { const [chain, gauge] = r.pool.split(":"); return { gauge, chain, pct: r.pct, name: r.name, known: true, kept: !!r.kept }; }),
                         away, plan: e.plan, stay: e.stay, ...(verdict[e.name] || {}) };
    }
    CY.res = { at: Date.now() / 1000, dataAt: D.meta.data_at, byName, planMatch: D.meta.plan_sha ? D.meta.plan_sha === CY_PLAN_SHA : null }; CY.key = key;
    log(`Cypher's picks: saero.org's planner ran on ${Object.keys(byName).length} of ${S.locks.length} lock${S.locks.length === 1 ? "" : "s"}.`);
  } catch (e) { CY.err = e.message || String(e); CY.key = key; CY.res = null; log("Cypher's picks: " + CY.err + "; showing his advice for the nearest lock size.", "warn"); }
  CY.busy = false;
  if (S.dial && S.dial.src === "cypher") { replan(); render(); }
}
// his split for one lock (null = use the nearest-size fallback); known = the gauge is on our scanner's list (checked here)
function cyPicks(L) {
  if (!S.dial || S.dial.src !== "cypher" || !CY.res || CY.key !== cyKey()) return null;
  const a = CY.res.byName["#" + L.id]; if (!a) return null;
  const known = new Set(S.D.gauges.filter(g => g.gauge).map(g => (g.chain || "base") + ":" + g.gauge.toLowerCase()));
  for (const k of (S.D.ext && S.D.ext.jpn && S.D.ext.jpn.rows) || []) if (k[6]) known.add((k[7] || "base") + ":" + k[0].toLowerCase());
  // A pool his planner says to "keep" counts as known only when this lock really holds it right now (read from the
  // chain by this page): his script alone can never name a pool to sign for that isn't on our scanner's list.
  const held = p => p.kept && (p.chain === "base" ? (L.current[p.gauge] || 0n) > 0n : !!keptWei(L, p));
  return Object.assign(a.picks.map(p => ({ ...p, kept: !!held(p), known: known.has(p.chain + ":" + p.gauge) || !!held(p) })), { away: a.away });   // away: planner.external
}
function replan() {
  if (!S.dial) S.dial = loadDial();
  if (S.dial.src === "cypher" && S.locks.length && cyKey() !== CY.key && !CY.busy) cyAdvise();   // his planner on these locks (async; replans when back)
  for (const L of S.locks) { L.dry = null; L.call = null; L.plan = null; L.x = null; if (!L.sent && !L.xWatching) L.status = ""; }
  S.plan = null;
  if (!S.locks.length || totalAero() <= 0) return;
  const now = Date.now() / 1000;
  if (perLock()) {
    const taken = {}, legs = [], warnings = new Set(); let usd = 0, lo = 0, hi = 0, placed = 100, g0 = 0, g1 = 0;
    for (const L of S.locks.slice().sort((a, b) => lockAero(b) - lockAero(a))) {    // biggest lock picks first
      const raw = S.dial.src ? P.external(S.D, lockAero(L), Math.max(now, L.next || now), S.live, S.dial.src, S.dial.n || null, !!S.dial.baseOnly, cyPicks(L))
        : P.plan(S.D, lockAero(L), Math.max(now, L.next || now), 1, S.live, { ...dialOpts(), taken: { ...taken } });
      for (const l of raw.legs) g0 += l.expect_usd + (l.cost || 0);
      const pl = calib(raw); for (const l of pl.legs) g1 += l.expect_usd + (l.cost || 0);
      L.plan = pl; for (const l of pl.legs) { taken[l.row.gid] = (taken[l.row.gid] || 0) + l.aero; legs.push({ ...l, lock: L.id }); }
      usd += pl.expect_usd; lo += pl.expect_low_usd; hi += pl.expect_high_usd; placed = Math.min(placed, pl.placed); pl.warnings.forEach(w => warnings.add(w));
    }
    const aero = totalAero(), apr = aero && S.D.px ? usd / (aero * S.D.px) * 365 / (S.D.consts.H47 / 86400) * 100 : 0;
    S.plan = { legs, start: openTs(), expect_usd: usd, expect_low_usd: lo, expect_high_usd: hi, apr, warnings: [...warnings], placed, perLock: true, cal: g0 > 0 ? g1 / g0 : 1, src: S.dial.src || null };
  } else {
    S.plan = calib(S.dial.src ? P.external(S.D, totalAero(), openTs(), S.live, S.dial.src, S.dial.n || null, !!S.dial.baseOnly) : P.plan(S.D, totalAero(), openTs(), null, S.live, { ...dialOpts(), locks: S.locks.length, carrier: Math.max(...S.locks.map(lockAero)) }));   // one split for the wallet
    for (const L of S.locks) L.plan = S.plan;
    if (S.plan.carried && S.locks.length > 1) carrierPlans(S.plan);
  }
}
/* ---------- the carrier lock (11/6/2026): with Base only off, Steady / Balanced / Custom may put pools on another
   network. With several locks, those pools go on the BIGGEST lock only (planner.js `carried`), so each network's cost
   is paid once; the Base pools are spread over every lock by what each has left, so the wallet's total per pool is
   the split shown. Each lock's own percentages (in hundredths, summing to exactly 100) are what its dry run and
   signature use. ---------- */
function carrierPlans(pl) {
  const car = S.locks.slice().sort((a, b) => lockAero(b) - lockAero(a))[0];
  const away = pl.legs.filter(l => l.chain && l.chain !== "base"), home = pl.legs.filter(l => !l.chain || l.chain === "base");
  const awayA = away.reduce((t, l) => t + l.aero, 0), capOf = L => Math.max(0, lockAero(L) - (L === car ? awayA : 0));
  const capT = S.locks.reduce((t, L) => t + capOf(L), 0);
  for (const L of S.locks) {
    const a = lockAero(L), share = capT > 0 ? capOf(L) / capT : 0;
    const raw = (L === car ? away.map(l => [l, l.aero]) : []).concat(home.map(l => [l, l.aero * share]));
    const bp = raw.map(([, x]) => Math.floor(x / a * 10000)), order = raw.map(([, x], i) => [x / a * 10000 - bp[i], i]).sort((u, v) => v[0] - u[0]);
    for (let k = 0, rem = 10000 - bp.reduce((t, v) => t + v, 0); k < rem; k++) bp[order[k % order.length][1]]++;
    const legs = raw.map(([l, x], i) => { const f = l.aero > 0 ? x / l.aero : 0;
      return { ...l, pct: bp[i] / 100, aero: x, expect_usd: l.expect_usd * f, expect_low_usd: l.expect_low_usd * f, expect_high_usd: l.expect_high_usd * f, lock: L.id }; }).filter(l => l.pct > 0);
    const sum = k => legs.reduce((t, l) => t + l[k], 0);
    L.plan = { ...pl, legs, expect_usd: sum("expect_usd"), expect_low_usd: sum("expect_low_usd"), expect_high_usd: sum("expect_high_usd"), carrier: L === car };
  }
  pl.carrierId = car.id;
}

/* ---------- move or stay (11/5/2026, after saero.org): your current votes vs the split, same model, same window.
   Move only when the split beats staying by 3% AND $0.25 a day, after network fees. ---------- */
const MOVE_PCT = 3, MOVE_USD_DAY = 0.25, FEE_PER_LOCK = 0.05;
function stayVerdict() {
  if (!S.plan || !S.locks.length) return null;
  const votes = {}; let elsewhere = 0, parked = 0;
  for (const L of S.locks) {
    if (L.booked === 0n && L.elsewhere.length) { elsewhere += lockAero(L); continue; }
    let v = 0;
    for (const [g, x] of Object.entries(L.current)) { const a = Number(ethers.formatUnits(x, 18)); votes[g] = (votes[g] || 0) + a; v += a; }
    parked += Math.max(0, lockAero(L) - v);
  }
  const st = P.stay(S.D, votes, S.plan.start, S.live, S.dial.src ? {} : dialOpts());   // pure presets: both sides on the default model
  const tot = totalAero(), base = tot - elsewhere;          // locks voting on other networks sit out of both sides
  if (tot <= 0 || base <= 0 || st.unpriced / base > 0.25) return { unknown: true, share: base > 0 ? st.unpriced / base : 1 };
  const unknown = st.unpriced;
  const per = S.D.consts.H47 / 86400;
  const stayUsd = st.usd * (S.plan.cal || 1), planUsd = S.plan.expect_usd * (tot - elsewhere) / tot;   // Base part only; same calibration both sides
  const gain = planUsd - stayUsd, fees = FEE_PER_LOCK * S.locks.filter(L => !(L.booked === 0n && L.elsewhere.length)).length;
  const pct = stayUsd > 0 ? gain / stayUsd * 100 : Infinity;
  const move = gain - fees >= MOVE_USD_DAY * per && pct >= MOVE_PCT;
  return { stayUsd, planUsd, gain, pct, fees, move, parked, unknown: false, unpricedShare: unknown / base, elsewhere };
}
const planFor = L => (L && L.plan) || S.plan;
const planSplit = L => planFor(L).legs.map(l => ({ gauge: l.gauge, pct: l.pct, label: l.label, pool: l.pool }));
const planGauges = L => new Set(planFor(L).legs.map(l => l.gauge.toLowerCase()));
const isOpen = L => L.next ? L.next <= Date.now() / 1000 : true;
const offPick = L => { const p = planFor(L); return p ? p.legs.find(l => l.chain && l.chain !== "base") || null : null; };
// a split on another network, or a lock that already allocates on one, goes through allocate-x.js (Stage 2, 11/6/2026)
const xNeeded = L => !!(offPick(L) || (L.elsewhere && L.elsewhere.length));
const xNext = L => (L.dry && L.dry.x && L.x && L.x.steps[0]) || null;
const opensAt = L => { const s = xNext(L); return s ? s.openAt : L.next; };
const isOpenNow = L => { const t = opensAt(L); return t ? t <= Date.now() / 1000 : true; };
const canSend = L => owns(L) && !!(L.dry && L.dry.ok) && !!planFor(L) && planFor(L).placed === 100 && !L.sent && !L.xWatching && !L.xBusy &&
  (L.dry.x ? !!(xNext(L) && xNext(L).ok && isOpenNow(L)) : (isOpen(L) && !offPick(L)));

// ---------- rank (every lock / every wallet), computed here from data/rank.json ----------
function decodeRank(Rk) {
  const per = {};
  for (const [name, p] of Object.entries(Rk.periods)) {
    const rows = []; let i = 0;
    for (let k = 0; k < p.i.length; k++) { i += p.i[k]; const r = p.r[k], a = p.a[k]; rows.push({ i, c: p.c[k] / 100, a, r: r / 1e6, v: (r + p.v[k]) / 1e6, va: a - p.va[k], f: p.f[k] }); }
    per[name] = { t0: p.t0, t1: p.t1, rows, byI: new Map(rows.map(x => [x.i, x])) };
  }
  const earn = new Map();
  if (Rk.earn) { const E = Rk.earn, l = E.l || []; let i = 0; for (let k = 0; k < E.i.length; k++) { i += E.i[k]; earn.set(i, { usd: E.e[k] / 100, unclaimed: E.u[k] / 100, since: E.s[k], life: l[k] != null && l[k] >= 0 ? l[k] / 100 : null, lifeSince: (E.ls || [])[k] || null }); } }
  const idOf = new Map(Rk.ids.map((id, i) => [id, i]));
  return { ...Rk, per, idOf, earn, groups: Rk.groups || {}, team: new Set(Rk.team || []) };
}
function decodeHist(H) {
  const idOf = new Map(H.ids.map((id, i) => [id, i]));
  const bucket = b => {
    const rows = []; let i = 0; const p = b.rows;
    for (let k = 0; k < p.i.length; k++) { i += p.i[k]; const r = p.r[k], a = p.a[k]; rows.push({ i, a, r: r / 1000, v: (r + p.v[k]) / 1000, va: a - p.va[k] }); }
    const w = b.w.r.map((r, k) => ({ r: r / 1000, a: b.w.a[k] }));
    return { ...b, rows, byI: new Map(rows.map(x => [x.i, x])), w };
  };
  return { ...H, idOf, team: new Set(H.team || []), weeks: H.weeks.map(bucket), days: H.days.map(bucket) };
}
function stats(list, thr) {   // average = weighted by AERO (what the average AERO earned); median = the typical lock
  const sel = list.filter(x => x.a >= thr), a = sel.map(x => x.r).sort((x, y) => x - y); if (!a.length) return null;
  const wa = sel.reduce((s, x) => s + x.a, 0), m = wa ? sel.reduce((s, x) => s + x.r * x.a, 0) / wa : 0; const md = a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; return { a, avg: m, med: md }; }
function rankOf(st, apr) { let lo = 0, hi = st.a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (st.a[m] <= apr) lo = m + 1; else hi = m; } const better = st.a.length - lo; return { rank: better + 1, of: st.a.length, top: (better + 1) / st.a.length * 100 }; }
function wallets(rows, Rk) {
  const acc = new Map();
  for (const x of rows) { if (Rk.team.has(x.i)) continue; const g = Rk.grp[x.i]; const w = acc.get(g) || { c: 0, a: 0, ra: 0, vv: 0, va: 0 }; w.c += x.c; w.a += x.a; w.ra += x.r * x.a; w.vv += x.v * x.va; w.va += x.va; acc.set(g, w); }
  const out = [];
  for (const [g, w] of acc) if (w.va >= Rk.min_aero && w.a > 0) out.push({ g, c: w.c, a: w.a, r: w.ra / w.a, v: w.va ? w.vv / w.va : null, va: w.va });
  return out;
}
const WCACHE = new Map();
function walletPool(period) { const Rk = S.RK; if (!WCACHE.has(period)) WCACHE.set(period, wallets(Rk.per[period].rows, Rk)); return WCACHE.get(period); }
function combine(mine) {
  const a = mine.reduce((s, x) => s + x.a, 0); if (!a) return null;
  const apr = mine.reduce((s, x) => s + x.r * x.a, 0) / a;
  const vm = mine.filter(x => x.va > 0), vote = vm.length ? vm.reduce((s, x) => s + x.v * x.va, 0) / vm.reduce((s, x) => s + x.va, 0) : null;
  return { apr, vote, aero: a, usd_day: mine.reduce((s, x) => s + (x.c || 0), 0) };
}
const STCACHE = new Map();
function periodStats(period, mode, thr) {    // the field you're ranked in: every lock (or wallet) at least thr AERO
  const Rk = S.RK, p = Rk && Rk.per[period]; if (!p) return null;
  const key = period + "|" + mode + "|" + thr;
  if (!STCACHE.has(key)) STCACHE.set(key, stats(mode === "wallet" ? walletPool(period) : p.rows.filter(x => x.f && !Rk.team.has(x.i)), thr));   // the Aero team's 4 locks sit out (as on saero.org)
  return STCACHE.get(key);
}
function rankLine(period, idxs, mode, thr) {
  const Rk = S.RK, p = Rk && Rk.per[period]; if (!p) return null;
  const mine = idxs.map(i => p.byI.get(i)).filter(Boolean); if (!mine.length) return null;
  const me = combine(mine); if (!me) return null;
  const st = periodStats(period, mode, thr); if (!st) return null;
  return { ...me, ...rankOf(st, me.apr), avg: st.avg, med: st.med };
}
function histLine(b, ids, mode, thr) {      // ids = sAERO token ids; history.json numbers its locks itself (H.idOf)
  const mine = ids.map(id => S.H.idOf.get(id)).filter(i => i != null).map(i => b.byI.get(i)).filter(Boolean); if (!mine.length) return null;
  const me = combine(mine); if (!me) return null;
  const st = stats(mode === "wallet" ? b.w : b.rows.filter(x => !S.H.team.has(x.i)), thr);
  return st ? { ...me, ...rankOf(st, me.apr), avg: st.avg, med: st.med } : { ...me, avg: null };
}
const lockIdxs = ids => ids.map(id => S.RK.idOf.get(id)).filter(i => i != null);

// ---------- render ----------
function ring(L, big) {
  const now = Date.now() / 1000, next = L && L.next || 0, la = L && L.la || (next - S.cool);
  const open = next ? next <= now : !!L;
  const frac = open ? 1 : Math.max(0, Math.min(1, (now - la) / Math.max(1, next - la)));
  const r = 20, c = 2 * Math.PI * r, left = next - now;
  const txt = open ? "OPEN" : !next ? "-" : left >= 3600 ? `${Math.floor(left / 3600)}h<br>${Math.round((left % 3600) / 60)}m` : `${Math.max(0, Math.round(left / 60))}m`;
  return `<div class="ring${big ? " big" : ""}${open ? " open" : ""}"><svg viewBox="0 0 48 48"><circle class="bgc" cx="24" cy="24" r="${r}"/><circle class="fgc" cx="24" cy="24" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - frac)).toFixed(1)}"/></svg><div class="t">${txt}</div></div>`;
}
function renderPill() {
  const el = $("wpill");
  if (S.account) { el.className = "wpill live"; el.innerHTML = `<span class="dot"></span>${esc(short(S.account))} · Base`; }
  else { el.className = "wpill btn"; el.textContent = "Connect wallet"; }
}
function renderHero() {
  const h = $("hero");
  if (!S.addr) { h.innerHTML = `<div class="hk">Plan your next allocation</div><div class="hv" style="font-size:28px;letter-spacing:-.6px">Paste a wallet or connect to start</div><div class="hs">You'll see its sAERO locks, a split sized to them, how they rank against every lock, and (connected) one signature per lock.</div>`; return; }
  if (S.busy) { h.innerHTML = `<div class="hk">${esc(short(S.addr))}</div><div class="hv" style="font-size:28px">Reading the chain…</div>`; return; }
  if (S.err && !S.locks.length) { h.innerHTML = `<div class="hk">${esc(short(S.addr))}</div><div class="hv" style="font-size:28px">Couldn't read your locks</div><div class="hs">${esc(S.err)}. Nothing is wrong with the wallet. <a href="#" id="retry">Try again</a> or reload the page.</div>`; const r = $("retry"); if (r) r.addEventListener("click", e => { e.preventDefault(); lookup(S.addr); }); return; }
  if (!S.locks.length) {
    const mine = S.account && S.account.toLowerCase() === S.addr.toLowerCase();
    const why = S.empty ? `${S.empty} lock${S.empty === 1 ? "" : "s"} found, but none holds any AERO now (withdrawn or merged).`
      : mine ? `Your wallet handed Flight Plan the account <code>${esc(S.addr)}</code>, and that account owns no sAERO. Switch to the account that holds your locks inside your wallet (the page follows the switch), or paste that address above to look.`
      : "Check the address, or try the wallet that holds your locks.";
    h.innerHTML = `<div class="hk">${esc(short(S.addr))}${mine ? " · connected" : ""}</div><div class="hv" style="font-size:28px">${S.empty ? "These locks are empty" : mine ? "This account has no sAERO locks" : "No sAERO locks here"}</div><div class="hs">${why}</div>`; return;
  }
  const p = S.plan, aero = totalAero(), now = Date.now() / 1000;
  const first = S.locks.slice().sort((a, b) => (a.next || 0) - (b.next || 0))[0];
  const pills = [];
  const ot = openTs();
  pills.push(ot <= now + 60 ? `<span class="tag ok">Window open</span>` : `<span class="tag">Opens ${esc(fmtTs(ot))}</span>`);
  if (S.account) pills.push(S.locks.some(owns) ? `<span class="tag ok">Yours · can sign</span>` : `<span class="tag">Not your locks · read-only</span>`);
  else pills.push(`<span class="tag">Read-only · connect to sign</span>`);
  const sv = p ? stayVerdict() : null;
  if (sv && !sv.unknown && !(S.dial && S.dial.src === "cypher")) pills.push(sv.move ? `<span class="tag ok">Move: +${esc(money(sv.gain))}</span>` : `<span class="tag">Staying is fine</span>`);
  if (p) {
    const crowd = p.legs.filter(l => l.row.rank48 && l.row.rank48 <= 5).length; if (crowd) pills.push(`<span class="tag warn">${crowd} crowded</span>`);
    const fad = p.legs.filter(l => l.row.fading).length; if (fad) pills.push(`<span class="tag warn">${fad} fading</span>`);
    if (p.warnings.length) pills.push(`<span class="tag warn" title="${esc(p.warnings.join(" "))}">⚠ ${p.warnings.length} note${p.warnings.length === 1 ? "" : "s"}</span>`);
  }
  if (S.D && Date.now() / 1000 - S.D.scan_ts > 3 * 3600) pills.push(`<span class="tag warn">Pool data ${esc(ago(S.D.scan_ts))}</span>`);
  h.innerHTML = `<div class="hrow">${ring(first, true)}<div class="hmain"><div class="hk">This window · ${esc(short(S.addr))}</div>
    <div class="hv num">${p ? money(p.expect_usd) : "-"}</div>
    <div class="hs num">${p && p.cal && p.cal < 1 ? `<a href="docs.html#tested" title="Forecast x ${p.cal.toFixed(2)}: pulled toward what this setting typically paid in the backtest">calibrated</a> · ` : ""}${p ? p.apr.toFixed(0) + "% APR · " : ""}${S.locks.length}${S.total > LOCK_MAX ? ` of ${S.total}` : ""} lock${S.locks.length === 1 ? "" : "s"} · ${fmtA(aero)} AERO</div></div></div>
    <div class="pills">${pills.join("")}</div>`;
}
// JPN's screener rank for a pool (plan.json ext.jpn, his top 25 Base pools), shown on every preset as a second opinion
const jpnRank = g => { const X = S.D && S.D.ext && S.D.ext.jpn; if (!X || !g) return null; if (!X._by) X._by = new Map(X.rows.map(r => [r[0].toLowerCase(), r[1]])); return X._by.get(g.toLowerCase()) || null; };
function extNote() {
  const src = S.dial && S.dial.src, X = src && S.D && S.D.ext && S.D.ext[src];
  if (!src) return "";
  const nets = S.dial.baseOnly
    ? (src === "cypher" ? "Base only (your switch) = his own Base setting: new picks go to Base pools, but AERO a lock already has on another network may stay there, as his site advises; Flight Plan signs that too." : "Base only (your switch): every pick is a Base pool, 0 ETH to sign.")
    : "Every network. Flight Plan signs any of them from Base: another network adds a small ETH fee for Aero's bridge, and moving AERO between networks takes two signatures (free it, then send it).";
  if (src === "jpn") {
    if (!X) return `<div class="banner warn small" style="margin:0 0 10px">JPN's picks aren't in this hour's data. Try Balanced, or check back after the next hourly update.</div>`;
    return `<div class="banner small" style="margin:0 0 10px"><b>JPN's picks</b>: the top ${S.dial.n || X.n} pools from JPN's <a href="${esc(httpsUrl(X.url))}" target="_blank" rel="noopener noreferrer">Aero v3 Allocation Screener</a> on Dune, weighted by his score (mid and low cases after dilution, steadier fees, x0.85 for pools the allocator apps already rank top 5). His read: ${esc(ago(X.fetched))}. ${nets} <b>Pure:</b> none of our rules apply; our model only prices the split so every preset's dollars compare. The Pools knob changes how many of his picks you take; turning any other knob switches to Custom (our model). <a href="docs.html#friends">More</a></div>`;
  }
  const exact = CY.res && CY.key === cyKey() ? S.locks.filter(L => CY.res.byName["#" + L.id]) : [];
  const head = exact.length
    ? `the split NYCypher's <a href="https://www.saero.org/" target="_blank" rel="noopener noreferrer">saero.org</a> shows on its <b>Plan</b> tab for ${exact.length === S.locks.length ? (S.locks.length === 1 ? "this lock" : "these locks") : `${exact.length} of these ${S.locks.length} locks`} (his defaults: the fewest pools that earn within his margin of the most, pools of ${fmtA(CY_MIN_SIZE)}+ sAERO): his own planner, run in a sealed-off frame on your locks' real state (amount, every network's allocations, cooldown) with his data from ${esc(ago(CY.res.dataAt))}, so the pools and the number of pools are his.${CY.res.planMatch === false ? " <span class=\"warn\">His site's Plan tab changed since Flight Plan last matched it, so a pick may differ slightly until it's updated.</span>" : ""}`
    : CY.busy ? `loading NYCypher's <a href="https://www.saero.org/" target="_blank" rel="noopener noreferrer">saero.org</a> planner to run on your locks; meanwhile, his advice for the nearest lock size.`
    : `his <a href="https://www.saero.org/" target="_blank" rel="noopener noreferrer">saero.org</a> advice for the nearest lock size (his planner couldn't run on your locks just now${CY.err ? ": " + esc(CY.err) : ""}).`;
  let verdict = "";
  if (exact.length) {
    const R = exact.map(L => CY.res.byName["#" + L.id]), plan = R.reduce((a, r) => a + (r.plan || 0), 0), stay = R.reduce((a, r) => a + (r.stay || 0), 0);
    const mv = R.filter(r => r.move);
    verdict = ` His Plan tab: about <b>${esc(money(plan))}/day</b> vs ${esc(money(stay))}/day if ${exact.length === 1 ? "it stays" : "they stay"} (his 47h estimate). His Advice tab says ${mv.length ? `move ${mv.length === exact.length ? (exact.length === 1 ? "now" : "all " + exact.length) : mv.length + " of " + exact.length}` : "stay for now (the gain doesn't clear his bar)"}.`;
  }
  return `<div class="banner small" style="margin:0 0 10px"><b>Cypher's picks</b>: ${head}${verdict} ${nets} <b>Pure:</b> none of our rules apply; our model only prices it. Turning any knob switches to Custom (our model). <a href="docs.html#friends">More</a></div>`;
}
function poolRow(l) {
  const r = l.row, col = typeColor(r.type);
  const nc = l.cost != null ? l.cost : r.cost, where = r.chain && r.chain !== "base" ? `${r.chain_name}${nc ? ` · after ${money(nc)} network costs` : ""}` : "";
  const jr = jpnRank(r.gauge);
  const tags = [where, TYPE_NAME[r.type] || r.type, jr ? "JPN #" + jr : "", l.ext && !l.ext.priced ? "not priced by our model" : "", r.fee_led ? "fee-led" : "", r.rank48 && r.rank48 <= 5 ? "crowded" : "", r.fading ? "fading" : "", l.small ? "small pool" : ""].filter(Boolean).join(" · ");
  const apr = l.aero && S.D.px ? l.expect_usd / (l.aero * S.D.px) * (365 * 24 / 47) * 100 : null;
  const st = (r.streams || [])[0];
  return `<details class="pool"><summary><span class="pdot" style="--c:${col}"></span><span class="pname">${esc(r.name)}<small>${esc(tags)}</small><span class="pbar"><i style="--c:${col};width:${Math.min(100, l.pct * 4)}%"></i></span></span><span class="ppct num">${l.pct}<small>%</small><em>${fmtA(l.aero)} AERO</em></span><span class="chev">▶</span></summary>
    <div class="drawer"><div class="tiles">
      <div class="tile"><div class="k">Expected · 47h</div><div class="v num">${money(l.expect_usd)} <small>${money(l.expect_low_usd)} to ${money(l.expect_high_usd)}</small></div></div>
      <div class="tile"><div class="k">APR</div><div class="v num">${apr != null ? apr.toFixed(0) + "%" : "-"}</div></div>
      <div class="tile"><div class="k">Fees · day</div><div class="v num">${money(r.fee_day)} <small>to allocators</small></div></div>
      <div class="tile"><div class="k">Incentives · 47h</div><div class="v num">${money(r.inc_w)}${st ? ` <small>${esc(st.tok)} to ${esc(fmtTs(st.end))}</small>` : ""}</div></div>
      <div class="tile"><div class="k">Allocated to it ${r.chain && r.chain !== "base" ? (r.age_h != null ? r.age_h + "h ago" : "at the scan") : "now"}</div><div class="v num">${r.alloc ? (r.alloc / 1e6).toFixed(2) + "M" : "-"} <small>${l.slice != null ? `you'd be ${(l.slice * 100).toFixed(1)}%` : "not on this hour's scan"}</small></div></div>
    </div>
    <div class="addr">pool <code data-copy="${esc(r.pool)}">${esc(r.pool)}</code></div>
    <div class="addr">gauge <code data-copy="${esc(r.gauge)}">${esc(r.gauge)}</code></div></div></details>`;
}
// The four knobs drive hidden range inputs (same ranges / steps / wiring as the old sliders), so nothing downstream changes.
const KNOBS = [["n", "Pools", 0, 10, 1], ["memory", "Fee lookback", 0, 100, 5], ["caution", "Avoid crowds", 0, 200, 10], ["streams", "Count incentives", 0, 100, 25]];
function knobVal(k) {
  const d = S.dial;
  // words, not raw numbers (11/6/2026): Fee lookback 4 days ... 12 hours; Avoid crowds Low / Normal / High (+ the
  // multiplier when not 1x); Count incentives Fees only ... Full
  return k === "n" ? (d.n ? String(d.n) : "Auto") : k === "memory" ? (d.memory <= 0 ? "4 days" : d.memory >= 1 ? "12 hours" : d.memory < 0.45 ? "Long mix" : d.memory <= 0.55 ? "Mixed" : "Short mix")
    : k === "caution" ? (Math.abs(d.caution - 1) < 0.05 ? "Normal" : (d.caution < 1 ? "Low " : "High ") + d.caution.toFixed(1) + "x")
    : d.streams <= 0 ? "Fees only" : d.streams >= 1 ? "Full" : Math.round(d.streams * 100) + "%";
}
function knobSvg() {   // 270 degree arc from -135 to +135 (0 = straight up): a track, the filled part, a dot at the value
  return `<svg viewBox="0 0 62 62" aria-hidden="true"><circle class="kc" cx="31" cy="31" r="20"/><path class="kt" d=""/><path class="kv" d=""/><circle class="kp" r="3.2" cx="31" cy="31"/></svg>`;
}
function arc(a0, a1) {
  const R = 25, P2 = a => [31 + R * Math.sin(a * Math.PI / 180), 31 - R * Math.cos(a * Math.PI / 180)];
  const [x0, y0] = P2(a0), [x1, y1] = P2(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
function drawKnob(k) {
  const [, , lo, hi] = KNOBS.find(x => x[0] === k), inp = $("d-" + k), el = $("k-" + k);
  const v = Number(inp.value), f = (v - lo) / (hi - lo), a = -135 + 270 * f;
  el.querySelector(".kt").setAttribute("d", arc(-135, 135));
  el.querySelector(".kv").setAttribute("d", f > 0.004 ? arc(-135, a) : "");
  const dot = el.querySelector(".kp"); dot.setAttribute("cx", (31 + 25 * Math.sin(a * Math.PI / 180)).toFixed(2)); dot.setAttribute("cy", (31 - 25 * Math.cos(a * Math.PI / 180)).toFixed(2));
  el.setAttribute("aria-valuenow", String(v)); el.setAttribute("aria-valuetext", knobVal(k));
  $("v-" + k).textContent = knobVal(k);
}
function dialHtml() {
  return `<div class="dial"><div class="seglabel">Strategy</div>
    <div class="seg" id="presets">${["steady", "balanced", "aggressive", "jpn", "cypher", "custom"].map(k => `<button type="button" data-preset="${k}" title="${esc(PRESET_NAME[k])}">${PRESET_BTN[k]}</button>`).join("")}</div>
    <div class="knobs">${KNOBS.map(([k, name, lo, hi, st]) => `<div class="knob"><b id="v-${k}"></b><div class="kd" id="k-${k}" role="slider" tabindex="0" aria-label="${name}" aria-valuemin="${lo}" aria-valuemax="${hi}">${knobSvg()}</div><span>${name}</span><input type="range" class="hidden" id="d-${k}" min="${lo}" max="${hi}" step="${st}" tabindex="-1" aria-hidden="true"></div>`).join("")}</div>
    <div class="dialfoot"><span style="display:inline-flex;gap:12px;flex-wrap:wrap"><label class="sw"><input type="checkbox" id="d-trust"> Trust spikes</label><label class="sw"><input type="checkbox" id="d-base"> Base only</label></span><a href="docs.html#dial">What each dial does</a></div></div>`;
}
function wireKnobs() {
  for (const [k, , lo, hi, st] of KNOBS) {
    const el = $("k-" + k), inp = $("d-" + k);
    const set = v => { v = Math.max(lo, Math.min(hi, Math.round(v / st) * st)); if (v !== Number(inp.value)) { inp.value = v; inp.dispatchEvent(new Event("input")); } };
    // Rotary drag (11/6/2026, was up/down): circle the finger around the knob and the dot follows it along the 270
    // degree arc. Relative, so a press never jumps the value; it never wraps across the gap at the bottom, and points within 6px of the centre are ignored (the angle is meaningless there).
    let a0 = null, acc = 0;
    const ang = e => { const r = el.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2); return Math.hypot(x, y) < 6 ? null : Math.atan2(x, -y) * 180 / Math.PI; };
    el.addEventListener("pointerdown", e => { e.preventDefault(); el.focus(); el.setPointerCapture(e.pointerId); a0 = ang(e); acc = -135 + 270 * (Number(inp.value) - lo) / (hi - lo); el.classList.add("turning"); });
    el.addEventListener("pointermove", e => {
      if (!el.classList.contains("turning")) return; e.preventDefault();
      const a = ang(e); if (a == null) return; if (a0 == null) { a0 = a; return; }
      let d = a - a0; if (d > 180) d -= 360; else if (d < -180) d += 360; a0 = a;
      // acc tracks the finger up to the bottom of the gap (+-180), so after an overshoot the dot waits at the end
      // until the finger comes back to it; the value itself stops at each end of the arc
      acc = Math.max(-180, Math.min(180, acc + d)); set(lo + (Math.max(-135, Math.min(135, acc)) + 135) / 270 * (hi - lo));
    });
    const up = e => { if (!el.classList.contains("turning")) return; el.classList.remove("turning"); a0 = null; try { el.releasePointerCapture(e.pointerId); } catch (er) {} };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    el.addEventListener("keydown", e => {
      const d = { ArrowUp: st, ArrowRight: st, ArrowDown: -st, ArrowLeft: -st, PageUp: st * 2, PageDown: -st * 2 }[e.key];
      if (e.key === "Home") { e.preventDefault(); set(lo); } else if (e.key === "End") { e.preventDefault(); set(hi); } else if (d) { e.preventDefault(); set(Number(inp.value) + d); }
    });
  }
}
function readSliders() {
  return { n: Number($("d-n").value), memory: Number($("d-memory").value) / 100, trust: $("d-trust").checked, caution: Number($("d-caution").value) / 100, streams: Number($("d-streams").value) / 100, baseOnly: $("d-base").checked };
}
function updateDial() {
  const d = S.dial;
  $("d-n").value = d.n; $("d-memory").value = Math.round(d.memory * 100); $("d-trust").checked = d.trust; $("d-base").checked = !!d.baseOnly; $("d-caution").value = Math.round(d.caution * 100); $("d-streams").value = Math.round(d.streams * 100);
  for (const [k] of KNOBS) drawKnob(k);
  document.querySelectorAll("#presets button").forEach(b => { b.classList.toggle("on", b.dataset.preset === d.preset); b.classList.toggle("agg", ["aggressive", "jpn", "cypher"].includes(b.dataset.preset)); });
}
function renderPlan() {
  const el = $("plan");
  if (!S.addr || !S.locks.length || !S.plan) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const p = S.plan;
  if (!$("dial")) {
    el.innerHTML = `<h2>Your split <span id="planHead"></span></h2><div class="body"><div id="dial">${dialHtml()}</div><div id="legs"></div></div>`;
    document.querySelectorAll("#presets button").forEach(b => b.addEventListener("click", () => { if (b.dataset.preset !== "custom") setDial({ ...PRESETS[b.dataset.preset], baseOnly: !!S.dial.baseOnly }); }));
    for (const id of ["d-n", "d-memory", "d-caution", "d-streams"]) $(id).addEventListener("input", () => setDial({ ...readSliders(), src: id === "d-n" && S.dial.src === "jpn" ? "jpn" : null }));
    wireKnobs();
    $("d-trust").addEventListener("change", () => setDial(readSliders()));
    $("d-base").addEventListener("change", () => setDial({ ...readSliders(), src: S.dial.src || null }));
  }
  updateDial();
  $("planHead").textContent = `${PRESET_NAME[S.dial.preset]} · ${fmtTs(p.start)} · 47h`;
  const types = [...new Set(p.legs.map(l => l.type))].filter(Boolean);
  const dried = S.locks.filter(L => L.dry || L.sent).length, sums = p.placed === 100, mine = S.locks.filter(owns), ready = S.locks.filter(canSend), sent = S.locks.filter(L => L.sent);
  let cta;
  if (!sums) cta = p.src ? `<button class="cta gbtn gviolet" disabled>Can't sign this one</button><div class="csub">${p.legs.length ? "A pool in it isn't on our scanner's list of Base pools. Copy it into the Aero app if you trust it, or pick another preset" : "No picks to place right now"}</div>` + (p.legs.length ? `<button class="gbtn" id="cta" data-act="copy" style="margin-top:8px">Copy the split</button>` : "")
    : `<button class="cta gbtn gviolet" disabled>Pick more pools to place 100%</button>`;
  else if (dried < S.locks.length) cta = `<button class="cta gbtn gviolet" id="cta" data-act="dry">Dry run ${S.locks.length > 1 ? "all " + S.locks.length + " locks" : "#" + S.locks[0].id}</button><div class="csub">A free rehearsal on the chain · nothing is signed</div>`;
  else if (ready.length) cta = `<button class="cta gbtn gviolet" id="cta" data-act="send">Allocate ${ready.length === 1 ? "#" + ready[0].id : ready.length + " locks"} · ${ready.length} signature${ready.length === 1 ? "" : "s"}</button><div class="csub">${ready.some(L => L.dry.x) ? "One allocate call per step, to the Aero Voter on Base; other networks carry a small ETH fee" : "One allocate call per lock, to the Aero Voter, 0 ETH"} · dry run passed</div>`;
  else if (mine.length && sent.length === mine.length) cta = `<button class="cta gbtn ggreen" disabled>Allocated ✓</button><div class="csub">${sent.length} lock${sent.length === 1 ? "" : "s"} allocated this window</div>`;
  else if (mine.length && mine.some(L => L.dry && L.dry.ok && !isOpenNow(L))) cta = `<button class="cta gbtn gviolet" disabled>Opens ${esc(fmtTs(Math.min(...mine.filter(L => !isOpenNow(L)).map(opensAt))))}</button><div class="csub">Dry run OK · the Allocate button unlocks when the window opens</div>`;
  else { const ok = S.locks.filter(L => L.dry && L.dry.ok).length; cta = `<button class="cta gbtn gviolet" id="cta" data-act="copy">Copy the split for the Aero app</button><div class="csub">${ok} of ${S.locks.length} lock${S.locks.length === 1 ? "" : "s"} dry-ran OK · ${S.account ? "connect the wallet that owns these locks to sign here, or" : "connect to sign here, or"} allocate these percentages in the Aero app</div>`; }
  const sv = S.dial.src === "cypher" ? null : stayVerdict(), pctTxt2 = x => !isFinite(x) ? "new allocation" : (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(0) + "%";
  const stayBox = !sv ? "" : sv.unknown
    ? `<div class="banner small" style="margin:0 0 10px"><b>Move or stay:</b> can't compare: ${Math.round(sv.share * 100)}% of your Base allocation sits in pools this page doesn't price (retired or off the scan), or every lock allocates on another network.</div>`
    : `<div class="banner ${sv.move ? "ok" : ""} small" style="margin:0 0 10px"><b>${sv.move ? "Worth moving" : "Staying is about as good"}.</b> Your current allocation: ${money(sv.stayUsd)} this window · this split: ${money(sv.planUsd)} (<b class="num">${sv.gain >= 0 ? "+" : "−"}${money(Math.abs(sv.gain))}</b>, ${pctTxt2(sv.pct)}).${sv.move ? "" : ` The bar to move is +${MOVE_PCT}% and +${money(MOVE_USD_DAY * S.D.consts.H47 / 86400)} a window after about ${money(sv.fees)} in network fees; an allocation keeps earning until you change it, so staying costs nothing.`}${sv.parked > 1 ? ` ${fmtA(sv.parked)} AERO isn't allocated at all right now.` : ""}${sv.elsewhere > 0 ? ` Locks allocated on other networks are left out of this comparison.` : ""} <a href="docs.html#stay">How</a></div>`;
  const legend = types.length ? `<div class="legend">${types.map(t => `<span><i class="pdot" style="--c:${typeColor(t)}"></i>${esc(TYPE_NAME[t] || t)}</span>`).join("")}</div>` : "";
  const rows = p.perLock
    ? S.locks.map(L => `<div class="lockhead">#${L.id} <span class="num">${fmtA(lockAero(L))} AERO · ${isOpen(L) ? "open" : "opens " + esc(fmtTs(L.next))} · ${money(L.plan.expect_usd)}</span></div>` + (L.plan.legs.length ? L.plan.legs.map(poolRow).join("") : `<div class="small warn">No pool fits this lock under the rules.</div>`)).join("")
    : p.legs.map(poolRow).join("");
  const netBox = p.note ? `<div class="banner warn small" style="margin:0 0 10px"><b>Other networks:</b> ${esc(p.note)}${p.carrierId ? ` Those pools go on #${p.carrierId} only; your other locks stay on Base.` : ""} <b>Careful:</b> ${esc(xRecord())} Turn on <b>Base only</b> to keep everything on Base. <a href="docs.html#networks">How</a></div>` : "";
  $("legs").innerHTML = extNote() + netBox + stayBox + legend + rows + (p.warnings.length ? `<div class="banner warn small">${esc(p.warnings.join(" "))}</div>` : "") + cta;
  el.querySelectorAll("[data-copy]").forEach(c => c.addEventListener("click", () => copy(c.dataset.copy)));
  const c = $("cta"); if (c) c.addEventListener("click", () => c.dataset.act === "dry" ? dryAll() : c.dataset.act === "send" ? sendAll() : copy(splitText()));
}
// what the backtest says about this preset with every network vs Base only, at the nearest tested size
function xRecord() {
  const B = S.BT, k = S.dial && S.dial.preset;
  const fallback = "In the backtest so far, splits that added another network have usually paid less than staying on Base; forecasts on other networks have run high.";
  if (!B || !B.rows || (k !== "balanced" && k !== "steady")) return fallback;
  const sizes = Object.keys(B.rows).map(Number), A = sizes.reduce((a, b) => Math.abs(Math.log(b / totalAero())) < Math.abs(Math.log(a / totalAero())) ? b : a);
  const r = B.rows[A] || {}, x = r[k + "_x"], b = r[k];
  if (!x || !b) return fallback;
  return `in the backtest (${x.n} past starts, ${fmtA(A)} AERO) ${PRESET_NAME[k]} with every network paid $${x.median.toFixed(2)} per 1,000 AERO a window (median) vs $${b.median.toFixed(2)} on Base only, and when it added a network it usually paid less than the forecast said. Treat the gain above as optimistic.`;
}
const legsText = legs => legs.map(l => `${l.pct}% ${l.label}${l.chain && l.chain !== "base" ? " (" + (l.chain_name || l.chain) + ")" : ""}`).join(", ");
function splitText() { return `Flight Plan split (${PRESET_NAME[S.dial.preset]}), window from ${fmtTs(S.plan.start)}:\n` + (S.plan.perLock ? S.locks.map(L => `#${L.id}: ` + L.plan.legs.map(l => `${l.pct}% ${l.label}${l.chain && l.chain !== "base" ? " (" + l.chain_name + ")" : ""}`).join(", ")).join("\n") : S.plan.legs.map(l => `${l.pct}% ${l.label}${l.chain && l.chain !== "base" ? " (" + (l.chain_name || l.chain) + ")" : ""}`).join("\n")); }
function renderLocks() {
  const el = $("locks");
  if (!S.locks.length) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const now = Date.now() / 1000;
  el.innerHTML = `<h2>Locks <span>${S.locks.length}${S.total > LOCK_MAX ? ` of ${S.total}` : ""} · ${fmtA(totalAero())} AERO</span></h2><div class="body">` + (S.total > LOCK_MAX ? `<div class="banner warn small">This wallet holds ${S.total} locks; the first ${LOCK_MAX} are shown and counted. The rest are not in the split, the rank or the earnings.</div>` : "") + S.locks.map(L => {
    const open = L.next ? L.next <= now : true, mine = owns(L);
    const net = L.booked === 0n && L.elsewhere.length ? ` · <span class="warn">allocated on ${esc(L.elsewhere.map(c => NET[c] || "chain " + c).join(" + "))}</span>` : "";
    const who = S.account ? (mine ? ` · <span class="ok">yours</span>` : ` · <span class="mut2">not the connected wallet</span>`) : "";
    const planOk = planFor(L) && planFor(L).placed === 100;
    const btns = L.sent ? "" : `<button class="sm" data-dry="${L.id}" ${planOk ? "" : "disabled"}>Dry run</button>` + (mine ? `<button class="sm gbtn gviolet" data-send="${L.id}" ${canSend(L) ? "" : "disabled"}>Allocate</button>` : "");
    return `<div class="lock"><div class="lhead">${ring(L)}<div class="linfo"><div class="lid">#${L.id}</div><div class="lmeta num">${fmtA(lockAero(L))} AERO · ${open ? `<span class="ok">open</span>` : "opens " + esc(fmtTs(L.next))}${net}${who}</div></div>
      <div class="lbtns">${btns}</div></div><div class="small">${L.status || ""}</div></div>`;
  }).join("") + `${S.account ? "" : `<p class="small mut2" style="margin:8px 0 0">Paste-only is read-only. Connect the wallet that owns these locks to sign here.</p>`}</div>`;
  el.querySelectorAll("[data-dry]").forEach(b => b.addEventListener("click", () => dryRun(S.locks.find(L => L.id === Number(b.dataset.dry)))));
  el.querySelectorAll("[data-send]").forEach(b => b.addEventListener("click", () => send(S.locks.find(L => L.id === Number(b.dataset.send)))));
  el.querySelectorAll("[data-copy]").forEach(c => c.addEventListener("click", () => copy(c.dataset.copy)));
  el.querySelectorAll("[data-copyoff]").forEach(c => c.addEventListener("click", e => { e.preventDefault(); const L = S.locks.find(x => x.id === Number(c.dataset.copyoff)), o = L && offPick(L); if (o) copy(`Lock #${L.id}: ${legsText(planFor(L).legs)} (allocate it in the Aero app)`); }));
}
const voteTxt = x => x.vote != null && Math.abs(x.vote - x.apr) >= 0.005 ? `allocated part ${(x.vote * 100).toFixed(1)}%` : "";
// "Now" looks back (earned over about the last 12 hours, between two every-lock reads); "Est. next 47h" looks forward
// (what the current votes pay at today's pool rates, raw); Lifetime = everything earned since the lock first voted
// (every claim on every network + what is waiting)
const lifeSince = idxs => { let m = null; for (const i of idxs) { const e = S.RK.earn.get(i); if (e && e.lifeSince) m = m == null ? e.lifeSince : Math.min(m, e.lifeSince); } return m; };
const vsTxt = vs => vs == null ? "-" : Math.abs(vs) < 0.5 ? "0%" : (vs >= 0 ? "+" : "−") + Math.abs(vs).toFixed(0) + "%";
function rankRows(idxs, thr) {
  const Rk = S.RK, names = { now: "Now", fwd: "Est. next 47h", "2d": "2 days", "7d": "7 days", life: "Lifetime" };
  const head = `<div class="rt rth"><div></div><div>You</div><div>Avg</div><div>vs avg</div><div>Rank</div></div>`;
  return `<div class="rtab">` + head + ["now", "fwd", "2d", "7d", "life"].map(k => {
    const x = rankLine(k, idxs, S.mode, thr);
    if (!x) return `<div class="rt"><div class="p">${names[k]}</div><div class="mut2 small" style="grid-column:2 / 6">${k === "life" ? "valuing claims" : k === "fwd" ? "after the next scan" : "building history"}</div></div>`;
    const wk = x.apr * 1000 * Rk.px / 52, good = x.apr >= x.avg, vt = voteTxt(x), vs = x.avg ? (x.apr / x.avg - 1) * 100 : null;
    const per = Rk.per[k], sm = t => `<small>${t}</small>`, ls = k === "life" && lifeSince(idxs);
    const span = k === "now" && per ? sm(`${clock(per.t0).replace(" ET", "")} to ${clock(per.t1)}`) : k === "fwd" ? sm("forecast") : ls ? sm("since " + new Date(ls * 1000).toLocaleDateString([], { month: "numeric", day: "numeric" })) : "";
    return `<div class="rt"><div class="p">${names[k]}${span}</div>
      <div class="ty num ${good ? "ok" : "warn"}">${(x.apr * 100).toFixed(1)}%<small>${vt ? vt + "<br>" : ""}$${wk.toFixed(2)}/wk/1k</small></div>
      <div class="ta num">${(x.avg * 100).toFixed(1)}%<small>med ${(x.med * 100).toFixed(1)}%</small></div>
      <div class="tv num ${vs == null ? "mut2" : vs >= 0 ? "ok" : "warn"}">${vsTxt(vs)}</div>
      <div class="tk num ${x.top <= 25 ? "ok" : x.top <= 50 ? "acc" : "mut2"}">top ${x.top < 10 ? x.top.toFixed(1) : Math.round(x.top)}%<small title="of ${x.of.toLocaleString()}">#${x.rank.toLocaleString()}</small></div></div>`;
  }).join("") + `</div>`;
}
function histRows(ids, thr) {
  const H = S.H;
  if (!H) return `<div class="rwh"><span>You vs the average, over time</span></div><div class="small mut2" style="padding:6px 0">${S.histBusy ? "Loading the history…" : "History unavailable."}</div>`;
  const L = S.logv === "day" ? H.days : H.weeks;
  const label = (w, i) => {
    if (S.logv === "week") return (i === 0 && !w.final ? "This week" : "Week of " + new Date(w.wk * 1000).toLocaleDateString([], { month: "numeric", day: "numeric", timeZone: "UTC" })) + (w.final ? "" : ` <small>so far, to ${clock(w.to)}</small>`);
    if (i === 0 && !w.final) return `Today <small>so far, to ${clock(w.to)}</small>`;
    return new Date(w.wk * 1000).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone: ET })
      + (w.partial ? ` <small>from ${clock(w.from)}</small>` : w.final && w.to - w.from < 18 * 3600 ? ` <small>${Math.round((w.to - w.from) / 3600)}h read</small>` : "");
  };
  const head = `<div class="rwh"><span>You vs the average, over time</span><span class="seg tight"><button type="button" data-logv="week" class="${S.logv === "week" ? "on" : ""}">By week</button><button type="button" data-logv="day" class="${S.logv === "day" ? "on" : ""}">By day</button></span></div>`;
  const cols = `<div class="rw rwc"><div>${S.logv === "day" ? "Day" : "Week"}</div><div>You</div><div>Avg</div><div>vs avg</div><div>${S.mode === "wallet" ? "Wallet rank" : "Rank"}</div></div>`;
  const rows = L.map((w, i) => {
    const x = histLine(w, ids, S.mode, thr);
    if (!x) return `<div class="rw"><div class="wl">${label(w, i)}</div><div class="wy mut2">-</div><div class="wa mut2">-</div><div class="wv mut2">-</div><div class="wr mut2">not tracked yet</div></div>`;
    const vs = x.avg ? (x.apr / x.avg - 1) * 100 : null, cls = vs == null ? "mut2" : vs >= 0 ? "ok" : "warn", vt = voteTxt(x);
    return `<div class="rw"><div class="wl">${label(w, i)}</div>
      <div class="wy num">${(x.apr * 100).toFixed(1)}%${vt ? "<small>" + vt + "</small>" : ""}</div>
      <div class="wa num">${x.avg != null ? (x.avg * 100).toFixed(1) + "%" : "-"}</div>
      <div class="wv num ${cls}">${vsTxt(vs)}</div>
      <div class="wr num">${x.rank ? "#" + x.rank.toLocaleString() + `<small>of ${x.of.toLocaleString()}</small>` : "-"}</div></div>`;
  }).join("");
  const running = L[0] && !L[0].final ? `<div class="small mut2" style="margin:4px 0 0">The running row ends at the last every-lock read (${esc(ago(L[0].to))}; every lock is read about every 3 hours). Days run midnight to midnight US Eastern; weeks are Aero epochs (Thursday 00:00 UTC).</div>` : "";
  const since = S.logv === "day" && H.days_since ? `<div class="small mut2" style="margin:4px 0 6px">The daily log starts ${new Date(H.days_since * 1000).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone: ET })}: the reads only reach back about 8 days, and a lock only has history from the day it was first tracked.</div>` : "";
  return head + (rows ? `<div class="rwt">${cols}${rows}</div>` : `<div class="small mut2" style="padding:6px 0">Nothing logged yet.</div>`) + running + since;
}
// ---------- "Rank among locks": you, each allocator product and the average holder side by side ----------
// one row each, one column per period (APR on the whole lock + place); then the same rows as a daily APR line chart
const CMP_COLS = [["fwd", "Est. next<br>47h"], ["2d", "Last<br>2 days"], ["7d", "Last<br>7 days"], ["life", "Life-<br>time"]];
const SER = ["var(--s1)", "var(--s2)", "var(--s3)"];      // fixed order: a product keeps its colour whatever else shows
function cmpEntities(idxs) {
  const n = k => `${k.toLocaleString()} lock${k === 1 ? "" : "s"}${k > 1 ? " as one" : ""}`;
  const out = idxs.length ? [{ name: "My locks", sub: n(idxs.length), idxs, col: "var(--fg)", me: true }] : [];
  Object.entries(S.RK.groups).forEach(([name, g], k) => out.push({ name, sub: n(g.length), idxs: g, col: SER[k] || null }));
  return out;
}
function cmpTable(ents, thr) {
  const head = `<div class="ct cth"><div></div>${CMP_COLS.map(([, t]) => `<div>${t}</div>`).join("")}</div>`;
  const rows = ents.map(e => `<div class="ct${e.me ? " me" : ""}"><div class="cn">${e.col ? `<i style="background:${e.col}"></i>` : ""}${esc(e.name)}<small>${e.sub}</small></div>` + CMP_COLS.map(([k]) => {
    const x = rankLine(k, e.idxs, S.mode, thr);
    if (!x) return `<div class="cv mut2">-</div>`;
    return `<div class="cv num"><b class="${x.apr >= x.avg ? "ok" : "warn"}">${(x.apr * 100).toFixed(1)}%</b><small title="${x.rank.toLocaleString()} of ${x.of.toLocaleString()}">#${x.rank.toLocaleString()}/${x.of.toLocaleString()}</small></div>`;
  }).join("") + `</div>`).join("");
  const avg = `<div class="ct avg"><div class="cn mut"><i class="dash"></i>Average ${S.mode === "wallet" ? "wallet" : "holder"}<small>weighted by AERO</small></div>` + CMP_COLS.map(([k]) => {
    const st = periodStats(k, S.mode, thr); return `<div class="cv num">${st ? `<b>${(st.avg * 100).toFixed(1)}%</b>` : `<span class="mut2">-</span>`}</div>`;
  }).join("") + `</div>`;
  return `<div class="ctab">${head}${rows}${avg}</div>`;
}
const APR_RANGES = [["week", "Week", 8], ["month", "Month", 31], ["3m", "3 months", 92], ["all", "All", Infinity]];
function aprSeries(ents, thr) {      // oldest day first; null where a row has no reading that day
  const H = S.H, days = H.days.slice().reverse(), Rk = S.RK;
  const lines = ents.filter(e => e.col).map(e => {
    const ids = e.idxs.map(i => Rk.ids[i]);
    return { ...e, v: days.map(d => { const x = histLine(d, ids, S.mode, thr); return x ? x.apr : null; }) };
  });
  lines.push({ name: `Average ${S.mode === "wallet" ? "wallet" : "holder"}`, col: "var(--mut2)", avg: true,
    v: days.map(d => { const st = stats(S.mode === "wallet" ? d.w : d.rows.filter(x => !H.team.has(x.i)), thr); return st ? st.avg : null; }) });
  return { days, lines };
}
function aprChart(ents, thr) {
  const H = S.H, head = `<div class="rwh"><span>Daily APR</span>`;
  if (!H) return head + `</div><div class="small mut2" style="padding:6px 0">${S.histBusy ? "Loading the history…" : "History unavailable."}</div>`;
  const n = H.days.length, opts = APR_RANGES.filter(([, , m], i) => i === 0 || n > APR_RANGES[i - 1][2]);
  if (!opts.some(o => o[0] === S.aprv)) S.aprv = "week";
  const seg = opts.length > 1 ? `<span class="seg tight">${opts.map(([k, t]) => `<button type="button" data-aprv="${k}" class="${S.aprv === k ? "on" : ""}">${t}</button>`).join("")}</span>` : "";
  const all = aprSeries(ents, thr), cut = Math.max(0, n - APR_RANGES.find(o => o[0] === S.aprv)[2]);
  const days = all.days.slice(cut), lines = all.lines.map(l => ({ ...l, v: l.v.slice(cut) }));
  S.aprData = { days, lines };
  if (days.length < 2) return head + seg + `</div><div class="small mut2" style="padding:6px 0">Not enough days logged yet.</div>`;
  const vals = lines.flatMap(l => l.v).filter(v => v != null).map(v => v * 100), top = Math.max(5, ...vals);
  let step = 100; for (const s of [5, 10, 20, 25, 50, 100]) if (top / s <= 4) { step = s; break; }
  const ymax = step * Math.ceil(top / step), W = 400, Ht = 200, L = 32, R = 10, T = 8, B = 22, pw = W - L - R, ph = Ht - T - B;
  const X = j => L + (days.length === 1 ? pw / 2 : j / (days.length - 1) * pw), Y = v => T + ph - Math.max(0, v * 100) / ymax * ph;
  const g = [];
  for (let v = 0; v <= ymax; v += step) g.push(`<line x1="${L}" x2="${W - R}" y1="${Y(v / 100).toFixed(1)}" y2="${Y(v / 100).toFixed(1)}" class="cg"/><text x="${L - 5}" y="${(Y(v / 100) + 3.5).toFixed(1)}" class="cx" text-anchor="end">${v}%</text>`);
  const every = Math.ceil(days.length / 8), lab = d => new Date(d.wk * 1000).toLocaleDateString([], { month: "numeric", day: "numeric", timeZone: ET });
  days.forEach((d, j) => { if ((days.length - 1 - j) % every === 0) g.push(`<text x="${X(j).toFixed(1)}" y="${Ht - 6}" class="cx" text-anchor="middle">${lab(d)}</text>`); });
  g.push(`<line class="cxh" x1="0" x2="0" y1="${T}" y2="${T + ph}" style="display:none"/>`);
  const dots = days.length <= 16;
  // the average and the products first, your line last (on top)
  [...lines.filter(l => !l.me), ...lines.filter(l => l.me)].forEach(l => {
    let d = "", pen = false;
    l.v.forEach((v, j) => { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + X(j).toFixed(1) + "," + Y(v).toFixed(1); pen = true; });
    if (d) g.push(`<path class="ln${l.me ? " me" : ""}${l.avg ? " avg" : ""}" d="${d}" style="stroke:${l.col}"/>`);
    if (dots && !l.avg) l.v.forEach((v, j) => { if (v != null) g.push(`<circle class="dt" cx="${X(j).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${l.me ? 3.5 : 3}" style="fill:${l.col}"/>`); });
  });
  const cw = pw / Math.max(1, days.length - 1);
  const hits = days.map((d, j) => `<rect class="ch" x="${Math.max(L, X(j) - cw / 2).toFixed(1)}" y="${T}" width="${(Math.min(W - R, X(j) + cw / 2) - Math.max(L, X(j) - cw / 2)).toFixed(1)}" height="${ph}" data-j="${j}" data-x="${X(j).toFixed(1)}"/>`).join("");
  const lg = `<div class="lg">${lines.map(l => `<span><i class="ln" style="background:${l.col}${l.avg ? ";opacity:.7" : ""}"></i>${esc(l.name)}</span>`).join("")}</div>`;
  const pc = v => v == null ? "-" : (v * 100).toFixed(1) + "%";
  const table = `<details style="margin-top:6px"><summary class="small mut" style="cursor:pointer">Table view (APR per day)</summary><div class="tw" style="margin-top:6px"><table><tr><th>Day</th>${lines.map(l => `<th class="num">${esc(l.name)}</th>`).join("")}</tr>`
    + days.map((d, j) => `<tr><td>${lab(d)}${d.final ? "" : " <small class='mut2'>so far</small>"}</td>${lines.map(l => `<td class="num">${pc(l.v[j])}</td>`).join("")}</tr>`).reverse().join("") + `</table></div></details>`;
  return head + seg + `</div><div class="viz" id="aprviz">${lg}<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Daily APR on the whole lock: your locks, each allocator product and the average, per day">${g.join("")}${hits}</svg><div class="tip"></div></div>`
    + `<div class="small mut2" style="margin:4px 0 0">Days run midnight to midnight US Eastern; the last point is today so far. A day's APR is lumpy when rewards land at once.</div>` + table;
}
function wireAprChart(el) {
  const box = el.querySelector("#aprviz"); if (!box || !S.aprData) return;
  const tip = box.querySelector(".tip"), xh = box.querySelector(".cxh"), { days, lines } = S.aprData;
  const show = r => {
    const j = +r.dataset.j, d = days[j];
    tip.innerHTML = "";
    const hd = document.createElement("div");
    hd.textContent = new Date(d.wk * 1000).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", timeZone: ET }) + (d.final ? "" : " (so far)");
    tip.appendChild(hd);
    lines.filter(l => l.v[j] != null).sort((a, b) => b.v[j] - a.v[j]).forEach(l => {
      const e = document.createElement("div"), sw = document.createElement("i"), b = document.createElement("b");
      sw.style.background = l.col; b.textContent = (l.v[j] * 100).toFixed(1) + "%";
      e.appendChild(sw); e.appendChild(b); e.appendChild(document.createTextNode(" " + l.name)); tip.appendChild(e);
    });
    xh.setAttribute("x1", r.dataset.x); xh.setAttribute("x2", r.dataset.x); xh.style.display = "";
    tip.style.display = "block";
    const bb = box.getBoundingClientRect(), rr = r.getBoundingClientRect();
    tip.style.left = Math.max(0, Math.min(bb.width - tip.offsetWidth, rr.left - bb.left + rr.width / 2 - tip.offsetWidth / 2)) + "px"; tip.style.top = "26px";
  };
  box.querySelectorAll(".ch").forEach(r => { r.addEventListener("pointerenter", () => show(r)); r.addEventListener("click", () => show(r)); });
  box.querySelector("svg").addEventListener("pointerleave", () => { tip.style.display = "none"; xh.style.display = "none"; });
}
function renderRank() {
  const el = $("rank");
  if (!S.locks.length || !S.RK) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const Rk = S.RK, idxs = lockIdxs(S.locks.map(L => L.id)), aero = totalAero();
  const br = Rk.brackets; if (S.bracket == null) { S.bracket = store.get("bracket", null); if (S.bracket == null) { let b = "all"; for (const [k, t] of br) if (aero >= t) b = k; S.bracket = b; } }
  const thr = (br.find(b => b[0] === S.bracket) || br[0])[1];
  const label = { all: "All", "10k": "10k+", "50k": "50k+", "100k": "100k+", "250k": "250k+", "500k": "500k+", "1m": "1M+" };
  const you = idxs.length ? `<div class="rcard glow"><div class="rch"><b>Your locks</b><span class="num">${S.locks.length} lock${S.locks.length === 1 ? "" : "s"} · ${fmtA(aero)} AERO</span></div>${rankRows(idxs, thr)}${histRows(S.locks.map(L => L.id), thr)}</div>`
    : `<div class="rcard glow"><div class="rch"><b>Your locks</b></div><p class="small mut2">Not in the rank data yet: new locks show up after the next every-lock read (about every 3 hours).</p></div>`;
  const ents = cmpEntities(idxs);
  const cmp = Object.keys(Rk.groups).length ? `<div class="rcard"><div class="rch"><b>Rank among ${S.mode === "wallet" ? "wallets" : "locks"}</b><span>${label[S.bracket] || S.bracket} · green = above the average</span></div>${cmpTable(ents, thr)}${aprChart(ents, thr)}</div>` : "";
  el.innerHTML = `<h2>vs every ${S.mode === "wallet" ? "wallet" : "lock"} <span>APR on the whole lock</span></h2><div class="body">
    <div class="seg" id="mode"><button type="button" data-m="lock" class="${S.mode === "lock" ? "on" : ""}">Every lock</button><button type="button" data-m="wallet" class="${S.mode === "wallet" ? "on" : ""}">Every wallet</button></div>
    <div class="seg" id="brk">${br.map(([k]) => `<button type="button" data-b="${k}" class="${S.bracket === k ? "on" : ""}">${label[k] || k}</button>`).join("")}</div>
    ${you}${cmp}
    <p class="small mut2" style="margin:8px 0 0">All your locks counted as one. The average is weighted by AERO and leaves out the Aero team's 4 locks (about half of all sAERO; they sit out of the rank too); vs avg is your APR against it; the median is the typical lock. "Now" looks back over about the last 12 hours, between two every-lock reads (the times are under it); $/wk/1k is dollars a week per 1,000 AERO; the # under the rank is your place. "Est. next 47h" looks ahead: what each lock's current allocation would pay at today's pool rates if nothing moved (4-day fees with spikes capped, plus live incentives, your own size counted in the pool). Lifetime is everything a lock has earned since it first allocated: every claim on every network plus what is waiting, at today's prices; "Today so far" in the history below starts at midnight, so the two cover different hours and can differ a lot when rewards land in a lump. Autopilot and 40acres are products that allocate for many lockers; in "Rank among locks" each is one combined entry, ranked the same way you are (the # is its place out of every ${S.mode === "wallet" ? "wallet" : "lock"} in the size filter), with the daily APR of each row below. <a href="docs.html#rank">How it's measured</a></p></div>`;
  el.querySelectorAll("#mode button").forEach(b => b.addEventListener("click", () => { S.mode = b.dataset.m; store.set("mode", S.mode); renderRank(); }));
  el.querySelectorAll("#brk button").forEach(b => b.addEventListener("click", () => { S.bracket = b.dataset.b; store.set("bracket", S.bracket); renderRank(); }));
  el.querySelectorAll("[data-logv]").forEach(b => b.addEventListener("click", () => { S.logv = b.dataset.logv; store.set("logv", S.logv); renderRank(); }));
  el.querySelectorAll("[data-aprv]").forEach(b => b.addEventListener("click", () => { S.aprv = b.dataset.aprv; store.set("aprv", S.aprv); renderRank(); }));
  wireAprChart(el);
}
function renderEarn() {
  const el = $("earn");
  if (!S.locks.length || !S.RK) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const Rk = S.RK, p1 = Rk.per["1d"], p7 = Rk.per["7d"];
  const pct = x => x == null ? "-" : (x * 100).toFixed(1) + "%";
  let T = { aero: 0, usd: 0, unc: 0, known: 0, life: 0, lifeN: 0 }, since = null, partial = false;
  const rows = S.locks.map(L => {
    const i = Rk.idOf.get(L.id), e = i != null ? Rk.earn.get(i) : null, r1 = i != null && p1 ? p1.byI.get(i) : null, r7 = i != null && p7 ? p7.byI.get(i) : null;
    T.aero += lockAero(L);
    if (e && e.life != null) { T.life += e.life; T.lifeN++; }
    if (e) { T.usd += e.usd; T.unc += e.unclaimed; T.known++; since = since == null ? e.since : Math.min(since, e.since); if (e.since > Rk.store_from + 3600) partial = true; }
    return `<tr><td>#${L.id}<br><small class="mut2">${fmtA(lockAero(L))} AERO</small></td><td class="num">${r1 ? pct(r1.r) : "-"}</td><td class="num">${r7 ? pct(r7.r) : "-"}</td><td class="num">${e ? money(e.usd) + `<br><small class="mut2">since ${new Date(e.since * 1000).toLocaleDateString([], { month: "numeric", day: "numeric" })}</small>` : `<span class="mut2">not tracked yet</span>`}</td><td class="num">${e ? money(e.unclaimed) : "-"}</td><td class="num">${e && e.life != null ? money(e.life) + (e.lifeSince ? `<br><small class="mut2">since ${new Date(e.lifeSince * 1000).toLocaleDateString([], { month: "numeric", day: "numeric" })}</small>` : "") : "-"}</td></tr>`;
  }).join("");
  const l1 = idxLine(p1), l7 = idxLine(p7);
  const tot = S.locks.length > 1 ? `<tr style="font-weight:600"><td>All<br><small class="mut2" style="font-weight:400">${fmtA(T.aero)} AERO</small></td><td class="num">${pct(l1)}</td><td class="num">${pct(l7)}</td><td class="num">${T.known ? money(T.usd) : "-"}</td><td class="num">${T.known ? money(T.unc) : "-"}</td><td class="num">${T.lifeN ? money(T.life) : "-"}</td></tr>` : "";
  el.innerHTML = `<h2>Earnings <span>read ${esc(ago(Rk.ts))}</span></h2><div class="body">
    <div class="tw"><table><tr><th>Lock</th><th class="num">APR 24h</th><th class="num">APR 7d</th><th class="num">Earned</th><th class="num">Unclaimed</th><th class="num">Lifetime</th></tr>${rows}${tot}</table></div>
    <p class="small mut2" style="margin:8px 0 0">APR = fees and incentives earned over the period on the whole lock, at today's AERO price, annualized. Earned = what the tracker has seen each lock earn since it first read it (claims bridged, every network), at most about 8 days back. Lifetime = everything the lock has earned since it first allocated: every claim on every network plus what is waiting now, at today's prices.${partial ? " One or more of these locks were first read after the tracker's window started, so their Earned covers fewer days." : ""} Unclaimed is what the last read saw waiting, every network. <a href="docs.html#earn">More</a></p></div>`;
  function idxLine(p) { if (!p) return null; const mine = S.locks.map(L => Rk.idOf.get(L.id)).filter(i => i != null).map(i => p.byI.get(i)).filter(Boolean); const c = combine(mine); return c ? c.apr : null; }
}
// ---------- "What actually wins": every ranked lock bucketed by behaviour (data/strategy.json) ----------
function viewerBuckets() {
  if (!S.locks.length || !S.D) return {};
  const counts = S.locks.map(L => Object.keys(L.current).length).filter(n => n > 0);
  const pools = counts.length ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : null;
  const byG = Object.fromEntries(S.D.gauges.filter(g => g.gauge).map(g => [g.gauge.toLowerCase(), g]));
  let fee = 0, tot = 0;
  for (const L of S.locks) for (const [g, v] of Object.entries(L.current)) { const m = byG[g]; if (!m) continue; const a = Number(ethers.formatUnits(v, 18)); tot += a; const inc = (m.streams || []).reduce((x, y) => x + y.usd_day, 0); if ((m.fee_day || 0) >= inc) fee += a; }
  const share = tot > 0 ? fee / tot : null;
  return { pools: pools == null ? null : pools <= 1 ? "1" : pools <= 3 ? "2-3" : pools <= 6 ? "4-6" : "7+", mix: share == null ? null : share >= 2 / 3 ? "fee-led" : share <= 1 / 3 ? "stream-led" : "mixed" };
}
function renderWins() {
  const el = $("wins");
  if (!S.ST || !S.ST.brackets) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const ST = S.ST, brs = Object.keys(ST.brackets);
  if (S.winsBr == null || !ST.brackets[S.winsBr]) S.winsBr = (S.locks.length && S.bracket && ST.brackets[S.bracket]) ? S.bracket : "all";
  const T = ST.brackets[S.winsBr], you = viewerBuckets();
  const label = { all: "All", "10k": "10k+", "50k": "50k+", "100k": "100k+", "250k": "250k+", "500k": "500k+", "1m": "1M+" };
  const pct = x => x == null ? "-" : x.toFixed(1) + "%";
  const best = o => { let b = null; for (const [k, v] of Object.entries(o)) if (!b || v.avg > o[b].avg) b = k; return b; };
  const tbl = (title, o, order, mine) => {
    const bk = best(o);
    return `<div class="tw"><table><tr><th>${title}</th><th class="num">Locks</th><th class="num">Avg APR 7d</th><th class="num">Median</th></tr>` +
      order.filter(k => o[k]).map(k => `<tr${mine === k ? ' style="font-weight:700"' : ""}><td>${esc(k)}${mine === k ? ' <span class="tag ok" style="font-size:11px;padding:1px 7px">you</span>' : ""}</td><td class="num">${o[k].n.toLocaleString()}</td><td class="num ${k === bk ? "ok" : ""}">${pct(o[k].avg)}</td><td class="num">${pct(o[k].median)}</td></tr>`).join("") + `</table></div>`;
  };
  const weeks = (ST.history || []).length;
  el.innerHTML = `<h2>What actually wins <span>last 7 days · ${ST.locks.toLocaleString()} locks</span></h2><div class="body">
    <div class="seg" id="winsbr">${brs.map(k => `<button type="button" data-b="${k}" class="${S.winsBr === k ? "on" : ""}">${label[k] || k}</button>`).join("")}</div>
    <p class="small mut" style="margin:0 0 8px">Every ranked lock${S.winsBr === "all" ? "" : " of " + (label[S.winsBr] || S.winsBr)}, grouped by what it did, with each group's whole-lock APR over the last 7 days (average weighted by AERO). Group average ${pct(T.all && T.all.avg)} · median ${pct(T.all && T.all.median)}.</p>
    ${tbl("Pools allocated", T.pools, ["1", "2-3", "4-6", "7+"], you.pools)}
    ${tbl("Moves in 7 days", T.moves, ["0", "1", "2+"], null)}
    ${tbl("Fees vs streams", T.mix, ["fee-led", "mixed", "stream-led"], you.mix)}
    <p class="small mut2" style="margin:8px 0 0">The average is weighted by AERO (what the group's average AERO earned); the median is the typical lock. Read on chain every 3 hours from the last ${Math.round((ST.to - ST.from) / 86400)} days; ${weeks ? `${weeks} weekly snapshot${weeks === 1 ? "" : "s"} kept so far` : "weekly snapshots start accumulating from this week"}. This is how the presets get tuned. <a href="docs.html#wins">How it's measured</a></p></div>`;
  el.querySelectorAll("#winsbr button").forEach(b => b.addEventListener("click", () => { S.winsBr = b.dataset.b; renderWins(); }));
}
// ---------- "How each strategy did": every preset replayed on past scans, no look-ahead (data/backtest.json) ----------
const BT_SIZES = [["1000", "1k"], ["30000", "30k"], ["100000", "100k"], ["1000000", "1M"]];
const BT_ORDER = ["balanced", "steady", "aggressive", "jpn", "cypher", "aggressive_base", "n10", "n6", "n3", "n1", "spike12"];
const BT_NET = { optimism: "OP", arbitrum: "Arbitrum", ethereum: "Ethereum", ink: "Ink", robinhood: "Robinhood", arc: "Arc", elysium: "Elysium" };
function renderTested() {
  const el = $("tested"), B = S.BT;
  if (!B || !B.rows) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  if (!S.btSize || !B.rows[S.btSize]) {
    const a = S.locks.length ? totalAero() : 30000;
    S.btSize = BT_SIZES.map(x => x[0]).filter(k => B.rows[k]).reduce((b, k) => Math.abs(Math.log(+k / a)) < Math.abs(Math.log(+b / a)) ? k : b, "30000");
  }
  const R = B.rows[S.btSize] || {}, mine = S.dial ? S.dial.preset : null;
  const d2 = x => x == null ? "-" : "$" + x.toFixed(2);
  const rows = BT_ORDER.filter(k => R[k]).map(k => { const v = R[k];
    return `<tr${mine === k ? ' style="font-weight:700"' : ""}><td>${esc(B.labels[k] || k)}${mine === k ? ' <span class="tag ok" style="font-size:11px;padding:1px 7px">you</span>' : ""}</td>` +
      `<td class="num">${d2(v.median)}<br><small class="mut">${v.p25 != null ? v.p25.toFixed(2) + " to " + v.p75.toFixed(2) : ""}</small></td>` +
      `<td class="num mut">${v.worst.toFixed(2)} to ${v.best.toFixed(2)}</td><td class="num">${k === "balanced" ? "" : (v.bw != null ? v.bw + " of " + v.b : "-")}</td></tr>`; }).join("");
  const N = (B.networks || {})[S.btSize] || {};
  const nets = Object.entries(N).filter(([, v]) => v && v.n).map(([c, v]) => `${BT_NET[c] || c} ${Math.round(v.share * 100)}%`).join(" · ");
  const thin = Object.entries(B.cadence || {}).filter(([, h]) => h && h > 6).map(([c]) => BT_NET[c] || c);
  const M = B.calmodel || {}, P0 = M.presets || {}, typ = m => m ? "$" + m[1].toFixed(2) : "-", cm = calModel();
  el.innerHTML = `<h2>How each strategy did <span>${B.n_starts} past starts · about ${B.independent_windows.toFixed(1)} separate windows</span></h2><div class="body">
    <div class="seg" id="btsize">${BT_SIZES.filter(x => B.rows[x[0]]).map(([k, t]) => `<button type="button" data-s="${k}" class="${S.btSize === k ? "on" : ""}">${t} AERO</button>`).join("")}</div>
    <p class="small mut" style="margin:0 0 8px">Each strategy planned with only what was known at the time, every 3 hours from ${esc(new Date(B.first * 1000).toLocaleDateString([], { month: "short", day: "numeric" }))} to ${esc(new Date(B.last * 1000).toLocaleDateString([], { month: "short", day: "numeric" }))}, then paid from what the pools really paid over the next 47 hours (real pile-ons in). Dollars per 1,000 AERO per window.</p>
    <div class="tw"><table><tr><th>Strategy</th><th class="num">Median<br><small>middle half</small></th><th class="num">Worst to best</th><th class="num">Beat Balanced</th></tr>${rows}</table></div>
    <p class="small mut2" style="margin:8px 0 0">"Beat Balanced" counts separate 2-day stretches. ${nets ? `Best single pool on another network beat Base's best after costs: ${esc(nets)} of the time.` : ""}${thin.length ? ` ${esc(thin.join(", "))} were scanned once a day until Nov 5, so their figures are rough.` : ""} Forecasts barely predicted payouts here, so expected dollars on this page are pulled toward what each setting typically paid per 1k AERO: Balanced ${typ(P0.balanced)}, Steady ${typ(P0.steady)}, Aggressive ${typ(P0.aggressive)}${S.dial && S.dial.preset === "custom" ? `, your Custom dials ${typ(cm)}` : ", Custom by the nearest tested dial setting"}; JPN's and Cypher's picks use Balanced's. Their two rows are graded only from picks recorded live (since Nov 6 for Cypher), so they fill in over time. A small sample, refreshed every 3 hours. <a href="docs.html#tested">How it's tested</a></p></div>`;
  el.querySelectorAll("#btsize button").forEach(b => b.addEventListener("click", () => { S.btSize = b.dataset.s; renderTested(); }));
}
// Crowd-window warning: any hour in the next 4 (or the one running now) where 100M+ sAERO comes off its 47-hour
// cooldown. Locks that move then can shift what the pools pay, so it shows at the top of the page from 4 hours out.
const WARN_BIG = 100e6, WARN_AHEAD = 4 * 3600;
function renderCrowdWarn() {
  const el = $("crowdwarn"), now = Date.now() / 1000, C = S.CR;
  const big = C ? (C.fwd || []).filter(x => x[1] >= WARN_BIG && x[0] + 3600 > now && x[0] < now + WARN_AHEAD) : [];
  if (!big.length) { el.classList.add("hidden"); return; }
  const c1 = (C.curve || []).find(c => c[0] === "0-1h"), share = c1 && c1[1] != null ? c1[1] / 100 : null;
  const span = t => `${clock(t).replace(" ET", "")} to ${clock(t + 3600)}`;
  const when = t => { const m = Math.round((t - now) / 60); return m <= 0 ? "now" : m < 60 ? `in ${m} min` : `in ${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`; };
  const lines = big.map(x => `<b>${(x[1] / 1e6).toFixed(0)}M sAERO</b> comes off its cooldown ${span(x[0])}${big.length > 1 ? ` (${when(x[0])})` : ""}`
    + (share ? `. About ${Math.round(share * 100)}% of sAERO usually moves within an hour of its window opening, so roughly <b>${(x[1] * share / 1e6).toFixed(0)}M</b> could move then` : ""));
  const day = t => new Date(t * 1000).toLocaleDateString([], { weekday: "short", timeZone: ET }) + " " + clock(t).replace(" ET", "");
  const mine = S.locks.filter(L => L.next).map(L => L.next <= now ? `#${L.id} is open now` : `#${L.id} opens ${day(L.next)}`);
  el.innerHTML = `<b>⚠ Crowd window ${when(big[0][0])}.</b> ${lines.join(". ")}. Pool rates can shift once they move.`
    + (mine.length ? ` Your locks: ${mine.join(" · ")}.` : "") + ` <a href="#crowd">See the chart</a>`;
  el.classList.remove("hidden");
}
function renderCrowd() {
  renderCrowdWarn();
  const el = $("crowd");
  if (!S.CR || !window.CrowdChart) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const now = Date.now() / 1000;
  const pins = S.locks.filter(L => L.next && L.next > now - 72 * 3600 && L.next < now + 72 * 3600).map(L => ({ t: L.next, label: "#" + L.id }));
  try { window.CrowdChart.render(el, S.CR, pins); } catch (e) { el.innerHTML = `<h2>When the crowd moves</h2><div class="body small mut2">Chart failed: ${esc(e.message)}</div>`; }
}
function render() { renderPill(); renderHero(); renderPlan(); renderLocks(); renderRank(); renderEarn(); renderWins(); renderTested(); renderCrowd(); }

// ---------- dry run (eth_simulateV1 from the lock owner's address; nothing is signed or sent) ----------
function buildCall(L) {
  const split = planSplit(L);
  const call = A.buildAllocate(ethers, { tokenId: L.id, owner: L.owner, staked: L.staked, booked: L.booked, split });
  const g = A.checkCall(ethers, call, { tokenId: L.id, owner: L.owner, account: L.owner, staked: L.staked, booked: L.booked, allowedGauges: planGauges(L) });
  if (!g.ok) throw new Error("safety check: " + g.why);
  return call;
}
async function dryRun(L) {
  if (!L || !planFor(L) || L.sent) return;
  const now = Math.floor(Date.now() / 1000);
  if (xNeeded(L)) return dryRunX(L);
  try {
    const call = buildCall(L);
    const at = L.next && L.next > now ? L.next + 5 : now;
    L.status = `<div class="banner">Rehearsing${at > now ? " at the window open" : ""}…</div>`; render();
    const calls = [{ from: call.owner, to: call.to, data: call.data, value: "0x0", gas: "0x" + (30_000_000).toString(16) },
      ...call.legs.map(l => ({ from: call.owner, to: C.LEAF, data: I.leaf.encodeFunctionData("allocations", [L.id, ethers.getAddress(l.gauge)]) })),
      { from: call.owner, to: C.LEAF, data: I.leaf.encodeFunctionData("allocatedGauges", [L.id]) },
      { from: call.owner, to: C.LEAF, data: I.leaf.encodeFunctionData("tokenStates", [L.id]) }];
    const block = { calls }; if (at > now) block.blockOverrides = { time: "0x" + at.toString(16) };
    const res = (await rpc("eth_simulateV1", [{ blockStateCalls: [block], validation: false }, "latest"]))[0].calls;
    if (res[0].status !== "0x1") {
      const err = JSON.stringify(res[0].error || res[0].returnData || ""), cd = /aa9a98df/.test(err);
      L.dry = { ok: false };
      L.status = `<div class="banner bad"><b>Dry run failed:</b> ${cd ? "the 47-hour cooldown is still running" : esc(err.slice(0, 160))}. Nothing was sent. <a href="docs.html#fail">Help</a></div>`;
      log(`#${L.id} dry run failed: ${err.slice(0, 200)}`, "bad"); return render();
    }
    const after = call.legs.map((l, i) => ({ ...l, got: I.leaf.decodeFunctionResult("allocations", res[1 + i].returnData)[0] }));
    const gl = I.leaf.decodeFunctionResult("allocatedGauges", res[res.length - 2].returnData)[0].map(x => x.toLowerCase());
    const ts = I.leaf.decodeFunctionResult("tokenStates", res[res.length - 1].returnData);
    const total = after.reduce((s, x) => s + x.got, 0n), extra = gl.filter(x => !after.some(a => a.gauge === x));
    const ok = total === L.staked && !extra.length && after.every(a => a.got === a.allocated);
    const tot = Number(ethers.formatUnits(L.staked, 18)) || 1, gas = parseInt(res[0].gasUsed, 16);
    let feeUsd = null; try { feeUsd = Number(BigInt(await rpc("eth_gasPrice", [])) * BigInt(gas)) / 1e18 * ethUsd(); } catch (e) { /* shown without a dollar figure */ }
    const nowW = g2 => Number(ethers.formatUnits(L.current[g2] || 0n, 18));
    const leg = Object.fromEntries(planFor(L).legs.map(l => [l.gauge.toLowerCase(), l]));
    const line = (name, col, a, b) => `<div class="r"><span class="pdot" style="--c:${col}"></span><span class="nm">${esc(name)}</span><span class="num">${(100 * a / tot).toFixed(0)}% → <b>${(100 * b / tot).toFixed(0)}%</b></span></div><div class="tr"><i class="now" style="width:${(100 * a / tot).toFixed(1)}%"></i><i class="aft" style="--c:${col};width:${(100 * b / tot).toFixed(1)}%"></i></div>`;
    let bars = after.map(a => line(a.label, typeColor((leg[a.gauge] || {}).type), nowW(a.gauge), Number(ethers.formatUnits(a.got, 18)))).join("");
    for (const g2 of Object.keys(L.current)) if (!after.some(a => a.gauge === g2)) bars += line(short(g2) + " (cleared)", "var(--mut2)", nowW(g2), 0);
    const bytes = (call.data.length - 2) / 2, newLA = Number(ts[1]);
    L.dry = { ok, data: call.data, at }; L.call = call;
    const sign = owns(L) && ok ? `<h3 class="sub">What you will sign</h3><ol class="steplist">
      <li>Network <b>Base</b></li>
      <li>To <code data-copy="${call.to}">${call.to}</code> <span class="mut">= the Aero Voter; compare start and end</span></li>
      <li>Method <b>allocate</b> <span class="mut">(selector <code>${C.ALLOCATE_SELECTOR}</code>)</span></li>
      <li>Value <b>0 ETH</b></li>
      <li>Data ${bytes.toLocaleString()} bytes <span class="mut">(a hardware wallet shows this as raw data; your wallet's preview should show sAERO #${L.id} re-allocated and no token moves)</span></li></ol>
      <div class="small mut2">Reject it if any screen names sAERO <code>0xbf7977e1…</code>, "setApprovalForAll", "approve", "transfer", or a value other than 0. Next change after this allocation: <b>${esc(fmtTs(newLA + S.cool))}</b>.</div>` : "";
    L.status = `<div class="banner ${ok ? "ok" : "bad"}"><b>${ok ? "Dry run OK" : "Result doesn't match the plan"}</b> · ${feeUsd != null ? "network fee about $" + (feeUsd < 0.01 ? "0.01 or less" : feeUsd.toFixed(2)) : "gas " + gas.toLocaleString()}${!ok ? "" : !owns(L) ? (S.account ? " · not the connected wallet" : " · connect to sign") : isOpen(L) ? " · ready to sign" : " · opens " + esc(fmtTs(L.next))}</div><div class="ba" style="margin-top:8px">${bars}</div>${sign}`;
    log(`#${L.id} dry run ${ok ? "OK" : "mismatch"} · gas ${gas.toLocaleString()}`, ok ? "" : "bad");
  } catch (e) { L.dry = { ok: false }; L.status = `<div class="banner bad">Dry run failed: ${esc(e.message || e)}</div>`; log(`#${L.id}: ${e.message || e}`, "bad"); }
  render();
}
async function dryAll() { for (const L of S.locks) if (!L.dry && !L.sent) await dryRun(L); }

// ---------- sign: ONE Voter.allocate per lock the connected wallet owns (Phase 2) ----------
async function send(L) {
  if (!L || L.sent) return;
  if (L.dry && L.dry.x) return sendX(L);
  try {
    if (!S.account || !S.provider) throw new Error("connect the wallet first");
    if (!owns(L)) throw new Error("this lock is not owned by the connected wallet");
    if (!L.dry || !L.dry.ok) throw new Error("dry run first");
    if (!planFor(L) || planFor(L).placed !== 100) throw new Error("the split does not place 100%");
    const call = buildCall(L);                                    // rebuild from the plan
    if (call.data !== L.dry.data) throw new Error("the plan changed since the dry run; dry-run again");
    await ensureChain();
    const [fresh] = await readLocks([L.id]);                      // live re-check: owner, window, booked
    Object.assign(L, fresh);
    if (!L.owner || L.owner.toLowerCase() !== S.account.toLowerCase()) throw new Error("the lock is not owned by the connected account");
    if (L.next && L.next > Date.now() / 1000 + 2) throw new Error(`the window opens ${fmtTs(L.next)}; not yet`);
    const g = A.checkCall(ethers, call, { tokenId: L.id, owner: L.owner, account: S.account, staked: L.staked, booked: L.booked, allowedGauges: planGauges(L) });
    if (!g.ok) throw new Error("guard tripped: " + g.why);
    L.status = `<div class="banner">Waiting for your signature… check the To address (the Aero Voter) and 0 ETH.</div>`; render();
    log(`Sending allocate #${L.id} (${call.legs.length} gauges) for signature…`);
    await assertBase();
    const hash = needHash(await S.provider.request({ method: "eth_sendTransaction", params: [{ from: S.account, to: call.to, data: call.data, value: "0x0" }] }));
    L.sent = hash; L.status = `<div class="banner">Sent <a href="https://basescan.org/tx/${hash}" target="_blank" rel="noopener noreferrer">${hash.slice(0, 12)}…</a>, waiting for confirmation…</div>`; render();
    log(`#${L.id} sent ${hash}`);
    const rc = await waitReceipt(hash);
    if (rc.status !== "0x1") { L.sent = null; L.dry = null; throw new Error(`transaction ${hash.slice(0, 12)}… reverted on chain`); }
    log(`#${L.id} confirmed in block ${parseInt(rc.blockNumber, 16)}`, "ok");
    const [after] = await readLocks([L.id]); Object.assign(L, after);
    const tot = Number(ethers.formatUnits(L.staked, 18)) || 1, leg = Object.fromEntries(planFor(L).legs.map(l => [l.gauge.toLowerCase(), l]));
    const chips = Object.entries(L.current).map(([g2, v]) => `<span class="chip"><span class="pdot" style="--c:${typeColor((leg[g2] || {}).type)}"></span>${esc((leg[g2] || {}).label || short(g2))} <b class="num">${(100 * Number(ethers.formatUnits(v, 18)) / tot).toFixed(0)}%</b></span>`).join("");
    L.status = `<div class="banner ok"><div class="big">Allocated ✓</div><span class="small">Block ${parseInt(rc.blockNumber, 16).toLocaleString()} · <a href="https://basescan.org/tx/${hash}" target="_blank" rel="noopener noreferrer">view on Basescan</a> · next change <b>${esc(fmtTs(L.next))}</b></span><div class="chips">${chips}</div>${tipLine()}</div>`;
    store.set("sent:" + L.id, hash);
  } catch (e) { log("Stopped: " + (e.message || e), "bad"); L.status = `<div class="banner bad">Stopped: ${esc(e.message || e)}</div>`; }
  render();
}
async function sendAll() { for (const L of S.locks) if (canSend(L)) await send(L); }

/* ---------- other networks (Stage 2, 11/6/2026): allocate-x.js plans the steps, rehearses BOTH halves (the Base call,
   then the exact Hyperlane message replayed on the other network) and guards every call. Each step is still ONE
   Voter.allocate on Base; it carries the other networks' message fee. Moving AERO between networks = two steps (free,
   then send); AERO coming back from another network lands on Base a few minutes after step 1, so step 2 waits. A move
   that hasn't landed yet blocks any new plan for that lock (the page remembers what it sent; the chain shows the rest). ---------- */
const xrpc = (cid, method, params) => Number(cid) === C.CHAIN_ID ? rpc(method, params) : window.SweepNets.rpc(window.SweepNets.byId(cid), method, params);
const ethUsd = () => ((window.SweepNets && window.SweepNets.byId(C.CHAIN_ID)) || {}).native_usd || 2400;
const ethTxt = w => { const e = Number(ethers.formatEther(w)); return `${e.toFixed(e < 0.001 ? 6 : 5)} ETH (~${money(e * ethUsd())})`; };
const netNm = c => XA.netName(Number(c));
// a pool Cypher keeps on another network signs its exact current amount there (read live), not his rounded percent, so
// a network he leaves alone stays alone: no fee, no extra step
const keptWei = (L, l) => { const lf = (L.leaf || []).find(x => !x.unread && x.chain === l.chain), w = lf && lf.allocsRaw[l.gauge.toLowerCase()]; return w > 0n ? w : null; };
const xSplit = L => planFor(L).legs.map(l => { const w = l.ext && l.ext.kept ? keptWei(L, l) : null;
  return { chain: l.chain || "base", gauge: l.gauge, pct: l.pct, label: l.label, ...(w ? { wei: w } : {}) }; });
const xAllowed = sp => new Set(sp.map(s => XA.ID_OF[s.chain] + ":" + s.gauge.toLowerCase()));
const xShape = st => JSON.stringify(st, (k, v) => typeof v === "bigint" ? v.toString() : v);
const xRec = L => { try { return JSON.parse(store.get("xsent:" + L.id, "null")); } catch (e) { return null; } };
function xState(L) {
  const booked = { [C.CHAIN_ID]: L.booked }, current = { [C.CHAIN_ID]: L.current }, opens = { [C.CHAIN_ID]: L.next || 0 }, pending = [];
  for (const lf of L.leaf || []) {
    if (lf.unread) throw new Error(`couldn't read the lock's ${netNm(lf.cid)} allocation; try again in a minute`);
    booked[lf.cid] = lf.bookedRaw; current[lf.cid] = lf.allocsRaw; opens[lf.cid] = lf.next || 0;
    if (lf.leafBudget !== lf.bookedRaw) pending.push(lf.cid);        // Base and that network disagree = a move is mid-flight
  }
  return { booked, current, opens, pending };
}
// networks a move from this page hasn't reached yet (sent, not delivered), plus any the chain shows as mid-flight
function xInflight(L, st) {
  const nets = new Set(st.pending), r = xRec(L), now = Date.now() / 1000;
  if (r && now - r.at < 3 * 3600) for (const c of r.cids) {
    if (c === C.CHAIN_ID) continue;
    const lf = (L.leaf || []).find(x => x.cid === c);
    if (lf && !(lf.la && lf.la >= r.at - 5)) nets.add(c);          // its clock hasn't moved since we sent = not delivered yet
  }
  return [...nets];
}
function xBars(L, r) {
  const tot = Number(ethers.formatUnits(L.staked, 18)) || 1, f = w => Number(ethers.formatUnits(w || 0n, 18));
  const line = (name, col, a, b) => `<div class="r"><span class="pdot" style="--c:${col}"></span><span class="nm">${esc(name)}</span><span class="num">${(100 * a / tot).toFixed(0)}% → <b>${(100 * b / tot).toFixed(0)}%</b></span></div><div class="tr"><i class="now" style="width:${(100 * a / tot).toFixed(1)}%"></i><i class="aft" style="--c:${col};width:${(100 * b / tot).toFixed(1)}%"></i></div>`;
  const cids = [...new Set([...Object.keys(r.plan.before), ...Object.keys(r.plan.target)].map(Number))].sort((a, b) => (a === C.CHAIN_ID ? -1 : b === C.CHAIN_ID ? 1 : a - b));
  const leg = Object.fromEntries(planFor(L).legs.map(l => [(XA.ID_OF[l.chain || "base"]) + ":" + l.gauge.toLowerCase(), l]));
  let h = cids.map(c => line(netNm(c) + (r.plan.skipped.includes(c) ? " (unchanged)" : ""), "var(--mut)", f(r.plan.before[c]), f(r.plan.target[c]))).join("");
  h += `<div class="small mut2" style="margin:6px 0 2px">Pools after:</div>` + r.plan.legs.map(l => { const x = leg[l.chainId + ":" + l.gauge] || {}; return line(`${x.label || short(l.gauge)}${l.chainId !== C.CHAIN_ID ? " · " + netNm(l.chainId) : ""}`, typeColor(x.type), 0, f(l.allocated)); }).join("");
  return h;
}
function xStepText(s, i, n) {
  const st = s.step, parts = [];
  for (const g of st.gaugeDispatches) {
    if (g.dealloc > 0n) parts.push(g.gauges.length ? `frees ${fmtA(ethers.formatUnits(g.dealloc, 18))} AERO on ${netNm(g.chainId)} and re-allocates the rest there` : `frees all ${fmtA(ethers.formatUnits(g.dealloc, 18))} AERO on ${netNm(g.chainId)}`);
  }
  for (const c of st.chainDispatches) parts.push(`sends ${fmtA(ethers.formatUnits(c.delta, 18))} AERO to ${netNm(c.chainId)} and allocates it there`);
  for (const g of st.gaugeDispatches) if (!(g.dealloc > 0n) && !st.chainDispatches.some(c => c.chainId === g.chainId)) parts.push(`re-allocates on ${netNm(g.chainId)}`);
  const fee = s.call ? (s.call.total > 0n ? ethTxt(s.call.total) : "0 ETH") : "";
  const state = s.waiting ? `<span class="mut2">waits until ${esc(st.waitFor.map(netNm).join(" + "))} ${st.waitFor.length > 1 ? "hand" : "hands"} the AERO back to Base (a few minutes after step ${i})</span>` : s.ok ? `<span class="ok">rehearsed OK</span>` : `<span class="bad">${esc(s.why || "failed")}</span>`;
  return `<li><b>Step ${i + 1} of ${n}:</b> ${esc(parts.join("; "))}.${fee ? ` Fee <b>${esc(fee)}</b>.` : ""} ${state}${s.openAt && s.openAt > Date.now() / 1000 + 5 ? ` · opens <b>${esc(fmtTs(s.openAt))}</b>` : ""}</li>`;
}
function xStatus(L) {
  const r = L.x, done = L.xDone || 0, n = done + r.steps.length, s0 = r.steps[0];
  const leafNets = [...new Set(r.steps.flatMap(s => s.touched || []).filter(c => c !== C.CHAIN_ID))];
  const fees = r.steps.filter(s => s.call).reduce((t, s) => t + s.call.total, 0n);
  const head = r.ok ? `<b>Dry run OK on Base${leafNets.length ? " + " + esc(leafNets.map(netNm).join(" + ")) : ""}</b> · ${r.steps.length} signature${r.steps.length === 1 ? "" : "s"} left · network fees about ${esc(fees > 0n ? ethTxt(fees) : "0 ETH")}${r.steps.some(s => s.waiting) ? " so far" : ""}`
    : `<b>Dry run failed:</b> ${esc(r.why || "see the steps")}. Nothing was sent.`;
  const own = owns(L), ready = canSend(L);
  const sign = own && r.ok && s0 && s0.ok ? `<h3 class="sub">What you will sign${n > 1 ? ` (step ${done + 1} of ${n})` : ""}</h3><ol class="steplist">
      <li>Network <b>Base</b> <span class="mut">(every step is sent on Base; the vote travels to ${esc(leafNets.length ? leafNets.map(netNm).join(" + ") : "Base")} by itself)</span></li>
      <li>To <code data-copy="${s0.call.to}">${s0.call.to}</code> <span class="mut">= the Aero Voter; compare start and end</span></li>
      <li>Method <b>allocate</b> <span class="mut">(selector <code>${C.ALLOCATE_SELECTOR}</code>)</span></li>
      <li>Value <b>${esc(s0.call.total > 0n ? ethTxt(s0.call.total) : "0 ETH")}</b>${s0.call.total > 0n ? ` <span class="mut">= the message fee to ${esc(Object.keys(s0.fees).map(netNm).join(" + "))}: Aero's own quote + 10%; the bridge refunds what isn't used, to you</span>` : ""}</li>
      <li>Data ${((s0.call.data.length - 2) / 2).toLocaleString()} bytes <span class="mut">(your wallet's preview should show ETH going to the Aero Voter and no token moves)</span></li></ol>
      <div class="small mut2">Reject it if any screen names sAERO <code>0xbf7977e1…</code>, "setApprovalForAll", "approve", "transfer", or a value other than the one above. ${leafNets.length ? "A vote usually lands on the other network 1-3 minutes after you sign; Flight Plan watches for it. " : ""}Each network keeps its own 47-hour clock.</div>` : "";
  return `<div class="banner ${r.ok ? "ok" : "bad"}">${head}${r.ok && !ready && own && s0 && s0.ok && !isOpenNow(L) ? " · opens " + esc(fmtTs(opensAt(L))) : r.ok && !own ? (S.account ? " · not the connected wallet" : " · connect to sign") : r.ok && ready ? " · ready to sign" : ""}</div>
    <ol class="steplist" style="margin-top:8px">${r.steps.map((s, i) => xStepText(s, done + i, n)).join("")}</ol><div class="ba" style="margin-top:8px">${xBars(L, r)}</div>${sign}`;
}
function xDoneStatus(L) {
  const tot = Number(ethers.formatUnits(L.staked, 18)) || 1, chips = [], leg = Object.fromEntries(planFor(L).legs.map(l => [(XA.ID_OF[l.chain || "base"]) + ":" + l.gauge.toLowerCase(), l]));
  const add = (cid, m) => { for (const [g, v] of Object.entries(m || {})) { const x = leg[cid + ":" + g] || {}; chips.push(`<span class="chip"><span class="pdot" style="--c:${typeColor(x.type)}"></span>${esc(x.label || short(g))}${cid !== C.CHAIN_ID ? " · " + esc(netNm(cid)) : ""} <b class="num">${(100 * Number(ethers.formatUnits(v, 18)) / tot).toFixed(0)}%</b></span>`); } };
  add(C.CHAIN_ID, L.current); for (const lf of L.leaf || []) add(lf.cid, lf.allocsRaw);
  const r = xRec(L);
  return `<div class="banner ok"><div class="big">Allocated ✓</div><span class="small">${r && txh(r.hash) ? `<a href="https://basescan.org/tx/${txh(r.hash)}" target="_blank" rel="noopener noreferrer">last step on Basescan</a> · ` : ""}every network checked on chain</span><div class="chips">${chips.join("")}</div>${tipLine()}</div>`;
}
async function dryRunX(L) {
  if (!L || L.xBusy) return;
  L.xBusy = true;
  try {
    if (L.elsewhere.length && (!L.leaf || L.leaf.some(lf => lf.unread) || L.leaf.length !== L.elsewhere.length)) await readLeaf([L]);
    const st = xState(L), fl = xInflight(L, st);
    if (fl.length) { L.dry = { ok: false, x: true, wait: true }; L.x = null; L.status = `<div class="banner">A move to ${esc(fl.map(netNm).join(" + "))} is still landing. Flight Plan plans this lock again once it has.</div>`; L.xBusy = false; render(); xWatch(L); return; }
    const sp = xSplit(L), nets = [...new Set(sp.map(s => s.chain).filter(c => c !== "base"))].map(c => netNm(XA.ID_OF[c]));
    L.status = `<div class="banner">Rehearsing on Base${nets.length ? " and " + esc(nets.join(" + ")) : ""}…</div>`; render();
    const r = await XA.dryRun(ethers, xrpc, { tokenId: L.id, owner: L.owner, staked: L.staked, booked: st.booked, current: st.current, opens: st.opens, split: sp, allowed: xAllowed(sp), now: Math.floor(Date.now() / 1000) });
    L.x = r;
    if (!r.steps.length) {
      L.dry = { ok: false, x: true, none: true };
      if (L.xDone) { L.status = xDoneStatus(L); L.sent = "x"; store.set("xsent:" + L.id, "null"); }
      else L.status = `<div class="banner ok">Already allocated this way on every network (within 1%): nothing to sign.</div>`;
    } else {
      L.dry = { ok: r.ok, x: true, at: Math.floor(Date.now() / 1000) };
      L.xBusy = false; L.status = xStatus(L);
    }
    log(`#${L.id} cross-network dry run: ${r.steps.length ? r.steps.map((s, i) => `step ${i + 1} ${s.waiting ? "waits" : s.ok ? "OK" + (s.call ? " " + ethers.formatEther(s.call.total) + " ETH" : "") : "failed: " + s.why}`).join(", ") : "nothing to change"}`, r.ok || !r.steps.length ? "" : "bad");
  } catch (e) { L.dry = { ok: false, x: true }; L.x = null; L.status = `<div class="banner bad">Dry run failed: ${esc(e.message || e)}</div>`; log(`#${L.id}: ${e.message || e}`, "bad"); }
  L.xBusy = false;
  render();
}
async function sendX(L) {
  if (!L || L.xBusy || L.xWatching) return;
  L.xBusy = true;
  try {
    if (!S.account || !S.provider) throw new Error("connect the wallet first");
    if (!owns(L)) throw new Error("this lock is not owned by the connected wallet");
    const shown = xNext(L);
    if (!L.dry || !L.dry.ok || !shown || !shown.ok) throw new Error("dry run first");
    await ensureChain();
    // live re-check: owner, both clocks, what every network holds; then the whole rehearsal again with fresh fees
    const [fresh] = await readLocks([L.id]); Object.assign(L, fresh); await readLeaf([L]);
    if (!L.owner || L.owner.toLowerCase() !== S.account.toLowerCase()) throw new Error("the lock is not owned by the connected account");
    const st = xState(L);
    if (xInflight(L, st).length) throw new Error("a move on this lock is still landing; wait for it");
    const sp = xSplit(L), allowed = xAllowed(sp), now = Math.floor(Date.now() / 1000);
    const r = await XA.dryRun(ethers, xrpc, { tokenId: L.id, owner: L.owner, staked: L.staked, booked: st.booked, current: st.current, opens: st.opens, split: sp, allowed, now });
    const s = r.steps[0];
    if (!s || !s.ok) throw new Error("the fresh dry run failed: " + ((s && s.why) || r.why || "nothing to send"));
    if (xShape(s.step) !== xShape(shown.step)) throw new Error("the plan changed since the dry run; dry-run again");
    if (s.call.total > shown.call.total * 13n / 10n + 10n ** 13n) throw new Error("network fees rose more than 30% since the dry run; dry-run again");
    if (s.openAt > now + 2) throw new Error(`it opens ${fmtTs(s.openAt)}; not yet`);
    const g = XA.checkStep(ethers, s.call, { tokenId: L.id, owner: L.owner, account: S.account, step: s.step, before: r.plan.before, allowed, caps: s.caps });
    if (!g.ok) throw new Error("guard tripped: " + g.why);
    const done = L.xDone || 0, n = done + r.steps.length;
    L.status = `<div class="banner">Waiting for your signature${n > 1 ? ` (step ${done + 1} of ${n})` : ""}… check: To the Aero Voter, Value ${esc(s.call.total > 0n ? ethTxt(s.call.total) : "0 ETH")}.</div>`; render();
    log(`Sending allocate #${L.id} step ${done + 1} of ${n} (${s.touched.map(netNm).join(" + ")}, ${ethers.formatEther(s.call.total)} ETH) for signature…`);
    await assertBase();                                            // this one carries ETH: never on the wrong network
    const hash = needHash(await S.provider.request({ method: "eth_sendTransaction", params: [{ from: S.account, to: s.call.to, data: s.call.data, value: s.call.value }] }));
    store.set("xsent:" + L.id, JSON.stringify({ at: now, cids: [...new Set(s.touched.concat(s.step.chainDispatches.map(c => c.chainId)))], hash }));
    L.status = `<div class="banner">Sent <a href="https://basescan.org/tx/${hash}" target="_blank" rel="noopener noreferrer">${hash.slice(0, 12)}…</a>, waiting for Base to confirm…</div>`; render();
    log(`#${L.id} sent ${hash}`);
    const rc = await waitReceipt(hash);
    if (rc.status !== "0x1") { store.set("xsent:" + L.id, "null"); throw new Error(`transaction ${hash.slice(0, 12)}… reverted on chain (nothing moved; the fee came back)`); }
    log(`#${L.id} step ${done + 1} confirmed in Base block ${parseInt(rc.blockNumber, 16)}`, "ok");
    L.xDone = done + 1; L.xLastSent = Date.now();
    L.xBusy = false;
    xWatch(L);
  } catch (e) { log("Stopped: " + (e.message || e), "bad"); L.status = `<div class="banner bad">Stopped: ${esc(e.message || e)}</div>`; }
  L.xBusy = false;
  render();
}
// after a step: wait until every network has it (checks every 20s, up to 40 min), then plan again: either nothing is
// left (done) or the next step, signed right away when it follows within a few minutes of the last signature
async function xWatch(L) {
  if (L.xWatching) return;
  L.xWatching = true; const t0 = Date.now();
  try {
    while (Date.now() - t0 < 40 * 60000) {
      const [fresh] = await readLocks([L.id]); Object.assign(L, fresh);
      try { await readLeaf([L]); } catch (e) {}
      let fl; try { fl = xInflight(L, xState(L)); } catch (e) { fl = ["?"]; }
      if (!fl.length) break;
      const m = Math.floor((Date.now() - t0) / 60000);
      L.status = `<div class="banner">Sent ✓ · landing on ${esc(fl.map(c => c === "?" ? "the other network" : netNm(c)).join(" + "))}${m ? ` (${m} min so far)` : ""}. Flight Plan checks every 20 seconds: a vote usually lands in 1-3 minutes, AERO coming back to Base a few minutes more. You can leave this page; it picks up where it was.</div>`; render();
      await new Promise(ok => setTimeout(ok, 20000));
    }
  } finally { L.xWatching = false; }
  await dryRunX(L);
  if (canSend(L) && L.xLastSent && Date.now() - L.xLastSent < 5 * 60000) { log(`#${L.id}: step ${(L.xDone || 0) + 1} is ready; asking your wallet now.`); await sendX(L); }
  else if (canSend(L)) toast(`#${L.id}: next step ready to sign`);
}

// ---------- wallet ----------
async function connect() {
  const eth = window.ethereum;
  if (!eth) { toast("no wallet in this browser"); log("No browser wallet found. Open this page inside your wallet's browser, or enable the extension.", "warn"); return; }
  if (!store.get("safety")) { showSafety(true); return; }
  S.provider = eth;
  const accs = await eth.request({ method: "eth_requestAccounts" });
  if (!accs || !accs[0]) throw new Error("no account");
  S.account = ethers.getAddress(accs[0]);
  try { await ensureChain(); } catch (e) { log("Not on Base yet: " + (e.message || e) + ". Signing will ask again.", "warn"); }
  if (!S.hooked && eth.on) {
    S.hooked = true;
    eth.on("accountsChanged", a => { S.account = a[0] ? ethers.getAddress(a[0]) : null; renderPill(); log(S.account ? `Account changed to ${S.account}` : "Wallet disconnected."); SW.rows = []; SW.byNet = {}; SW.gas = {}; SW.cid = null; SW.plan = null; SW.dry = null; renderSweep(); if (S.account) lookup(S.account); else render(); });
    eth.on("chainChanged", id => log(`Wallet network changed to chain ${parseInt(id, 16)}.`, parseInt(id, 16) === C.CHAIN_ID ? "" : "warn"));
  }
  renderPill(); log(`Connected ${S.account}`);
  await lookup(S.account);
  if ($("sweep").open) swScan().catch(e => log("Scan failed: " + e.message, "bad"));
}
async function ensureChain() {
  const id = await S.provider.request({ method: "eth_chainId" });
  if (parseInt(id, 16) !== C.CHAIN_ID) { log(`Wallet is on chain ${parseInt(id, 16)}; asking it to switch to Base…`, "warn"); await S.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: C.CHAIN_HEX }] }); }
  await assertBase();                                             // some wallets answer the switch without switching
}
// Read the wallet's network again and refuse unless it is Base: run right before every Base eth_sendTransaction, because
// the user can change networks during the seconds-long re-checks between ensureChain() and the prompt.
async function assertBase() {
  const id = parseInt(await S.provider.request({ method: "eth_chainId" }), 16);
  if (id !== C.CHAIN_ID) throw new Error(`the wallet is on chain ${id}, not Base; switch it to Base and try again`);
}
$("wpill").addEventListener("click", () => { if (!S.account) connect().catch(e => { log("Connect failed: " + (e.message || e), "bad"); toast("connect cancelled"); }); });

// ---------- first-visit safety sheet ----------
let safetyThenConnect = false;
function showSafety(thenConnect) { safetyThenConnect = !!thenConnect; $("safety").classList.remove("hidden"); }
$("safeok").addEventListener("click", () => { store.set("safety", "1"); $("safety").classList.add("hidden"); if (safetyThenConnect) { safetyThenConnect = false; connect().catch(e => log("Connect failed: " + (e.message || e), "bad")); } });
for (const id of ["safelink", "safelink2"]) $(id).addEventListener("click", e => { e.preventDefault(); showSafety(false); });
$("tip").addEventListener("click", () => copy($("tip").dataset.copy));
const TIP = $("tip").dataset.copy;
const tipLine = () => `<div class="small" style="margin-top:8px;color:var(--mut)">Flight Plan is free. Tips: <code class="tipcopy" title="Tap to copy">${TIP.slice(0, 6)}…${TIP.slice(-4)}</code> <span class="mut2">(tap to copy; send it from your own wallet)</span></div>`;
document.addEventListener("click", e => { const t = e.target.closest && e.target.closest(".tipcopy"); if (t) copy(TIP); });
if (!store.get("safety")) showSafety(false);

/* ======================================================================================
   SWEEP: every reward token with a route to USDC through the new Aero pools, sold in ONE
   Metarouter.execute, with exact-amount approvals to the Metarouter only (ported from the
   private page, 11/5/2026; no server, no logging).
   ====================================================================================== */
/* Every Aero network (11/5/2026): the scan reads all of them (sweep-nets.js), the chips pick one, and the rest of this
   section works on SWN exactly as it used to on Base. MR / MQ / USDC follow SWN (the Metarouter and Metaquoter share one
   address everywhere; "USDC" is the network's stable, USDG on Robinhood). */
const SN = window.SweepNets;
let SWN = SN ? (SN.byId(8453) || SN.NETS[0]) : null;
let MR = SWN ? SWN.mr : null, MQ = SWN ? SWN.mq : null, USDC = SWN ? SWN.stableAddr : null;
function useNet(n) { SWN = n; MR = n.mr; MQ = n.mq; USDC = n.stableAddr; }
const CMD_CL = 0x00, CMD_V2 = 0x08, FLAG_ALLOW_REVERT = 0x80, DUST_ALLOW_REVERT_USD = 0.25;
const coder = ethers.AbiCoder.defaultAbiCoder();
const APPROVE_SEL = I.erc20.getFunction("approve").selector, EXEC_SEL = I.mr.getFunction("execute").selector;
// Guard: a call may only be (a) approve(Metarouter, amount) on a token this scan found in the wallet, or (b) execute() on
// the Metarouter whose decoded swaps are exactly the rows: one per row, in order, that row's token, pools, whole balance
// and minimum, paid by you, output to `owner` (you), and a deadline within the hour.
const SWAP_T = ["tuple(address[] pools,address tokenIn,tuple(uint8 mode,uint256 value) amountIn,bool payerIsUser,uint256 minAmountOut,address recipient)"];
function execIsAllowed(data, rows, owner) {
  try {
    const [cmds, inputs, deadline] = I.mr.decodeFunctionData("execute", data), cb = ethers.getBytes(cmds), now = Date.now() / 1000;
    if (cb.length !== rows.length || inputs.length !== rows.length) return false;
    if (!(Number(deadline) > now && Number(deadline) < now + 3600)) return false;
    return rows.every((r, i) => {
      const kind = cb[i] & ~FLAG_ALLOW_REVERT, want = r.best.route.kinds[0] === "cl" ? CMD_CL : CMD_V2;
      if (kind !== want || (cb[i] & FLAG_ALLOW_REVERT) !== (r.allowRevert ? FLAG_ALLOW_REVERT : 0)) return false;
      const [[pools, tokenIn, [mode, value], payerIsUser, minOut, recipient]] = coder.decode(SWAP_T, inputs[i]);
      return tokenIn.toLowerCase() === r.address.toLowerCase() && Number(mode) === 0 && value === r.balance && payerIsUser === true &&
             minOut === r.minOut && recipient.toLowerCase() === owner.toLowerCase() &&
             pools.length === r.best.route.pools.length && pools.every((x, k) => x.toLowerCase() === r.best.route.pools[k].toLowerCase());
    });
  } catch (e) { return false; }
}
function callIsAllowed(c, rows, owner) {
  const to = c.to.toLowerCase();
  if (to === MR.toLowerCase()) return c.data.startsWith(EXEC_SEL) && execIsAllowed(c.data, rows, owner);
  if (!rows.some(r => r.address.toLowerCase() === to)) return false;
  if (!c.data.startsWith(APPROVE_SEL)) return false;
  const [spender, amount] = I.erc20.decodeFunctionData("approve", c.data);
  const row = rows.find(r => r.address.toLowerCase() === to);
  return spender.toLowerCase() === MR.toLowerCase() && amount === row.balance;
}
const EXTRA_KEY = "fp:sweep:extraTokens";
function extraTokens() { try { return (localStorage.getItem(EXTRA_KEY) || "").split(/[\s,]+/).filter(x => /^0x[0-9a-fA-F]{40}$/.test(x)).map(ethers.getAddress); } catch (e) { return []; } }
let SW = { rows: [], plan: null, dry: null, floor: 0.5, busy: false, done: null, byNet: {}, gas: {}, cid: null };
try { $("extra").value = localStorage.getItem(EXTRA_KEY) || ""; } catch (e) {}

async function explorerTokens(owner) {
  const out = []; let url = `https://base.blockscout.com/api/v2/addresses/${owner}/tokens?type=ERC-20`;
  try {
    for (let page = 0; page < 5 && url; page++) {
      const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      for (const it of j.items || []) {
        const tk = it.token || {}; const a = tk.address_hash || tk.address; if (!a || !/^0x[0-9a-fA-F]{40}$/.test(a)) continue;
        out.push({ sym: tk.symbol || null, address: ethers.getAddress(a), decimals: tk.decimals != null ? Number(tk.decimals) : null });
      }
      const np = j.next_page_params; url = np ? `https://base.blockscout.com/api/v2/addresses/${owner}/tokens?` + new URLSearchParams({ type: "ERC-20", ...Object.fromEntries(Object.entries(np).map(([k, v]) => [k, String(v)])) }) : null;
    }
    log(`Block explorer lists ${out.length} ERC-20 token${out.length === 1 ? "" : "s"} in this wallet.`);
  } catch (e) { log("Block explorer lookup unavailable (" + (e.message || e) + "); scanning the Aero token universe + your extra addresses only.", "warn"); }
  return out;
}
async function swScan() {
  const owner = viewer();
  if (!SN || !SN.NETS.length) { renderSweep("The sweep routes file did not load."); return; }
  if (!owner) { renderSweep("Paste an address or connect a wallet first."); return; }
  if (SW.busy) return; SW.busy = true; $("swk").textContent = "scanning…";
  try {
    const floor = SW.floor, slip = Math.min(5, Math.max(0.1, Number($("slip").value) || 1)) / 100;
    const discovered = await explorerTokens(owner);   // Base only (the other networks use the loop's token list)
    log(`Scanning ${SN.NETS.length} networks for reward tokens in ${short(owner)}…`);
    const res = await Promise.allSettled(SN.NETS.map(n => SN.scan(n, owner, { floor, slip, extra: extraTokens(), discovered: n.isBase ? discovered : [], log })));
    SW.byNet = {}; SW.gas = {};
    res.forEach((r, i) => {
      const n = SN.NETS[i];
      if (r.status !== "fulfilled") { log(`${n.name}: scan failed (${(r.reason && r.reason.message) || r.reason}); skipped.`, "warn"); return; }
      const { rows, noRoute } = r.value;
      if (noRoute.length) log(`${n.name}: ${noRoute.length} token${noRoute.length === 1 ? "" : "s"} with no Aero route to ${n.stable}, skipped: ${noRoute.slice(0, 12).map(x => x.sym).join(", ")}${noRoute.length > 12 ? ", …" : ""}`);
      if (rows.length) SW.byNet[n.chainId] = rows;
    });
    const has = SN.NETS.filter(n => SW.byNet[n.chainId]);
    await Promise.all(has.map(n => swGasRead(n, owner).catch(e => log(`${n.name}: gas read failed (${e.message})`, "warn"))));
    const val = n => (SW.byNet[n.chainId] || []).filter(r => r.sell).reduce((t, r) => t + r.usd, 0);
    const keep = SW.cid && SW.byNet[SW.cid] ? SN.byId(SW.cid) : has.slice().sort((x, y) => val(y) - val(x))[0];
    if (!keep) { SW.rows = []; SW.plan = null; SW.cid = null; renderSweep(`Nothing to sweep on any of the ${SN.NETS.length} Aero networks. Claim in the Aero app first, then re-scan.`); log("No sellable tokens found on any network.", "warn"); return; }
    if ($("keepAero").checked && K) for (const rows of Object.values(SW.byNet)) for (const r of rows) if (r.address.toLowerCase() === K.C.AERO && r.sell) { r.sell = false; r.note = "kept to compound"; }
    if (has.length > 1) log(`Rewards found on ${has.length} networks: ${has.map(n => `${n.name} $${fmt(val(n), 2)}`).join(" · ")}. Each sweeps on its own.`);
    swPick(keep.chainId);
  } finally { SW.busy = false; if ($("swk").textContent === "scanning…") $("swk").textContent = ""; }
}
// gas on one network for its selected rows (before the dry run: a guess; after it: the dry run's real gas)
async function swGasRead(n, owner, units) {
  const rows = (SW.byNet[n.chainId] || []).filter(r => r.sell && r.best);
  units = units || SN.gasGuess(rows.filter(r => r.needsApproval).length, rows.length);
  SW.gas[n.chainId] = await SN.gasCheck(n, owner, units);
  return SW.gas[n.chainId];
}
function swPick(cid) {
  useNet(SN.byId(cid)); SW.cid = SWN.chainId;
  SW.rows = SW.byNet[SWN.chainId] || []; SW.plan = null; SW.dry = null; SW.done = null; $("swOut").innerHTML = ""; if (!BR) $("swBridge").innerHTML = "";
  renderSweep(); swBuildPlan(viewer());
}
function renderNets() {
  const box = $("swNets"); const has = SN.NETS.filter(n => SW.byNet[n.chainId]);
  if (!has.length || (has.length === 1 && has[0].isBase)) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="small mut" style="margin:8px 0 4px">Rewards found on ${has.length} network${has.length === 1 ? "" : "s"}. Each one is its own sweep, signed on that network:</div><div class="row" style="gap:6px;flex-wrap:wrap">` + has.map(n => {
    const v = SW.byNet[n.chainId].filter(r => r.sell).reduce((t, r) => t + r.usd, 0), g = SW.gas[n.chainId];
    return `<button class="sm${n.chainId === SWN.chainId ? " on" : ""}" data-cid="${n.chainId}" aria-pressed="${n.chainId === SWN.chainId}">${esc(n.name)} $${fmt(v, 2)}${g && !g.ok ? ` · needs gas` : ""}</button>`;
  }).join("") + `</div>`;
  box.querySelectorAll("button[data-cid]").forEach(b => b.addEventListener("click", () => swPick(Number(b.dataset.cid))));
}
// "To swap X on Arbitrum you need about 0.00003 ETH there": above the totals, refreshed after the dry run
function renderGas() {
  const g = SW.gas[SWN.chainId], el = $("swGas"); const sel = SW.rows.filter(r => r.sell && r.best);
  if (!g || g.ok || !sel.length) { el.innerHTML = ""; return; }
  const names = sel.slice(0, 3).map(r => r.sym).join(", ") + (sel.length > 3 ? ` and ${sel.length - 3} more` : "");
  const usd = SN.gasUsd(SWN, g.need);
  el.innerHTML = `<div class="banner warn small" style="margin-top:8px"><b>Gas needed on ${esc(SWN.name)}.</b> To swap ${esc(names)} you need about <b>${SN.gasAmt(g.need)} ${SWN.gas}</b>${usd != null ? ` (~$${fmt(Math.max(usd, 0.01), 2)})` : ""} for gas on ${esc(SWN.name)}. This wallet has ${SN.gasAmt(g.bal)} ${SWN.gas} there.
    Send ${SN.suggest(SWN)} to this same address on ${esc(SWN.name)} (for example with <a href="${SN.relayUrl(SWN)}" target="_blank" rel="noopener noreferrer">Relay</a>, from ETH on Base), then re-scan. <a href="docs.html#gas">How</a>
    ${SWN.isBase ? "" : `<div style="margin-top:6px"><button class="sm" data-gas="${SWN.chainId}">Get gas: bridge ~$${SN.bridgeUsd(SWN)} of ETH from Base</button>${gasShort().length > 1 ? ` <button class="sm" data-gas="${gasShort().map(n => n.chainId).join(",")}">Get gas on all ${gasShort().length} networks that need it</button>` : ""}</div>`}</div>`;
  el.querySelectorAll("button[data-gas]").forEach(b => b.addEventListener("click", () => swGetGas(b.dataset.gas.split(",").map(Number)).catch(e => log("Get gas failed: " + (e.message || e), "bad"))));
}
/* Get gas (11/5/2026): bridge a little ETH from Base to every network that is short, via Relay. Quote + guard +
   Base dry run first (sweep-nets.js); one signature when the wallet batches. Nothing is sent without the Sign tap. */
let BR = null;
const gasShort = () => SN.NETS.filter(n => !n.isBase && SW.byNet[n.chainId] && SW.gas[n.chainId] && !SW.gas[n.chainId].ok);
async function swGetGas(cids) {
  const owner = viewer(); if (!owner) return;
  const nets = cids.map(c => SN.byId(c)).filter(Boolean), el = $("swBridge");
  el.innerHTML = `<div class="banner small">Asking Relay for ${nets.length === 1 ? "a quote" : nets.length + " quotes"}…</div>`;
  const qs = await Promise.allSettled(nets.map(n => SN.bridgeQuote(n, owner)));
  const items = [], errs = [];
  qs.forEach((q, i) => { if (q.status === "fulfilled") items.push(q.value); else errs.push(q.reason.message || String(q.reason)); });
  errs.forEach(e => log(e, "bad"));
  if (!items.length) { el.innerHTML = `<div class="banner bad small">${esc(errs.join(" "))}</div>`; return; }
  const dry = await SN.bridgeDry(items, owner).catch(e => ({ ok: false, why: e.message }));
  BR = { owner, items, dry };
  const mine = S.account && ethers.getAddress(S.account) === owner;
  const usdIn = items.reduce((t, b) => t + b.inUsd, 0), usdOut = items.reduce((t, b) => t + b.outUsd, 0);
  el.innerHTML = `<div class="banner ${dry.ok ? "ok" : "bad"} small" style="margin-top:8px"><b>Get gas from Base, via Relay</b>
    <ul style="margin:6px 0 6px 18px;padding:0">${items.map(b => `<li>${esc(b.net.name)}: send <b>${SN.gasAmt(b.value)} ETH</b> from Base, get about <b>${SN.gasAmt(b.outWei)} ${b.net.gas}</b> (~$${fmt(b.outUsd, 2)}) to <code>${short(owner)}</code> on ${esc(b.net.name)}${Number.isFinite(Number(b.secs)) && b.secs != null ? `, ~${Math.round(Number(b.secs))}s` : ""}</li>`).join("")}</ul>
    Total ~$${fmt(usdIn, 2)} in, ~$${fmt(usdOut, 2)} out (Relay's fee is the difference). ${items.length > 1 ? `${items.length} deposits on Base: one signature if your wallet batches, else one each.` : "One signature on Base."}
    <br><span class="mut">Checked before your wallet opens: To = Relay's Base deposit contract <code>${SN.RELAY_DEPOSITORY}</code>, method depositNative, depositor and recipient = you, amount = exactly the line above (never over 0.006 ETH). Relay is a separate service; if it can't deliver, it refunds you on Base.</span>
    ${errs.length ? `<br><span class="mut">${esc(errs.join(" "))}</span>` : ""}
    <div style="margin-top:6px">${dry.ok ? `Dry run on Base OK.` : `<b>Dry run: ${esc(dry.why)}</b>`}</div>
    <div class="sign" style="margin-top:6px"><button class="sm" id="brCancel">Cancel</button> <button class="sm primary" id="brSign" ${dry.ok && mine ? "" : "disabled"}>${mine ? "Sign bridge" : "Connect this wallet to sign"}</button></div></div>`;
  $("brCancel").addEventListener("click", () => { BR = null; el.innerHTML = ""; });
  $("brSign").addEventListener("click", () => swBridgeSend().catch(e => { log("Bridge stopped: " + (e.message || e), "bad"); el.innerHTML = `<div class="banner bad small">Bridge stopped: ${esc(e.message || e)}. Nothing more will be sent; re-scan to see where things stand.</div>`; }));
}
async function swBridgeSend() {
  const b = BR; if (!b || !b.dry.ok || !S.account || ethers.getAddress(S.account) !== b.owner) return;
  const el = $("swBridge"); $("brSign").disabled = true;
  const prog = m => { el.innerHTML = `<div class="banner small">${esc(m)}</div>`; };
  if (b.items.some(x => Date.now() - x.at > SN.QUOTE_MS)) {      // never sign a quote the user hasn't seen: fetch, show, tap again
    log("The Relay quote is over 90s old; getting a fresh one. Check the amounts and tap Sign again.", "warn");
    return swGetGas(b.items.map(x => x.net.chainId));
  }
  const r = await SN.bridgeSend(S.provider, b.owner, b.items, log, prog);
  const nets = b.items.map(x => x.net);
  await Promise.all(nets.map(n => swGasRead(n, b.owner).catch(() => null)));
  renderNets(); renderGas(); BR = null;
  const okN = nets.filter(n => r.done[n.chainId] === "success").map(n => n.name), late = nets.filter(n => !r.done[n.chainId]).map(n => n.name);
  el.innerHTML = `<div class="banner ${late.length || okN.length < nets.length ? "warn" : "ok"} small">${okN.length ? `Gas delivered on ${esc(okN.join(", "))}. ` : ""}${late.length ? `Still on its way to ${esc(late.join(", "))}; re-scan in a minute. ` : ""}${r.txs.map(txh).filter(Boolean).map(h => `<a href="https://basescan.org/tx/${h}" target="_blank" rel="noopener noreferrer">${h.slice(0, 10)}…</a>`).join(" · ")} · switch back to ${esc(SWN.name)} and sweep when ready.</div>`;
  if (SWN.isBase || gasOk()) $("btnSend").disabled = !SW.dry;
}
const gasOk = () => { const g = SW.gas[SWN.chainId]; return !g || g.ok; };
const gasCostTxt = gas => { const g = SW.gas[SWN.chainId]; if (!g) return ""; const w = BigInt(gas) * g.price, usd = SN.gasUsd(SWN, w); return `≈ ${SN.gasAmt(w)} ${SWN.gas}${usd != null ? ` ($${fmt(usd, 3)})` : ""}`; };
function renderSweep(emptyMsg) {
  const box = $("toks"); box.innerHTML = "";
  renderNets(); renderGas();
  if (!SW.rows.length) {
    box.innerHTML = emptyMsg ? `<div class="banner warn small">${esc(emptyMsg)}</div>` : "";
    $("swTot").style.display = "none"; $("swPlanWrap").style.display = "none"; $("swSign").style.display = "none"; $("swk").textContent = emptyMsg ? "nothing to sweep" : (viewer() ? "open to scan" : "paste or connect to scan");
    return;
  }
  let tot = 0, n = 0;
  for (const r of SW.rows) {
    const d = document.createElement("div"); d.className = "tok" + (r.sell ? "" : " skip");
    d.innerHTML = `<input type="checkbox" ${r.sell ? "checked" : ""} ${r.best ? "" : "disabled"} data-addr="${r.address}">
      <div class="sym">${esc(r.sym)}${r.known ? "" : `<small title="${r.address}">${short(r.address)}</small>`}</div>
      <div class="bal">${fmt(ethers.formatUnits(r.balance, r.decimals), 4)}<small>${r.best ? "via " + esc(r.best.route.via) : "no route"}${r.needsApproval ? " · approval needed" : ""}${r.note ? " · " + esc(r.note) : ""}</small></div>
      <div class="usd num">${r.best ? "$" + fmt(r.usd, 2) : "-"}<small>${r.best ? "min $" + fmt(Number(r.minOut) / 1e6, 2) : ""}</small></div>`;
    box.appendChild(d);
    if (r.sell) { tot += r.usd; n++; }
  }
  box.querySelectorAll("input[type=checkbox]").forEach(cb => cb.addEventListener("change", e => {
    const r = SW.rows.find(x => x.address === e.target.dataset.addr); r.sell = e.target.checked; renderSweep(); swBuildPlan(viewer());
  }));
  const appr = SW.rows.filter(r => r.sell && r.needsApproval).length;
  $("swTot").style.display = ""; $("swTot").innerHTML = `<div class="tile"><div class="k">Expected</div><div class="v num">$${fmt(tot, 2)} <small>${SWN.stable}${SWN.isBase ? "" : " on " + esc(SWN.name)}</small></div></div>
    <div class="tile"><div class="k">Tokens</div><div class="v num">${n} <small>of ${SW.rows.length}</small></div></div>
    <div class="tile"><div class="k">Signatures</div><div class="v num">${n ? appr + 1 : 0} <small>${appr} approval${appr === 1 ? "" : "s"} + 1 swap</small></div></div>`;
  $("swk").textContent = `${n} to sell · $${fmt(tot, 2)}`;
}
// Rabby (and some other wallets) preview a swap as ONE token in and ONE token out. Our sweep sells several tokens in
// one swap, so the preview compares a single token with the whole USDC total and can show a red "value" or
// "slippage" warning. The balance change underneath is the true picture; the dry run proves it.
function walletNote(n, usd) {
  if (n < 2) return "";
  return `<div class="banner warn small" style="margin-top:8px"><b>Expect a red warning in your wallet on the last signature.</b> This swap sells ${n} tokens at once, and wallets like Rabby compare just one of them against the whole USDC total, so it can look like a big loss or "slippage". It isn't: check that the balance change at the bottom of the wallet screen (the ${n} tokens out, USDC in) matches the dry run${usd != null ? ` (<b>+$${fmt(usd, 2)} USDC</b>)` : ""}. <a href="docs.html#sweep">Why</a></div>`;
}
function swBuildPlan(ownerIn) {
  if (!ownerIn) return;
  const owner = ethers.getAddress(ownerIn);
  const sel = SW.rows.filter(r => r.sell && r.best);
  if (!sel.length) { $("swPlanWrap").style.display = "none"; $("swSign").style.display = "none"; SW.plan = null; return; }
  const approvals = sel.filter(r => r.needsApproval).map(r => ({ to: r.address, data: I.erc20.encodeFunctionData("approve", [MR, r.balance]), desc: `Approve the Metarouter to spend exactly ${fmt(ethers.formatUnits(r.balance, r.decimals), 6)} ${r.sym}`, sym: r.sym, amount: ethers.formatUnits(r.balance, r.decimals) }));
  const cmds = [], inputs = [];
  for (const r of sel) {
    const kind = r.best.route.kinds[0];
    cmds.push((kind === "cl" ? CMD_CL : CMD_V2) | (r.allowRevert ? FLAG_ALLOW_REVERT : 0));
    inputs.push(coder.encode(SWAP_T, [[r.best.route.pools, r.address, [0, r.balance], true, r.minOut, owner]]));
  }
  const deadline = Math.floor(Date.now() / 1000) + 20 * 60;
  const exec = { to: MR, data: I.mr.encodeFunctionData("execute", [ethers.hexlify(new Uint8Array(cmds)), inputs, deadline]), desc: `ONE swap: ${sel.length} swap${sel.length === 1 ? "" : "s"} through the Metarouter, ${SWN.stable} lands in ${short(owner)} on ${SWN.name}` };
  for (const c of [...approvals, exec]) if (!callIsAllowed(c, sel, owner)) throw new Error("internal guard: unexpected call to " + c.to);
  SW.plan = { owner, approvals, exec, deadline, sel }; SW.dry = null;
  const bytes = (exec.data.length - 2) / 2;
  $("swPlan").innerHTML = `<ol class="steplist">${approvals.map(a => `<li><b>Approve ${esc(a.sym)}</b> · To <code>${a.to}</code> (the ${esc(a.sym)} token) · spender <code>${MR}</code> (Metarouter) · amount <b>${esc(a.amount)}</b> · 0 ETH</li>`).join("")}
    <li><b>Swap</b> · To <code>${MR}</code> (Aero Metarouter) · method <b>execute</b> <code>${exec.data.slice(0, 10)}</code> · ${bytes.toLocaleString()} bytes · <b>0 ETH</b> · USDC paid to <code>${owner}</code> (you)<br><span class="mut">A hardware wallet shows this as raw data. Check the To address and 0 ETH on the device; the content is what the dry run returns and what your wallet's simulation shows (minus the reward tokens, plus ${SWN.stable}).</span>${sel.length > 1 ? `<br><span class="mut">Your wallet may flag this swap in red as a loss or "slippage": it compares one token with the whole total. The balance change is what counts.</span>` : ""}</li></ol>
    <p class="small mut">Network <b>${esc(SWN.name)}</b> on every screen. Reject anything naming sAERO <code>0xbf7977e1…</code>, "setApprovalForAll", "transfer", or an amount larger than the row. Deadline ${new Date(deadline * 1000).toLocaleTimeString()}.</p>`;
  $("swPlanWrap").style.display = ""; $("swSign").style.display = ""; $("btnSend").disabled = true; $("swOut").innerHTML = "";
}
/* Two tokens routed through the same pool (e.g. WETH and kBTC both ending in WETH/USDC): the first swap moves that pool,
   so the second gets less than its own quote and its minimum reverts the whole sweep (seen on Ink 11/5: kBTC quoted
   $124.6, got $114.0 after the WETH leg). When routes share a pool, simulate the swaps one after another with no minimum
   to read what each really gets in this order, and lower those tokens' minimums to that x (1 - slippage). Never raises one. */
async function swSeqMins(p) {
  const seen = {}, shared = new Set();
  for (const r of p.sel) for (const pool of r.best.route.pools) { const k = pool.toLowerCase(); if (seen[k] && seen[k] !== r) shared.add(k); seen[k] = r; }
  if (!shared.size) return null;
  const slip = Math.min(5, Math.max(0.1, Number($("slip").value) || 1)) / 100;
  const balData = I.erc20.encodeFunctionData("balanceOf", [p.owner]), G2 = "0x" + (200000).toString(16);
  const n = p.sel.length, per = Math.floor((await SN.simSwapGas(SWN, p.approvals.length + n + 1)) / n);
  const one = r => I.mr.encodeFunctionData("execute", [ethers.hexlify(new Uint8Array([r.best.route.kinds[0] === "cl" ? CMD_CL : CMD_V2])),
    [coder.encode(["tuple(address[] pools,address tokenIn,tuple(uint8 mode,uint256 value) amountIn,bool payerIsUser,uint256 minAmountOut,address recipient)"],
      [[r.best.route.pools, r.address, [0, r.balance], true, 0n, p.owner]])], p.deadline]);
  const calls = [{ from: p.owner, to: USDC, data: balData, gas: G2 }, ...p.approvals.map(a => ({ from: p.owner, to: a.to, data: a.data, gas: G2 }))];
  for (const r of p.sel) calls.push({ from: p.owner, to: MR, data: one(r), gas: "0x" + per.toString(16) }, { from: p.owner, to: USDC, data: balData, gas: G2 });
  let out;
  try { out = (await SN.rpc(SWN, "eth_simulateV1", [{ blockStateCalls: [{ calls }], validation: false }, "latest"]))[0].calls; } catch (e) { log("Order check skipped: " + e.message, "warn"); return null; }
  const base = 1 + p.approvals.length; let prev = out[0].status === "0x1" ? BigInt(out[0].returnData) : null; const moved = [];
  p.sel.forEach((r, i) => {
    const sw = out[base + 2 * i], rd = out[base + 2 * i + 1];
    const now = rd && rd.status === "0x1" ? BigInt(rd.returnData) : null;
    if (sw && sw.status === "0x1" && prev != null && now != null && r.best.route.pools.some(x => shared.has(x.toLowerCase()))) {
      const got = now - prev, min = got * BigInt(Math.round((1 - slip) * 1e6)) / 1000000n;
      if (min < r.minOut) { moved.push(`${r.sym} $${fmt(Number(r.minOut) / 1e6, 2)} → $${fmt(Number(min) / 1e6, 2)}`); r.minOut = min; }
    }
    if (now != null) prev = now;
  });
  if (!moved.length) return null;
  log(`Swaps share a pool, so each one moves the price for the next: minimums set from the in-order result (${moved.join(", ")}).`, "warn");
  swBuildPlan(p.owner);
  return SW.plan;
}
async function swSimCalls(p) {
  const balData = I.erc20.encodeFunctionData("balanceOf", [p.owner]);
  const G2 = "0x" + (200000).toString(16), swapGas = await SN.simSwapGas(SWN, p.approvals.length + 2);
  return [{ from: p.owner, to: USDC, data: balData, gas: G2 },
    ...p.approvals.map(a => ({ from: p.owner, to: a.to, data: a.data, gas: G2 })),
    { from: p.owner, to: p.exec.to, data: p.exec.data, gas: "0x" + swapGas.toString(16) },
    { from: p.owner, to: USDC, data: balData, gas: G2 }];
}
/* Second opinion before signing (11/11/2026): every price this sweep relies on came from one public RPC, and the
   swap's minimums are set from them. So the same rehearsal runs on a different RPC; if that one says the swap should
   pay clearly more than the minimums allow (more than slippage + 1.5%), the first RPC's prices can't be trusted and
   nothing is signed. Returns {ok, why, checked}. */
const XCHECK_TOL = 0.015;
async function swCrossCheck(p) {
  const slip = Math.min(5, Math.max(0.1, Number($("slip").value) || 1)) / 100;
  const alt = await SN.rpcOther(SWN, "eth_simulateV1", [{ blockStateCalls: [{ calls: await swSimCalls(p) }], validation: false }, "latest"]);
  if (!alt) return { ok: true, checked: false };
  const out = alt.result[0].calls, host = new URL(alt.url).hostname;
  if (out.some(c => c.status !== "0x1")) return { ok: false, checked: true, why: `a second RPC (${host}) says this swap would fail; re-scan and dry-run again` };
  const fair = BigInt(out[out.length - 1].returnData) - BigInt(out[0].returnData), mins = p.sel.reduce((t, r) => t + r.minOut, 0n);
  const floor = fair * BigInt(Math.round((1 - slip - XCHECK_TOL) * 1e6)) / 1000000n;
  if (mins < floor) return { ok: false, checked: true, why: `a second RPC (${host}) says this swap should pay about $${fmt(Number(fair) / 1e6, 2)}, but the minimums only guarantee $${fmt(Number(mins) / 1e6, 2)}; the prices this page read can't be trusted right now. Re-scan and dry-run again` };
  return { ok: true, checked: true, host, fair: Number(fair) / 1e6 };
}
async function swDry() {
  let p = SW.plan; if (!p) return;
  log("Sweep dry run: simulating approvals + swap from your address…");
  $("swOut").innerHTML = `<div class="banner small">Simulating…</div>`;
  p = (await swSeqMins(p)) || p;
  $("swOut").innerHTML = `<div class="banner small">Simulating…</div>`;
  const calls = await swSimCalls(p);
  let res;
  try { res = await SN.rpc(SWN, "eth_simulateV1", [{ blockStateCalls: [{ calls }], validation: false }, "latest"]); }
  catch (e) { log("Simulation RPC failed: " + e.message, "bad"); $("swOut").innerHTML = `<div class="banner bad">Simulation failed. Not safe to sign.</div>`; return; }
  const out = res[0].calls;
  const bad = out.findIndex(c => c.status !== "0x1");
  if (bad >= 0) {
    const c = out[bad]; const what = bad === 0 || bad === out.length - 1 ? "balance read" : bad <= p.approvals.length ? `approval #${bad}` : "the swap";
    const errTxt = JSON.stringify(c.error || c.returnData); const oog = /out of gas|OutOfGas/i.test(errTxt);
    log(`Simulation: ${what} FAILED${oog ? " (out of gas in the simulation: a page limit, not your wallet)" : ""}: ${errTxt.slice(0, 300)}`, "bad");
    $("swOut").innerHTML = `<div class="banner bad"><b>Dry run failed at ${esc(what)}.</b> Nothing was sent. Untick the token that cannot swap, or raise slippage, and dry-run again. <a href="docs.html#fail">Help</a></div>`;
    SW.dry = null; $("btnSend").disabled = true; return;
  }
  const before = BigInt(out[0].returnData), after = BigInt(out[out.length - 1].returnData);
  const got = Number(after - before) / 1e6, gas = out.slice(1, -1).reduce((s, c) => s + parseInt(c.gasUsed, 16), 0);
  const expect = p.sel.reduce((s, r) => s + r.usd, 0);
  SW.dry = { got, gas };
  const mine = S.account && ethers.getAddress(S.account) === p.owner;
  log(`Sweep simulation OK on ${SWN.name}: +${fmt(got, 4)} ${SWN.stable} (quotes ${fmt(expect, 4)}), gas ${gas.toLocaleString()}`, "ok");
  $("swOut").innerHTML = `<div class="banner ok"><div class="big num">+$${fmt(got, 2)} ${SWN.stable}</div><span class="small">Dry run OK · quotes said $${fmt(expect, 2)} · gas ${gas.toLocaleString()} ${gasCostTxt(gas)} · ${p.approvals.length + 1} signature${p.approvals.length ? "s" : ""}${mine ? "" : S.account ? " · connect the wallet that holds these tokens to sign" : " · connect to sign"}</span></div>${walletNote(p.sel.length, got)}`;
  try { await swGasRead(SWN, p.owner, gas); } catch (e) { /* keep the guess */ }
  renderNets(); renderGas();
  $("btnSend").disabled = !mine || !gasOk();
}
async function swSend() {
  const p = SW.plan; if (!p || !S.account || !SW.dry) return;
  if (ethers.getAddress(S.account) !== p.owner) { log("Connected account differs from the scanned one. Re-scan.", "bad"); return; }
  try { const g = await swGasRead(SWN, p.owner, SW.dry.gas); if (!g.ok) { renderNets(); renderGas(); log(`Not enough ${SWN.gas} for gas on ${SWN.name}; nothing sent.`, "bad"); return; } } catch (e) { /* the wallet will refuse if gas is short */ }
  const xc = await swCrossCheck(p).catch(e => ({ ok: true, checked: false, err: e.message }));
  if (!xc.ok) { log("Stopped before signing: " + xc.why, "bad"); $("swOut").innerHTML = `<div class="banner bad"><b>Stopped before signing.</b> ${esc(xc.why)}.</div>`; return; }
  log(xc.checked ? `Second RPC (${xc.host}) agrees: about $${fmt(xc.fair, 2)}.` : `No second RPC on ${SWN.name} could double-check the prices${xc.err ? " (" + xc.err + ")" : ""}; going by the dry run alone.`, xc.checked ? "ok" : "warn");
  await SN.ensureNet(S.provider, SWN, log);
  const all = [...p.approvals, p.exec];
  for (const c of all) if (!callIsAllowed(c, p.sel, S.account)) { log("Guard tripped: refusing to send to " + c.to + " (it isn't exactly the swap shown, or its deadline passed; dry-run again)", "bad"); return; }
  $("btnSend").disabled = true; $("btnDry").disabled = true;
  const prog = m => { $("swOut").innerHTML = `<div class="banner small">${m}</div>`; };
  let atomic = false;
  try {
    const caps = await S.provider.request({ method: "wallet_getCapabilities", params: [S.account, [SWN.hex]] });
    const st = caps && caps[SWN.hex] && caps[SWN.hex].atomic && caps[SWN.hex].atomic.status;
    atomic = st === "supported" || st === "ready";
    log(`Wallet batching capability: ${st || "none"}`);
  } catch (e) { log("Wallet does not expose wallet_getCapabilities; signing one by one."); }
  const txs = [];
  try {
    if (atomic) {
      prog("Waiting for your signature (one batch)…" + walletNote(p.sel.length, SW.dry && SW.dry.got));
      await SN.assertNet(S.provider, SWN);
      const id = await S.provider.request({ method: "wallet_sendCalls", params: [{ version: "2.0.0", chainId: SWN.hex, from: S.account, atomicRequired: true, calls: all.map(c => ({ to: c.to, data: c.data, value: "0x0" })) }] });
      log(`Batch submitted (${all.length} calls in one signature), id ${JSON.stringify(id).slice(0, 80)}. Waiting…`);
      txs.push(...await SN.waitCalls(S.provider, id));          // throws unless confirmed: never "Swept ✓" on a guess
      log("Batch confirmed.", "ok");
    } else {
      for (const [i, c] of all.entries()) {
        prog(`Signature ${i + 1} of ${all.length}: ${esc(c.desc)}` + (c === p.exec ? walletNote(p.sel.length, SW.dry && SW.dry.got) : ""));
        log(`Signing ${i + 1}/${all.length}: ${c.desc}`);
        await SN.assertNet(S.provider, SWN);                    // the wallet can change networks between signatures
        const hash = needHash(await S.provider.request({ method: "eth_sendTransaction", params: [{ from: S.account, to: c.to, data: c.data, value: "0x0" }] }));
        log(`  sent ${hash}, waiting for confirmation…`); txs.push(hash);
        const rc = await SN.waitReceipt(SWN, hash);
        if (rc.status !== "0x1") throw new Error(`transaction ${hash} reverted on chain`);
        log(`  confirmed in block ${parseInt(rc.blockNumber, 16)}`, "ok");
      }
    }
    const b = BigInt(await SN.call(SWN, USDC, I.erc20.encodeFunctionData("balanceOf", [S.account])));
    SW.done = { usdc: Number(b) / 1e6, txs };
    log(`Sweep done on ${SWN.name}. ${SWN.stable} balance there now ${fmt(Number(b) / 1e6, 2)}.`, "ok");
    $("swOut").innerHTML = `<div class="banner ok"><div class="big num">Swept ✓ · ${fmt(Number(b) / 1e6, 2)} ${SWN.stable} in the wallet on ${esc(SWN.name)}</div><span class="small">${txs.map(txh).filter(Boolean).map(h => `<a href="${esc(SN.txUrl(SWN, h))}" target="_blank" rel="noopener noreferrer">${h.slice(0, 10)}…</a>`).join(" · ")} · <a href="#" id="swAgain">re-scan</a> to confirm the reward tokens are gone</span>${tipLine()}</div>`;
    const ag = $("swAgain"); if (ag) ag.addEventListener("click", e => { e.preventDefault(); swScan().catch(er => log(er.message, "bad")); });
    $("swk").textContent = "done";
  } catch (e) { log("Stopped: " + (e.message || e), "bad"); $("swOut").innerHTML = `<div class="banner bad">Stopped: ${esc(e.message || e)}. ${txs.length ? "Sent so far: " + esc(txs.map(h => String(h).slice(0, 10) + "…").join(", ")) + ". " : ""}Re-scan before trying again.</div>`; }
  $("btnDry").disabled = false;
}
$("floorSeg").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { $("floorSeg").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); SW.floor = Number(b.dataset.f); if (SW.rows.length) swScan().catch(e => log(e.message, "bad")); }));
$("btnScan").addEventListener("click", () => { try { localStorage.setItem(EXTRA_KEY, $("extra").value); } catch (e) {} swScan().catch(e => log("Scan failed: " + e.message, "bad")); });
try { $("keepAero").checked = store.get("keepAero") === "1"; } catch (e) {}
$("keepAero").addEventListener("change", () => { store.set("keepAero", $("keepAero").checked ? "1" : "0"); if (viewer()) swScan().catch(e => log("Scan failed: " + e.message, "bad")); });
$("btnDry").addEventListener("click", () => swDry().catch(e => log("Dry run failed: " + e.message, "bad")));
$("btnSend").addEventListener("click", () => swSend().catch(e => log("Sweep failed: " + e.message, "bad")));
$("sweep").addEventListener("toggle", () => { if ($("sweep").open && viewer() && !SW.rows.length && !SW.busy) swScan().catch(e => log("Scan failed: " + e.message, "bad")); });

/* ======================================================================================
   CLAIM + COMPOUND (11/11/2026): claim.js builds and guards the calls; this section finds
   what's waiting, rehearses it from your address, and signs only after a passing dry run.
   Claim = one Voter.claimRewards per lock on Base, 0 ETH, rewards paid to you.
   Compound = approve exactly N AERO to the sAERO escrow + increaseStakeAmount(lock, N).
   ====================================================================================== */
const K = window.AeroClaim;
const CL = { sc: null, calls: [], dry: null, busy: false, owner: null }, TOKM = {};
const CL_MAX_LOCKS = 20;
// bigger batches, four at a time: the claim scan asks every Base rewards contract about every lock
async function mcPar(calls) {
  const parts = []; for (let i = 0; i < calls.length; i += 120) parts.push(calls.slice(i, i + 120));
  const out = [];
  for (let i = 0; i < parts.length; i += 4) {
    const rs = await Promise.all(parts.slice(i, i + 4).map(async part => I.mc3.decodeFunctionResult("tryAggregate", await ethCall(C.MC3, I.mc3.encodeFunctionData("tryAggregate", [false, part])))[0].map(r => ({ success: r[0], returnData: r[1] }))));
    for (const r of rs) out.push(...r);
  }
  return out;
}
async function tokMeta(addrs) {
  const need = addrs.filter(a => !TOKM[a]); if (!need.length) return;
  const T = new ethers.Interface(K.ABI.erc20), r = await mcPar(need.flatMap(a => [{ target: a, callData: T.encodeFunctionData("symbol", []) }, { target: a, callData: T.encodeFunctionData("decimals", []) }]));
  need.forEach((a, k) => {
    let sym = a.slice(0, 8), dec = 18;
    try { sym = String(T.decodeFunctionResult("symbol", r[2 * k].returnData)[0]).slice(0, 16); } catch (e) {}
    try { dec = Number(T.decodeFunctionResult("decimals", r[2 * k + 1].returnData)[0]); } catch (e) {}
    TOKM[a] = { sym, dec: dec >= 0 && dec <= 36 ? dec : 18 };
  });
}
const tokAmt = (a, v) => { const m = TOKM[a] || { sym: short(a), dec: 18 }, x = Number(ethers.formatUnits(v, m.dec)); return `${x >= 100 ? fmt(x, 0) : x >= 1 ? fmt(x, 2) : x.toPrecision(3)} ${m.sym}`; };
function clTotals(L) {     // {token: wei} one lock is owed, from the scan
  const t = {}, add = (a, v) => { if (a && v > 0n) t[a] = (t[a] || 0n) + v; };
  for (const f of L.fees) { add(f.t0, f.a0); add(f.t1, f.a1); } for (const e of L.incs) add(e.tok, e.amt);
  return t;
}
async function clScan() {
  const owner = viewer();
  if (!K || !owner || !S.D || !S.locks.length) { clRender(); return; }
  if (CL.busy) return; CL.busy = true; $("clk").textContent = "checking…";
  try {
    const ids = S.locks.slice(0, CL_MAX_LOCKS).map(L => L.id);
    const sc = await K.scan(ethers, mcPar, { ids, gauges: S.D.gauges.filter(g => g.gauge && (g.chain || "base") === "base").map(g => g.gauge), registry: S.D.factory_registry });
    await tokMeta([...sc.tokens]);
    CL.sc = sc; CL.owner = owner; CL.dry = null; CL.calls = [];
    for (const L of S.locks) {
      const x = sc.byLock[L.id]; if (!x || !(x.fees.length + x.incs.length) || !L.owner) continue;
      const call = K.buildClaim(ethers, { tokenId: L.id, owner: L.owner, fees: x.fees, incs: x.incs });
      const g = K.checkClaim(ethers, call, { tokenId: L.id, owner: L.owner, account: L.owner, vrms: sc.vrms });
      if (!g.ok) throw new Error("safety check: " + g.why);
      CL.calls.push({ L, call, totals: clTotals(x) });
    }
    log(`Claim scan: ${sc.vrms.size} Base rewards contracts asked for ${ids.length} lock${ids.length === 1 ? "" : "s"}; ${CL.calls.length} with rewards waiting.`);
  } catch (e) { CL.sc = null; CL.calls = []; log("Claim scan failed: " + (e.message || e), "bad"); $("clOut").innerHTML = `<div class="banner bad small">Couldn't check rewards: ${esc(e.message || e)}</div>`; CL.busy = false; $("clk").textContent = "check failed"; return; }
  CL.busy = false; clRender();
}
function clRender() {
  const out = $("clOut"), sign = $("clSign");
  cpRender();
  if (!viewer() || !S.locks.length) { out.innerHTML = ""; sign.style.display = "none"; $("clk").textContent = viewer() ? "no locks" : "paste or connect to check"; return; }
  if (!CL.sc) { out.innerHTML = ""; sign.style.display = "none"; $("clk").textContent = "open to check"; return; }
  if (!CL.calls.length) { out.innerHTML = `<div class="banner small">Nothing to claim on Base right now.</div>`; sign.style.display = "none"; $("clk").textContent = "nothing to claim"; return; }
  out.innerHTML = (S.locks.length > CL_MAX_LOCKS ? `<div class="banner warn small">Only the first ${CL_MAX_LOCKS} locks are checked.</div>` : "") + CL.calls.map(c =>
    `<div class="tok"><div class="sym">#${c.L.id}<small>${c.call.n} reward${c.call.n === 1 ? "" : "s"}</small></div><div class="bal">${esc(Object.entries(c.totals).map(([a, v]) => tokAmt(a, v)).join(" · ") || "amounts unread")}</div></div>`).join("");
  const mine = CL.calls.every(c => owns(c.L));
  sign.style.display = ""; $("clSend").textContent = `Claim · ${CL.calls.length} signature${CL.calls.length === 1 ? "" : "s"}`;
  $("clSend").disabled = !(CL.dry && CL.dry.ok && mine);
  $("clk").textContent = `${CL.calls.length} lock${CL.calls.length === 1 ? "" : "s"} to claim`;
}
// rehearse every claim, one after another, from the owner's address: each must succeed and token balances must rise
async function clSim(calls, owner) {
  const B = new ethers.Interface(K.ABI.erc20), toks = [...new Set(calls.flatMap(c => Object.keys(c.totals)))];
  // fees in wrapped ETH are paid out as plain ETH, so the wallet's ETH is read before and after too (Multicall3)
  const bal = toks.map(a => ({ from: owner, to: a, data: B.encodeFunctionData("balanceOf", [owner]) })).concat([{ from: owner, to: C.MC3, data: "0x4d2301cc" + owner.slice(2).toLowerCase().padStart(64, "0") }]);
  toks.push("ETH"); TOKM.ETH = { sym: "ETH", dec: 18 };
  const res = (await rpc("eth_simulateV1", [{ blockStateCalls: [{ calls: [...bal, ...calls.map(c => ({ from: owner, to: c.call.to, data: c.call.data, value: "0x0", gas: "0x" + (12_000_000).toString(16) })), ...bal] }], validation: false }, "latest"]))[0].calls;
  const n = toks.length, mid = res.slice(n, n + calls.length), badI = mid.findIndex(r => r.status !== "0x1");
  if (badI >= 0) return { ok: false, why: `#${calls[badI].L.id}: ${JSON.stringify(mid[badI].error || mid[badI].returnData || "").slice(0, 160)}` };
  const got = {}; let up = 0;
  toks.forEach((a, i) => { const d = BigInt(res[n + calls.length + i].returnData) - BigInt(res[i].returnData); if (d > 0n) { got[a] = d; up++; } });
  if (!up) return { ok: false, why: "no token balance rose in the rehearsal" };
  return { ok: true, got, gas: mid.reduce((t, r) => t + parseInt(r.gasUsed, 16), 0) };
}
async function clDry() {
  if (!CL.calls.length) return;
  $("clRes").innerHTML = `<div class="banner small">Rehearsing…</div>`;
  try {
    const r = await clSim(CL.calls, CL.owner); CL.dry = r;
    if (!r.ok) { $("clRes").innerHTML = `<div class="banner bad"><b>Dry run failed.</b> ${esc(r.why)}. Nothing was sent.</div>`; log("Claim dry run failed: " + r.why, "bad"); }
    else {
      const mine = CL.calls.every(c => owns(c.L)), c0 = CL.calls[0].call;
      $("clRes").innerHTML = `<div class="banner ok"><b>Dry run OK.</b> Paid to ${esc(short(CL.owner))}: ${esc(Object.entries(r.got).map(([a, v]) => tokAmt(a, v)).join(" · "))}<br><span class="small">gas ${r.gas.toLocaleString()}${mine ? " · ready to sign" : S.account ? " · not the connected wallet" : " · connect to sign"}</span></div>` +
        (mine ? `<ol class="steplist"><li>Network <b>Base</b></li><li>To <code>${esc(c0.to)}</code> <span class="mut">= the Aero Voter; compare start and end</span></li><li>Method <b>claimRewards</b> <span class="mut">(selector <code>${K.C.CLAIM_SELECTOR}</code>)</span></li><li>Value <b>0 ETH</b></li><li>Your wallet's preview should show reward tokens coming <b>in</b> and nothing going out</li></ol>` : "");
      log(`Claim dry run OK: ${Object.keys(r.got).length} tokens, gas ${r.gas.toLocaleString()}.`, "ok");
    }
  } catch (e) { CL.dry = null; $("clRes").innerHTML = `<div class="banner bad">Dry run failed: ${esc(e.message || e)}</div>`; }
  clRender();
}
// one batch when the wallet can (EIP-5792, all or nothing), else one signature after another, each confirmed first
async function sendGuarded(calls, label) {
  let atomic = false;
  if (calls.length > 1) { try { const caps = await S.provider.request({ method: "wallet_getCapabilities", params: [S.account, [C.CHAIN_HEX]] }); const st = caps && caps[C.CHAIN_HEX] && caps[C.CHAIN_HEX].atomic && caps[C.CHAIN_HEX].atomic.status; atomic = st === "supported" || st === "ready"; } catch (e) { /* one by one */ } }
  const txs = [];
  if (atomic) {
    await assertBase();
    const id = await S.provider.request({ method: "wallet_sendCalls", params: [{ version: "2.0.0", chainId: C.CHAIN_HEX, from: S.account, atomicRequired: true, calls: calls.map(c => ({ to: c.to, data: c.data, value: "0x0" })) }] });
    txs.push(...await SN.waitCalls(S.provider, id));
  } else for (const [i, c] of calls.entries()) {
    label(i, calls.length);
    await assertBase();
    const h = needHash(await S.provider.request({ method: "eth_sendTransaction", params: [{ from: S.account, to: c.to, data: c.data, value: "0x0" }] }));
    txs.push(h); log(`  sent ${h}`);
    const rc = await waitReceipt(h);
    if (rc.status !== "0x1") throw new Error(`transaction ${h.slice(0, 12)}… reverted on chain`);
  }
  return txs;
}
const txLinks = txs => txs.map(txh).filter(Boolean).map(h => `<a href="https://basescan.org/tx/${h}" target="_blank" rel="noopener noreferrer">${h.slice(0, 10)}…</a>`).join(" · ");
async function clSend() {
  const out = $("clRes");
  try {
    if (!S.account || !S.provider) throw new Error("connect the wallet first");
    if (!CL.dry || !CL.dry.ok || !CL.calls.length) throw new Error("dry run first");
    if (!CL.calls.every(c => owns(c.L))) throw new Error("these locks are not owned by the connected wallet");
    $("clSend").disabled = true;
    await ensureChain();
    // live re-check: owner of every lock, the guard on every call, and the whole rehearsal again
    const fresh = await readLocks(CL.calls.map(c => c.L.id));
    for (const c of CL.calls) {
      const f = fresh.find(x => x.id === c.L.id);
      if (!f || !f.owner || f.owner.toLowerCase() !== S.account.toLowerCase()) throw new Error(`#${c.L.id} is not owned by the connected account`);
      const g = K.checkClaim(ethers, c.call, { tokenId: c.L.id, owner: f.owner, account: S.account, vrms: CL.sc.vrms });
      if (!g.ok) throw new Error("guard tripped: " + g.why);
    }
    const again = await clSim(CL.calls, S.account);
    if (!again.ok) throw new Error("the fresh dry run failed: " + again.why);
    out.innerHTML = `<div class="banner">Waiting for your signature… check: To the Aero Voter, 0 ETH, tokens coming in.</div>`;
    const txs = await sendGuarded(CL.calls.map(c => c.call), (i, n) => { out.innerHTML = `<div class="banner">Signature ${i + 1} of ${n}: claim for #${CL.calls[i].L.id}. To the Aero Voter, 0 ETH.</div>`; });
    log(`Claimed for ${CL.calls.length} lock${CL.calls.length === 1 ? "" : "s"}.`, "ok");
    out.innerHTML = `<div class="banner ok"><div class="big">Claimed ✓</div><span class="small">${txLinks(txs)} · the rewards are in your wallet: sweep them to USDC below, or keep the AERO and compound it</span>${tipLine()}</div>`;
    CL.sc = null; CL.calls = []; CL.dry = null; clRender(); cpRead().catch(() => {});
    if ($("sweep").open) swScan().catch(() => {});
  } catch (e) { log("Claim stopped: " + (e.message || e), "bad"); out.innerHTML = `<div class="banner bad">Stopped: ${esc(e.message || e)}. Check the claim list again before retrying.</div>`; clRender(); }
}
// ---------- compound ----------
const CP = { bal: null, dry: null, owner: null };
const cpErc = new ethers.Interface(K ? K.ABI.erc20 : []), cpEsc = new ethers.Interface(K ? K.ABI.escrow : []);
async function cpRead() {
  const owner = viewer(); if (!K || !owner) { CP.bal = null; cpRender(); return; }
  CP.bal = BigInt(await ethCall(K.C.AERO, cpErc.encodeFunctionData("balanceOf", [owner]))); CP.owner = owner; CP.dry = null; cpRender();
}
function cpRender() {
  const sel = $("cpLock"), keep = sel.value;
  sel.innerHTML = S.locks.slice().sort((a, b) => lockAero(b) - lockAero(a)).map(L => `<option value="${L.id}">#${L.id} · ${fmtA(lockAero(L))} AERO</option>`).join("");
  if (keep && S.locks.some(L => String(L.id) === keep)) sel.value = keep;
  $("cpBal").textContent = CP.bal == null ? "" : `AERO in this wallet: ${fmt(ethers.formatUnits(CP.bal, 18), 4)}`;
  const L = cpLock();
  $("cpSend").disabled = !(CP.dry && CP.dry.ok && L && owns(L) && CP.dry.key === cpKey());
  $("cpDry").disabled = !S.locks.length;
}
const cpLock = () => S.locks.find(L => String(L.id) === $("cpLock").value) || null;
function cpAmount() { try { const s = $("cpAmt").value.trim().replace(/,/g, ""); if (!/^\d+(\.\d{1,18})?$/.test(s)) return 0n; return ethers.parseUnits(s, 18); } catch (e) { return 0n; } }
const cpKey = () => $("cpLock").value + ":" + cpAmount();
async function cpCheck(account) {      // live reads + the guard on both calls; returns {L, amount, calls, ctx}
  const L = cpLock(), amount = cpAmount();
  if (!L) throw new Error("pick a lock");
  if (!(amount > 0n)) throw new Error("enter an amount of AERO");
  const [fresh] = await readLocks([L.id]);
  const [balance, token] = await Promise.all([ethCall(K.C.AERO, cpErc.encodeFunctionData("balanceOf", [account])).then(BigInt), ethCall(K.C.SAERO, cpEsc.encodeFunctionData("TOKEN", [])).then(r => cpEsc.decodeFunctionResult("TOKEN", r)[0])]);
  CP.bal = balance;
  const ctx = { tokenId: L.id, owner: fresh.owner, account, amount, balance, token }, calls = K.buildCompound(ethers, { tokenId: L.id, amount });
  for (const c of calls) { const g = K.checkCompound(ethers, c, ctx); if (!g.ok) throw new Error("safety check: " + g.why); }
  return { L, amount, calls, staked: fresh.staked };
}
async function cpSim(p, owner) {
  const st = { from: owner, to: C.SAERO, data: I.saero.encodeFunctionData("staked", [p.L.id]) };
  const res = (await rpc("eth_simulateV1", [{ blockStateCalls: [{ calls: [st, ...p.calls.map(c => ({ from: owner, to: c.to, data: c.data, gas: "0x" + (2_000_000).toString(16) })), st] }], validation: false }, "latest"]))[0].calls;
  const badI = res.findIndex(r => r.status !== "0x1");
  if (badI >= 0) return { ok: false, why: (badI === 1 ? "the approval" : badI === 2 ? "the top-up" : "a read") + " failed: " + JSON.stringify(res[badI].error || res[badI].returnData || "").slice(0, 160) };
  const s0 = I.saero.decodeFunctionResult("staked", res[0].returnData)[0], s1 = I.saero.decodeFunctionResult("staked", res[3].returnData)[0];
  if (s1 - s0 !== p.amount) return { ok: false, why: "the lock did not grow by exactly the amount" };
  return { ok: true, s0, s1, gas: parseInt(res[1].gasUsed, 16) + parseInt(res[2].gasUsed, 16) };
}
async function cpDry() {
  const out = $("cpRes"); out.innerHTML = `<div class="banner small">Rehearsing…</div>`;
  try {
    const owner = viewer(); if (!owner) throw new Error("paste an address or connect first");
    const p = await cpCheck(owner), r = await cpSim(p, owner);
    CP.dry = { ...r, key: cpKey() };
    if (!r.ok) { out.innerHTML = `<div class="banner bad"><b>Dry run failed.</b> ${esc(r.why)}. Nothing was sent.</div>`; }
    else {
      const mine = owns(p.L), amt = fmt(ethers.formatUnits(p.amount, 18), 6);
      out.innerHTML = `<div class="banner ok"><b>Dry run OK.</b> #${p.L.id}: ${fmt(ethers.formatUnits(r.s0, 18), 2)} → <b>${fmt(ethers.formatUnits(r.s1, 18), 2)} AERO</b><br><span class="small">gas ${r.gas.toLocaleString()}${mine ? " · ready to sign" : S.account ? " · not the connected wallet" : " · connect to sign"}</span></div>` +
        (mine ? `<ol class="steplist"><li><b>Approve AERO</b> · To <code>${esc(p.calls[0].to)}</code> (the AERO token) · spender <code>${esc(p.calls[1].to)}</code> (the sAERO contract) · amount <b>${esc(amt)}</b> exactly · 0 ETH</li><li><b>Add to lock #${p.L.id}</b> · To <code>${esc(p.calls[1].to)}</code> (the sAERO contract) · method <b>increaseStakeAmount</b> · ${esc(amt)} AERO · 0 ETH</li></ol><div class="small mut2">Reject it if any screen says "setApprovalForAll", an unlimited amount, a transfer of the lock, or a different amount. AERO added to a lock stays locked on the lock's own terms.</div>` : "");
    }
  } catch (e) { CP.dry = null; out.innerHTML = `<div class="banner bad">Dry run failed: ${esc(e.message || e)}</div>`; }
  cpRender();
}
async function cpSend() {
  const out = $("cpRes");
  try {
    if (!S.account || !S.provider) throw new Error("connect the wallet first");
    if (!CP.dry || !CP.dry.ok || CP.dry.key !== cpKey()) throw new Error("dry run first");
    $("cpSend").disabled = true;
    await ensureChain();
    const p = await cpCheck(S.account);                                // live: owner, balance, the escrow's token, both guards
    if (!owns(p.L)) throw new Error("this lock is not owned by the connected wallet");
    const again = await cpSim(p, S.account);
    if (!again.ok) throw new Error("the fresh dry run failed: " + again.why);
    out.innerHTML = `<div class="banner">Waiting for your signature…</div>`;
    const txs = await sendGuarded(p.calls, (i) => { out.innerHTML = `<div class="banner">Signature ${i + 1} of 2: ${i === 0 ? "approve exactly " + esc(fmt(ethers.formatUnits(p.amount, 18), 6)) + " AERO to the sAERO contract" : "add it to lock #" + p.L.id}. 0 ETH.</div>`; });
    log(`Compounded ${ethers.formatUnits(p.amount, 18)} AERO into #${p.L.id}.`, "ok");
    out.innerHTML = `<div class="banner ok"><div class="big">Added to #${p.L.id} ✓</div><span class="small">${txLinks(txs)} · the new AERO starts earning at this lock's next allocation</span></div>`;
    CP.dry = null; $("cpAmt").value = "";
    await lookup(S.account);
  } catch (e) { log("Compound stopped: " + (e.message || e), "bad"); out.innerHTML = `<div class="banner bad">Stopped: ${esc(e.message || e)}.</div>`; cpRender(); }
}
if (K) {
  $("clDry").addEventListener("click", () => clDry());
  $("clSend").addEventListener("click", () => clSend());
  $("cpDry").addEventListener("click", () => cpDry());
  $("cpSend").addEventListener("click", () => cpSend());
  $("cpMax").addEventListener("click", () => { if (CP.bal != null) { $("cpAmt").value = ethers.formatUnits(CP.bal, 18); CP.dry = null; cpRender(); } });
  for (const id of ["cpAmt", "cpLock"]) $(id).addEventListener("input", () => { CP.dry = null; cpRender(); });
  $("cycle").addEventListener("toggle", () => { if ($("cycle").open && viewer() && S.locks.length) { if (!CL.sc && !CL.busy) clScan(); cpRead().catch(e => log("AERO balance unavailable: " + e.message, "warn")); } });
}

// ---------- look up ----------
async function lookup(raw) {
  let a = String(raw || "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) { toast("that isn't a wallet address"); return; }
  a = ethers.getAddress(a); S.addr = a; S.locks = []; S.total = 0; S.plan = null; S.bracket = null; S.busy = true; S.err = null; $("addr").value = a; render();
  SW.rows = []; SW.byNet = {}; SW.gas = {}; SW.cid = null; SW.plan = null; SW.dry = null; renderSweep();
  try { history.replaceState(null, "", "?addr=" + a); } catch (e) {}
  try {
    if (!S.D) await loadData();
    loadRank();                                   // in parallel with the chain reads below
    const ids = await discover(a);
    const all = ids.length ? await readLocks(ids) : [];
    S.locks = all.filter(L => L.staked > 0n); S.empty = all.length - S.locks.length;
    await readLeaf(S.locks).catch(e => log("Other-network allocations unavailable: " + e.message, "warn"));
    for (const L of S.locks) { const h = txh(store.get("sent:" + L.id)); if (h && L.la && Date.now() / 1000 - L.la < 600) L.sent = h; }
    S.live = S.locks.length ? await readLive().catch(e => { log("Live pool sizes unavailable, using the last scan: " + e.message, "warn"); return null; }) : null;
    replan();
    if (S.plan) log(`Plan (${PRESET_NAME[S.dial.preset]}): ${S.plan.legs.length} pool${S.plan.legs.length === 1 ? "" : "s"}, ~${money(S.plan.expect_usd)} this window.`);
    await loadRank();
    if (S.locks.length) loadHist();
  } catch (e) { S.err = e.message || String(e); log("Lookup failed: " + S.err, "bad"); toast("lookup failed"); }
  S.busy = false; render();
  CL.sc = null; CL.calls = []; CL.dry = null; CP.dry = null; $("clRes").innerHTML = ""; clRender();
  if ($("cycle").open && S.locks.length) { clScan(); cpRead().catch(() => {}); }
  if ($("sweep").open && S.addr) swScan().catch(e => log("Scan failed: " + e.message, "bad"));
}
$("find").addEventListener("submit", e => { e.preventDefault(); lookup($("addr").value); });
setInterval(() => { if (!document.hidden && S.locks.length) { renderHero(); renderLocks(); } }, 30000);
// a page left open keeps the warning current: the countdown every minute, fresh crowd data every 15
let crowdAt = Date.now();
setInterval(() => {
  if (document.hidden) return;
  if (Date.now() - crowdAt > 15 * 60000) { crowdAt = Date.now(); dataJson("crowd.json", Math.floor(crowdAt / 600000)).then(c => { S.CR = c; renderCrowd(); }).catch(() => {}); }
  else renderCrowdWarn();
}, 60000);

render();
loadData().then(() => { const q = new URLSearchParams(location.search).get("addr"); if (q) lookup(q); }).catch(e => { if (!/refreshed/.test(e.message)) $("fresh").textContent = "Pool data unavailable"; log("Data load failed: " + e.message, "bad"); });
})();
