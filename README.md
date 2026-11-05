# Flight Plan

An unofficial, open-source vote planner for sAERO lockers on Aero (Base). Not affiliated with Aerodrome.

Paste a wallet address and Flight Plan:

- finds its sAERO locks on chain,
- suggests a split of the votes across pools, sized to those locks (Auto, or exactly 1 to 10 pools),
- ranks the locks against every sAERO lock or every wallet, on a whole-lock APR,
- rehearses the vote for free with `eth_simulateV1` (nothing is signed or sent),
- shows your week-by-week and day-by-day APR against the average, your earnings, and when the crowd moves.

Connect the wallet that owns the locks and it signs one `allocate` per lock (dry run first, window open), and can
sweep your claimed rewards into USDC through Aero's Metarouter. Or copy the split and vote in the Aero app.

## How it works

- `index.html` is a static page. Everything runs in your browser against a public Base RPC.
- `planner.js` is the planning model: each pool's expected fees and incentives over a 47-hour window, your own
  dilution, a pile-on factor for crowded pools, and the caps (per pool, per pool type, at most 10% of any pool).
  `tools/check.js` checks it against reference plans.
- `allocate-lib.js` builds and checks the one allocate call the page may send (the guard).
- `sweep-routes.js` lists candidate USDC routes through Aero's new pools; the page re-quotes them live.
- `crowd.js` draws the crowd chart from `data/crowd.json`.
- `data/plan.json` (pool estimates, hourly), `data/rank.json` (every lock's earnings over 12 hours, 1 day, 2 days
  and 7 days plus earned / unclaimed, every 3 hours), `data/history.json` (every lock's APR per week and per day)
  and `data/crowd.json` are published by a scanner. Wallet groups are anonymous indices; no addresses.
- `vendor/` pins ethers 6.13.4.

## Safety

Exactly three kinds of signature, only with the owning wallet connected and only after a passing dry run: one
`allocate` to the Aero Voter per lock you own (0 ETH, moves votes not tokens), an exact-amount `approve` to the
Metarouter on a reward token the scan found, and one Metarouter `execute` that sells those rewards for USDC to your
own wallet. Never an approval on sAERO, never `setApprovalForAll`, never a transfer or claim, never a value other
than 0. Check the address bar says flight-plan.app. Details: `docs.html#safe`.

Not financial advice. Estimates can be wrong and pools change fast.

MIT licensed.
