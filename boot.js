/* boot.js: runs before anything else.
   1. Refuses to run inside another site's frame (a page that signs must never be shown under someone else's buttons).
   2. Shows load errors on the page instead of failing silently. */
(function () {
  "use strict";
  if (window.top !== window.self) {
    document.documentElement.style.display = "none";
    try { window.top.location = window.self.location.href; } catch (e) { /* the framing page blocks it: stay hidden */ }
    throw new Error("Flight Plan does not run inside a frame");
  }
  window.onerror = function (msg, src, line) {
    try {
      var h = document.getElementById("hero"); if (!h) return;
      var d = document.createElement("div"), b = document.createElement("b");
      d.className = "banner bad"; b.textContent = "Something broke: ";
      d.appendChild(b); d.appendChild(document.createTextNode(String(msg) + " (line " + line + "). Reload the page."));
      h.textContent = ""; h.appendChild(d);
    } catch (e) {}
  };
})();
