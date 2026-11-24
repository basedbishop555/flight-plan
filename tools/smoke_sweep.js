// SMOKE_EXTRA=tools/smoke_sweep.js node tools/smoke.js : the "Sweep into" picker in the real page (11/24/2026).
// A second fake wallet that holds many tokens (SWEEP_WALLET, default a large public Base wallet) picks each payout in
// turn (USDC, AERO, ETH, BTC), dry-runs the sweep and taps Sign. The page must show the right payout token, rehearse
// it, pass its own second-RPC check, and ask the wallet for nothing but an exact approval to the Metarouter (or the
// swap itself). The fake wallet never signs.
const WALLET = process.env.SWEEP_WALLET || "0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A";
const MR = "0x0fef9e88a7b76bcdbf451780c6774fe32965ee98";
module.exports = async ({ page, step, until, base, ethers }) => {
  const ctx = await page.context().browser().newContext(), p = await ctx.newPage(), asked = [], errs = [];
  p.on("console", m => { if (m.type() === "error" && !/flight-plan-data|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  p.on("pageerror", e => errs.push("pageerror: " + e.message));
  await p.exposeFunction("__asked2", x => asked.push(x));
  await p.addInitScript(([acct]) => {
    window.addEventListener("securitypolicyviolation", e => console.error("CSP violation: " + e.violatedDirective + " " + e.blockedURI));
    try { localStorage.setItem("fp:safety", "1"); } catch (e) {}
    window.ethereum = { on() {}, request: async ({ method, params }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [acct];
      if (method === "eth_chainId") return window.__chain || "0x2105";
      if (method === "wallet_switchEthereumChain") { window.__chain = params[0].chainId; return null; }
      if (method === "wallet_getCapabilities") return {};
      if (method === "eth_sendTransaction" || method === "wallet_sendCalls") { window.__asked2({ method, params }); throw new Error("smoke test: not signing"); }
      throw new Error("smoke wallet: " + method);
    } };
  }, [WALLET]);
  const text = sel => p.$eval(sel, e => e.textContent);
  await p.goto(base + "/?addr=" + WALLET);
  await p.click("#wpill"); await p.waitForSelector("#wpill.live", { timeout: 60000 });
  await p.click("#sweep > summary");
  const erc20 = new ethers.Interface(["function approve(address,uint256)"]);
  for (const [key, sym] of [["stable", "USDC"], ["aero", "AERO"], ["eth", "WETH"], ["btc", "cbBTC"]]) {
    await step(`sweep into ${sym}: scan, dry run, second-RPC check, exact approval asked`, async () => {
      if (key !== "stable") await p.click(`#intoSeg button[data-t="${key}"]`);
      await until(async () => /to sell|nothing to sweep/.test(await text("#swk")), 150000, "sweep scan");
      if (!/to sell/.test(await text("#swk"))) throw new Error("nothing to sweep: " + (await text("#swk")));
      // this wallet holds tokens on several networks: test Base, where every payout token exists
      const chip = await p.$('#swNets button[data-cid="8453"]');
      if (chip) { await chip.click(); await p.waitForTimeout(800); }
      else if (/Rewards found on|needs gas/.test(await text("#swNets"))) throw new Error("Base did not scan: " + (await text("#log")).slice(-400));
      const head = await text("#swk"), title = await text("#swTitle");
      if (key !== "stable" && !head.includes("into " + sym)) throw new Error("header does not name " + sym + ": " + head);
      const rows = await p.$$eval("#toks .tok", els => els.map(e => ({ sym: e.querySelector(".sym").textContent, on: e.querySelector("input").checked, txt: e.textContent.replace(/\s+/g, " ") })));
      if (rows.some(r => r.sym.trim() === sym)) throw new Error(sym + " is listed for sale while it is the payout");
      const usdc = rows.find(r => r.sym.trim() === "USDC");
      if (key !== "stable" && usdc && usdc.on) throw new Error("the wallet's own USDC is ticked by default");
      // keep the rehearsal small: the four biggest ticked tokens
      const boxes = await p.$$("#toks .tok input:checked");
      for (const b of boxes.slice(4)) { await b.evaluate(el => { el.checked = false; el.dispatchEvent(new Event("change", { bubbles: true })); }); await p.waitForTimeout(60); }
      await p.waitForTimeout(400);
      await p.click("#btnDry");
      await until(async () => /Dry run OK|Dry run failed|Dry run stopped|Simulation failed/.test(await text("#swOut")), 120000, "sweep dry run");
      const out = (await text("#swOut")).replace(/\s+/g, " ");
      console.log(`      ${title} · ${head} · ${out.slice(0, 120)}`);
      if (!/Dry run OK/.test(out)) throw new Error("dry run: " + out.slice(0, 200));
      if (!out.includes(sym)) throw new Error("dry run does not pay out " + sym);
      const plan = (await text("#swPlan")).replace(/\s+/g, " ");
      if (!plan.includes(sym + " 0x")) throw new Error("the plan does not name the payout token and its address");
      const n0 = asked.length; await p.click("#btnSend");
      await until(async () => asked.length > n0 || /Stopped/.test(await text("#swOut")), 120000, "sweep signature request");
      const a = asked[n0] && asked[n0].params[0];
      if (!a) throw new Error("stopped before asking: " + (await text("#swOut")).replace(/\s+/g, " ").slice(0, 220));
      if (a.value !== "0x0") throw new Error("non-zero ETH asked");
      if (a.to.toLowerCase() !== MR) {                       // then it must be an exact approval to the Metarouter
        const [spender, amount] = erc20.decodeFunctionData("approve", a.data);
        if (spender.toLowerCase() !== MR || amount <= 0n || amount >= 2n ** 200n) throw new Error("unexpected approval: " + JSON.stringify(a).slice(0, 200));
      } else if (!a.data.startsWith("0x")) throw new Error("unexpected call");
      if (errs.length) throw new Error("page errors: " + errs.join(" | ").slice(0, 300));
    });
  }
  await ctx.close();
};
