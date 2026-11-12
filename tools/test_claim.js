// node tools/test_claim.js : the claim + compound builders and guards, then live rehearsals (eth_simulateV1; nothing is sent).
const fs = require("fs"), path = require("path");
const { ethers } = require("../vendor/ethers-6.13.4.umd.min.js");
const K = require("../claim.js"), A = require("../allocate-lib.js");
const RPC = "https://base-rpc.publicnode.com", HIST = "https://base.gateway.tenderly.co";
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "plan.json")));
let bad = 0;
const t = (name, ok, extra) => { if (!ok) bad++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ": " + extra : ""}`); };
async function rpc(url, method, params) {
  const j = await (await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
  if (j.error) throw new Error(method + ": " + JSON.stringify(j.error).slice(0, 200)); return j.result;
}
const MC = new ethers.Interface(A.ABI.mc3);
async function mc(calls) {
  const out = [];
  for (let i = 0; i < calls.length; i += 150) {
    const raw = await rpc(RPC, "eth_call", [{ to: A.C.MC3, data: MC.encodeFunctionData("tryAggregate", [false, calls.slice(i, i + 150)]) }, "latest"]);
    out.push(...MC.decodeFunctionResult("tryAggregate", raw)[0].map(r => ({ success: r[0], returnData: r[1] })));
  }
  return out;
}
(async () => {
  // 1. the encoding, against a real claim signed in the Aero app
  const real = await rpc(HIST, "eth_getTransactionByHash", ["0xdabf35c282e4984714ab2f13641ffab473b1dec507db7ec26a6714aa308a447f"]);
  const I = new ethers.Interface(K.ABI.voter), d = I.decodeFunctionData("claimRewards", real.input);
  t("real claim decodes and re-encodes byte for byte", I.encodeFunctionData("claimRewards", [d[0], d[1], d[2]]) === real.input && real.input.startsWith(K.C.CLAIM_SELECTOR));
  // 2. guards on a built call
  const me = "0x1111111111111111111111111111111111111111", other = "0x2222222222222222222222222222222222222222", v1 = "0x3333333333333333333333333333333333333333", v2 = "0x4444444444444444444444444444444444444444";
  const call = K.buildClaim(ethers, { tokenId: 7, owner: me, fees: [{ vrm: v1 }, { vrm: v1 }], incs: [{ vrm: v2, pid: 3 }] });
  const ctx = { tokenId: 7, owner: me, account: me, vrms: new Set([v1, v2]) };
  t("guard passes the built claim", K.checkClaim(ethers, call, ctx).ok);
  const mut = (f) => { const x = I.decodeFunctionData("claimRewards", call.data).toArray(true); const p = x[1].map(e => e.slice()); f(x, p); return { ...call, data: I.encodeFunctionData("claimRewards", [x[0], p, x[2]]) }; };
  const no = (name, c, cx) => { const g = K.checkClaim(ethers, c, cx || ctx); t("guard refuses " + name, !g.ok, g.why); };
  no("rewards paid to someone else", mut((x, p) => { p[0][3] = other; }));
  no("refund to someone else", mut((x) => { x[2] = other; }));
  no("another lock id", mut((x) => { x[0] = 8n; }));
  no("a fee on the Base entry", mut((x, p) => { p[0][2] = 1n; }));
  no("another network", mut((x, p) => { p[0][0] = 10n; p[0][1] = 300000n; }));
  no("an unknown rewards contract", call, { ...ctx, vrms: new Set([v1]) });
  no("a wallet that doesn't own the lock", call, { ...ctx, account: other });
  no("ETH attached", { ...call, value: "0x1" });
  no("a call to the escrow", { ...call, to: K.C.SAERO });
  no("another method", { ...call, data: "0xf02e634e" + call.data.slice(10) });
  // compound guards
  const cc = K.buildCompound(ethers, { tokenId: 7, amount: 5n * 10n ** 18n }), cx = { tokenId: 7, owner: me, account: me, amount: 5n * 10n ** 18n, balance: 6n * 10n ** 18n, token: K.C.AERO };
  t("compound guard passes both built calls", cc.every(c => K.checkCompound(ethers, c, cx).ok));
  const T = new ethers.Interface(K.ABI.erc20), E = new ethers.Interface(["function setApprovalForAll(address,bool)", "function approve(address,uint256)", "function increaseStakeAmount(uint256,uint128)"]);
  const noc = (name, c, x) => { const g = K.checkCompound(ethers, c, x || cx); t("compound guard refuses " + name, !g.ok, g.why); };
  noc("an unlimited approval", { ...cc[0], data: T.encodeFunctionData("approve", [K.C.SAERO, ethers.MaxUint256]) });
  noc("an approval to another spender", { ...cc[0], data: T.encodeFunctionData("approve", [other, 5n * 10n ** 18n]) });
  noc("setApprovalForAll on the escrow", { ...cc[1], data: E.encodeFunctionData("setApprovalForAll", [other, true]) });
  noc("approve on the escrow (the lock)", { ...cc[1], data: E.encodeFunctionData("approve", [other, 7n]) });
  noc("another lock id", { ...cc[1], data: E.encodeFunctionData("increaseStakeAmount", [8n, 5n * 10n ** 18n]) });
  noc("more than the wallet holds", cc[1], { ...cx, balance: 1n });
  noc("a lock the wallet doesn't own", cc[1], { ...cx, account: other });
  noc("a different escrow token", cc[0], { ...cx, token: other });
  noc("a call to any other contract", { ...cc[0], to: other });
  // 3. live: what lock #697's owner can claim, rehearsed from the owner's address
  const S = new ethers.Interface(A.ABI.saero.concat(["function TOKEN() view returns (address)"])), B = new ethers.Interface(K.ABI.erc20);
  for (const id of [697, 966]) {
    const owner = S.decodeFunctionResult("ownerOf", await rpc(RPC, "eth_call", [{ to: A.C.SAERO, data: S.encodeFunctionData("ownerOf", [id]) }, "latest"]))[0];
    const t0 = Date.now(), sc = await K.scan(ethers, mc, { ids: [id], gauges: D.gauges.filter(g => (g.chain || "base") === "base").map(g => g.gauge), registry: D.factory_registry });
    const L = sc.byLock[id], n = L.fees.length + L.incs.length;
    console.log(`      #${id}: ${sc.vrms.size} rewards contracts asked, ${L.fees.length} fee + ${L.incs.length} incentive claims, ${sc.tokens.size} tokens (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (!n) { console.log("      nothing waiting; live rehearsal skipped"); continue; }
    const c = K.buildClaim(ethers, { tokenId: id, owner, fees: L.fees, incs: L.incs });
    t(`#${id} built claim passes the guard`, K.checkClaim(ethers, c, { tokenId: id, owner, account: owner, vrms: sc.vrms }).ok);
    const toks = [...sc.tokens], bal = toks.map(x => ({ from: owner, to: x, data: B.encodeFunctionData("balanceOf", [owner]) }));
    const res = (await rpc(RPC, "eth_simulateV1", [{ blockStateCalls: [{ calls: [...bal, { from: owner, to: c.to, data: c.data, value: "0x0", gas: "0x1c9c380" }, ...bal] }], validation: false }, "latest"]))[0].calls;
    const r = res[toks.length], up = toks.filter((x, i) => BigInt(res[toks.length + 1 + i].returnData) > BigInt(res[i].returnData)).length;
    t(`#${id} live claim rehearsal`, r.status === "0x1" && up > 0, `${r.status === "0x1" ? "OK" : JSON.stringify(r.error || r.returnData).slice(0, 160)}, gas ${parseInt(r.gasUsed, 16).toLocaleString()}, ${up} of ${toks.length} token balances rose`);
  }
  // 4. live: compound 1 AERO into #697 from its owner's wallet
  {
    const id = 697, amount = 10n ** 18n;
    const owner = S.decodeFunctionResult("ownerOf", await rpc(RPC, "eth_call", [{ to: A.C.SAERO, data: S.encodeFunctionData("ownerOf", [id]) }, "latest"]))[0];
    const token = S.decodeFunctionResult("TOKEN", await rpc(RPC, "eth_call", [{ to: A.C.SAERO, data: S.encodeFunctionData("TOKEN", []) }, "latest"]))[0];
    t("the escrow's token is the pinned AERO", token.toLowerCase() === K.C.AERO);
    const balance = BigInt(await rpc(RPC, "eth_call", [{ to: K.C.AERO, data: B.encodeFunctionData("balanceOf", [owner]) }, "latest"]));
    if (balance < amount) console.log("      owner holds under 1 AERO; live compound rehearsal skipped");
    else {
      const calls = K.buildCompound(ethers, { tokenId: id, amount }), st = { from: owner, to: A.C.SAERO, data: S.encodeFunctionData("staked", [id]) };
      t("built compound passes the guard", calls.every(c => K.checkCompound(ethers, c, { tokenId: id, owner, account: owner, amount, balance, token }).ok));
      const res = (await rpc(RPC, "eth_simulateV1", [{ blockStateCalls: [{ calls: [st, ...calls.map(c => ({ from: owner, to: c.to, data: c.data, gas: "0x1e8480" })), st] }], validation: false }, "latest"]))[0].calls;
      const s0 = S.decodeFunctionResult("staked", res[0].returnData)[0], s1 = res[3].status === "0x1" ? S.decodeFunctionResult("staked", res[3].returnData)[0] : 0n;
      t("live compound rehearsal: the lock grows by exactly the amount", res[1].status === "0x1" && res[2].status === "0x1" && s1 - s0 === amount, `${ethers.formatUnits(s0, 18)} -> ${ethers.formatUnits(s1, 18)} AERO, gas ${parseInt(res[1].gasUsed, 16) + parseInt(res[2].gasUsed, 16)}${res[2].status === "0x1" ? "" : " " + JSON.stringify(res[2].error || "").slice(0, 160)}`);
    }
  }
  console.log(bad ? `\n${bad} FAILURE(S)` : "\nall claim + compound tests passed"); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
