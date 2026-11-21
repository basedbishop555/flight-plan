/* crowd.js: "When the crowd moves". Draws an inline SVG (one axis, sAERO per 2 hours) from data/crowd.json:
   sAERO moved over the last 72 hours, coming off cooldown and likely to move over the next 72 hours, the team's
   likely batch window shaded, and the viewer's own lock windows pinned (from the chain reads on the page; nothing
   about any other wallet is in the data). Hover or tap a bar for the readout; a table view sits below. */
(function (root) {
  "use strict";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var hr = function (t) { return new Date(t * 1000).toLocaleTimeString([], { hour: "numeric" }).replace(" ", "").toLowerCase(); };
  var dayHr = function (t) { return new Date(t * 1000).toLocaleDateString([], { weekday: "short" }) + " " + hr(t); };

  function render(el, Cd, pins) {
    var now = Math.floor(Date.now() / 1000), h0 = now - now % 3600, BIN = 7200;
    var tLo = h0 - 72 * 3600, tHi = h0 + 72 * 3600, nb = (tHi - tLo) / BIN;
    var moved = [], frees = [], likely = [], k;
    for (k = 0; k < nb; k++) { moved.push(0); frees.push(0); likely.push(0); }
    (Cd.back || []).forEach(function (x) { var i = Math.floor((x[0] - tLo) / BIN); if (i >= 0 && i < nb && x[0] < h0) moved[i] += x[1] / 1e6; });
    (Cd.fwd || []).forEach(function (x) { var i = Math.floor((x[0] - tLo) / BIN); if (i >= 0 && i < nb) { frees[i] += x[1] / 1e6; likely[i] += x[2] / 1e6; } });
    var fut = []; for (k = 0; k < nb; k++) if (tLo + k * BIN >= h0) fut.push(k);
    var vals = moved.concat(frees, likely, [1]).sort(function (a, b) { return a - b; });
    var top = Math.min(vals[vals.length - 1], vals[vals.length - 2] * 1.6);     // one outlier is clipped and labelled
    var steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500], step = 500;
    for (k = 0; k < steps.length; k++) if (top / steps[k] <= 4) { step = steps[k]; break; }
    var ymax = step * (Math.floor(top / step) + 1);
    var W = 400, H = 210, L = 30, R = 4, T = 32, Bm = 20, pw = W - L - R, ph = H - T - Bm, bw = pw / nb;
    var X = function (t) { return L + (t - tLo) / (tHi - tLo) * pw; }, Y = function (v) { return T + ph - v / ymax * ph; };
    var g = [];
    for (var v = 0; v <= ymax; v += step) g.push("<line x1='" + L + "' x2='" + (W - R) + "' y1='" + Y(v).toFixed(1) + "' y2='" + Y(v).toFixed(1) + "' class='cg'/>" +
      "<text x='" + (L - 5) + "' y='" + (Y(v) + 4).toFixed(1) + "' class='cx' text-anchor='end'>" + v + "M</text>");
    var nl = (Cd.batch && Cd.batch.next) || null;
    if (nl && nl.start && nl.end > tLo && nl.start < tHi) {
      var a = Math.max(nl.start, tLo), b = Math.min(nl.end, tHi);
      g.push("<rect x='" + X(a).toFixed(1) + "' y='" + T + "' width='" + (X(b) - X(a)).toFixed(1) + "' height='" + ph + "' class='cband'/>" +
        (X(a) > W - 90 ? "<text x='" + (X(b) - 3).toFixed(1) + "' y='" + (T + 11) + "' class='cx' text-anchor='end'>" : "<text x='" + (X(a) + 3).toFixed(1) + "' y='" + (T + 11) + "' class='cx'>") +
        "team batch? " + Math.round((nl.p || 0) * 100) + "%</text>");
    }
    for (k = 0; k < nb; k++) {
      var x = L + k * bw + 1;
      [[moved[k], "c1"], [frees[k], "c2"]].forEach(function (p) {
        var val = p[0];
        if (val > 0.005) {
          if (val > ymax) { g.push("<text x='" + (x + (bw - 2) / 2).toFixed(1) + "' y='" + (T + 10) + "' class='cx cxb' text-anchor='" + (k < 4 ? "start" : "middle") + "'>" + val.toFixed(0) + "M</text>"); val = ymax * 0.97; }
          var hgt = Math.max(1, Y(0) - Y(val));
          g.push(bw - 2 >= 6 ? "<path class='" + p[1] + "' d='M" + x.toFixed(1) + "," + Y(0).toFixed(1) + "v" + (-Math.max(0, hgt - 2)).toFixed(1) + "q0,-2 2,-2h" + (bw - 6).toFixed(1) + "q2,0 2,2v" + Math.max(0, hgt - 2).toFixed(1) + "z'/>"
            : "<rect class='" + p[1] + "' x='" + x.toFixed(1) + "' y='" + Y(val).toFixed(1) + "' width='" + (bw - 2).toFixed(1) + "' height='" + hgt.toFixed(1) + "' rx='1'/>");
        }
      });
    }
    if (fut.length) g.push("<polyline class='c3' points='" + fut.map(function (i) { return (L + (i + 0.5) * bw).toFixed(1) + "," + Y(likely[i]).toFixed(1); }).join(" ") + "'/>");
    g.push("<line x1='" + X(now).toFixed(1) + "' x2='" + X(now).toFixed(1) + "' y1='" + (T - 4) + "' y2='" + (T + ph) + "' class='cnow'/>" +
      "<text x='" + X(now).toFixed(1) + "' y='" + (H - 6) + "' class='cx' text-anchor='middle'>now</text>");
    var byBin = {};
    (pins || []).forEach(function (p) { if (p.t >= tLo && p.t <= tHi) { var key = Math.floor(p.t / BIN); (byBin[key] = byBin[key] || { t: p.t, names: [] }).names.push(p.label); } });
    Object.keys(byBin).sort().forEach(function (key) {
      var p = byBin[key];
      g.push("<line x1='" + X(p.t).toFixed(1) + "' x2='" + X(p.t).toFixed(1) + "' y1='" + (T - 12) + "' y2='" + (T + ph) + "' class='cpin'/>" +
        "<text x='" + Math.min(Math.max(X(p.t), L + 14), W - R - 14).toFixed(1) + "' y='" + (T - 16) + "' class='cx cxb' text-anchor='middle'>" + esc(p.names.join(" · ")) + "</text>");
    });
    var mid = new Date(h0 * 1000); mid.setHours(0, 0, 0, 0);
    for (var d = -3; d <= 3; d++) {
      var t = mid.getTime() / 1000 + d * 86400;
      if (tLo + 3600 < t && t < tHi - 3600 && Math.abs(t - now) > 5 * 3600)
        g.push("<line x1='" + X(t).toFixed(1) + "' x2='" + X(t).toFixed(1) + "' y1='" + (T + ph) + "' y2='" + (T + ph + 4) + "' class='cg'/>" +
          "<text x='" + X(t).toFixed(1) + "' y='" + (H - 6) + "' class='cx' text-anchor='middle'>" + new Date(t * 1000).toLocaleDateString([], { weekday: "short" }) + "</text>");
    }
    var hits = "", data = [];
    for (k = 0; k < nb; k++) {
      hits += "<rect class='ch' x='" + (L + k * bw).toFixed(1) + "' y='" + T + "' width='" + bw.toFixed(1) + "' height='" + ph + "' data-k='" + k + "'/>";
      data.push({ t: tLo + k * BIN, m: Math.round(moved[k] * 100) / 100, f: Math.round(frees[k] * 100) / 100, l: Math.round(likely[k] * 100) / 100, fut: tLo + k * BIN >= h0 });
    }
    var bits = [], pk = Cd.peak;
    if (pk && pk.h) {
      bits.push((pk.frees / 1e6).toFixed(0) + "M frees " + dayHr(pk.h) + " to " + hr(pk.h + 3600));
      var l24 = 0; (Cd.fwd || []).slice(1, 25).forEach(function (x) { l24 += x[2]; });
      bits.push("~" + (l24 / 1e6).toFixed(0) + "M likely to move in 24h");
    }
    var curve = (Cd.curve || []).filter(function (c) { return c[1] != null; }).map(function (c) { return c[0] + " " + c[1] + "%"; }).join(" · ");
    var team = Cd.team || {}, bt = Cd.batch || {};
    var rows = data.filter(function (d2) { return Math.max(d2.m, d2.f, d2.l) >= 0.5; }).map(function (d2) {
      return "<tr><td>" + esc(dayHr(d2.t)) + "</td><td class='num'>" + (d2.m || "") + "</td><td class='num'>" + (d2.f || "") + "</td><td class='num'>" + (d2.l || "") + "</td></tr>"; }).join("");
    el.innerHTML = "<h2>When the crowd moves <span>" + esc(bits.join(" · ")) + "</span></h2><div class='body'>" +
      "<div class='viz'><div class='lg'><span><i style='background:var(--s1)'></i>moved (last 72h)</span><span><i style='background:var(--s2)'></i>comes off cooldown</span><span><i class='ln' style='background:var(--s3)'></i>likely to move</span><span class='mut2'>per 2h · shaded = team batch window" + (pins && pins.length ? " · dashed = your windows" : "") + "</span></div>" +
      "<svg viewBox='0 0 " + W + " " + H + "' role='img' aria-label='sAERO moved over the last 72 hours and coming off cooldown over the next 72 hours, per 2 hours'>" + g.join("") + hits + "</svg><div class='tip'></div></div>" +
      "<p class='small mut' style='margin:8px 0 0'>Allocating right after a big wave has moved (its dilution is known) and after the team's batch has landed is the edge: a vote keeps earning past its window until you change it, so waiting is free.</p>" +
      "<p class='small mut2' style='margin:6px 0 0'>How long after a window opens locks move (share of sAERO, since launch): " + esc(curve) + ". Free and not moving now: " + ((Cd.free_now || 0) / 1e6).toFixed(0) + "M" +
      (team.aero ? " (the team's " + team.locks + " locks, " + (team.aero / 1e6).toFixed(0) + "M, left out)" : "") + ". Team Safe: " + (bt.executed != null ? bt.executed : "?") + " batches, last " + (bt.last ? esc(dayHr(bt.last)) : "?") + (bt.fresh ? "; a NEW proposal is queued" : "") + ". Data from " + esc(ago(Cd.ts)) + ".</p>" +
      "<details style='margin-top:8px'><summary class='small mut' style='cursor:pointer'>Table view (M sAERO per 2h)</summary><div class='tw' style='margin-top:6px'><table><tr><th>From</th><th class='num'>Moved</th><th class='num'>Frees</th><th class='num'>Likely</th></tr>" + rows + "</table></div></details></div>";
    var tip = el.querySelector(".tip"), box = tip.parentNode, last = null;
    function f(v) { return v ? v.toFixed(1) + "M" : "-"; }
    function show(r) {
      if (last) last.classList.remove("on"); last = r; r.classList.add("on");
      var d2 = data[+r.getAttribute("data-k")], t1 = new Date(d2.t * 1000), t2 = new Date(d2.t * 1000 + 7200000);
      var h = function (xx) { return xx.toLocaleTimeString([], { hour: "numeric" }).replace(" ", "").toLowerCase(); };
      tip.innerHTML = "";
      var hd = document.createElement("div"); hd.textContent = t1.toLocaleDateString([], { weekday: "short" }) + " " + h(t1) + " to " + h(t2); tip.appendChild(hd);
      (d2.fut ? [["comes off cooldown", d2.f], ["likely to move", d2.l]] : [["moved", d2.m]]).forEach(function (xx) { var e = document.createElement("div"), bb = document.createElement("b"); bb.textContent = f(xx[1]); e.appendChild(bb); e.appendChild(document.createTextNode(" " + xx[0])); tip.appendChild(e); });
      tip.style.display = "block";
      var bbx = box.getBoundingClientRect(), rr = r.getBoundingClientRect();
      var xx2 = rr.left - bbx.left + rr.width / 2 - tip.offsetWidth / 2;
      tip.style.left = Math.max(0, Math.min(bbx.width - tip.offsetWidth, xx2)) + "px"; tip.style.top = "18px";
    }
    var hs = el.querySelectorAll(".ch");
    for (var i = 0; i < hs.length; i++) { hs[i].addEventListener("pointerenter", function () { show(this); }); hs[i].addEventListener("click", function () { show(this); }); }
    el.querySelector("svg").addEventListener("pointerleave", function () { tip.style.display = "none"; if (last) last.classList.remove("on"); });
  }
  function ago(ts) { var m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60)); return m < 60 ? m + " min ago" : Math.floor(m / 60) + "h " + (m % 60) + "m ago"; }
  root.CrowdChart = { render: render };
})(typeof self !== "undefined" ? self : this);
