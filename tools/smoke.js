// node tools/smoke.js [lockId] : loads the real page in headless Chromium from a local static server (same files, same
// Content-Security-Policy), looks a lock owner up, and dry-runs. Fails on any CSP violation, page error or missing plan.
// A fake wallet (owner = the lock's real owner) records what the page would ask it to sign; nothing is ever sent.
const http = require("http"), fs = require("fs"), path = require("path");
// needs playwright or playwright-core on NODE_PATH (not vendored); uses the installed Google Chrome when Playwright has no browser of its own
let chromium; try { chromium = require("playwright").chromium; } catch (e) { chromium = require("playwright-core").chromium; }
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const { ethers } = require("../vendor/ethers-6.13.4.umd.min.js");
const ROOT = path.join(__dirname, ".."), LOCK = Number(process.argv[2] || 697);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split("?")[0]); if (p === "/") p = "/index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(s);
});
(async () => {
  await new Promise(ok => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  const owner = await new ethers.Contract("0xbf7977e1521e9a3032bf7243ee4712f311f13915", ["function ownerOf(uint256) view returns (address)"], new ethers.JsonRpcProvider("https://base-rpc.publicnode.com")).ownerOf(LOCK);
  const browser = await chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}), ctx = await browser.newContext(), page = await ctx.newPage();
  const problems = [], asked = [];
  page.on("console", m => { if (m.type() === "error" && !/flight-plan-data|Failed to load resource/.test(m.text())) problems.push("console: " + m.text().slice(0, 200)); });
  page.on("pageerror", e => problems.push("pageerror: " + e.message));
  await page.exposeFunction("__asked", x => asked.push(x));
  await page.addInitScript(([acct]) => {
    window.addEventListener("securitypolicyviolation", e => console.error("CSP violation: " + e.violatedDirective + " " + e.blockedURI));
    try { localStorage.setItem("fp:safety", "1"); } catch (e) {}
    window.ethereum = { on() {}, request: async ({ method, params }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [acct];
      if (method === "eth_chainId") return "0x2105";
      if (method === "wallet_getCapabilities") return {};
      if (method === "eth_sendTransaction" || method === "wallet_sendCalls") { window.__asked({ method, params }); throw new Error("smoke test: not signing"); }
      throw new Error("smoke wallet: " + method);
    } };
  }, [owner]);
  // the page's policy forbids eval, which Playwright's waitForFunction uses: poll with plain evaluate calls instead
  const until = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 500)); } throw new Error("timed out waiting for " + what); };
  const step = async (name, fn) => { try { await fn(); console.log("PASS  " + name); } catch (e) { problems.push(name + ": " + e.message.split("\n")[0]); console.log("FAIL  " + name + ": " + e.message.split("\n")[0]); } };
  await page.goto(base + "/?addr=" + owner);
  await step("plan renders for #" + LOCK + "'s owner", () => page.waitForSelector("#legs details.pool", { timeout: 90000 }));
  await step("rank card renders", () => page.waitForSelector("#rank .rtab", { timeout: 60000 }));
  await step("self-hosted font loaded", async () => { if (!(await page.evaluate(() => document.fonts.check("16px Inter")))) throw new Error("Inter not loaded"); });
  await step("connect (fake wallet)", async () => { await page.click("#wpill"); await page.waitForSelector("#wpill.live", { timeout: 60000 }); await page.waitForSelector("#legs details.pool", { timeout: 90000 }); });
  await step("dry run answers", async () => {
    await page.click("#cta");
    await until(() => page.evaluate(() => [...document.querySelectorAll("#locks .lock > .small")].every(e => /Dry run|Already allocated|still landing|Result doesn/.test(e.textContent))), 180000, "dry run result");
    console.log("      " + (await page.$$eval("#locks .lock", els => els.map(e => e.querySelector(".lid").textContent + ": " + (e.querySelector(".banner") || { textContent: "" }).textContent.slice(0, 110)).join(" | "))));
  }).then(async () => {
    if (problems.some(p => p.startsWith("dry run answers"))) console.log("      status: " + (await page.$$eval("#locks .lock > .small", els => els.map(e => e.textContent.slice(0, 160)).join(" | "))) + "\n      log: " + (await page.$eval("#log", e => e.textContent.slice(-600))));
  });
  const text = sel => page.$eval(sel, e => e.textContent);
  await step("claim card: finds rewards and rehearses the claim", async () => {
    await page.click("#cycle > summary");
    await until(async () => /to claim|nothing to claim|check failed/.test(await text("#clk")), 120000, "claim scan");
    console.log("      " + (await text("#clk")) + " | " + (await text("#clOut")).replace(/\s+/g, " ").slice(0, 200));
    if (/check failed/.test(await text("#clk"))) throw new Error("claim scan failed");
    if (!/to claim/.test(await text("#clk")) || /nothing/.test(await text("#clk"))) return;
    await page.click("#clDry"); await until(async () => /Dry run OK|Dry run failed/.test(await text("#clRes")), 90000, "claim dry run");
    const r = await text("#clRes"); console.log("      " + r.replace(/\s+/g, " ").slice(0, 220)); if (!/Dry run OK/.test(r)) throw new Error("claim dry run failed");
    const n0 = asked.length; await page.click("#clSend"); await until(async () => asked.length > n0 || /Stopped/.test(await text("#clRes")), 90000, "claim signature request");
    const a = asked[n0] && asked[n0].params[0];
    if (!a || a.to.toLowerCase() !== "0x49d7d4f17ec56ef8fa04e464af5d1a4942cc31e6" || !a.data.startsWith("0x28b54326") || a.value !== "0x0") throw new Error("unexpected claim request: " + JSON.stringify(a || (await text("#clRes"))).slice(0, 200));
  });
  await step("compound: rehearses 1 AERO into the biggest lock, asks for the exact approval first", async () => {
    await until(async () => /AERO in this wallet/.test(await text("#cpBal")), 60000, "AERO balance");
    console.log("      " + (await text("#cpBal")));
    if (!(parseFloat((await text("#cpBal")).split(":")[1].replace(/,/g, "")) >= 1)) return;
    await page.fill("#cpAmt", "1"); await page.click("#cpDry"); await until(async () => /Dry run OK|Dry run failed/.test(await text("#cpRes")), 90000, "compound dry run");
    const r = await text("#cpRes"); console.log("      " + r.replace(/\s+/g, " ").slice(0, 160)); if (!/Dry run OK/.test(r)) throw new Error("compound dry run failed");
    const n0 = asked.length; await page.click("#cpSend"); await until(async () => asked.length > n0 || /Stopped/.test(await text("#cpRes")), 90000, "compound signature request");
    const a = asked[n0] && asked[n0].params[0], want = "0x095ea7b3" + "bf7977e1521e9a3032bf7243ee4712f311f13915".padStart(64, "0") + (10n ** 18n).toString(16).padStart(64, "0");
    if (!a || a.to.toLowerCase() !== "0x3f5bf3edac59d650d8fdf9657a71f2f904a3a4ee" || a.data.toLowerCase() !== want) throw new Error("unexpected approval request: " + JSON.stringify(a || (await text("#cpRes"))).slice(0, 220));
  });
  for (const extra of process.env.SMOKE_EXTRA ? [require(path.resolve(process.env.SMOKE_EXTRA))] : []) await extra({ page, step, until, asked, owner, base, ethers });
  await step("docs page loads under its policy", async () => { const p2 = await ctx.newPage(); p2.on("console", m => { if (m.type() === "error") problems.push("docs console: " + m.text().slice(0, 160)); }); await p2.goto(base + "/docs.html"); await p2.waitForSelector("#safe"); await p2.close(); });
  await step("refuses to run inside a frame", async () => {
    const p3 = await ctx.newPage(); await p3.setContent(`<iframe src="${base}/" style="width:600px;height:400px"></iframe>`);
    await p3.waitForTimeout(1500);
    const f = p3.frames().find(x => x.url().startsWith(base));
    if (f) { const shown = await f.evaluate(() => getComputedStyle(document.documentElement).display).catch(() => "none"); if (shown !== "none") throw new Error("page is visible inside a frame"); }
    await p3.close();
  });
  await browser.close(); server.close();
  if (asked.length) console.log("wallet was asked for:", asked.map(a => a.method).join(", "));
  console.log(problems.length ? `\n${problems.length} PROBLEM(S)\n` + problems.join("\n") : "\nsmoke OK");
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
