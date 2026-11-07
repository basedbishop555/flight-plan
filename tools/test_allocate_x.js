/* Proves allocate-x.js (cross-network allocations) against the chain. Read-only; nothing is signed or sent.
 *   node tools/test_allocate_x.js            (encoding + plan + guard tests, then live dry runs on public locks)
 *   node tools/test_allocate_x.js --offline  (skip the live dry runs)
 * 1. Encoding: rebuilds real cross-network allocate() calls signed in the Aero app and compares them byte-for-byte
 *    (calldata fetched from Base by hash). Stake #41's two-step move Base -> Ethereum + Arbitrum goes through the
 *    whole planner (planSteps) as well.
 * 2. Planner: the step rules on made-up locks (Base -> OP, OP -> Base, unchanged networks left alone, growth).
 * 3. Guard: every tampered call refused.
 * 4. Live: full dry runs (Base eth_simulateV1 + the Hyperlane messages replayed on the other network) for public
 *    locks: a Base-only lock moving 30% to OP, and #41 (Ethereum + Arbitrum) moving to Base + Arbitrum. */
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const e = require(path.join(ROOT, "vendor", "ethers-6.13.4.umd.min.js")); const ethers = e.ethers || e;
const X = require(path.join(ROOT, "allocate-x.js"));
global.window = global; require(path.join(ROOT, "sweep-routes.js"));
const NETS = Object.values(window.SWEEP_ROUTES.nets);
const OFFLINE = process.argv.includes("--offline");

