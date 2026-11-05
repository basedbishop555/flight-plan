# Flight Plan

An unofficial, read-only vote planner for sAERO lockers on Aero (Base). Not affiliated with Aerodrome.

Paste a wallet address and Flight Plan:

- finds its sAERO locks on chain,
- suggests a split of the votes across pools, sized to those locks (Auto, or exactly 1 to 10 pools),
- ranks the locks against every sAERO lock or every wallet, on a whole-lock APR,
- rehearses the vote for free with `eth_simulateV1` (nothing is signed or sent).

You then vote the percentages yourself in the Aero app.

## How it works

- `index.html` is a static page. Everything runs in your browser against a public Base RPC.
- `planner.js` is the planning model: each pool's expected fees and incentives over a 47-hour window, your own
  dilution, a pile-on factor for crowded pools, and the caps (per pool, per pool type, at most 10% of any pool).
  `tools/check.js` checks it against reference plans.
- `allocate-lib.js` builds and checks the allocate call that the dry run simulates.
- `data/plan.json` (pool estimates, hourly) and `data/rank.json` (every lock's earnings over 12 hours, 2 days and
  7 days, every 3 hours) are published by a scanner. Wallet groups in `rank.json` are anonymous indices.
- `vendor/` pins ethers 6.13.4.

## Safety

There is no Sign or Send anywhere. Connecting a wallet only reads its address. If a site claiming to be Flight Plan
asks you to sign or approve anything, it is not this one.

Not financial advice. Estimates can be wrong and pools change fast.

MIT licensed.
