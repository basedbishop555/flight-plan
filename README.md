# Flight Plan

An unofficial, open-source allocation planner for sAERO lockers on Aero (Base). Not affiliated with Aerodrome.

Paste a wallet address and Flight Plan:

- finds its sAERO locks on chain,
- suggests a split of the allocation across pools, sized to those locks (Auto, or exactly 1 to 10 pools),
- ranks the locks against every sAERO lock or every wallet, on a whole-lock APR,
- rehearses the allocation for free with `eth_simulateV1` (nothing is signed or sent),
- shows your week-by-week and day-by-day APR against the average, your earnings, and when the crowd moves.

Connect the wallet that owns the locks and it signs one `allocate` per lock (dry run first, window open), and can
sweep your claimed rewards into USDC through Aero's Metarouter. Or copy the split and allocate in the Aero app.

## How it works

- `index.html` is a static page. Everything runs in your browser against public RPCs (several per network, in turn).
- `planner.js` is the planning model: each pool's expected fees and incentives over a 47-hour window, your own
  dilution, a pile-on factor for crowded pools, and the caps (per pool, per pool type, at most 10% of any pool).
  `tools/check.js` checks it against reference plans.
- `allocate-lib.js` builds and checks the Base-only allocate call (the guard); `allocate-x.js` plans, rehearses and
  checks allocate calls that reach other networks.
- `sweep-routes.js` lists candidate USDC routes through Aero's new pools; the page re-quotes them live.
- `crowd.js` draws the crowd chart from `data/crowd.json`.
- `data/plan.json` (pool estimates, hourly), `data/rank.json` (every lock's earnings over 12 hours, 1 day, 2 days
  and 7 days plus earned / unclaimed, every 3 hours), `data/history.json` (every lock's APR per week and per day)
  and `data/crowd.json` are published by a scanner. Wallet groups are anonymous indices; no addresses.
- `app.js` is the page's code, `boot.js` the frame guard and error banner. No script is inline, so the pages run under a
  strict Content-Security-Policy (`script-src 'self'`).
- `vendor/` pins ethers 6.13.4 (byte-identical to the npm release); `fonts/` holds Inter (OFL). Nothing loads from a third party.
- `tools/test_allocate_x.js` tests the cross-network guard and live dry runs; `tools/smoke.js` loads the real page in
  headless Chrome with a fake wallet (needs playwright-core on NODE_PATH) and fails on any policy violation.

## Safety

Four kinds of signature, only with the owning wallet connected and only after a passing dry run:

- `allocate` to the Aero Voter on Base for a lock you own (moves your allocation, not tokens). **0 ETH** when the split
  stays on Base. A split that uses another network carries that network's Hyperlane message fee as ETH on the same
  Base call: the amount shown under its dry run, never more than 0.03 ETH.
- An exact-amount `approve` to the Metarouter on a reward token the scan found (0 ETH).
- One Metarouter `execute` that sells those rewards for USDC to your own wallet (0 ETH).
- Only when you tap **Get gas**: Relay's `depositNative` on Base, carrying the small amount of ETH shown (hard cap
  0.006 ETH), delivered to your own address on the network that needs gas.

Never an approval on sAERO, never `setApprovalForAll`, never a transfer or claim, and never ETH except the
allocate fee or the Get-gas amount the page showed you. Check the address bar says flight-plan.app. Details:
`docs.html#safe`.

Not financial advice. Estimates can be wrong and pools change fast.

Tips (a plain wallet, any EVM network, Base preferred): `0xbe46e9dD6f22b5578529385F2e0Ee25840110196`. The page never asks you to send one.

MIT licensed.
