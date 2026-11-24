/* Sweep on every Aero network (11/5/2026). Shared by aero.html (home) and Flight Plan (public): the same file in both.
   Reads only. The pages keep their own guard, rendering and signing; this file does the per-network reads:
   balances, routes, quotes, gas, and the wallet's network switch.

   Why: votes placed on another network pay their rewards ON that network, so a Base-only sweep never sees them.
   The Aero Metarouter + Metaquoter have the same address on every network; factories, USDC and the token list differ
   (window.SWEEP_ROUTES.nets, written by the route generator). Robinhood's pools settle in USDG, so "stable" is per network.
   Needs: window.ethers (v6) and window.SWEEP_ROUTES, loaded first. */
(function () {
  "use strict";
  const R = window.SWEEP_ROUTES || {}, E = window.ethers, M = R.meta || {};
  const ZERO = "0x0000000000000000000000000000000000000000";
  const I = {
    erc20: new E.Interface(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"]),
    mc3: new E.Interface(["function tryAggregate(bool requireSuccess, (address target, bytes callData)[] calls) returns ((bool success, bytes returnData)[])"]),
    mq: new E.Interface(["function quoteExactInput(address[] pools, address tokenIn, uint256 amountIn) returns (uint256 amountOut, uint160[] a, uint32[] b)"]),
    f: new E.Interface(["function getPool(address,address,int24) view returns (address)", "function getPool(address,address) view returns (address)"]),
  };
  const coder = E.AbiCoder.defaultAbiCoder();

  // ---------- networks ----------
  const baseFallback = {
    key: "base", chainId: 8453, hex: "0x2105", name: "Base", gas: "ETH", native_usd: M.eth_usd || null, explorer: "https://basescan.org",
    rpcs: ["https://base-rpc.publicnode.com", "https://mainnet.base.org", "https://base.drpc.org"], relay: "base",
    metarouter: M.metarouter, metaquoter: M.metaquoter, mc3: "0xcA11bde05977b3631167028862bE2a173976CA11", usdc: M.usdc, stable: "USDC",
    weth: M.weth, btc: M.cbbtc, btc_sym: "cbBTC", clFactory: M.clFactory, volatileFactory: M.volatileFactory, stableFactory: M.stableFactory,
    spacings: M.spacings || [], universe: {},
  };
  const order = M.nets || [8453];
  const NETS = order.map(id => (R.nets || {})[String(id)] || (id === 8453 ? baseFallback : null)).filter(n => n && n.metarouter && n.usdc);
  if (!NETS.length && baseFallback.metarouter) NETS.push(baseFallback);
  for (const n of NETS) {
    n.isBase = n.chainId === 8453;
    n.mr = E.getAddress(n.metarouter); n.mq = E.getAddress(n.metaquoter); n.stableAddr = E.getAddress(n.usdc);
    n.stable = n.stable || "USDC";
    // Base keeps the hand-checked token list + precomputed routes at the top level of the routes file
    const uni = n.isBase ? (R.universe || {}) : (n.universe || {});
    n.tokens = Object.entries(uni).map(([a, m]) => ({ sym: m.symbol || a.slice(0, 8), address: E.getAddress(a), decimals: m.decimals ?? 18 }));
    n.known = {};
    if (n.isBase) for (const [sym, t] of Object.entries(R.tokens || {})) { n.known[t.address.toLowerCase()] = Object.assign({ sym }, t); n.tokens.unshift({ sym, address: E.getAddress(t.address), decimals: t.decimals }); }
    n.mids = [[n.weth, n.weth_sym || "WETH"], [n.btc, n.btc_sym || "BTC"]].filter(([a]) => a).map(([a, s]) => [E.getAddress(a), s]);
    n.midPools = null; n.midPoolsBy = {};
    // Sweep targets (11/24/2026): what a sweep can pay out on this network. The stable is always there; AERO only on
    // Base; ETH = this network's WETH (never another network's wrapped gas token, e.g. WHYPE); BTC = its wrapped BTC.
    const aero = n.isBase && (R.tokens || {}).AERO ? (R.tokens || {}).AERO.address : (n.aero || null);
    n.targets = { stable: { key: "stable", sym: n.stable, address: n.stableAddr, decimals: 6, ref: 0n } };
    if (aero) n.targets.aero = { key: "aero", sym: "AERO", address: E.getAddress(aero), decimals: 18, ref: 10n * 10n ** 18n };
    if (n.weth && (n.weth_sym || "WETH") === "WETH") n.targets.eth = { key: "eth", sym: "WETH", address: E.getAddress(n.weth), decimals: 18, ref: 10n ** 16n };
    if (n.btc) n.targets.btc = { key: "btc", sym: n.btc_sym || "BTC", address: E.getAddress(n.btc), decimals: null, ref: null };
  }
  const TARGET_KEYS = ["stable", "aero", "eth", "btc"], POOR_PCT = 3;
  /** The token a sweep "into `key`" pays out on `net`, or the network's stable (fellBack) when it has no such token. */
  function targetFor(net, key) {
    const t = net.targets[key];
    return t ? Object.assign({ fellBack: false }, t) : Object.assign({ fellBack: key !== "stable" }, net.targets.stable);
  }
  const byId = id => NETS.find(n => n.chainId === Number(id)) || null;

  // ---------- reads (public RPCs, falls through to the next one on a network error) ----------
  async function post(url, method, params) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  async function rpc(net, method, params) {
    let last = null;
    for (const url of net.rpcs) {
      let j;
      try { j = await post(url, method, params); } catch (e) { last = e; continue; }
      if (j.error) throw new Error(`${net.name} ${method}: ${JSON.stringify(j.error).slice(0, 240)}`);
      net.lastRpc = url;
      return j.result;
    }
    throw new Error(`${net.name}: every RPC failed (${last && last.message})`);
  }
  /* A second opinion (11/11/2026): the same request on a DIFFERENT public RPC than the one that answered last, so one
     RPC that lies about prices can't set a swap's minimum on its own. Returns {result, url}, or null when no other RPC
     on this network could answer (some networks list a single RPC, and not every RPC runs eth_simulateV1). */
  async function rpcOther(net, method, params) {
    for (const url of net.rpcs) {
      if (url === (net.lastRpc || net.rpcs[0])) continue;
      try { const j = await post(url, method, params); if (!j.error && j.result != null) return { result: j.result, url }; } catch (e) { /* next */ }
    }
    return null;
  }
  const call = (net, to, data) => rpc(net, "eth_call", [{ to, data }, "latest"]);
  // Batches of 60; a batch an RPC refuses for gas (Ethereum's public RPCs cap eth_call gas, and quotes are heavy) is split in half and retried
  async function multicall(net, calls, size) {
    size = size || 60;
    const out = [];
    for (let i = 0; i < calls.length; i += size) {
      const part = calls.slice(i, i + size);
      let raw;
      try { raw = await call(net, net.mc3, I.mc3.encodeFunctionData("tryAggregate", [false, part])); }
      catch (e) {
        if (part.length > 1 && /gas/i.test(e.message || "")) { out.push(...await multicall(net, part, Math.ceil(part.length / 2))); continue; }
        throw e;
      }
      out.push(...I.mc3.decodeFunctionResult("tryAggregate", raw)[0].map(r => ({ success: r[0], returnData: r[1] })));
    }
    return out;
  }
  /* Gas for the dry run's swap call: 30M, capped under the network's block gas limit (Ink's blocks are smaller, and
     eth_simulateV1 refuses a block whose calls ask for more than the limit). Reads + approvals get 200k each. */
  async function simSwapGas(net, nOther) {
    let lim = 30000000;
    try { const b = await rpc(net, "eth_getBlockByNumber", ["latest", false]); lim = parseInt(b.gasLimit, 16) || lim; } catch (e) { /* keep 30M */ }
    return Math.max(1000000, Math.min(30000000, Math.floor(lim * 0.9) - 200000 * nOther));
  }
  async function stableBalance(net, owner) { return BigInt(await call(net, net.stableAddr, I.erc20.encodeFunctionData("balanceOf", [owner]))); }
  async function waitReceipt(net, hash) {
    for (let i = 0; i < 150; i++) { const r = await rpc(net, "eth_getTransactionReceipt", [hash]); if (r) return r; await new Promise(s => setTimeout(s, 2000)); }
    throw new Error("timed out waiting for " + hash);
  }

  // ---------- routes ----------
  async function poolsBetween(net, pairs) {
    const calls = [], idx = [];
    for (const [a, b] of pairs) {
      for (const s of net.spacings) { calls.push({ target: net.clFactory, callData: I.f.encodeFunctionData("getPool(address,address,int24)", [a, b, s]) }); idx.push([a, b, "cl", `CL${s}`]); }
      calls.push({ target: net.volatileFactory, callData: I.f.encodeFunctionData("getPool(address,address)", [a, b]) }); idx.push([a, b, "v2", "vAMM"]);
      calls.push({ target: net.stableFactory, callData: I.f.encodeFunctionData("getPool(address,address)", [a, b]) }); idx.push([a, b, "v2", "sAMM"]);
    }
    const res = await multicall(net, calls), out = {};
    res.forEach((r, i) => {
      if (!r.success || r.returnData.length < 66) return;
      const pool = E.getAddress("0x" + r.returnData.slice(26)); if (pool === ZERO) return;
      const [a, b, kind, label] = idx[i]; (out[`${a}|${b}`] ||= []).push({ pool, kind, label });
    });
    return out;
  }
  /* Routes from each token to `to` (default: the network's stable): one pool, or two through a middle token. The
     middle tokens are WETH and the network's BTC, plus the stable when the sweep pays out something else. */
  async function discoverRoutes(net, tokens, to) {
    if (!tokens.length) return {};
    const U = to || net.stableAddr, uk = U.toLowerCase(), isStable = uk === net.stableAddr.toLowerCase();
    const mids0 = isStable ? net.mids : [...net.mids, [net.stableAddr, net.stable]].filter(([m]) => m.toLowerCase() !== uk);
    if (isStable) { if (!net.midPools) net.midPools = await poolsBetween(net, mids0.map(([m]) => [m, U])); }
    else if (!net.midPoolsBy[uk]) net.midPoolsBy[uk] = await poolsBetween(net, mids0.map(([m]) => [m, U]));
    const midPools = isStable ? net.midPools : net.midPoolsBy[uk];
    const pairs = tokens.flatMap(t => [[t, U], ...mids0.map(([m]) => [t, m])].filter(([a, b]) => a.toLowerCase() !== b.toLowerCase()));
    const found = await poolsBetween(net, pairs), out = {};
    for (const t of tokens) {
      const routes = [];
      for (const p of found[`${t}|${U}`] || []) routes.push({ pools: [p.pool], kinds: [p.kind], via: p.label });
      for (const [mid, name] of mids0) {
        if (t.toLowerCase() === mid.toLowerCase()) continue;
        // the Metarouter runs one pool family per route (all CL or all v2)
        for (const p1 of found[`${t}|${mid}`] || []) for (const p2 of midPools[`${mid}|${U}`] || []) if (p1.kind === p2.kind) routes.push({ pools: [p1.pool, p2.pool], kinds: [p1.kind, p2.kind], via: `${p1.label} → ${name} → ${p2.label}` });
      }
      out[t.toLowerCase()] = routes;
    }
    return out;
  }

  /* One network's sweep rows for `owner`: [{sym, decimals, balance, allowance, address, known, routes, best, usd, minOut,
     sell, allowRevert, needsApproval, note}] plus the tokens that had no route. The same row shape the pages used before. */
  async function scan(net, owner, o) {
    const floor = o.floor, slip = o.slip, log = o.log || (() => {});
    // o.target = "stable" (default) | "aero" | "eth" | "btc": what the sweep pays out. A network without that token
    // pays out its stable instead (T.fellBack). Paying out anything but the stable, the wallet's own stable balance is
    // listed too, but unticked: it may be savings, not rewards.
    let T = targetFor(net, o.target || "stable"), tRoutes = [];
    const sk = net.stableAddr.toLowerCase();
    if (T.address.toLowerCase() !== sk) {
      // the payout token's decimals and its price in the stable (a small reference amount, quoted like any other swap).
      // No market for it here = this network pays out its stable instead, the same as a network without the token.
      try {
        if (T.decimals == null) T.decimals = Number(BigInt(await call(net, T.address, "0x313ce567")));
        if (!(T.decimals >= 0 && T.decimals <= 36)) throw new Error("decimals");
        const ref = T.ref || 5n * 10n ** BigInt(Math.max(0, T.decimals - 4));       // BTC: 0.0005
        const kn = net.known[T.address.toLowerCase()];
        tRoutes = kn ? kn.routes : ((await discoverRoutes(net, [T.address]))[T.address.toLowerCase()] || []);
        const pq = tRoutes.length ? await multicall(net, tRoutes.map(rt => ({ target: net.mq, callData: I.mq.encodeFunctionData("quoteExactInput", [rt.pools, T.address, ref]) }))) : [];
        let bestOut = 0n;
        for (const res of pq) if (res.success && res.returnData.length >= 66) { const out = BigInt(I.mq.decodeFunctionResult("quoteExactInput", res.returnData)[0]); if (out > bestOut) bestOut = out; }
        if (bestOut <= 0n) throw new Error("no price");
        T.price = (Number(bestOut) / 1e6) / (Number(ref) / 10 ** T.decimals);      // stable per one whole payout token
      } catch (e) {
        log(`${net.name}: no usable ${T.sym} market there (${e.message}); sweeping to ${net.stable} instead.`);
        T = Object.assign({}, net.targets.stable, { fellBack: true });
      }
    }
    const toStable = T.address.toLowerCase() === sk, tk = T.address.toLowerCase();
    if (toStable) T.price = 1;
    const seen = new Set(), toks = [];
    const list = [...net.tokens, ...(o.extra || []).map(a => ({ sym: null, address: a, decimals: null })), ...(o.discovered || [])];
    if (!toStable) list.unshift({ sym: net.stable, address: net.stableAddr, decimals: 6 });
    for (const t of list) {
      const k = t.address.toLowerCase(); if (k === tk || seen.has(k)) continue; seen.add(k); toks.push(t);
    }
    const outNum = x => Number(x) / 10 ** T.decimals;
    const bal = await multicall(net, toks.flatMap(t => [
      { target: t.address, callData: I.erc20.encodeFunctionData("balanceOf", [owner]) },
      { target: t.address, callData: I.erc20.encodeFunctionData("allowance", [owner, net.mr]) }]));
    let rows = [];
    toks.forEach((t, k) => {
      const ok = r => r.success && r.returnData.length >= 66;
      const b = ok(bal[2 * k]) ? BigInt(bal[2 * k].returnData) : 0n, al = ok(bal[2 * k + 1]) ? BigInt(bal[2 * k + 1].returnData) : 0n;
      if (b > 0n) rows.push({ sym: t.sym, decimals: t.decimals, balance: b, allowance: al, address: t.address, known: net.known[t.address.toLowerCase()] || null });
    });
    if (!rows.length) return { rows: [], noRoute: [], target: T };
    const need = rows.filter(r => r.sym == null || r.decimals == null);
    if (need.length) {
      const md = await multicall(net, need.flatMap(r => [{ target: r.address, callData: "0x95d89b41" }, { target: r.address, callData: "0x313ce567" }]));
      need.forEach((r, k) => {
        try { r.sym = r.sym || coder.decode(["string"], md[2 * k].returnData)[0]; } catch (e) { r.sym = r.sym || r.address.slice(0, 8); }
        try { r.decimals = r.decimals ?? Number(BigInt(md[2 * k + 1].returnData)); } catch (e) { r.decimals = r.decimals ?? 18; }
      });
    }
    log(`${net.name}: ${rows.length} token${rows.length === 1 ? " holds" : "s hold"} a balance. Finding routes…`);
    // the hand-checked routes all end in the stable, so any other payout finds its routes live, for every token
    if (!toStable) for (const r of rows) { r.listed = !!r.known; r.knownS = r.known; r.known = null; }
    const mids = await discoverRoutes(net, rows.filter(r => !r.known).map(r => r.address), T.address);
    for (const r of rows) r.routes = r.known ? r.known.routes : (mids[r.address.toLowerCase()] || []);
    const noRoute = rows.filter(r => !r.routes.length);
    rows = rows.filter(r => r.routes.length);
    if (!rows.length) return { rows: [], noRoute, target: T };
    const qcalls = [], qidx = [];
    rows.forEach((r, ri) => r.routes.forEach((rt, qi) => { qcalls.push({ target: net.mq, callData: I.mq.encodeFunctionData("quoteExactInput", [rt.pools, r.address, r.balance]) }); qidx.push([ri, qi]); }));
    const q = await multicall(net, qcalls);
    rows.forEach(r => { r.quotes = []; });
    q.forEach((res, i) => { const [ri, qi] = qidx[i]; if (res.success && res.returnData.length >= 66) rows[ri].quotes.push({ route: rows[ri].routes[qi], out: BigInt(I.mq.decodeFunctionResult("quoteExactInput", res.returnData)[0]) }); });
    for (const r of rows) { r.quotes.sort((a, b) => (b.out > a.out ? 1 : b.out < a.out ? -1 : 0)); r.best = r.quotes[0] || null; }
    /* Value check (any payout but the stable): a thin pool can quote a payout token at a fraction of its worth, and a
       minimum set from that quote would not catch it. So each token is ALSO quoted straight to the stable (worth),
       and what it would buy is quoted back to the stable (back). A token whose `back` is more than POOR_PCT under its
       `worth` is left unticked with the reason. Both figures come from the same Metaquoter. */
    if (!toStable) {
      const live = rows.filter(r => r.best);
      const sRoutes = await discoverRoutes(net, live.filter(r => !r.knownS && r.address.toLowerCase() !== sk).map(r => r.address));
      const vc = [], vi = [];
      live.forEach((r, ri) => {
        if (r.address.toLowerCase() === sk) { r.worth = r.balance; }
        else for (const rt of (r.knownS ? r.knownS.routes : (sRoutes[r.address.toLowerCase()] || []))) { vc.push({ target: net.mq, callData: I.mq.encodeFunctionData("quoteExactInput", [rt.pools, r.address, r.balance]) }); vi.push([ri, "worth"]); }
        for (const rt of tRoutes) { vc.push({ target: net.mq, callData: I.mq.encodeFunctionData("quoteExactInput", [rt.pools, T.address, r.best.out]) }); vi.push([ri, "back"]); }
      });
      const vq = vc.length ? await multicall(net, vc) : [];
      vq.forEach((res, i) => {
        if (!res.success || res.returnData.length < 66) return;
        const [ri, k] = vi[i], out = BigInt(I.mq.decodeFunctionResult("quoteExactInput", res.returnData)[0]);
        if (live[ri][k] == null || out > live[ri][k]) live[ri][k] = out;
      });
    }
    for (const r of rows) {
      r.usd = !r.best ? 0 : toStable ? outNum(r.best.out) : r.worth != null ? Number(r.worth) / 1e6 : r.back != null ? Number(r.back) / 1e6 : outNum(r.best.out) * T.price;
      r.lossPct = !toStable && r.best && r.worth > 0n && (r.back != null || r.worth >= 250000n) ? (1 - Number(r.back || 0n) / Number(r.worth)) * 100 : null;   // dust with no back-quote: unknown, not poor
      r.poor = r.lossPct != null && r.lossPct > POOR_PCT;
      r.minOut = r.best ? (r.best.out * BigInt(Math.round((1 - slip) * 1e6)) / 1000000n) : 0n;
      r.own = !toStable && r.address.toLowerCase() === sk;
      r.sell = !!r.best && r.usd >= floor && !r.own && !r.poor;
      r.allowRevert = r.usd < 0.25;
      r.needsApproval = r.allowance < r.balance;
      r.note = !r.best ? "no quote" : r.usd < floor ? `under $${floor}` : r.poor ? `poor ${T.sym} price here: about ${r.lossPct.toFixed(r.lossPct < 10 ? 1 : 0)}% worse than selling for ${net.stable}` : r.allowRevert ? "dust, may revert" : r.own ? `your ${net.stable}: tick to include it` : "";
    }
    rows.sort((a, b) => b.usd - a.usd);
    return { rows, noRoute, target: T };
  }

  // ---------- gas ----------
  // Rough gas before the dry run (an approval ~60k; the swap ~180k + ~140k per token); the dry run replaces it.
  const gasGuess = (approvals, swaps) => 60000 * approvals + (swaps ? 180000 + 140000 * swaps : 0);
  /* {bal, need, ok, price} in the network's gas token (18 decimals everywhere, Arc's USDC included).
     need = gas x price x 1.5 (room for the price to move between the read and the signature). */
  async function gasCheck(net, owner, units) {
    const [b, p] = await Promise.all([rpc(net, "eth_getBalance", [owner, "latest"]), rpc(net, "eth_gasPrice", [])]);
    const bal = BigInt(b), price = BigInt(p), need = BigInt(Math.ceil(units * 1.5)) * price;
    return { bal, price, need, ok: bal >= need, units };
  }
  const gasAmt = wei => { const x = Number(E.formatUnits(wei, 18)); return x === 0 ? "0" : x < 0.000001 ? "<0.000001" : x.toLocaleString(undefined, { maximumSignificantDigits: 2 }); };
  const gasUsd = (net, wei) => net.native_usd ? Number(E.formatUnits(wei, 18)) * net.native_usd : null;
  // What to keep on each network so a sweep or two always fits (Ethereum mainnet gas runs far higher than the rest)
  const SUGGEST = { ethereum: "about $5 of ETH", arc: "about $1 of USDC", elysium: "about $1 of HYPE" };
  const suggest = net => SUGGEST[net.key] || "about $1 of ETH";
  const relayUrl = net => `https://relay.link/bridge/${encodeURIComponent(net.relay || net.key)}`;

  // ---------- wallet network ----------
  async function ensureNet(provider, net, log) {
    const id = await provider.request({ method: "eth_chainId" });
    if (String(id).toLowerCase() === net.hex.toLowerCase()) return;
    (log || (() => {}))(`Wallet is on chain ${parseInt(id, 16)}; asking it to switch to ${net.name}…`, "warn");
    try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: net.hex }] }); }
    catch (e) {
      // 4902 = the wallet has never seen this network (Robinhood, Ink, Arc in many wallets): add it, then it switches
      const unknown = e && (e.code === 4902 || (e.data && e.data.originalError && e.data.originalError.code === 4902) || /unrecognized|not added|unknown chain/i.test(e.message || ""));
      if (!unknown) throw e;
      await provider.request({ method: "wallet_addEthereumChain", params: [{
        chainId: net.hex, chainName: ({ OP: "OP Mainnet", Robinhood: "Robinhood Chain" })[net.name] || net.name,
        nativeCurrency: { name: ({ USDC: "USDC", HYPE: "HYPE" })[net.gas] || "Ether", symbol: net.gas, decimals: 18 },
        rpcUrls: net.rpcs, blockExplorerUrls: [net.explorer] }] });
    }
    await assertNet(provider, net);
  }
  // Read the wallet's network again and refuse unless it is `net`: run right before every signature request, because
  // the wallet can change networks during the seconds between the checks and the prompt.
  async function assertNet(provider, net) {
    const now = await provider.request({ method: "eth_chainId" });
    if (parseInt(now, 16) !== net.chainId) throw new Error(`the wallet is on chain ${parseInt(now, 16)}, not ${net.name}; switch it and try again`);
  }
  const isHash = h => /^0x[0-9a-fA-F]{64}$/.test(String(h));

  /* ---------- gas bridge: ETH on Base -> the gas token on another network, via Relay (11/5/2026) ----------
     One transaction on Base per network: depositNative(depositor, id) on Relay's Base deposit contract, with the ETH as
     value. Relay's solver pays the gas token (ETH; USDC on Arc, HYPE on Elysium) to the recipient on the other network within seconds,
     or refunds the depositor on Base. The page cannot read the order behind `id`, so it checks everything it can:
     the To address is the pinned deposit contract, the method is depositNative, the depositor is you, the value is
     exactly what was asked (and under a hard cap), and Relay's quote says recipient = you, output = that network's gas
     token. Then it dry-runs the deposit on Base. Anything else is refused. */
  const RELAY = "https://api.relay.link";
  const RELAY_DEPOSITORY = "0x4cd00e387622c35bddb9b4c962c136462338bc31";   // Base, Relay protocol v2 (api /chains, 11/5/2026)
  const DEPOSIT_NATIVE = "0x49290c1c";                                     // depositNative(address depositor, bytes32 id)
  const BRIDGE_MAX_WEI = 6000000000000000n;                                // 0.006 ETH (~$13) per network, never more
  const bridgeUsd = net => (net.key === "ethereum" ? 5 : 1);
  function bridgeCheck(b, owner) {
    const o = owner.toLowerCase(), t = b.tx, why = [];
    if ((t.to || "").toLowerCase() !== RELAY_DEPOSITORY) why.push("To is not Relay's Base deposit contract");
    if (Number(t.chainId) !== 8453) why.push("not a Base transaction");
    if (BigInt(t.value) !== b.value) why.push("amount differs from the one asked for");
    if (b.value <= 0n || b.value > BRIDGE_MAX_WEI) why.push("amount is over the 0.006 ETH cap");
    const d = (t.data || "").toLowerCase();
    if (!d.startsWith(DEPOSIT_NATIVE) || d.length !== 2 + 8 + 128) why.push("method is not depositNative");
    else if ("0x" + d.slice(10 + 24, 10 + 64) !== o) why.push("depositor is not you");
    if ((b.recipient || "").toLowerCase() !== o) why.push("recipient on the other network is not you");
    if (Number(b.outChain) !== b.net.chainId || (b.outToken || "").toLowerCase() !== ZERO) why.push(`output is not ${b.net.gas} on ${b.net.name}`);
    if (why.length) throw new Error(`bridge to ${b.net.name} refused: ${why.join("; ")}`);
    return true;
  }
  async function bridgeQuote(net, owner) {
    const base = byId(8453);
    if (net.isBase) throw new Error("Base needs no bridge");
    if (!base || !base.native_usd) throw new Error("no ETH price in the routes file");
    const value = BigInt(Math.round(bridgeUsd(net) / base.native_usd * 1e9)) * 1000000000n;
    const o = owner.toLowerCase();
    // A smart-contract wallet (a Safe, say) lives at its address only on the networks it was deployed to: refuse to send
    // gas to an address that is a contract on Base but empty on the target, where nobody may be able to move it
    const [cb, cn] = await Promise.all([rpc(base, "eth_getCode", [o, "latest"]), rpc(net, "eth_getCode", [o, "latest"])]);
    if (cb && cb !== "0x" && (!cn || cn === "0x")) throw new Error(`This address is a smart-contract wallet on Base that doesn't exist on ${net.name}; gas sent there might be stuck. Fund gas there another way.`);
    const r = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ user: o, recipient: o, originChainId: 8453, destinationChainId: net.chainId, originCurrency: ZERO, destinationCurrency: ZERO, amount: value.toString(), tradeType: "EXACT_INPUT" }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.steps) {
      const m = j.message || ("HTTP " + r.status);
      throw new Error(/invalid recipient/i.test(m) ? `Relay can't deliver to this address on ${net.name} (a smart-contract wallet often exists on one network only). Fund gas there another way.` : `Relay quote for ${net.name} failed: ${m}`);
    }
    if (j.steps.length !== 1 || (j.steps[0].items || []).length !== 1 || j.steps[0].kind !== "transaction") throw new Error(`Relay's ${net.name} quote needs more than one step; not supported here`);
    const it = j.steps[0].items[0], det = j.details || {}, out = det.currencyOut || {};
    const b = { net, value, at: Date.now(), requestId: j.requestId, tx: { to: it.data.to, data: it.data.data, value: it.data.value, chainId: it.data.chainId },
      recipient: det.recipient, outChain: out.currency && out.currency.chainId, outToken: out.currency && out.currency.address,
      outWei: BigInt(out.amount || 0), outUsd: Number(out.amountUsd || 0), inUsd: Number((det.currencyIn || {}).amountUsd || 0), secs: det.timeEstimate };
    bridgeCheck(b, owner);
    return b;
  }
  // Base-side rehearsal: enough ETH on Base, and every deposit goes through from your address
  async function bridgeDry(items, owner) {
    const base = byId(8453), total = items.reduce((t, b) => t + b.value, 0n);
    const bal = BigInt(await rpc(base, "eth_getBalance", [owner, "latest"]));
    const price = BigInt(await rpc(base, "eth_gasPrice", []));
    const room = 200000n * BigInt(items.length) * price * 2n;
    if (bal < total + room) return { ok: false, why: `This wallet has ${gasAmt(bal)} ETH on Base; the bridge needs ${gasAmt(total + room)} ETH there (amount + gas).`, total };
    const calls = items.map(b => ({ from: owner, to: b.tx.to, data: b.tx.data, value: "0x" + b.value.toString(16), gas: "0x" + (200000).toString(16) }));
    const res = await rpc(base, "eth_simulateV1", [{ blockStateCalls: [{ calls }], validation: false }, "latest"]);
    const bad = res[0].calls.findIndex(c => c.status !== "0x1");
    if (bad >= 0) return { ok: false, why: `The ${items[bad].net.name} deposit failed in the dry run: ${JSON.stringify(res[0].calls[bad].error || res[0].calls[bad].returnData).slice(0, 160)}`, total };
    return { ok: true, total, gas: res[0].calls.reduce((t, c) => t + parseInt(c.gasUsed, 16), 0) };
  }
  // Wait for a wallet_sendCalls batch (EIP-5792) to land. Returns its tx hashes; throws if it failed, reverted, or is
  // still unconfirmed after ~3 minutes, so a caller never reports success for a batch it hasn't seen confirmed.
  async function waitCalls(provider, id) {
    const key = typeof id === "string" ? id : id.id;
    for (let i = 0; i < 90; i++) {
      const s = await provider.request({ method: "wallet_getCallsStatus", params: [key] });
      if (s.status === 200 || s.status === "CONFIRMED") {
        const rs = s.receipts || [];
        if (rs.some(r => r.status === "0x0" || r.status === 0)) throw new Error("the batch reverted on chain: " + JSON.stringify(s).slice(0, 200));
        return rs.map(r => r.transactionHash).filter(isHash);
      }
      if (s.status >= 400) throw new Error("batch failed: " + JSON.stringify(s).slice(0, 200));
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error("the batch still isn't confirmed after 3 minutes; check your wallet's activity before trying again");
  }
  const QUOTE_MS = 90000;            // a Relay quote older than this is never signed; the page fetches and shows a fresh one
  // Sign on Base (one batch when the wallet can, else one by one), then wait for Relay to fill each order
  async function bridgeSend(provider, account, items, log, prog) {
    const base = byId(8453);
    const old = items.filter(b => Date.now() - b.at > QUOTE_MS);
    if (old.length) throw Object.assign(new Error(`the Relay quote for ${old.map(b => b.net.name).join(", ")} is over 90s old; get a fresh one and check it before signing`), { stale: true });
    items.forEach(b => bridgeCheck(b, account));
    const dry = await bridgeDry(items, account);                   // again, right before signing: balance or quote may have moved
    if (!dry.ok) throw new Error("dry run before signing: " + dry.why);
    await ensureNet(provider, base, log);
    const calls = items.map(b => ({ to: b.tx.to, data: b.tx.data, value: "0x" + b.value.toString(16) }));
    for (const c of calls) bridgeCheck(items[calls.indexOf(c)], account);
    let atomic = false;
    if (calls.length > 1) {
      try { const caps = await provider.request({ method: "wallet_getCapabilities", params: [account, ["0x2105"]] }); const st = caps && caps["0x2105"] && caps["0x2105"].atomic && caps["0x2105"].atomic.status; atomic = st === "supported" || st === "ready"; } catch (e) { /* one by one */ }
    }
    const txs = [];
    if (atomic) {
      prog(`Waiting for your signature (${calls.length} bridges, one batch)…`);
      await assertNet(provider, base);
      const id = await provider.request({ method: "wallet_sendCalls", params: [{ version: "2.0.0", chainId: "0x2105", from: account, atomicRequired: true, calls }] });
      txs.push(...await waitCalls(provider, id));
    } else {
      for (const [i, c] of calls.entries()) {
        prog(`Signature ${i + 1} of ${calls.length}: bridge ${gasAmt(items[i].value)} ETH to ${items[i].net.name}`);
        await assertNet(provider, base);                               // this one carries ETH: never on the wrong network
        const h = await provider.request({ method: "eth_sendTransaction", params: [{ from: account, to: c.to, data: c.data, value: c.value }] });
        if (!isHash(h)) throw new Error("the wallet did not return a transaction hash; check its activity before trying again");
        txs.push(h); log(`  bridge to ${items[i].net.name} sent ${h}`);
        const rc = await waitReceipt(base, h);
        if (rc.status !== "0x1") throw new Error(`deposit ${h} reverted on Base`);
      }
    }
    prog("Deposited on Base. Waiting for Relay to deliver (usually seconds)…");
    const done = {};
    for (let i = 0; i < 60 && Object.keys(done).length < items.length; i++) {
      for (const b of items) {
        if (done[b.net.chainId]) continue;
        try { const s = await (await fetch(`${RELAY}/intents/status?requestId=${encodeURIComponent(b.requestId)}`, { signal: AbortSignal.timeout(10000) })).json();
          if (s.status === "success" || s.status === "failure" || s.status === "refund") { done[b.net.chainId] = s.status; log(`Relay ${b.net.name}: ${s.status}`, s.status === "success" ? "ok" : "bad"); } } catch (e) { /* retry */ }
      }
      if (Object.keys(done).length < items.length) await new Promise(r => setTimeout(r, 3000));
    }
    return { txs, done };
  }

  window.SweepNets = { NETS, byId, targetFor, TARGET_KEYS, POOR_PCT, discoverRoutes, rpc, rpcOther, assertNet, isHash, call, multicall, simSwapGas, stableBalance, bridgeQuote, bridgeCheck, bridgeDry, bridgeSend, bridgeUsd, waitCalls, QUOTE_MS, RELAY_DEPOSITORY, waitReceipt, scan, gasGuess, gasCheck, gasAmt, gasUsd, suggest, relayUrl, ensureNet,
    txUrl: (net, h) => `${net.explorer}/tx/${h}` };
})();
