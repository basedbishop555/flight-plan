// node tools/check.js : the browser planner must give the same split as the reference planner on the same data.
const fs = require("fs"), path = require("path");
const P = require("../planner.js");
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "plan.json")));
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, "reference.json")));
let bad = 0;
for (const r of ref) {
  const out = P.plan(D, r.aero, r.start, r.n_pools);
  const got = out.legs.map(l => [l.row.gid, l.pct]);
  const same = JSON.stringify(got) === JSON.stringify(r.split) && Math.abs(Math.round(out.expect_usd) - r.expect_usd) <= 1;
  if (!same) bad++;
  console.log(`${same ? "PASS" : "FAIL"}  ${r.aero} AERO, ${r.n_pools || "auto"} pools: ${got.map(g => g[1] + "%").join(" ")} ~$${out.expect_usd.toFixed(2)}` +
    (same ? "" : `\n      want ${JSON.stringify(r.split)} $${r.expect_usd}\n      got  ${JSON.stringify(got)}`));
}
process.exit(bad ? 1 : 0);