async function rpc(cid, method, params) {
  const net = NETS.find((n) => n.chainId === Number(cid)); let err;
  for (const url of net.rpcs) {
    for (let k = 0; k < 2; k++) {
      try {
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20000) });
        const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result;
      } catch (x) { err = x; await new Promise((r) => setTimeout(r, 500)); }
    }
  }
  throw err;
}
let fails = 0;
const check = (ok, name, extra) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ": " + extra : ""}`); if (!ok) fails++; };
const I = new ethers.Interface(X.ABI.voter);

// ---------- 1. encoding vs the Aero app ----------
const TX = {
  s41a: "0xe5c45eda9322f9812a09140928095809f49838a376a155b6f8068ff275067bdf",   // #41 frees all of Base (lone sentinel)
  s41b: "0xea1e579fe66b7b0f459e1845b76110157306d23370ca9355bb8176c3a54882f6",   // #41 sends it to Ethereum + Arbitrum and votes there
  s3470: "0x6fda481b8314cf750a0cb704734a74fee7fea22cbcc1768fde0690ba9c3d873a",  // #3470 parked power -> Robinhood
  s5873: "0x38a011b728656bfb",                                                  // #5873 first allocation Robinhood + Base (looked up by prefix below)
};
async function txByHash(h) { return rpc(8453, "eth_getTransactionByHash", [h]); }
// rebuild any decoded allocate() through encodeStep: the step = its networks, deltas and votes; fees = its gas/value
function rebuild(tx) {
  const [tokenId, ch, gd, refund] = I.decodeFunctionData("allocate", tx.input);
  const fees = {};
  const step = {
    chainDispatches: ch.map((c) => { if (Number(c.chainId) !== 8453) (fees[Number(c.chainId)] = fees[Number(c.chainId)] || {}).chain = { gasLimit: c.gasLimit, value: c.value }; return { chainId: Number(c.chainId), delta: c.delta }; }),
    gaugeDispatches: gd.map((g) => {
      if (Number(g.chainId) !== 8453) (fees[Number(g.chainId)] = fees[Number(g.chainId)] || {}).gauge = { gasLimit: g.gasLimit, value: g.value };
      const d = g.gauges.find((x) => x.gauge.toLowerCase() === X.C.DEALLOC);
      return { chainId: Number(g.chainId), dealloc: d ? d.allocated : 0n, gauges: g.gauges.filter((x) => x.gauge.toLowerCase() !== X.C.DEALLOC).map((x) => ({ gauge: x.gauge.toLowerCase(), allocated: x.allocated })) };
    }),
  };
  return { step, fees, tokenId: Number(tokenId), owner: refund };
}

(async () => {
  if (!OFFLINE) {
    const a = await txByHash(TX.s41a), b = await txByHash(TX.s41b);
    // through the planner: #41 had X on Base, nothing parked; plan = 50% Arbitrum pool + 50% Ethereum pool
    const [, , gdA] = I.decodeFunctionData("allocate", a.input), X41 = gdA[0].gauges[0].allocated;
    const [, chB, gdB] = I.decodeFunctionData("allocate", b.input);
    const plan = X.planSteps({ staked: X41, booked: { 8453: X41 }, current: { 8453: null },
      split: [{ chain: "arbitrum", gauge: gdB[1].gauges[0].gauge, pct: 50, label: "arb pool" }, { chain: "ethereum", gauge: gdB[0].gauges[0].gauge, pct: 50, label: "eth pool" }] });
    check(plan.steps.length === 2 && plan.steps[1].waitFor.length === 0, "#41 plan: 2 steps, the second needs no wait (Base frees instantly)");
    const fees = {}; for (const c of chB) fees[Number(c.chainId)] = { chain: { gasLimit: c.gasLimit, value: c.value } };
    for (const g of gdB) fees[Number(g.chainId)].gauge = { gasLimit: g.gasLimit, value: g.value };
    const ca = X.encodeStep(ethers, { tokenId: 41, owner: a.from, step: plan.steps[0], fees: {} });
    const cb = X.encodeStep(ethers, { tokenId: 41, owner: b.from, step: plan.steps[1], fees });
    check(ca.data.toLowerCase() === a.input.toLowerCase() && BigInt(a.value) === ca.total, "#41 step 1 (free Base) = the Aero app's call, byte for byte", `${(ca.data.length - 2) / 2} bytes, 0 ETH`);
    check(cb.data.toLowerCase() === b.input.toLowerCase() && BigInt(b.value) === cb.total, "#41 step 2 (send + vote on Ethereum + Arbitrum) = the Aero app's call, byte for byte", `${(cb.data.length - 2) / 2} bytes, ${ethers.formatEther(cb.total)} ETH`);
    // more real calls straight through encodeStep
    let t5873 = null;
    const logs = await rpc(8453, "eth_getLogs", [{ address: X.C.VOTER, fromBlock: "0x" + (53935892).toString(16), toBlock: "0x" + (53935892).toString(16) }]);
    for (const l of logs) if (l.transactionHash.startsWith(TX.s5873)) t5873 = l.transactionHash;
    for (const [name, h] of [["#3470 parked -> Robinhood", TX.s3470], ["#5873 first allocation Robinhood + Base (Base listed last: chain ids ascend)", t5873]]) {
      const tx = await txByHash(h), r = rebuild(tx), c = X.encodeStep(ethers, { tokenId: r.tokenId, owner: tx.from, step: r.step, fees: r.fees });
      check(c.data.toLowerCase() === tx.input.toLowerCase() && BigInt(tx.value) === c.total, name + " = the Aero app's call", `${ethers.formatEther(c.total)} ETH`);
    }
    // the fee: the Aero app sends exactly the adapter's quote (Ethereum, 800k gas)
    const q = await X.quote(ethers, rpc, 1, "0x" + "00".repeat(300), 800000, "0x000000000000000000000000000000000000dEaD");
    check(q > 0n, "Ethereum quote at 800k gas reads", ethers.formatEther(q) + " ETH (the Aero app sent 0.000725165 for this gas on 11/6)");
  }

  // ---------- 2. planner rules ----------
  const W = (n) => ethers.parseEther(String(n));
  const gB1 = "0x1000000000000000000000000000000000000001", gB2 = "0x1000000000000000000000000000000000000002", gO1 = "0x2000000000000000000000000000000000000001", gA1 = "0x3000000000000000000000000000000000000001";
  let p = X.planSteps({ staked: W(1000), booked: { 8453: W(1000) }, current: { 8453: { [gB1]: W(1000) } }, split: [{ chain: "base", gauge: gB1, pct: 70 }, { chain: "optimism", gauge: gO1, pct: 30 }] });
  check(p.steps.length === 2 && p.steps[0].gaugeDispatches.length === 1 && p.steps[0].gaugeDispatches[0].dealloc === W(300) && p.steps[1].chainDispatches[0].chainId === 10 && p.steps[1].chainDispatches[0].delta === W(300) && !p.steps[1].waitFor.length,
        "Base 1000 -> Base 700 + OP 300: step 1 frees 300 on Base with the Base vote, step 2 sends 300 to OP, no wait");
  p = X.planSteps({ staked: W(1000), booked: { 8453: W(700), 10: W(300) }, current: { 8453: { [gB1]: W(700) }, 10: { [gO1]: W(300) } }, split: [{ chain: "base", gauge: gB1, pct: 100 }] });
  check(p.steps.length === 2 && p.steps[0].gaugeDispatches[0].chainId === 10 && p.steps[0].gaugeDispatches[0].gauges.length === 0 && p.steps[1].waitFor[0] === 10 && p.steps[1].chainDispatches[0].chainId === 8453,
        "OP 300 back to Base: step 1 = OP's lone sentinel, step 2 waits for OP's return message");
  p = X.planSteps({ staked: W(1000), booked: { 8453: W(700), 10: W(300) }, current: { 8453: { [gB1]: W(700) }, 10: { [gO1]: W(300) } }, split: [{ chain: "base", gauge: gB2, pct: 70 }, { chain: "optimism", gauge: gO1, pct: 30 }] });
  check(p.steps.length === 1 && p.skipped[0] === 10 && p.steps[0].gaugeDispatches.length === 1 && p.steps[0].gaugeDispatches[0].chainId === 8453 && !p.steps[0].chainDispatches.length,
        "same amounts, new Base pool: one Base vote, OP left alone (no fee, its clock keeps running)");
  p = X.planSteps({ staked: W(1010), booked: { 8453: W(700), 10: W(300) }, current: { 8453: { [gB1]: W(700) }, 10: { [gO1]: W(300) } }, split: [{ chain: "base", gauge: gB1, pct: 60 }, { chain: "arbitrum", gauge: gA1, pct: 40 }] });
  const s1 = p.steps[0], s2 = p.steps[1];
  check(p.steps.length === 2 && s1.gaugeDispatches.map((g) => g.chainId).join() === "10,8453" && s2.chainDispatches.map((c) => c.chainId).join() === "42161" && s2.waitFor.join() === "10",
        "grown stake, Base + OP -> Base + Arbitrum: step 1 trims Base and empties OP, step 2 (after OP's return) sends to Arbitrum");
  // a pool kept on another network (Cypher's picks, Base only): 3.4% on OP rounded to 3% for show, signed at its exact wei
  const op34 = W(1000) * 34n / 1000n;
  p = X.planSteps({ staked: W(1000), booked: { 8453: W(1000) - op34, 10: op34 }, current: { 8453: { [gB1]: W(1000) - op34 }, 10: { [gO1]: op34 } },
                    split: [{ chain: "base", gauge: gB2, pct: 97 }, { chain: "optimism", gauge: gO1, pct: 3, wei: op34 }] });
  check(p.steps.length === 1 && p.skipped.join() === "10" && p.target[10] === op34 && p.target[8453] === W(1000) - op34 && !p.steps[0].chainDispatches.length,
    "a kept pool signs its exact amount: OP left alone, one Base-only step, no network fee");
  p = X.planSteps({ staked: W(1000), booked: { 8453: W(1000) - op34, 10: op34 }, current: { 8453: { [gB1]: W(1000) - op34 }, 10: { [gO1]: op34 } },
                    split: [{ chain: "base", gauge: gB2, pct: 97 }, { chain: "optimism", gauge: gO1, pct: 3 }] });
  check(p.steps.length === 2, "the same split by rounded percent alone would move OP (why kept pools carry wei)");
  let threw = ""; try { X.planSteps({ staked: W(1), booked: {}, split: [{ chain: "base", gauge: X.C.DEALLOC, pct: 100 }] }); } catch (x) { threw = x.message; }
  check(/sentinel/.test(threw), "a split naming the deallocation sentinel as a pool is refused", threw);
  threw = ""; try { X.planSteps({ staked: W(1), booked: {}, split: [{ chainId: 137, gauge: gB1, pct: 100 }] }); } catch (x) { threw = x.message; }
  check(/unknown network/.test(threw), "an unknown network is refused", threw);

  // ---------- 3. guard ----------
  const owner = "0x00000000000000000000000000000000000000a1", other = "0x00000000000000000000000000000000000000b2";
  p = X.planSteps({ staked: W(1000), booked: { 8453: W(1000) }, current: {}, split: [{ chain: "base", gauge: gB1, pct: 70 }, { chain: "optimism", gauge: gO1, pct: 30 }] });
  const step = p.steps[1], q0 = 200000000000000n;
  const fees = { 10: { chain: { gasLimit: 350000, value: q0 + q0 / 10n }, gauge: { gasLimit: 800000, value: q0 + q0 / 10n } } };
  const caps = { 10: { chain: q0 + q0 / 5n, gauge: q0 + q0 / 5n } };
  const allowed = new Set(["8453:" + gB1, "10:" + gO1]);
  const ctx = { tokenId: 7, owner, account: owner, step, before: p.before, allowed, caps };
  const good = X.encodeStep(ethers, { tokenId: 7, owner, step, fees });
  check(X.checkStep(ethers, good, ctx).ok, "guard passes the planned call", X.checkStep(ethers, good, ctx).why);
  const s1g = X.encodeStep(ethers, { tokenId: 7, owner, step: p.steps[0], fees: {} });
  check(X.checkStep(ethers, s1g, { ...ctx, step: p.steps[0] }).ok, "guard passes step 1 (Base vote + sentinel, 0 ETH)");
  const mut = (f) => { const [t, ch, gd, rf] = I.decodeFunctionData("allocate", good.data); const a = { t, ch: ch.map((c) => [...c]), gd: gd.map((g) => [g[0], g[1], g[2], g[3].map((x) => [...x])]), rf, v: good.total }; f(a); return { to: good.to, data: I.encodeFunctionData("allocate", [a.t, a.ch, a.gd, a.rf]), value: "0x" + a.v.toString(16) }; };
  const tam = [
    ["refund to someone else", mut((a) => { a.rf = other; })],
    ["other tokenId", mut((a) => { a.t = 8n; })],
    ["fee above quote + 20%", mut((a) => { a.gd[0][2] = q0 * 2n; a.v = a.ch[0][3] + q0 * 2n; })],
    ["ETH sent above the fees", { ...good, value: "0x" + (good.total + 1n).toString(16) }],
    ["ETH sent below the fees", { ...good, value: "0x" + (good.total - 1n).toString(16) }],
    ["more AERO sent to OP than planned", mut((a) => { a.ch[0][1] += 1n; })],
    ["pool swapped for another", mut((a) => { a.gd[0][3][0][0] = "0x2000000000000000000000000000000000000009"; })],
    ["sentinel slipped into the OP vote", mut((a) => { a.gd[0][3] = [[X.C.DEALLOC, a.gd[0][3][0][1], "0x"]]; })],
    ["network changed to Arbitrum", mut((a) => { a.ch[0][0] = 42161n; a.gd[0][0] = 42161n; })],
    ["gas limit 0 on OP", mut((a) => { a.gd[0][1] = 0n; })],
    ["gas limit above 6M", mut((a) => { a.gd[0][1] = 7000000n; })],
    ["per-pool data", mut((a) => { a.gd[0][3][0][2] = "0x01"; })],
  ];
  for (const [n, call] of tam) { const g = X.checkStep(ethers, call, ctx); check(!g.ok, "guard refuses " + n, g.why); }
  check(!X.checkStep(ethers, good, { ...ctx, account: other }).ok, "guard refuses a wallet that doesn't own the lock");
  check(!X.checkStep(ethers, { ...good, to: "0xbf7977e1521e9a3032bf7243ee4712f311f13915" }, ctx).ok, "guard refuses anything sent to sAERO");
  const s1bad = X.encodeStep(ethers, { tokenId: 7, owner, step: { ...p.steps[0], gaugeDispatches: [{ ...p.steps[0].gaugeDispatches[0], dealloc: W(400), gauges: [{ gauge: gB1, allocated: W(600) }] }] }, fees: {} });
  check(!X.checkStep(ethers, s1bad, { ...ctx, step: p.steps[0] }).ok, "guard refuses freeing more than planned");
  const baseFee = mut((a) => { a.gd = [[8453n, 0n, 1n, a.gd[0][3]]]; });
  check(!X.checkStep(ethers, baseFee, ctx).ok, "guard refuses a fee on a Base entry");

  // ---------- 4. live dry runs ----------
  if (!OFFLINE) {
    const plan = JSON.parse(require("fs").readFileSync(path.join(ROOT, "data", "plan.json")));
    const pick = (chain) => plan.gauges.filter((g) => (g.chain || "base") === chain && g.gauge).sort((a, b) => (b.alloc || 0) - (a.alloc || 0))[0];
    for (const [id, split] of [
      [697, (st) => { const b = Object.keys(st.cur[8453] || {})[0] || pick("base").gauge; return [{ chain: "base", gauge: b, pct: 70 }, { chain: "optimism", gauge: pick("optimism").gauge, pct: 30 }]; }],
      [41, () => [{ chain: "base", gauge: pick("base").gauge, pct: 50 }, { chain: "arbitrum", gauge: pick("arbitrum").gauge, pct: 50 }]],
    ]) {
      const st = await readLock(id);
      const sp = split(st);
      const t0 = Date.now();
      const r = await X.dryRun(ethers, rpc, { tokenId: id, owner: st.owner, staked: st.staked, booked: st.booked, current: st.cur, split: sp, opens: st.opens,
        allowed: new Set(sp.map((s) => X.ID_OF[s.chain] + ":" + s.gauge.toLowerCase())) });
      const desc = r.steps.map((s, i) => `step ${i + 1}: ` + (s.waiting ? s.why : s.ok ? `OK, ${ethers.formatEther(s.call.total)} ETH, Base gas ${s.baseGas}` + Object.entries(s.leaf).map(([c, L]) => `, ${X.netName(Number(c))} handled ${L.handled.map((h) => h.gas).join("+")} gas`).join("") : "FAILED " + s.why)).join(" | ");
      check(r.ok, `live dry run #${id} (${Object.keys(st.booked).map((c) => X.netName(Number(c))).join(" + ")} -> ${sp.map((s) => s.pct + "% " + s.chain).join(" + ")})`, desc + ` (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  }
  console.log(fails ? `\n${fails} FAILURE(S)` : "\nall cross-network tests passed");
  process.exit(fails ? 1 : 0);
})().catch((x) => { console.error(x); process.exit(1); });

