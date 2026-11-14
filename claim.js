/* claim.js: claim a lock's rewards on Base, and compound AERO into a lock (11/11/2026).
 *
 * Claim = ONE Voter.claimRewards(tokenId, params, refundRecipient) on Base per lock, value 0, to the same root Voter
 * the allocations go to. Shape proved byte-for-byte against real claims signed in the Aero app (November 2026):
 *   params = [{chainId 8453, gasLimit 0, value 0, recipient = the owner,
 *              feeClaims [{votingRewardsManager, maxCheckpoints}],
 *              incentiveClaims [{votingRewardsManager, programId, maxCheckpoints}]}]
 *   refundRecipient = the owner. The rewards manager pays the tokens straight to `recipient`.
 * Only rewards on Base are claimed here; rewards waiting on another network are claimed in the Aero app.
 *
 * Compound = two calls: AERO.approve(sAERO escrow, exactly the amount), then
 * escrow.increaseStakeAmount(tokenId, amount) for a lock the account owns. The approval is on the AERO TOKEN, for
 * the exact amount, and is used up by the second call. It is never an approval on the lock itself.
 *
 * Like allocate-lib.js: builders, then guards that decode a call and refuse anything else. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AeroClaim = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const C = {
    CHAIN_ID: 8453,
    VOTER: "0x49d7d4f17ec56ef8fa04e464af5d1a4942cc31e6",       // root Voter (Base)
    SAERO: "0xbf7977e1521e9a3032bf7243ee4712f311f13915",       // sAERO escrow (VotingEscrow)
    AERO: "0x3f5bf3edac59d650d8fdf9657a71f2f904a3a4ee",        // escrow.TOKEN(), re-read live before every compound
    CLAIM_SELECTOR: "0x28b54326", APPROVE_SELECTOR: "0x095ea7b3",
    MAX_CP: 50,                 // checkpoints processed per claim (the Aero app sends a lock's own count, 6 to 8 so far)
    MAX_CLAIMS: 120,            // fee + incentive entries in one call (gas stays far under a block)
  };
  const ABI = {
    voter: ["function claimRewards(uint256 tokenId,(uint256 chainId,uint256 gasLimit,uint256 value,address recipient,(address votingRewardsManager,uint256 maxCheckpoints)[] feeClaims,(address votingRewardsManager,uint256 programId,uint256 maxCheckpoints)[] incentiveClaims)[] params,address refundRecipient) payable"],
    vrm: ["function token0() view returns (address)", "function token1() view returns (address)", "function incentiveCount() view returns (uint256)",
          "function earnedFees(uint256 tokenId,uint256 maxCheckpoints) view returns (uint256,uint256)",
          "function earnedIncentives(uint256 tokenId,uint256 programId,uint256 maxCheckpoints) view returns (uint256)"],
    registry: ["function gaugeToRewards(address) view returns (address)"],
    escrow: ["function increaseStakeAmount(uint256 tokenId,uint128 value)", "function TOKEN() view returns (address)"],
    erc20: ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)", "function symbol() view returns (string)", "function decimals() view returns (uint8)"],
  };
  const lower = (a) => String(a).toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a));
  const ZERO = "0x0000000000000000000000000000000000000000";

  /** What each lock can claim on Base right now.
   *  mc = async (calls [{target, callData}]) => [{success, returnData}] (the page's multicall)
   *  p = {ids: [tokenId], gauges: [Base gauge address], registry}
   *  -> {vrms: Set(lowercase), byLock: {id: {fees: [{vrm, t0, t1, a0, a1}], incs: [{vrm, pid, tok, amt}]}}, tokens: Set}
   *  Every Base pool on the scanner's list is asked, so rewards from pools a lock has since left are found too. */
  async function scan(ethers, mc, p) {
    const R = new ethers.Interface(ABI.registry), V = new ethers.Interface(ABI.vrm);
    const ok = (r) => r && r.success && r.returnData.length >= 66;
    const gauges = [...new Set(p.gauges.map(lower))].filter(isAddr);
    const r1 = await mc(gauges.map((g) => ({ target: p.registry, callData: R.encodeFunctionData("gaugeToRewards", [g]) })));
    const vrms = [...new Set(r1.map((r) => (ok(r) ? lower(R.decodeFunctionResult("gaugeToRewards", r.returnData)[0]) : null)).filter((v) => v && v !== ZERO))];
    const r2 = await mc(vrms.flatMap((v) => ["token0", "token1", "incentiveCount"].map((f) => ({ target: v, callData: V.encodeFunctionData(f, []) }))));
    const meta = {};
    vrms.forEach((v, k) => {
      const a = r2.slice(3 * k, 3 * k + 3);
      meta[v] = { t0: ok(a[0]) ? lower(V.decodeFunctionResult("token0", a[0].returnData)[0]) : null, t1: ok(a[1]) ? lower(V.decodeFunctionResult("token1", a[1].returnData)[0]) : null,
                  n: ok(a[2]) ? Math.min(40, Number(V.decodeFunctionResult("incentiveCount", a[2].returnData)[0])) : 0 };
    });
    const q = [], idx = [];
    for (const id of p.ids) for (const v of vrms) {
      q.push({ target: v, callData: V.encodeFunctionData("earnedFees", [id, C.MAX_CP]) }); idx.push([id, v, 0]);
      for (let pid = 1; pid <= meta[v].n; pid++) { q.push({ target: v, callData: V.encodeFunctionData("earnedIncentives", [id, pid, C.MAX_CP]) }); idx.push([id, v, pid]); }
    }
    const r3 = q.length ? await mc(q) : [];
    const byLock = {}, incQ = [];
    for (const id of p.ids) byLock[id] = { fees: [], incs: [] };
    r3.forEach((r, i) => {
      if (!ok(r)) return;
      const [id, v, pid] = idx[i];
      if (pid === 0) { const [a0, a1] = V.decodeFunctionResult("earnedFees", r.returnData); if (a0 > 0n || a1 > 0n) byLock[id].fees.push({ vrm: v, t0: meta[v].t0, t1: meta[v].t1, a0, a1 }); }
      else { const [amt] = V.decodeFunctionResult("earnedIncentives", r.returnData); if (amt > 0n) { const e = { vrm: v, pid, tok: null, amt }; byLock[id].incs.push(e); incQ.push(e); } }
    });
    // the reward token of each program that has something waiting (word 0 of incentive(programId))
    const r4 = incQ.length ? await mc(incQ.map((e) => ({ target: e.vrm, callData: "0x" + ethers.id("incentive(uint256)").slice(2, 10) + e.pid.toString(16).padStart(64, "0") }))) : [];
    r4.forEach((r, i) => { if (ok(r)) { const word0 = r.returnData.slice(26, 66); incQ[i].tok = lower(`0x${word0}`); } });
    const tokens = new Set();
    for (const L of Object.values(byLock)) { for (const f of L.fees) { if (f.a0 > 0n && f.t0) tokens.add(f.t0); if (f.a1 > 0n && f.t1) tokens.add(f.t1); } for (const e of L.incs) if (e.tok) tokens.add(e.tok); }
    return { vrms: new Set(vrms), byLock, tokens };
  }

  /** {tokenId, owner, fees: [{vrm}], incs: [{vrm, pid}]} -> {to, data, value "0x0", tokenId, owner, n} */
  function buildClaim(ethers, p) {
    const I = new ethers.Interface(ABI.voter), owner = ethers.getAddress(p.owner);
    const fees = [...new Set(p.fees.map((f) => lower(f.vrm)))].map((v) => [ethers.getAddress(v), BigInt(C.MAX_CP)]);
    const seen = new Set(), incs = [];
    for (const e of p.incs) { const k = lower(e.vrm) + ":" + e.pid; if (seen.has(k)) continue; seen.add(k); incs.push([ethers.getAddress(e.vrm), BigInt(e.pid), BigInt(C.MAX_CP)]); }
    if (!fees.length && !incs.length) throw new Error("nothing to claim");
    if (fees.length + incs.length > C.MAX_CLAIMS) throw new Error("too many rewards for one claim");
    const data = I.encodeFunctionData("claimRewards", [BigInt(p.tokenId), [[BigInt(C.CHAIN_ID), 0n, 0n, owner, fees, incs]], owner]);
    return { to: ethers.getAddress(C.VOTER), data, value: "0x0", tokenId: Number(p.tokenId), owner, n: fees.length + incs.length };
  }

  /** The claim guard: claimRewards(owned tokenId) to the root Voter, value 0, exactly one Base entry with no gas limit
   *  and no fee, rewards paid to you, refund to you, every rewards manager one the Aero registry returned for a pool on
   *  the scanner's list, sane checkpoint caps. ctx = {tokenId, owner, account, vrms: Set(lowercase)} */
  function checkClaim(ethers, call, ctx) {
    try {
      if (lower(call.to) !== C.VOTER) return { ok: false, why: "to is not the Voter" };
      if (call.value && BigInt(call.value) !== 0n) return { ok: false, why: "value must be 0" };
      if (!lower(call.data).startsWith(C.CLAIM_SELECTOR)) return { ok: false, why: "not claimRewards()" };
      const [tokenId, params, refund] = new ethers.Interface(ABI.voter).decodeFunctionData("claimRewards", call.data);
      if (Number(tokenId) !== Number(ctx.tokenId)) return { ok: false, why: "tokenId differs from the lock shown" };
      if (lower(ctx.owner) !== lower(ctx.account)) return { ok: false, why: "connected account does not own this lock" };
      if (lower(refund) !== lower(ctx.account)) return { ok: false, why: "refund recipient is not you" };
      if (params.length !== 1) return { ok: false, why: "exactly one network entry (Base) expected" };
      const c = params[0];
      if (Number(c.chainId) !== C.CHAIN_ID || c.gasLimit !== 0n || c.value !== 0n) return { ok: false, why: "entry is not Base / zero gas limit / zero fee" };
      if (lower(c.recipient) !== lower(ctx.account)) return { ok: false, why: "rewards would not be paid to you" };
      const n = c.feeClaims.length + c.incentiveClaims.length;
      if (!n || n > C.MAX_CLAIMS) return { ok: false, why: "claim list is empty or too long" };
      for (const f of c.feeClaims) if (!ctx.vrms.has(lower(f.votingRewardsManager)) || f.maxCheckpoints !== BigInt(C.MAX_CP)) return { ok: false, why: "a fee claim names an unknown rewards contract" };
      for (const e of c.incentiveClaims) if (!ctx.vrms.has(lower(e.votingRewardsManager)) || e.maxCheckpoints !== BigInt(C.MAX_CP) || !(e.programId > 0n)) return { ok: false, why: "an incentive claim names an unknown rewards contract" };
      return { ok: true, why: "" };
    } catch (e) { return { ok: false, why: "decode failed: " + (e.message || e) }; }
  }

  /** {tokenId, amount (wei)} -> [approve AERO -> escrow for exactly amount, increaseStakeAmount(tokenId, amount)] */
  function buildCompound(ethers, p) {
    const amount = BigInt(p.amount);
    if (!(amount > 0n) || amount >= 1n << 128n) throw new Error("bad amount");
    const T = new ethers.Interface(ABI.erc20), E = new ethers.Interface(ABI.escrow);
    return [
      { to: ethers.getAddress(C.AERO), data: T.encodeFunctionData("approve", [ethers.getAddress(C.SAERO), amount]), value: "0x0", kind: "approve" },
      { to: ethers.getAddress(C.SAERO), data: E.encodeFunctionData("increaseStakeAmount", [BigInt(p.tokenId), amount]), value: "0x0", kind: "increase" },
    ];
  }

  /** The compound guard. A call may only be (a) AERO.approve(escrow, exactly ctx.amount) or (b)
   *  escrow.increaseStakeAmount(ctx.tokenId, exactly ctx.amount) for a lock the account owns, value 0, and the amount
   *  no more than the AERO the wallet holds. Anything else to the escrow (approve, setApprovalForAll, transfer,
   *  withdraw ...) is refused by selector. ctx = {tokenId, owner, account, amount, balance, token (escrow.TOKEN() live)} */
  function checkCompound(ethers, call, ctx) {
    try {
      const T = new ethers.Interface(ABI.erc20), E = new ethers.Interface(ABI.escrow), to = lower(call.to), d = lower(call.data), amount = BigInt(ctx.amount);
      if (call.value && BigInt(call.value) !== 0n) return { ok: false, why: "value must be 0" };
      if (lower(ctx.token) !== C.AERO) return { ok: false, why: "the escrow's token is not the AERO this page knows" };
      if (lower(ctx.owner) !== lower(ctx.account)) return { ok: false, why: "connected account does not own this lock" };
      if (!(amount > 0n) || amount > BigInt(ctx.balance)) return { ok: false, why: "amount is more than the AERO in the wallet" };
      if (to === C.AERO) {
        if (!d.startsWith(C.APPROVE_SELECTOR)) return { ok: false, why: "not approve()" };
        const [spender, amt] = T.decodeFunctionData("approve", call.data);
        if (lower(spender) !== C.SAERO) return { ok: false, why: "spender is not the sAERO escrow" };
        if (amt !== amount) return { ok: false, why: "approval is not exactly the amount shown" };
        return { ok: true, why: "" };
      }
      if (to === C.SAERO) {
        if (!d.startsWith(E.getFunction("increaseStakeAmount").selector)) return { ok: false, why: "not increaseStakeAmount()" };
        const [tokenId, amt] = E.decodeFunctionData("increaseStakeAmount", call.data);
        if (Number(tokenId) !== Number(ctx.tokenId)) return { ok: false, why: "tokenId differs from the lock shown" };
        if (amt !== amount) return { ok: false, why: "amount differs from the one shown" };
        return { ok: true, why: "" };
      }
      return { ok: false, why: "to is neither AERO nor the sAERO escrow" };
    } catch (e) { return { ok: false, why: "decode failed: " + (e.message || e) }; }
  }

  return { C, ABI, scan, buildClaim, checkClaim, buildCompound, checkCompound };
});
