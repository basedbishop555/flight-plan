/* allocate-lib.js: builds and checks the Base-only allocate call (the page dry-runs it, then sends it only after the
 * owner signs; cross-network calls, which carry Hyperlane fees, are allocate-x.js's):
 * root Voter.allocate(tokenId, chainDispatches, gaugeDispatches, refundRecipient) on Base, for a stake the
 * connected account owns, value 0. The encoding was proved byte-for-byte against real
 * allocate transactions signed in the Aero app (October 2026).
 *
 * Shape proved from those transactions + V3/src/voter/Voter.sol (dromos-labs/metadex-public):
 *   re-vote (power already booked on Base): chainDispatches = []
 *   first allocation (power parked on CHAIN0): chainDispatches = [{8453, delta = staked - booked, 0, 0}]
 *   gaugeDispatches = [{chainId 8453, gasLimit 0 (root-local delivery), value 0,
 *                       gauges strictly ascending by address, allocated in wei summing EXACTLY to the
 *                       chain budget, data 0x}]
 *   refundRecipient = the owner; msg.value 0 (Hyperlane fees only exist off-Base). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AeroAlloc = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const C = {
    CHAIN_ID: 8453, CHAIN_HEX: "0x2105",
    VOTER: "0x49d7d4f17ec56ef8fa04e464af5d1a4942cc31e6",       // root Voter (Base)
    LEAF: "0x382409fad8503fbcdbb27a4211551fa03e884078",        // LeafVoter (Base)
    SAERO: "0xbf7977e1521e9a3032bf7243ee4712f311f13915",       // sAERO escrow (VotingEscrow)
    MC3: "0xcA11bde05977b3631167028862bE2a173976CA11",
    RPC: "https://base-rpc.publicnode.com",
    ALLOCATE_SELECTOR: "0xf02e634e",
  };
  const ABI = {
    voter: [
      "function allocate(uint256 tokenId,(uint256 chainId,uint128 delta,uint256 gasLimit,uint256 value)[] chainDispatches,(uint256 chainId,uint256 gasLimit,uint256 value,(address gauge,uint128 allocated,bytes data)[] gauges)[] gaugeDispatches,address refundRecipient) payable",
      "function allocationChainAmounts(uint256 tokenId,uint256 chainId) view returns (uint128)",
    ],
    leaf: [
      "function tokenStates(uint256 tokenId) view returns (address operator,uint48 lastAllocated,bool canVoteForZeroCapGauges,uint128 chainAllocation)",
      "function allocatedGauges(uint256 tokenId) view returns (address[])",
      "function allocations(uint256 tokenId,address gauge) view returns (uint128)",
      "function allocationCooldown() view returns (uint48)",
    ],
    saero: [
      "function ownerOf(uint256 tokenId) view returns (address)",
      "function staked(uint256 tokenId) view returns (uint256 amount,uint256 end,bool isPermanent)",
    ],
    mc3: ["function tryAggregate(bool requireSuccess,(address target,bytes callData)[] calls) returns ((bool success,bytes returnData)[])"],
  };
  const lower = (a) => String(a).toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a));

  /** split rows {gauge, pct, label, pool} + budget (BigInt wei) -> legs sorted ascending by gauge address,
   *  allocated = floor(budget * pct / 100), remainder (from integer division) added to the largest leg so the
   *  sum equals the budget exactly (the contract reverts ChainAllocationMismatch otherwise). */
  function legs(split, budget) {
    if (!Array.isArray(split) || !split.length) throw new Error("empty split");
    const rows = split.map((s) => {
      if (!isAddr(s.gauge)) throw new Error(`no gauge address for ${s.label || s.pool}`);
      const pct = Number(s.pct);
      if (!(pct > 0) || pct > 100) throw new Error(`bad pct for ${s.label}`);
      return { gauge: lower(s.gauge), pct, label: s.label, pool: s.pool, allocated: (budget * BigInt(Math.round(pct * 100))) / 10000n };
    });
    const total = rows.reduce((n, r) => n + r.pct, 0);
    if (Math.abs(total - 100) > 1e-9) throw new Error(`split sums to ${total}%, not 100%`);
    const seen = new Set();
    for (const r of rows) { if (seen.has(r.gauge)) throw new Error(`gauge ${r.gauge} listed twice`); seen.add(r.gauge); }
    let sum = rows.reduce((n, r) => n + r.allocated, 0n);
    if (sum > budget) throw new Error("rounding overshoot");
    if (sum < budget) { const big = rows.reduce((a, b) => (b.allocated > a.allocated ? b : a)); big.allocated += budget - sum; }
    rows.sort((a, b) => (BigInt(a.gauge) < BigInt(b.gauge) ? -1 : 1));
    for (const r of rows) if (r.allocated <= 0n) throw new Error(`zero allocation for ${r.label}`);
    return rows;
  }

  /** {ethers, tokenId, owner, staked(BigInt), booked(BigInt = root allocationChainAmounts on Base), split}
   *  -> {to, data, value, legs, delta, chainDispatches, gaugeDispatches} */
  function buildAllocate(ethers, p) {
    const I = new ethers.Interface(ABI.voter);
    const owner = ethers.getAddress(p.owner);
    const staked = BigInt(p.staked), booked = BigInt(p.booked);
    if (staked <= 0n) throw new Error("stake reads as 0");
    if (booked > staked) throw new Error("booked more than staked (unexpected)");
    const delta = staked - booked;                       // power still parked on CHAIN0 (first allocation only)
    const L = legs(p.split, staked);
    const chainDispatches = delta > 0n ? [[BigInt(C.CHAIN_ID), delta, 0n, 0n]] : [];
    const gaugeDispatches = [[BigInt(C.CHAIN_ID), 0n, 0n, L.map((l) => [ethers.getAddress(l.gauge), l.allocated, "0x"])]];
    const data = I.encodeFunctionData("allocate", [BigInt(p.tokenId), chainDispatches, gaugeDispatches, owner]);
    return { to: ethers.getAddress(C.VOTER), data, value: "0x0", legs: L, delta, chainDispatches, gaugeDispatches, owner, tokenId: Number(p.tokenId) };
  }

  /** The send guard. Decodes the call and refuses anything but allocate(ownedTokenId, Base-only, value 0,
   *  refund = account, sum = staked). Returns {ok, why}. */
  function checkCall(ethers, call, ctx) {
    try {
      if (lower(call.to) !== C.VOTER) return { ok: false, why: "to is not the Voter" };
      if (call.value && call.value !== "0x0" && BigInt(call.value) !== 0n) return { ok: false, why: "value must be 0" };
      if (!String(call.data).toLowerCase().startsWith(C.ALLOCATE_SELECTOR)) return { ok: false, why: "not allocate()" };
      const I = new ethers.Interface(ABI.voter);
      const [tokenId, chains, gauges, refund] = I.decodeFunctionData("allocate", call.data);
      if (Number(tokenId) !== Number(ctx.tokenId)) return { ok: false, why: "tokenId differs from the stake shown" };
      if (lower(ctx.owner) !== lower(ctx.account)) return { ok: false, why: "connected account does not own this stake" };
      if (lower(refund) !== lower(ctx.account)) return { ok: false, why: "refund recipient is not you" };
      for (const c of chains) {
        if (Number(c.chainId) !== C.CHAIN_ID || c.value !== 0n || c.gasLimit !== 0n) return { ok: false, why: "chain dispatch is not Base-only / zero-value" };
        if (c.delta !== BigInt(ctx.staked) - BigInt(ctx.booked)) return { ok: false, why: "chain delta differs from staked - booked" };
      }
      if (gauges.length !== 1) return { ok: false, why: "exactly one gauge dispatch (Base) expected" };
      const g = gauges[0];
      if (Number(g.chainId) !== C.CHAIN_ID || g.value !== 0n || g.gasLimit !== 0n) return { ok: false, why: "gauge dispatch is not Base / zero-value / gasLimit 0" };
      let sum = 0n, prev = 0n;
      for (const x of g.gauges) {
        if (BigInt(x.gauge) <= prev && sum > 0n) return { ok: false, why: "gauges not strictly ascending" };
        prev = BigInt(x.gauge); sum += x.allocated;
        if (x.data !== "0x") return { ok: false, why: "unexpected per-gauge data" };
      }
      if (sum !== BigInt(ctx.staked)) return { ok: false, why: "allocations do not sum to the stake" };
      if (ctx.allowedGauges && !g.gauges.every((x) => ctx.allowedGauges.has(lower(x.gauge)))) return { ok: false, why: "a gauge is not in the plan" };
      return { ok: true, why: "" };
    } catch (e) { return { ok: false, why: "decode failed: " + (e.message || e) }; }
  }

  return { C, ABI, legs, buildAllocate, checkCall };
});
