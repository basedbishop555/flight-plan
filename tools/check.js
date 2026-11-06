// node tools/check.js : the browser planner must give the same split as the reference planner on the same data.
const fs = require("fs"), path = require("path");
const P = require("../planner.js");
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "plan.json")));
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, "reference.json")));
let bad = 0;
for (const r of ref) {
  const out = P.plan(D, r.aero, r.start, r.n_pools, null, { baseOnly: true });   // the reference planner (plan.py) is Base only
  const got = out.legs.map(l => [l.row.gid, l.pct]);
  const same = JSON.stringify(got) === JSON.stringify(r.split) && Math.abs(Math.round(out.expect_usd) - r.expect_usd) <= 1;
  if (!same) bad++;
  console.log(`${same ? "PASS" : "FAIL"}  ${r.aero} AERO, ${r.n_pools || "auto"} pools: ${got.map(g => g[1] + "%").join(" ")} ~$${out.expect_usd.toFixed(2)}` +
    (same ? "" : `\n      want ${JSON.stringify(r.split)} $${r.expect_usd}\n      got  ${JSON.stringify(got)}`));
}
// "Base only" off (11/6/2026): another network is added only when it beats the split without it by 10% and $0.25 a
// window after its costs, so the plan is never worse than Base alone; each network's cost is charged once
for (const aero of [1000, 30143, 300000, 2000000]) for (const memory of [0.25, 0.5]) {
  const o = { memory, caution: memory === 0.25 ? 1.4 : 1 }, st = D.starts[0];
  const b = P.plan(D, aero, st, null, null, { ...o, baseOnly: true }), x = P.plan(D, aero, st, null, null, o);
  const costs = x.legs.reduce((t, l) => t + (l.cost || 0), 0), nets = new Set(x.legs.filter(l => l.chain).map(l => l.chain));
  const ok = Math.abs(x.base_usd - b.expect_usd) < 1e-6
    && (x.nets.length ? x.expect_usd - b.expect_usd >= Math.max(0.25, 0.1 * b.expect_usd) - 1e-9 : x.expect_usd === b.expect_usd)
    && nets.size === x.nets.length && (!x.nets.length || costs > 0) && x.placed >= b.placed;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"}  every network, ${aero} AERO, ${memory === 0.25 ? "Steady" : "Balanced"}: ` +
    (x.nets.length ? `${x.nets.join(" + ")} $${b.expect_usd.toFixed(2)} -> $${x.expect_usd.toFixed(2)} after $${costs.toFixed(2)} costs` : "Base only (nothing clears the bar)"));
}
process.exit(bad ? 1 : 0);
