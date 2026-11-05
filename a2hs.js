/* "Add Flight Plan to your Home Screen" pop-up. iPhone/iPad Safari cannot add a page by itself, so the pill
   opens a 3-step card (Share -> Add to Home Screen -> Add); Chrome/Android gets the real install prompt. Hidden when
   already running from the Home Screen or dismissed in the last 30 days. Self-contained; storage wrapped in try/catch. */
(function () {
  "use strict";
  var KEY = "a2hs-hide:" + location.pathname, DAY = 864e5;
  var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
  if (standalone || typeof window.fully !== "undefined" || /FullyKiosk/i.test(navigator.userAgent)) return;
  try { if (Date.now() - (+localStorage.getItem(KEY) || 0) < 30 * DAY) return; } catch (e) { /* private mode */ }

  var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; show(); });

  var css = ".a2hs-pill{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));" +
    "z-index:2147483000;display:flex;align-items:center;gap:6px;background:#111827;color:#fff;border-radius:999px;" +
    "box-shadow:0 6px 24px rgba(0,0,0,.35);font:600 14px -apple-system,system-ui,sans-serif;padding:4px 4px 4px 14px;max-width:calc(100vw - 32px)}" +
    ".a2hs-pill button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:8px 4px}" +
    ".a2hs-pill .x{opacity:.6;padding:8px 10px;font-size:16px}" +
    ".a2hs-back{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center}" +
    ".a2hs-card{background:#fff;color:#111;width:100%;max-width:420px;border-radius:18px 18px 0 0;padding:20px 20px calc(24px + env(safe-area-inset-bottom,0px));" +
    "font:15px/1.45 -apple-system,system-ui,sans-serif}.a2hs-card h3{margin:0 0 10px;font-size:18px}" +
    ".a2hs-card ol{margin:0 0 16px;padding-left:22px}.a2hs-card li{margin:6px 0}" +
    ".a2hs-card .ok{width:100%;padding:12px;border:0;border-radius:12px;background:#111827;color:#fff;font:600 16px system-ui}" +
    "@media (prefers-color-scheme: dark){.a2hs-card{background:#1f2937;color:#f3f4f6}.a2hs-card .ok{background:#f3f4f6;color:#111}}";

  function hide(remember) {
    var p = document.querySelector(".a2hs-pill"); if (p) p.remove();
    if (remember) { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* ignore */ } }
  }

  function steps() {
    var back = document.createElement("div");
    back.className = "a2hs-back";
    var share = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 3v13"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
    back.innerHTML = '<div class="a2hs-card" role="dialog" aria-label="Add to Home Screen"><h3>Add Flight Plan to your Home Screen</h3>' +
      (ios ? "<ol><li>Tap the <b>Share</b> button " + share + " (bottom bar in Safari, or the ⋯ menu).</li>" +
             "<li>Scroll down and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>. The app's icon shows up on your Home Screen.</li></ol>"
           : "<ol><li>Open your browser's menu (⋮ or ⋯).</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li></ol>") +
      '<button type="button" class="ok">Got it</button></div>';
    back.addEventListener("click", function (e) { if (e.target === back || e.target.className === "ok") back.remove(); });
    document.body.appendChild(back);
  }

  function show() {
    if (document.querySelector(".a2hs-pill") || !document.body) return;
    if (!document.getElementById("a2hs-css")) {
      var st = document.createElement("style"); st.id = "a2hs-css"; st.textContent = css; document.head.appendChild(st);
    }
    var p = document.createElement("div");
    p.className = "a2hs-pill";
    p.innerHTML = '<button type="button" class="go">📲 Add Flight Plan to your Home Screen</button><button type="button" class="x" aria-label="Dismiss">✕</button>';
    p.querySelector(".go").addEventListener("click", function () {
      if (deferred) {
        deferred.prompt();
        deferred.userChoice.then(function (r) { if (r.outcome === "accepted") hide(true); deferred = null; });
      } else steps();
    });
    p.querySelector(".x").addEventListener("click", function () { hide(true); });
    document.body.appendChild(p);
  }

  // iPhone/iPad and phones only; elsewhere only a real install prompt shows it. Kiosk browsers are skipped.
  var touch = ios || /Mobi/i.test(navigator.userAgent);
  if (touch) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(show, 1200); });
    else setTimeout(show, 1200);
  }
})();
