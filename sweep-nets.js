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
    n.mids = [[n.weth, "WETH"], [n.btc, n.btc_sym || "BTC"]].filter(([a]) => a).map(([a, s]) => [E.getAddress(a), s]);
    n.midPools = null;
  }
  const byId = id => NETS.find(n => n.chainId === Number(id)) || null;

  // ---------- reads (public RPCs, falls through to the next one on a network error) ----------
  async function rpc(net, method, params) {
    let last = null;
    for (const url of net.rpcs) {
      let j;
      try {
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error("HTTP " + r.status);
        j = await r.json();
      } catch (e) { last = e; continue; }
      if (j.error) throw new Error(`${net.name} ${method}: ${JSON.stringify(j.error).slice(0, 240)}`);
      return j.result;
    }
    throw new Error(`${net.name}: every RPC failed (${last && last.message})`);
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
  async function discoverRoutes(net, tokens) {
    if (!tokens.length) return {};
    const U = net.stableAddr;
    if (!net.midPools) net.midPools = await poolsBetween(net, net.mids.map(([m]) => [m, U]));
    const pairs = tokens.flatMap(t => [[t, U], ...net.mids.map(([m]) => [t, m])].filter(([a, b]) => a.toLowerCase() !== b.toLowerCase()));
    const found = await poolsBetween(net, pairs), out = {};
    for (const t of tokens) {
      const routes = [];
      for (const p of found[`${t}|${U}`] || []) routes.push({ pools: [p.pool], kinds: [p.kind], via: p.label });
      for (const [mid, name] of net.mids) {
        if (t.toLowerCase() === mid.toLowerCase()) continue;
        // the Metarouter runs one pool family per route (all CL or all v2)
        for (const p1 of found[`${t}|${mid}`] || []) for (const p2 of net.midPools[`${mid}|${U}`] || []) if (p1.kind === p2.kind) routes.push({ pools: [p1.pool, p2.pool], kinds: [p1.kind, p2.kind], via: `${p1.label} → ${name} → ${p2.label}` });
      }
      out[t.toLowerCase()] = routes;
    }
    return out;
  }

  /* One network's sweep rows for `owner`: [{sym, decimals, balance, allowance, address, known, routes, best, usd, minOut,
     sell, allowRevert, needsApproval, note}] plus the tokens that had no route. The same row shape the pages used before. */
  async function scan(net, owner, o) {
    const floor = o.floor, slip = o.slip, log = o.log || (() => {});
    const seen = new Set(), toks = [];
    for (const t of [...net.tokens, ...(o.extra || []).map(a => ({ sym: null, address: a, decimals: null })), ...(o.discovered || [])]) {
      const k = t.address.toLowerCase(); if (k === net.stableAddr.toLowerCase() || seen.has(k)) continue; seen.add(k); toks.push(t);
    }
    const bal = await multicall(net, toks.flatMap(t => [
      { target: t.address, callData: I.erc20.encodeFunctionData("balanceOf", [owner]) },
      { target: t.address, callData: I.erc20.encodeFunctionData("allowance", [owner, net.mr]) }]));
    let rows = [];
    toks.forEach((t, k) => {
      const ok = r => r.success && r.returnData.length >= 66;
      const b = ok(bal[2 * k]) ? BigInt(bal[2 * k].returnData) : 0n, al = ok(bal[2 * k + 1]) ? BigInt(bal[2 * k + 1].returnData) : 0n;
      if (b > 0n) rows.push({ sym: t.sym, decimals: t.decimals, balance: b, allowance: al, address: t.address, known: net.known[t.address.toLowerCase()] || null });
    });
    if (!rows.length) return { rows: [], noRoute: [] };
    const need = rows.filter(r => r.sym == null || r.decimals == null);
    if (need.length) {
      const md = await multicall(net, need.flatMap(r => [{ target: r.address, callData: "0x95d89b41" }, { target: r.address, callData: "0x313ce567" }]));
      need.forEach((r, k) => {
        try { r.sym = r.sym || coder.decode(["string"], md[2 * k].returnData)[0]; } catch (e) { r.sym = r.sym || r.address.slice(0, 8); }
        try { r.decimals = r.decimals ?? Number(BigInt(md[2 * k + 1].returnData)); } catch (e) { r.decimals = r.decimals ?? 18; }
      });
    }
    log(`${net.name}: ${rows.length} token${rows.length === 1 ? " holds" : "s hold"} a balance. Finding routes…`);
    const mids = await discoverRoutes(net, rows.filter(r => !r.known).map(r => r.address));
    for (const r of rows) r.routes = r.known ? r.known.routes : (mids[r.address.toLowerCase()] || []);
    const noRoute = rows.filter(r => !r.routes.length);
    rows = rows.filter(r => r.routes.length);
    if (!rows.length) return { rows: [], noRoute };
    const qcalls = [], qidx = [];
    rows.forEach((r, ri) => r.routes.forEach((rt, qi) => { qcalls.push({ target: net.mq, callData: I.mq.encodeFunctionData("quoteExactInput", [rt.pools, r.address, r.balance]) }); qidx.push([ri, qi]); }));
    const q = await multicall(net, qcalls);
    rows.forEach(r => { r.quotes = []; });
    q.forEach((res, i) => { const [ri, qi] = qidx[i]; if (res.success && res.returnData.length >= 66) rows[ri].quotes.push({ route: rows[ri].routes[qi], out: BigInt(I.mq.decodeFunctionResult("quoteExactInput", res.returnData)[0]) }); });
    for (const r of rows) {
      r.quotes.sort((a, b) => (b.out > a.out ? 1 : b.out < a.out ? -1 : 0));
      r.best = r.quotes[0] || null;
      r.usd = r.best ? Number(r.best.out) / 1e6 : 0;
      r.minOut = r.best ? (r.best.out * BigInt(Math.round((1 - slip) * 1e6)) / 1000000n) : 0n;
      r.sell = !!r.best && r.usd >= floor;
      r.allowRevert = r.usd < 0.25;
      r.needsApproval = r.allowance < r.balance;
      r.note = !r.best ? "no quote" : r.usd < floor ? `under $${floor}` : r.allowRevert ? "dust, may revert" : "";
    }
    rows.sort((a, b) => b.usd - a.usd);
    return { rows, noRoute };
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
  const SUGGEST = { ethereum: "about $5 of ETH", arc: "about $1 of USDC" };
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
        nativeCurrency: { name: net.gas === "USDC" ? "USDC" : "Ether", symbol: net.gas, decimals: 18 },
        rpcUrls: net.rpcs, blockExplorerUrls: [net.explorer] }] });
    }
    const now = await provider.request({ method: "eth_chainId" });
    if (String(now).toLowerCase() !== net.hex.toLowerCase()) throw new Error(`wallet is still on chain ${parseInt(now, 16)}, not ${net.name}`);
  }

  window.SweepNets = { NETS, byId, rpc, call, multicall, simSwapGas, stableBalance, waitReceipt, scan, gasGuess, gasCheck, gasAmt, gasUsd, suggest, relayUrl, ensureNet,
    txUrl: (net, h) => `${net.explorer}/tx/${h}` };
})();
