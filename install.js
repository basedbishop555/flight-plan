/* install.js: the "Add Flight Plan to your Home Screen" pop-up (11/7/2026). Shown on phones and tablets only, never
 * once the app runs from the Home Screen, and never again after it's installed or dismissed (✕).
 *   Chrome / Android: Chrome's own install prompt (beforeinstallprompt); if Chrome doesn't offer one, the menu steps.
 *   iPhone / iPad: Safari has no prompt, so the button opens the Share → Add to Home Screen steps.
 * No network calls; one localStorage key. */
(function () {
  const KEY = "fp:install", wait = 3000;
  const standalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  const done = () => { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } };
  const remember = v => { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode: shows again next visit */ } };
  if (standalone() || done()) return;
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  if (!ios && !android) return;                                    // desktop browsers: no pop-up

  const css = `.fpi{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:40;
    display:flex;align-items:center;gap:8px;max-width:calc(100% - 24px);background:var(--card,#12172c);color:var(--fg,#eaeaec);
    border:1px solid var(--line,#222845);border-radius:999px;padding:6px 6px 6px 8px;box-shadow:0 6px 24px rgba(0,0,0,.25);font:600 14px/1.2 Inter,system-ui,sans-serif}
  .fpi img{width:28px;height:28px;border-radius:7px}
  .fpi .go{border:0;background:var(--acc,#8c9fff);color:#fff;border-radius:999px;padding:8px 12px;font:inherit;cursor:pointer;white-space:nowrap}
  .fpi .x{border:0;background:transparent;color:var(--mut,#b0b4ca);font:16px/1 system-ui,sans-serif;padding:8px;cursor:pointer}
  .fpi-sheet{position:fixed;inset:0;z-index:45;background:rgba(9,14,31,.55);display:flex;align-items:flex-end;justify-content:center}
  .fpi-sheet>div{background:var(--card,#12172c);color:var(--fg,#eaeaec);border-radius:18px 18px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px));
    max-width:560px;width:100%;font:15px/1.45 Inter,system-ui,sans-serif;box-shadow:0 -8px 30px rgba(0,0,0,.3)}
  .fpi-sheet h3{margin:0 0 8px;font-size:18px} .fpi-sheet ol{padding-left:1.3em;margin:.4em 0 .8em} .fpi-sheet li{margin:.35em 0}
  .fpi-sheet .ok{border:0;background:var(--acc,#8c9fff);color:#fff;border-radius:10px;padding:10px 14px;font:600 15px Inter,system-ui,sans-serif;width:100%;cursor:pointer}
  .fpi-share{display:inline-block;vertical-align:-3px;width:18px;height:18px}`;
  const SHARE = `<svg class="fpi-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Share"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11v9h12v-9"/></svg>`;
  let deferred = null, pill = null;

  function close(v) { if (pill) pill.remove(); pill = null; if (v) remember(v); }
  function steps() {
    const s = document.createElement("div"); s.className = "fpi-sheet";
    s.innerHTML = `<div role="dialog" aria-label="Add to Home Screen"><h3>Add Flight Plan to your Home Screen</h3><ol>${ios
      ? `<li>Tap <b>Share</b> ${SHARE} in Safari's toolbar (on iPhone, at the bottom; on iPad, at the top).</li><li>Scroll down and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>.</li>`
      : `<li>Tap Chrome's menu <b>⋮</b> (top right).</li><li>Tap <b>Add to Home screen</b> or <b>Install app</b>.</li><li>Tap <b>Install</b> or <b>Add</b>.</li>`}</ol>
      <button class="ok" type="button">Got it</button></div>`;
    const shut = () => s.remove();
    s.addEventListener("click", e => { if (e.target === s) shut(); });
    s.querySelector(".ok").addEventListener("click", shut);
    document.body.appendChild(s);
  }
  function show() {
    if (pill || standalone() || done()) return;
    pill = document.createElement("div"); pill.className = "fpi";
    pill.innerHTML = `<img src="icons/icon-180.png" alt=""><button class="go" type="button">Add our app to your Home Screen</button><button class="x" type="button" aria-label="Dismiss">✕</button>`;
    pill.querySelector(".x").addEventListener("click", () => close("dismissed"));
    pill.querySelector(".go").addEventListener("click", async () => {
      if (!deferred) return steps();
      const d = deferred; deferred = null; d.prompt();
      try { const c = await d.userChoice; if (c && c.outcome === "accepted") close("installed"); } catch (e) { /* keep the pill */ }
    });
    document.body.appendChild(pill);
  }

  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; setTimeout(show, wait); });
  window.addEventListener("appinstalled", () => close("installed"));
  setTimeout(show, ios ? wait : wait + 2000);                      // Android: give Chrome's prompt a moment to arrive first
})();