// what the page reads: owner, stake, what each network holds, each network's vote and clock
async function readLock(id) {
  const call = async (cid, to, sig, args) => { const J = new ethers.Interface(["function " + sig]); const f = J.fragments[0]; return J.decodeFunctionResult(f.name, await rpc(cid, "eth_call", [{ to, data: J.encodeFunctionData(f.name, args) }, "latest"])); };
  const owner = (await call(8453, "0xbf7977e1521e9a3032bf7243ee4712f311f13915", "ownerOf(uint256) view returns (address)", [id]))[0];
  const staked = (await call(8453, "0xbf7977e1521e9a3032bf7243ee4712f311f13915", "staked(uint256) view returns (uint256,uint256,bool)", [id]))[0];
  const ids = (await call(8453, X.C.VOTER, "allocationChainIds(uint256) view returns (uint256[])", [id]))[0].map(Number);
  const booked = {}, cur = {}, opens = {};
  for (const c of [...new Set([8453, ...ids])]) {
    const b = (await call(8453, X.C.VOTER, "allocationChainAmounts(uint256,uint256) view returns (uint128)", [id, c]))[0];
    if (b > 0n) booked[c] = b;
    const ts = await call(c, X.C.LEAF, "tokenStates(uint256) view returns (address,uint48,bool,uint128)", [id]);
    const cd = (await call(c, X.C.LEAF, "allocationCooldown() view returns (uint48)", []))[0];
    opens[c] = Number(ts[1]) ? Number(ts[1]) + Number(cd) : 0;
    const gs = (await call(c, X.C.LEAF, "allocatedGauges(uint256) view returns (address[])", [id]))[0];
    cur[c] = {};
    for (const g of gs) cur[c][g.toLowerCase()] = (await call(c, X.C.LEAF, "allocations(uint256,address) view returns (uint128)", [id, g]))[0];
  }
  return { owner, staked, booked, cur, opens };
}
