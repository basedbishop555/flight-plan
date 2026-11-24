// node tools/test_sweep_into.js [address] : the "Sweep into" targets, read-only (11/24/2026).
// Loads the shipped sweep-routes.js + sweep-nets.js, scans a wallet for every payout choice (USDC / AERO / ETH / BTC),
// builds the same Metarouter swap the page builds, and rehearses approvals + swap with eth_simulateV1 on the main
// RPC and on a second one. Checks: the payout token is what was asked for (or the network's stable when it has none),
// every route starts at the token sold and ends at the payout token (pool token0/token1 read on chain), what the
// rehearsal pays out is at least the minimums, and both RPCs agree. Nothing is signed or sent.
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const { ethers } = require("../vendor/ethers-6.13.4.umd.min.js");
const ROOT = path.join(__dirname, "..");
const win = { ethers, location: { hostname: "localhost" } };
const ctx = vm.createContext({ window: win, fetch, AbortSignal, URL, console, setTimeout, BigInt, encodeURIComponent });
for (const f of ["sweep-routes.js", "sweep-nets.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const SN = win.SweepNets;
const OWNER = ethers.getAddress(process.argv[2] || "0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A");
const ONLY = process.argv[3] ? process.argv[3].split(",") : null;      // optional: network keys
const coder = ethers.AbiCoder.defaultAbiCoder();
const I = {
  erc20: new ethers.Interface(["function approve(address,uint256)", "function balanceOf(address) view returns (uint256)"]),
  mr: new ethers.Interface(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]),
  pool: new ethers.Interface(["function token0() view returns (address)", "function token1() view returns (address)"]),
};
const SWAP_T = ["tuple(address[] pools,address tokenIn,tuple(uint8 mode,uint256 value) amountIn,bool payerIsUser,uint256 minAmountOut,address recipient)"];
let fails = 0;
const ok = (c, name, extra) => { console.log((c ? "PASS  " : "FAIL  ") + name + (extra ? "  " + extra : "")); if (!c) fails++; };

async function routeEnds(net, r, T) {          // every hop shares a token with the next; first holds tokenIn, last holds T
  const res = await SN.multicall(net, r.best.route.pools.flatMap(p => [{ target: p, callData: I.pool.encodeFunctionData("token0") }, { target: p, callData: I.pool.encodeFunctionData("token1") }]));
  let cur = r.address.toLowerCase();
  for (let i = 0; i < r.best.route.pools.length; i++) {
    const a = "0x" + res[2 * i].returnData.slice(26).toLowerCase(), b = "0x" + res[2 * i + 1].returnData.slice(26).toLowerCase();
    if (cur === a) cur = b; else if (cur === b) cur = a; else return false;
  }
  return cur === T.address.toLowerCase();
}
function calls(net, T, sel, owner) {
  const bal = I.erc20.encodeFunctionData("balanceOf", [owner]), G2 = "0x" + (200000).toString(16);
  const cmds = sel.map(r => (r.best.route.kinds[0] === "cl" ? 0x00 : 0x08) | (r.allowRevert ? 0x80 : 0));
  const inputs = sel.map(r => coder.encode(SWAP_T, [[r.best.route.pools, r.address, [0, r.balance], true, r.minOut, owner]]));
  const exec = I.mr.encodeFunctionData("execute", [ethers.hexlify(new Uint8Array(cmds)), inputs, Math.floor(Date.now() / 1000) + 1200]);
  return [{ from: owner, to: T.address, data: bal, gas: G2 },
    ...sel.map(r => ({ from: owner, to: r.address, data: I.erc20.encodeFunctionData("approve", [net.mr, r.balance]), gas: G2 })),
    { from: owner, to: net.mr, data: exec, gas: "0x" + (12000000).toString(16) },
    { from: owner, to: T.address, data: bal, gas: G2 }];
}
(async () => {
  console.log("wallet", OWNER.slice(0, 8) + "…", "· networks", SN.NETS.map(n => n.key).join(" "));
  for (const net of SN.NETS) {
    if (ONLY && !ONLY.includes(net.key)) continue;
    for (const key of SN.TARGET_KEYS) {
      const want = SN.targetFor(net, key), tag = `${net.name} → ${key}`;
      let sc;
      try { sc = await SN.scan(net, OWNER, { floor: 0.5, slip: 0.01, target: key }); } catch (e) { ok(false, tag + ": scan", e.message.slice(0, 140)); continue; }
      const T = sc.target;
      // the stable is also the answer when the network lists the token but has no market for it (logged by the scan)
      ok(T.fellBack ? T.address === net.stableAddr && key !== "stable" : T.address === want.address, `${tag}: pays out ${T.sym}${T.fellBack ? (net.targets[key] ? " (no market for it here: the stable)" : " (no such token here: the stable)") : ""}`);
      if (key !== "stable" && !T.fellBack) ok(T.price > 0 && Number.isFinite(T.price), `${tag}: ${T.sym} priced`, `$${T.price.toFixed(T.price > 100 ? 0 : 4)}`);
      if (T.fellBack) continue;                                   // same sweep as "stable", already covered
      const rows = sc.rows.filter(r => r.best);
      if (!rows.length) { console.log(`      ${tag}: nothing to sweep in this wallet`); continue; }
      ok(!rows.some(r => r.address.toLowerCase() === T.address.toLowerCase()), `${tag}: the payout token is never sold`);
      const stableRow = rows.find(r => r.address.toLowerCase() === net.stableAddr.toLowerCase());
      if (key !== "stable" && stableRow) ok(stableRow.own && !stableRow.sell, `${tag}: the wallet's own ${net.stable} is listed but unticked`);
      const ends = await Promise.all(rows.map(r => routeEnds(net, r, T)));
      ok(ends.every(Boolean), `${tag}: ${rows.length} routes start at the token and end in ${T.sym}`, rows.filter((r, i) => !ends[i]).map(r => r.sym).join(","));
      // rehearse the biggest few together (dust left out: it is allowed to revert)
      const poor = rows.filter(r => r.poor);
      if (poor.length) console.log(`      ${tag}: left unticked for a poor price: ${poor.map(r => `${r.sym} (${r.lossPct.toFixed(1)}% worse)`).join(", ")}`);
      ok(rows.every(r => !(r.poor && r.sell)), `${tag}: a poorly priced token is never ticked by default`);
      if (key !== "stable") ok(rows.filter(r => !r.poor && r.lossPct != null).every(r => r.lossPct <= SN.POOR_PCT), `${tag}: every ticked token keeps its value`, rows.filter(r => r.lossPct != null && !r.poor).map(r => `${r.sym} ${r.lossPct.toFixed(2)}%`).slice(0, 6).join(" "));
      const sel = rows.filter(r => !r.allowRevert && !r.poor).slice(0, 4);
      if (!sel.length) continue;
      const cs = calls(net, T, sel, OWNER), must = sel.reduce((t, r) => t + r.minOut, 0n), quoted = sel.reduce((t, r) => t + r.best.out, 0n);
      const num = x => Number(x) / 10 ** T.decimals;
      let got = null;
      try {
        const out = (await SN.rpc(net, "eth_simulateV1", [{ blockStateCalls: [{ calls: cs }], validation: false }, "latest"]))[0].calls;
        const bad = out.findIndex(c => c.status !== "0x1");
        if (bad >= 0) ok(false, `${tag}: rehearsal`, `call ${bad} failed ${JSON.stringify(out[bad].error || out[bad].returnData).slice(0, 120)}`);
        else { got = BigInt(out[out.length - 1].returnData) - BigInt(out[0].returnData); ok(got >= must, `${tag}: rehearsal pays ${num(got)} ${T.sym}`, `min ${num(must)} · quoted ${num(quoted)} · ${sel.map(r => r.sym + " via " + r.best.route.via).join("; ")}`); }
      } catch (e) { ok(false, `${tag}: rehearsal`, e.message.slice(0, 160)); }
      const alt = await SN.rpcOther(net, "eth_simulateV1", [{ blockStateCalls: [{ calls: cs }], validation: false }, "latest"]);
      if (!alt) { ok(false, `${tag}: a second RPC answers`, "none did: the page would refuse to sign here right now"); continue; }
      const o2 = alt.result[0].calls;
      if (o2.some(c => c.status !== "0x1")) { ok(false, `${tag}: second RPC rehearsal`, new URL(alt.url).hostname); continue; }
      const fair = BigInt(o2[o2.length - 1].returnData) - BigInt(o2[0].returnData);
      ok(fair >= must && (got == null || (fair * 1000n >= got * 985n && got * 1000n >= fair * 985n)), `${tag}: second RPC (${new URL(alt.url).hostname}) agrees`, `${num(fair)} ${T.sym}`);
    }
  }
  console.log(fails ? `\n${fails} FAILED` : "\nall sweep-into tests passed");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("test error", e); process.exit(1); });
