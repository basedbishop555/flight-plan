/* allocate-x.js: allocations that use networks other than Base (Stage 2, November 2026).
 *
 * How Aero does it (V3 Voter.sol / LeafVoter / RootMessageOrchestrator / HyperlaneAdapter, dromos-labs/metadex-public,
 * checked against 60 real cross-network allocations signed in the Aero app):
 *   - Every step is ONE Voter.allocate on Base, to the same root Voter Flight Plan already signs to. The other network
 *     needs no transaction, no gas and no approval: the vote travels there as a Hyperlane message.
 *   - The message fee is ETH attached to that Base call (value = the sum of the per-network fees). The fee is the
 *     network's own adapter quote (quoteMessage), the same number the Aero app sends; anything paid above it is
 *     refunded to `refundRecipient` (= you).
 *   - Moving AERO between networks: power comes off a network only through the DEALLOC_GAUGE sentinel in that
 *     network's vote, and goes onto a network only as a chain `delta` drawn from parked power. allocate() books
 *     deltas BEFORE votes, so freeing and sending are two transactions. Freeing on Base is instant; freeing on another
 *     network sends a message back to Base (minutes), and the second step waits for it.
 *   - Each network has its own 47-hour clock. A vote arriving inside it is redelivered later or expires, so every
 *     network a step votes on must be open when it lands.
 * The dry run proves both halves: the Base call in eth_simulateV1, then the exact Hyperlane message it dispatches
 * replayed into that network's adapter (from its mailbox) in eth_simulateV1 there, reading the vote back. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AeroX = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const C = {
    BASE: 8453,
    VOTER: "0x49d7d4f17ec56ef8fa04e464af5d1a4942cc31e6",          // root Voter (Base)
    ORCH: "0x4f347fec2aeb8fdb569045af4d0806ee7f7f6194",           // RootMessageOrchestrator (Base) = Voter.ORCHESTRATOR()
    LEAF: "0x382409fad8503fbcdbb27a4211551fa03e884078",           // LeafVoter, same address on every network
    BASE_MAILBOX: "0xea87ae93fa0019a82a727bfd3ebd1cfca8f64f1d",   // Hyperlane mailbox on Base
    DEALLOC: "0x2e67fe7bd6843e2d0095f5d02c60a7cd29a26902",        // address(uint160(uint256(keccak256('DROMOS_DEALLOC_GAUGE'))))
    ALLOCATE_SELECTOR: "0xf02e634e",
    // per network: our key, its name, the Base-side adapter (orchestrator.adapters(id)), and the far side's adapter +
    // mailbox (LeafVoter.ORCHESTRATOR().adapter(), adapter.MAILBOX()); read on chain 11/6/2026. The dry run re-reads
    // the Base side live and refuses if Aero has changed it.
    NETS: {
      1:     { key: "ethereum",  name: "Ethereum",  rootAdapter: "0x0c54028e2aefdf6e740513655dce88ae63df96c9", leafAdapter: "0x4aaff8cfb43e2cefbbbf4c133c934db6ba7e4c14", leafMailbox: "0xc005dc82818d67af737725bd4bf75435d065d239" },
      10:    { key: "optimism",  name: "OP",        rootAdapter: "0xe82457ff1049f1f63e51d634d2c96993b841b1cb", leafAdapter: "0x314bdc685ad3426d586860cf909e4d4f0279bf77", leafMailbox: "0xd4c1905bb1d26bc93dac913e13cacc278cdcc80d" },
      4663:  { key: "robinhood", name: "Robinhood", rootAdapter: "0xd9dc65a40e70517da5f4f5cb1f9e5d4b59aa2910", leafAdapter: "0x4aaff8cfb43e2cefbbbf4c133c934db6ba7e4c14", leafMailbox: "0x3a867fcffec2b790970eebdc9023e75b0a172aa7" },
      5042:  { key: "arc",       name: "Arc",       rootAdapter: "0x247c86a3bbd88059aef2e9d3af0e90d2f3f5c8bf", leafAdapter: "0x56632394f866761fd86873e96a567720ce865682", leafMailbox: "0x7f50c5776722630a0024fae05fde8b47571d7b39" },
      42161: { key: "arbitrum",  name: "Arbitrum",  rootAdapter: "0xa365addaa935fd97c0815d41a6375dbb483d5c67", leafAdapter: "0xe7eb27bf93a7a3caa8b483ec5f5ee6588bfd3886", leafMailbox: "0x979ca5202784112f4738403dbec5d0f3b9daabb9" },
      57073: { key: "ink",       name: "Ink",       rootAdapter: "0x5ad9a3920a25caa5abd36cd35f1c57b48793fd03", leafAdapter: "0x4aaff8cfb43e2cefbbbf4c133c934db6ba7e4c14", leafMailbox: "0x7f50c5776722630a0024fae05fde8b47571d7b39" },
      // Elysium (gas HYPE) joined 11/9/2026; same reads (orchestrator.adapters(99901), LeafVoter.ORCHESTRATOR().adapter(), MAILBOX())
      99901: { key: "elysium",   name: "Elysium",   rootAdapter: "0xc93eb34f4e893cbd6dc4f6530ff06cb1162cbe74", leafAdapter: "0x4aaff8cfb43e2cefbbbf4c133c934db6ba7e4c14", leafMailbox: "0x7f50c5776722630a0024fae05fde8b47571d7b39" },
    },
    CHAIN_GAS: 350000,          // the chain-budget message (the Aero app sends 250k-350k)
    GAS_MIN: 300000, GAS_MAX: 6000000,
    PAD_PCT: 10n,               // fee sent = quote + 10% (prices can tick between the quote and the block; the rest is refunded)
    CAP_PCT: 20n,               // the guard refuses any message fee above quote + 20%
    HARD_CAP: 30000000000000000n,  // 0.03 ETH: no allocate call from this page ever carries more
  };
  const ID_OF = { base: C.BASE };
  for (const [id, n] of Object.entries(C.NETS)) ID_OF[n.key] = Number(id);
  const ABI = {
    voter: [
      "function allocate(uint256 tokenId,(uint256 chainId,uint128 delta,uint256 gasLimit,uint256 value)[] chainDispatches,(uint256 chainId,uint256 gasLimit,uint256 value,(address gauge,uint128 allocated,bytes data)[] gauges)[] gaugeDispatches,address refundRecipient) payable",
      "function allocationChainAmounts(uint256 tokenId,uint256 chainId) view returns (uint128)",
    ],
    orch: [
      "function adapters(uint256 chainId) view returns (address)",
      "function deallocationReturnCost(uint256 chainId) view returns (uint256)",
    ],
    adapter: [
      "function quoteMessage(bytes message,uint256 gasLimit,address refundRecipient) view returns (uint256)",
      "function handle(uint32 origin,bytes32 sender,bytes message) payable",
    ],
    leaf: [
      "function tokenStates(uint256 tokenId) view returns (address operator,uint48 lastAllocated,bool canVoteForZeroCapGauges,uint128 chainAllocation)",
      "function allocatedGauges(uint256 tokenId) view returns (address[])",
      "function allocations(uint256 tokenId,address gauge) view returns (uint128)",
    ],
    mailbox: ["event Dispatch(address indexed sender,uint32 indexed destination,bytes32 indexed recipient,bytes message)"],
  };
  const lower = (a) => String(a).toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a));
  const known = (cid) => cid === C.BASE || !!C.NETS[cid];
  const netName = (cid) => (cid === C.BASE ? "Base" : (C.NETS[cid] || {}).name || "chain " + cid);
  const sum = (xs) => xs.reduce((a, b) => a + b, 0n);

  /** split rows {chainId | chain (key), gauge, pct, label, wei?} over the WHOLE stake -> legs with exact wei, summing to
   *  the stake (integer-division remainder on the largest leg), each network's legs ascending by gauge address.
   *  A row with `wei` keeps exactly that amount (a pool left as it is); the other rows share what's left by percent. */
  function targetLegs(split, staked) {
    if (!Array.isArray(split) || !split.length) throw new Error("empty split");
    staked = BigInt(staked);
    const rows = split.map((s) => {
      const cid = Number(s.chainId != null ? s.chainId : ID_OF[s.chain || "base"]);
      if (!known(cid)) throw new Error(`unknown network for ${s.label || s.gauge}`);
      if (!isAddr(s.gauge)) throw new Error(`no gauge address for ${s.label || s.pool}`);
      if (lower(s.gauge) === C.DEALLOC) throw new Error("the deallocation sentinel is not a pool");
      const pct = Number(s.pct);
      if (!(pct > 0) || pct > 100) throw new Error(`bad percent for ${s.label}`);
      const fixed = s.wei != null;
      if (fixed && !(BigInt(s.wei) > 0n && BigInt(s.wei) <= staked)) throw new Error(`bad amount for ${s.label}`);
      return { chainId: cid, gauge: lower(s.gauge), pct, label: s.label || "", fixed, allocated: fixed ? BigInt(s.wei) : (staked * BigInt(Math.round(pct * 100))) / 10000n };
    });
    const total = rows.reduce((n, r) => n + r.pct, 0);
    if (Math.abs(total - 100) > 1e-6) throw new Error(`split sums to ${total}%, not 100%`);
    const seen = new Set();
    for (const r of rows) { const k = r.chainId + ":" + r.gauge; if (seen.has(k)) throw new Error(`pool ${r.label || r.gauge} listed twice`); seen.add(k); }
    const kept = sum(rows.filter((r) => r.fixed).map((r) => r.allocated)), free = rows.filter((r) => !r.fixed);
    if (kept > staked) throw new Error("kept amounts exceed the stake");
    if (kept > 0n && free.length) {                                  // the percent rows fill exactly what the kept rows leave
      const bp = free.map((r) => BigInt(Math.round(r.pct * 100))), bt = sum(bp);
      if (bt <= 0n) throw new Error("the moved pools have no share");
      free.forEach((r, i) => { r.allocated = ((staked - kept) * bp[i]) / bt; });
    }
    const s = sum(rows.map((r) => r.allocated));
    if (s > staked) throw new Error("rounding overshoot");
    if (s < staked) { const big = (free.length ? free : rows).reduce((a, b) => (b.allocated > a.allocated ? b : a)); big.allocated += staked - s; }
    for (const r of rows) { if (r.allocated <= 0n) throw new Error(`zero allocation for ${r.label}`); delete r.fixed; }
    rows.sort((a, b) => a.chainId - b.chainId || (BigInt(a.gauge) < BigInt(b.gauge) ? -1 : 1));
    return rows;
  }

  /** What has to happen, as Voter.allocate steps (no fees yet).
   *  p = {staked, booked: {chainId: wei} (root allocationChainAmounts for every network the lock uses),
   *       current: {chainId: {gauge: wei} | null} (null = unknown), split, tol (default 0.01)}
   *  -> {legs, target: {cid: wei}, before: {cid: wei}, steps: [{chainDispatches:[{chainId, delta}],
   *      gaugeDispatches:[{chainId, gauges:[{gauge, allocated}], dealloc}], waitFor:[cid]}], skipped:[cid]}
   *  Rules: each network is voted on at most once. A network losing AERO votes (with the sentinel) in step 1; a network
   *  gaining AERO gets its delta and its vote in the last step; a network keeping its amount but changing pools votes in
   *  the first step; one whose pools already match within `tol` is left alone (no fee, its clock keeps running). */
  function planSteps(p) {
    const staked = BigInt(p.staked), tol = p.tol == null ? 0.01 : p.tol;
    const legs = targetLegs(p.split, staked);
    const target = {}, before = {};
    for (const l of legs) target[l.chainId] = (target[l.chainId] || 0n) + l.allocated;
    for (const [c, v] of Object.entries(p.booked || {})) { const b = BigInt(v); if (b > 0n) { if (!known(Number(c))) throw new Error(`this lock allocates on chain ${c}, which Flight Plan doesn't know`); before[c] = b; } }
    const booked = sum(Object.values(before));
    if (booked > staked) throw new Error("more booked than staked (unexpected)");
    const chains = [...new Set([...Object.keys(before), ...Object.keys(target)].map(Number))].sort((a, b) => a - b);
    const dec = [], inc = [], changed = [], skipped = [];
    const votes = (cid) => legs.filter((l) => l.chainId === cid).map((l) => ({ gauge: l.gauge, allocated: l.allocated }));
    for (const c of chains) {
      const b = before[c] || 0n, t = target[c] || 0n;
      if (b > t) dec.push({ chainId: c, gauges: votes(c), dealloc: b - t });
      else if (t > b) inc.push({ chainId: c, delta: t - b, gauges: votes(c) });
      else if (t > 0n) {
        const raw = (p.current || {})[c], want = votes(c), slack = (t * BigInt(Math.round(tol * 1e6))) / 1000000n;
        const cur = raw ? Object.fromEntries(Object.entries(raw).map(([k, v]) => [lower(k), BigInt(v)])) : null;
        let same = !!cur;
        if (same) {
          const keys = new Set([...Object.keys(cur), ...want.map((w) => w.gauge)]);
          for (const k of keys) {
            const a = cur[k] || 0n, w = (want.find((x) => x.gauge === k) || {}).allocated || 0n;
            if ((a > w ? a - w : w - a) > slack) { same = false; break; }
          }
        }
        if (same) skipped.push(c); else changed.push({ chainId: c, gauges: want, dealloc: 0n });
      }
    }
    const steps = [];
    if (dec.length) steps.push({ chainDispatches: [], gaugeDispatches: dec.concat(changed).sort((a, b) => a.chainId - b.chainId), waitFor: [] });
    if (inc.length || (!dec.length && changed.length)) {
      steps.push({ chainDispatches: inc.map((x) => ({ chainId: x.chainId, delta: x.delta })),
                   gaugeDispatches: inc.map((x) => ({ chainId: x.chainId, gauges: x.gauges, dealloc: 0n })).concat(dec.length ? [] : changed).sort((a, b) => a.chainId - b.chainId),
                   waitFor: dec.filter((x) => x.chainId !== C.BASE).map((x) => x.chainId) });
    }
    // the books must balance: what the deltas add = parked power + what step 1 frees
    const free = staked - booked, freed = sum(dec.map((x) => x.dealloc)), added = sum(inc.map((x) => x.delta));
    if (added !== free + freed) throw new Error("internal: deltas don't balance (" + added + " vs " + (free + freed) + ")");
    return { legs, target, before, steps, skipped };
  }

  /** the budget each network's vote must add up to in a step: booked before + the delta that step adds */
  function budgets(before, step) {
    const out = {};
    for (const g of step.gaugeDispatches) {
      const d = step.chainDispatches.find((c) => c.chainId === g.chainId);
      out[g.chainId] = BigInt(before[g.chainId] || 0n) + (d ? d.delta : 0n);
    }
    return out;
  }

  /** gauges of one network's vote in contract order: target legs + the sentinel, strictly ascending */
  function voteList(g) {
    const xs = g.gauges.map((x) => ({ gauge: lower(x.gauge), allocated: BigInt(x.allocated) }));
    if (g.dealloc && BigInt(g.dealloc) > 0n) xs.push({ gauge: C.DEALLOC, allocated: BigInt(g.dealloc) });
    xs.sort((a, b) => (BigInt(a.gauge) < BigInt(b.gauge) ? -1 : 1));
    return xs;
  }

  /** {ethers, tokenId, owner, step, fees: {cid: {chain: {gasLimit, value}, gauge: {gasLimit, value}}}} -> the call */
  function encodeStep(ethers, p) {
    const I = new ethers.Interface(ABI.voter);
    const owner = ethers.getAddress(p.owner), f = p.fees || {};
    const fee = (cid, kind) => (cid === C.BASE ? { gasLimit: 0n, value: 0n } : { gasLimit: BigInt(f[cid][kind].gasLimit), value: BigInt(f[cid][kind].value) });
    const chainDispatches = p.step.chainDispatches.map((c) => { const x = fee(c.chainId, "chain"); return [BigInt(c.chainId), BigInt(c.delta), x.gasLimit, x.value]; });
    const gaugeDispatches = p.step.gaugeDispatches.map((g) => { const x = fee(g.chainId, "gauge"); return [BigInt(g.chainId), x.gasLimit, x.value, voteList(g).map((v) => [ethers.getAddress(v.gauge), v.allocated, "0x"])]; });
    const total = chainDispatches.reduce((a, c) => a + c[3], 0n) + gaugeDispatches.reduce((a, g) => a + g[2], 0n);
    const data = I.encodeFunctionData("allocate", [BigInt(p.tokenId), chainDispatches, gaugeDispatches, owner]);
    return { to: ethers.getAddress(C.VOTER), data, value: "0x" + total.toString(16), total, owner, tokenId: Number(p.tokenId) };
  }

  /** The send guard for a cross-network step. Decodes the call and refuses anything that isn't exactly the expected
   *  step: allocate(owned tokenId) to the root Voter, refund = you, the same networks / deltas / pools / amounts the
   *  plan asked for (the sentinel only where the plan frees AERO, for exactly that amount), every network's vote adding
   *  up to its budget, Base entries with no gas and no fee, other networks with a sane gas limit and a fee no higher
   *  than its quote + 20% (+ that network's fixed return cost when AERO comes back), the ETH sent = the fees, total
   *  under 0.03 ETH.
   *  ctx = {tokenId, owner, account, step, before, allowed: Set("cid:gauge"), caps: {cid: {chain, gauge}} (wei)} */
  function checkStep(ethers, call, ctx) {
    try {
      if (lower(call.to) !== C.VOTER) return { ok: false, why: "to is not the Voter" };
      if (!String(call.data).toLowerCase().startsWith(C.ALLOCATE_SELECTOR)) return { ok: false, why: "not allocate()" };
      const I = new ethers.Interface(ABI.voter);
      const [tokenId, chains, gauges, refund] = I.decodeFunctionData("allocate", call.data);
      if (Number(tokenId) !== Number(ctx.tokenId)) return { ok: false, why: "tokenId differs from the lock shown" };
      if (lower(ctx.owner) !== lower(ctx.account)) return { ok: false, why: "connected account does not own this lock" };
      if (lower(refund) !== lower(ctx.account)) return { ok: false, why: "refund recipient is not you" };
      const st = ctx.step, caps = ctx.caps || {}, allowed = ctx.allowed;
      const feeOk = (cid, gasLimit, value, cap, what) => {
        if (cid === C.BASE) return gasLimit === 0n && value === 0n ? "" : `Base ${what} must carry no gas limit and no fee`;
        if (!C.NETS[cid]) return `network ${cid} is not on the allowed list`;
        if (gasLimit < BigInt(C.GAS_MIN) || gasLimit > BigInt(C.GAS_MAX)) return `${netName(cid)} ${what} gas limit out of range`;
        if (!(value > 0n)) return `${netName(cid)} ${what} has no fee`;
        if (cap == null || value > BigInt(cap)) return `${netName(cid)} ${what} fee is above its quote + 20%`;
        return "";
      };
      if (chains.length !== st.chainDispatches.length) return { ok: false, why: "network moves differ from the plan" };
      let total = 0n, prev = -1n;
      for (let i = 0; i < chains.length; i++) {
        const c = chains[i], e = st.chainDispatches[i], cid = Number(c.chainId);
        if (c.chainId <= prev) return { ok: false, why: "networks not in ascending order" };
        prev = c.chainId;
        if (cid !== e.chainId || c.delta !== BigInt(e.delta) || !(c.delta > 0n)) return { ok: false, why: `the AERO sent to ${netName(cid)} differs from the plan` };
        const w = feeOk(cid, c.gasLimit, c.value, (caps[cid] || {}).chain, "move"); if (w) return { ok: false, why: w };
        total += c.value;
      }
      if (gauges.length !== st.gaugeDispatches.length) return { ok: false, why: "networks voted on differ from the plan" };
      const bud = budgets(ctx.before || {}, st);
      prev = -1n;
      for (let i = 0; i < gauges.length; i++) {
        const g = gauges[i], e = st.gaugeDispatches[i], cid = Number(g.chainId);
        if (g.chainId <= prev) return { ok: false, why: "networks not in ascending order" };
        prev = g.chainId;
        if (cid !== e.chainId) return { ok: false, why: "networks voted on differ from the plan" };
        const w = feeOk(cid, g.gasLimit, g.value, (caps[cid] || {}).gauge, "vote"); if (w) return { ok: false, why: w };
        total += g.value;
        const want = voteList(e);
        if (g.gauges.length !== want.length) return { ok: false, why: `${netName(cid)} pools differ from the plan` };
        let s = 0n, last = -1n;
        for (let k = 0; k < want.length; k++) {
          const x = g.gauges[k], a = BigInt(x.gauge);
          if (a <= last) return { ok: false, why: "pools not strictly ascending" };
          last = a;
          if (x.data !== "0x") return { ok: false, why: "unexpected per-pool data" };
          if (lower(x.gauge) !== want[k].gauge || x.allocated !== want[k].allocated) return { ok: false, why: `${netName(cid)} pools or amounts differ from the plan` };
          if (lower(x.gauge) === C.DEALLOC) { if (!(e.dealloc > 0n)) return { ok: false, why: "unexpected deallocation" }; }
          else if (allowed && !allowed.has(cid + ":" + lower(x.gauge))) return { ok: false, why: "a pool is not in the plan" };
          s += x.allocated;
        }
        if (s !== bud[cid]) return { ok: false, why: `${netName(cid)} vote doesn't add up to its budget` };
      }
      const v = BigInt(call.value || 0);
      if (v !== total) return { ok: false, why: "ETH sent differs from the fees" };
      if (v > C.HARD_CAP) return { ok: false, why: "fees above 0.03 ETH" };
      return { ok: true, why: "" };
    } catch (e) { return { ok: false, why: "decode failed: " + (e.message || e) }; }
  }

  // ---------- chain I/O (rpc = async (chainId, method, params) => result) ----------
  const hex = (n) => "0x" + BigInt(n).toString(16);
  async function ethCall(ethers, rpc, cid, to, abi, fn, args) {
    const I = new ethers.Interface(abi);
    const r = await rpc(cid, "eth_call", [{ to, data: I.encodeFunctionData(fn, args) }, "latest"]);
    return I.decodeFunctionResult(fn, r);
  }
  /** the Base side of every network a plan touches, live: adapter must still be the pinned one; return cost */
  async function readBridge(ethers, rpc, cids) {
    const out = {};
    await Promise.all(cids.map(async (cid) => {                     // every network at once: these reads don't depend on each other
      const [[ad], [cost]] = await Promise.all([ethCall(ethers, rpc, C.BASE, C.ORCH, ABI.orch, "adapters", [cid]),
                                                ethCall(ethers, rpc, C.BASE, C.ORCH, ABI.orch, "deallocationReturnCost", [cid])]);
      if (lower(ad) !== C.NETS[cid].rootAdapter) throw new Error(`Aero changed its ${netName(cid)} bridge adapter; Flight Plan needs an update before it can send there`);
      out[cid] = { cost: BigInt(cost) };
    }));
    return out;
  }
  async function quote(ethers, rpc, cid, message, gasLimit, refund) {
    const [q] = await ethCall(ethers, rpc, C.BASE, C.NETS[cid].rootAdapter, ABI.adapter, "quoteMessage", [message, gasLimit, refund]);
    return BigInt(q);
  }
  const roundUp = (n, step) => Math.ceil(n / step) * step;
  const guessGas = (nNew, nOld) => Math.min(C.GAS_MAX, 600000 + 450000 * Math.max(1, nNew, nOld));

  /** Simulate steps on Base in one eth_simulateV1 (each step its own block, in order), owner funded by override.
   *  Returns per step {ok, err, gas, msgs: [{cid, body}]} (msgs = the Hyperlane messages, in dispatch order). */
  async function simBase(ethers, rpc, owner, calls, at, tokenId, gaugesOf) {
    const M = new ethers.Interface(ABI.mailbox), topic = M.getEvent("Dispatch").topicHash, L = new ethers.Interface(ABI.leaf);
    const blocks = calls.map((c, i) => {
      const gs = gaugesOf ? gaugesOf(i) : [];
      const reads = [{ to: C.LEAF, data: L.encodeFunctionData("tokenStates", [tokenId]) }, { to: C.LEAF, data: L.encodeFunctionData("allocatedGauges", [tokenId]) }]
        .concat(gs.map((g) => ({ to: C.LEAF, data: L.encodeFunctionData("allocations", [tokenId, g]) })));
      const b = { calls: [{ from: owner, to: c.to, data: c.data, value: c.value, gas: hex(30000000) }].concat(reads) };
      if (i === 0) { b.stateOverrides = { [owner]: { balance: hex(10n ** 20n) } }; if (at && at > Date.now() / 1000 + 30) b.blockOverrides = { time: hex(at) }; }   // only a real future time: "now" can trail the latest block
      return { b, gs };
    });
    const res = await rpc(C.BASE, "eth_simulateV1", [{ blockStateCalls: blocks.map((x) => x.b), validation: false }, "latest"]);
    return res.map((blk, i) => {
      const r = blk.calls[0], gs = blocks[i].gs;
      if (r.status !== "0x1") return { ok: false, err: JSON.stringify(r.error || r.returnData || "").slice(0, 300), gas: parseInt(r.gasUsed, 16), msgs: [] };
      const ts = blk.calls[1].status === "0x1" ? L.decodeFunctionResult("tokenStates", blk.calls[1].returnData) : null;
      const base = { budget: ts ? ts[3] : null, lastAllocated: ts ? Number(ts[1]) : null,
                     listed: blk.calls[2].status === "0x1" ? L.decodeFunctionResult("allocatedGauges", blk.calls[2].returnData)[0].map(lower) : [], got: {} };
      gs.forEach((g, k) => { const x = blk.calls[3 + k]; base.got[lower(g)] = x.status === "0x1" ? L.decodeFunctionResult("allocations", x.returnData)[0] : null; });
      const msgs = (r.logs || []).filter((l) => lower(l.address) === C.BASE_MAILBOX && l.topics[0] === topic).map((l) => {
        const [m] = ethers.AbiCoder.defaultAbiCoder().decode(["bytes"], l.data);
        return { cid: Number(BigInt(l.topics[2])), body: ethers.dataSlice(m, 77) };   // v3 header = 1 + 4 + 4 + 32 + 4 + 32 bytes
      });
      return { ok: true, err: "", gas: parseInt(r.gasUsed, 16), msgs, base };
    });
  }
  /** a network's vote after the step, checked against the plan: budget, every pool exact, nothing else left listed */
  function voteMatches(st, d, target) {
    if (st.budget !== (target == null ? 0n : target)) return "budget after doesn't match";
    if (!d) return "";
    const miss = d.gauges.find((g) => st.got[g.gauge] !== g.allocated), extra = st.listed.filter((x) => !d.gauges.some((g) => g.gauge === x));
    return miss || extra.length ? "vote after doesn't match the plan" : "";
  }

  /** Replay the messages for one network into its adapter (from its mailbox) at time `at`, then read the vote back. */
  async function simLeaf(ethers, rpc, cid, tokenId, msgs, gauges, at) {
    const A = new ethers.Interface(ABI.adapter), L = new ethers.Interface(ABI.leaf), n = C.NETS[cid];
    const sender = ethers.zeroPadValue(n.rootAdapter, 32);
    const calls = msgs.map((m) => ({ from: n.leafMailbox, to: n.leafAdapter, data: A.encodeFunctionData("handle", [C.BASE, sender, m.body]), gas: hex(8000000) }))
      .concat([{ to: C.LEAF, data: L.encodeFunctionData("tokenStates", [tokenId]) }, { to: C.LEAF, data: L.encodeFunctionData("allocatedGauges", [tokenId]) }])
      .concat(gauges.map((g) => ({ to: C.LEAF, data: L.encodeFunctionData("allocations", [tokenId, g]) })));
    const blk = { calls }; if (at) blk.blockOverrides = { time: hex(at) };
    const r = (await rpc(cid, "eth_simulateV1", [{ blockStateCalls: [blk], validation: false }, "latest"]))[0].calls;
    const k = msgs.length, handled = r.slice(0, k).map((x) => ({ ok: x.status === "0x1", gas: parseInt(x.gasUsed, 16), err: x.status === "0x1" ? "" : JSON.stringify(x.error || x.returnData || "").slice(0, 300) }));
    const ts = r[k].status === "0x1" ? L.decodeFunctionResult("tokenStates", r[k].returnData) : null;
    const listed = r[k + 1].status === "0x1" ? L.decodeFunctionResult("allocatedGauges", r[k + 1].returnData)[0].map(lower) : [];
    const got = {}; gauges.forEach((g, i) => { const x = r[k + 2 + i]; got[lower(g)] = x.status === "0x1" ? L.decodeFunctionResult("allocations", x.returnData)[0] : null; });
    return { handled, budget: ts ? ts[3] : null, lastAllocated: ts ? Number(ts[1]) : null, listed, got };
  }

  /** The whole cross-network dry run for one lock.
   *  p = {tokenId, owner, staked, booked, current, split, allowed (Set "cid:gauge"), now, opens: {cid: unix},
   *       arrive (seconds a message takes, default 120)}
   *  -> {plan, steps: [{call, fees, caps, quoted, sim, leaf: {cid: {...}}, ok, why, openAt, touched}], ok, why} */
  async function dryRun(ethers, rpc, p) {
    const plan = planSteps(p), now = p.now || Math.floor(Date.now() / 1000), arrive = p.arrive || 120, opens = { ...(p.opens || {}) };
    if (!plan.steps.length) return { plan, steps: [], ok: true, why: "nothing to change" };
    const leafs = [...new Set(plan.steps.flatMap((s) => s.chainDispatches.concat(s.gaugeDispatches).map((x) => x.chainId)))].filter((c) => c !== C.BASE);
    // the bridge side on Base and each network's own 47-hour clock (a network the lock left earlier keeps its clock, read
    // here when the caller hasn't), all at once
    const clocks = leafs.filter((cid) => opens[cid] == null).map(async (cid) => {
      try {
        const [ts, [cd]] = await Promise.all([ethCall(ethers, rpc, cid, C.LEAF, ABI.leaf, "tokenStates", [p.tokenId]),
                                              ethCall(ethers, rpc, cid, C.LEAF, ["function allocationCooldown() view returns (uint48)"], "allocationCooldown", [])]);
        opens[cid] = Number(ts[1]) ? Number(ts[1]) + Number(cd) : 0;
      } catch (e) { opens[cid] = 0; }        // unreadable: the replay below still catches a running clock
    });
    const [bridge] = await Promise.all([readBridge(ethers, rpc, leafs), ...clocks]);
    const nOld = (cid) => Object.keys(((p.current || {})[cid]) || {}).length;
    // a step can be rehearsed only when everything it depends on has landed: a step waiting for AERO to come back from
    // another network is planned (and shown) but not simulated until it's back
    const live = []; for (const s of plan.steps) { if (s.waitFor.length) break; live.push(s); }
    const touched = (s) => [...new Set(s.gaugeDispatches.map((g) => g.chainId))];
    const openAt = (s) => Math.max(now, ...touched(s).map((c) => opens[c] || 0));
    // round 1: generous gas, quoted fees -> simulate -> the real messages + the gas they use there
    const feesFor = async (s, gasOf, msgOf) => {
      const fees = {}, caps = {}, quoted = {}, todo = [];
      for (const kind of ["chain", "gauge"]) for (const x of kind === "chain" ? s.chainDispatches : s.gaugeDispatches) if (x.chainId !== C.BASE) todo.push([kind, x]);
      const qs = await Promise.all(todo.map(([kind, x]) => quote(ethers, rpc, x.chainId, msgOf ? msgOf(x.chainId, kind) : "0x" + "00".repeat(400), gasOf(x.chainId, kind, x), p.owner)));
      for (const [k, [kind, x]] of todo.entries()) {
        const cid = x.chainId, gl = gasOf(cid, kind, x), q = qs[k], ret = kind === "gauge" && x.dealloc > 0n ? bridge[cid].cost : 0n;
        (fees[cid] = fees[cid] || {})[kind] = { gasLimit: gl, value: q + (q * C.PAD_PCT + 99n) / 100n + ret };
        (caps[cid] = caps[cid] || {})[kind] = q + (q * C.CAP_PCT) / 100n + ret;
        (quoted[cid] = quoted[cid] || {})[kind] = q + ret;
      }
      return { fees, caps, quoted };
    };
    const g1 = (cid, kind, x) => (kind === "chain" ? C.CHAIN_GAS : guessGas(x.gauges.length + (x.dealloc > 0n ? 1 : 0), nOld(cid)));
    const r1 = await Promise.all(live.map((s) => feesFor(s, g1)));
    const calls1 = live.map((s, i) => encodeStep(ethers, { tokenId: p.tokenId, owner: p.owner, step: s, fees: r1[i].fees }));
    const baseGauges = (i) => (live[i].gaugeDispatches.find((g) => g.chainId === C.BASE) || { gauges: [] }).gauges.map((g) => g.gauge);
    const sim1 = live.length ? await simBase(ethers, rpc, p.owner, calls1, openAt(live[0]), p.tokenId, baseGauges) : [];
    const out = [];
    for (let i = 0; i < plan.steps.length; i++) {
      const s = plan.steps[i], touchedNets = touched(s);
      if (i >= live.length) { out.push({ step: s, ok: false, waiting: true, why: `waits for ${s.waitFor.map(netName).join(" + ")} to hand AERO back to Base`, touched: touchedNets, openAt: openAt(s) }); continue; }
      const sm = sim1[i];
      if (!sm.ok) { out.push({ step: s, ok: false, why: "the Base call failed: " + sm.err, err: sm.err, touched: touchedNets, openAt: openAt(s) }); break; }
      // expected messages: per network, the chain message (if it gets AERO) then the vote, in ascending network order
      const want = s.chainDispatches.filter((c) => c.chainId !== C.BASE).map((c) => [c.chainId, "chain"]).concat(s.gaugeDispatches.filter((g) => g.chainId !== C.BASE).map((g) => [g.chainId, "gauge"]));
      if (sm.msgs.length !== want.length || sm.msgs.some((m, k) => m.cid !== want[k][0])) { out.push({ step: s, ok: false, why: "the Base call didn't send the expected network messages", touched: touchedNets, openAt: openAt(s) }); break; }
      const msgOf = (cid, kind) => sm.msgs[want.findIndex((w) => w[0] === cid && w[1] === kind)].body;
      // replay on each other network, at the later of arrival and that network's clock
      const leaf = {};
      await Promise.all([...new Set(want.map((w) => w[0]))].map(async (cid) => {   // each network's replay at once
        const msgs = want.map((w, k) => (w[0] === cid ? sm.msgs[k] : null)).filter(Boolean);
        const gs = (s.gaugeDispatches.find((g) => g.chainId === cid) || { gauges: [] }).gauges.map((g) => g.gauge);
        const at = Math.max(openAt(s), now) + arrive;
        try { leaf[cid] = await simLeaf(ethers, rpc, cid, p.tokenId, msgs, gs, Math.max(at, (opens[cid] || 0) + 60)); }
        catch (e) { leaf[cid] = { error: e.message || String(e) }; }
      }));
      // gas for each message = what it used there x 1.4 + 60k, rounded up to 50k; then the exact quote for the exact message
      const used = (cid, kind) => { const L = leaf[cid]; if (!L || !L.handled) return null; const k = want.filter((w) => w[0] === cid).findIndex((w) => w[1] === kind); return L.handled[k] ? L.handled[k].gas : null; };
      const g2 = (cid, kind) => { const u = used(cid, kind); return u ? Math.min(C.GAS_MAX, Math.max(C.GAS_MIN, roundUp(u * 1.4 + 60000, 50000))) : (kind === "chain" ? C.CHAIN_GAS : C.GAS_MAX); };
      const r2 = await feesFor(s, g2, msgOf);
      const call = encodeStep(ethers, { tokenId: p.tokenId, owner: p.owner, step: s, fees: r2.fees });
      // what landed there, checked
      let ok = true, why = "";
      const bd = s.gaugeDispatches.find((g) => g.chainId === C.BASE);
      if (bd) { const w = voteMatches(sm.base, bd, plan.target[C.BASE]); if (w) { ok = false; why = "Base " + w; } }
      for (const [cid, L] of ok ? Object.entries(leaf) : []) {
        const c = Number(cid), d = s.gaugeDispatches.find((g) => g.chainId === c);
        if (L.error) { ok = false; why = `${netName(c)} rehearsal unavailable (${L.error.slice(0, 120)})`; break; }
        const bad = L.handled.find((h) => !h.ok);
        if (bad) { ok = false; why = `${netName(c)} would refuse it: ${/aa9a98df/.test(bad.err) ? "its 47-hour clock is still running" : bad.err.slice(0, 160)}`; break; }
        if (d) { const w = voteMatches(L, d, plan.target[c]); if (w) { ok = false; why = `${netName(c)} ${w}`; break; } }
      }
      if (ok && call.total > C.HARD_CAP) { ok = false; why = "fees above 0.03 ETH"; }
      const g = ok ? checkStep(ethers, call, { tokenId: p.tokenId, owner: p.owner, account: p.owner, step: s, before: plan.before, allowed: p.allowed, caps: r2.caps }) : { ok: true };
      if (!g.ok) { ok = false; why = "safety check: " + g.why; }
      out.push({ step: s, call, fees: r2.fees, caps: r2.caps, quoted: r2.quoted, baseGas: sm.gas, leaf, ok, why, touched: touchedNets, openAt: openAt(s), bridge });
      if (!ok) break;
    }
    const ok = out.length > 0 && out.every((x) => x.ok || x.waiting) && out[0].ok;
    return { plan, steps: out, ok, why: ok ? "" : (out.find((x) => !x.ok && !x.waiting) || {}).why || "" };
  }

  return { C, ABI, ID_OF, netName, targetLegs, planSteps, budgets, voteList, encodeStep, checkStep, readBridge, quote, simBase, simLeaf, dryRun };
});
