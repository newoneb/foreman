// Foreman interaction layer, shared by every page. Loaded in the head without defer so the "js" class
// is set before the first paint (the entrance and reveals rely on it); everything else waits for the DOM.
// No inline scripts or style attributes: the site's Content-Security-Policy blocks them.
document.documentElement.classList.add("js");

(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function ready(fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }

  ready(function () {
    nav();
    goal();
    practicePhoto();
    fieldAll();
    bridge();
    steps();
    sequence();
    teamUnit();
    reveals();
    drift();
  });

  // ---------- nav: transparent over the dark opening, white once past it; a full-screen menu on phones
  function nav() {
    var bar = document.querySelector(".ui-nav");
    if (!bar) return;
    var hero = document.querySelector(".hero, .page-hero");
    if (hero && "IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { bar.classList.toggle("is-solid", !e[0].isIntersecting); },
        { rootMargin: "-" + bar.offsetHeight + "px 0px 0px 0px" }).observe(hero);
    } else bar.classList.add("is-solid");

    var toggle = bar.querySelector(".ui-nav__toggle"), menu = document.getElementById("ui-menu");
    if (!toggle || !menu) return;
    function setOpen(open) {
      bar.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.body.style.overflow = open ? "hidden" : "";
      if (open) { var a = menu.querySelector("a"); if (a) a.focus(); }
    }
    toggle.addEventListener("click", function () { setOpen(toggle.getAttribute("aria-expanded") !== "true"); });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && bar.classList.contains("is-open")) { setOpen(false); toggle.focus(); } });
    window.matchMedia("(min-width: 1024px)").addEventListener("change", function (m) { if (m.matches) setOpen(false); });
  }

  // ---------- the opening's switch: run it better / plan the exit (tabs, with arrow keys)
  function goal() {
    var root = document.querySelector("[data-goal-switch]");
    if (!root) return;
    var hero = root.closest(".hero");
    var tabs = [].slice.call(root.querySelectorAll('[role="tab"]'));
    var ink = root.querySelector(".goal__ink");
    function place(tab) {
      if (!ink) return;
      ink.style.width = tab.offsetWidth + "px";
      ink.style.transform = "translateX(" + (tab.offsetLeft - 4) + "px)";
    }
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.setAttribute("aria-hidden", String(!on));
      });
      if (hero) hero.setAttribute("data-goal", tab.getAttribute("data-value"));
      place(tab);
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t, false); });
      t.addEventListener("keydown", function (e) {
        var n = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (n) { e.preventDefault(); select(tabs[(i + n + tabs.length) % tabs.length], true); }
      });
    });
    var current = tabs.filter(function (t) { return t.getAttribute("aria-selected") === "true"; })[0] || tabs[0];
    select(current, false);
    window.addEventListener("resize", function () { place(tabs.filter(function (t) { return t.getAttribute("aria-selected") === "true"; })[0]); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { place(current); });
  }

  // ---------- What we do: the photograph follows the practice you point at or tab into
  function practicePhoto() {
    var fig = document.querySelector("[data-practice-photo]");
    if (!fig) return;
    [].forEach.call(document.querySelectorAll("[data-practice]"), function (card) {
      var show = function () { fig.setAttribute("data-show", card.getAttribute("data-practice")); };
      card.addEventListener("pointerenter", show);
      card.addEventListener("focusin", show);
    });
  }

  // ---------- a field of dots that leans away from the pointer, on the dark openings
  function fieldAll() { [].forEach.call(document.querySelectorAll("canvas.ui-field"), field); }
  function field(canvas) {
    var host = canvas.parentElement, ctx = canvas.getContext("2d");
    if (!ctx) return;
    var w = 0, h = 0, mx = -999, my = -999, lens = 0, aim = 0, raf = 0;
    var cs = getComputedStyle(host);
    var dot = (cs.getPropertyValue("--field-dot") || "").trim() || "rgba(255,255,255,0.09)";
    var glow = (cs.getPropertyValue("--field-lens") || "").trim() || "142,162,255";
    function size() {
      var r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      var gap = 26, R = 180;
      for (var y = gap / 2; y < h; y += gap) for (var x = gap / 2; x < w; x += gap) {
        var dx = x - mx, dy = y - my, d = Math.sqrt(dx * dx + dy * dy);
        var k = d < R ? Math.pow(1 - d / R, 2) * lens : 0;
        var ox = d ? dx / d * k * 10 : 0, oy = d ? dy / d * k * 10 : 0;
        ctx.fillStyle = k > 0.02 ? "rgba(" + glow + "," + (0.18 + k * 0.6).toFixed(3) + ")" : dot;
        ctx.beginPath(); ctx.arc(x + ox, y + oy, 0.9 + k * 1.5, 0, 6.2832); ctx.fill();
      }
    }
    function loop() {
      lens += (aim - lens) * 0.12; draw();
      raf = Math.abs(aim - lens) > 0.004 ? requestAnimationFrame(loop) : 0;
    }
    function kick() { if (!raf) raf = requestAnimationFrame(loop); }
    size();
    window.addEventListener("resize", size);
    if (reduce || !finePointer) return;
    host.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; aim = 1;
      if (!raf) raf = requestAnimationFrame(function step() { lens += (aim - lens) * 0.12; draw(); raf = requestAnimationFrame(step); });
    });
    host.addEventListener("pointerleave", function () { aim = 0; cancelAnimationFrame(raf); raf = 0; kick(); });
  }

  // ---------- the earnings bridge: a waterfall that builds in view, rows that light their bar,
  // and a switch that counts the owner's marketing add-back so you see what a buyer would reject
  function bridge() {
    var root = document.querySelector("[data-bridge]");
    if (!root) return;
    var svg = root.querySelector("svg"), sheet = document.querySelector("[data-bridge-sheet]");
    var sw = document.querySelector("[data-claim]"), note = document.querySelector("[data-claim-note]");
    var outEbitda = document.querySelector("[data-out='ebitda']"), outValue = document.querySelector("[data-out='value']"), outDscr = document.querySelector("[data-out='dscr']");
    var steps = [
      { key: "reported", label: "Reported", v: 612, base: true },
      { key: "legal", label: "Legal", v: 38 },
      { key: "personal", label: "Personal", v: 22 },
      { key: "marketing", label: "Marketing", v: 31, claim: true },
      { key: "pay", label: "Owner pay", v: -76 },
      { key: "rent", label: "Rent", v: -48 },
      { key: "adjusted", label: "Adjusted", total: true },
    ];
    var NS = "http://www.w3.org/2000/svg", W = 700, H = 300, top = 24, bottom = 40, maxV = 700;
    var y = function (v) { return top + (H - top - bottom) * (1 - v / maxV); };
    var bw = W / steps.length * 0.56, gapX = W / steps.length;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    [200, 400, 600].forEach(function (g) {
      var l = document.createElementNS(NS, "line");
      l.setAttribute("x1", 0); l.setAttribute("x2", W); l.setAttribute("y1", y(g)); l.setAttribute("y2", y(g)); l.setAttribute("class", "grid-line"); svg.appendChild(l);
    });
    var els = steps.map(function (s, i) {
      var g = document.createElementNS(NS, "g");
      var r = document.createElementNS(NS, "rect"), v = document.createElementNS(NS, "text"), t = document.createElementNS(NS, "text");
      r.setAttribute("class", "bar"); r.setAttribute("x", i * gapX + (gapX - bw) / 2); r.setAttribute("width", bw);
      r.style.transitionDelay = (reduce ? 0 : i * 90) + "ms";
      v.setAttribute("class", "v num"); v.setAttribute("text-anchor", "middle"); v.setAttribute("x", i * gapX + gapX / 2);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("x", i * gapX + gapX / 2); t.setAttribute("y", H - 14); t.textContent = s.label;
      g.appendChild(r); g.appendChild(v); g.appendChild(t); svg.appendChild(g);
      return { s: s, r: r, v: v };
    });
    var claim = false;
    function money(k) { return (k >= 1000 ? "$" + (k / 1000).toFixed(1) + "M" : "$" + Math.round(k) + "K"); }
    function render() {
      var run = 0;
      els.forEach(function (e) {
        var s = e.s, from, to, fill;
        if (s.base) { from = 0; to = s.v; run = s.v; fill = "#eef1f6"; }
        else if (s.total) { from = 0; to = run; fill = "#ffffff"; }
        else {
          var on = !s.claim || claim, d = on ? s.v : 0;
          from = run; to = run + d; if (on) run += s.v;
          fill = s.v >= 0 ? "#8ea2ff" : "#5b6b8f";
          e.r.classList.toggle("is-off", s.claim && !claim);
          if (s.claim && !claim) { from = run; to = run + s.v; }
        }
        var lo = Math.min(from, to), hi = Math.max(from, to);
        e.r.setAttribute("y", y(hi)); e.r.setAttribute("height", Math.max(2, y(lo) - y(hi))); e.r.setAttribute("fill", fill);
        e.r.classList.toggle("is-down", !s.base && !s.total && s.v < 0);
        e.v.setAttribute("y", y(hi) - 8);
        e.v.textContent = s.base || s.total ? (s.total ? run : s.v) + "K" : (s.claim && !claim ? "excluded" : (s.v > 0 ? "+" : "−") + Math.abs(s.v) + "K");
      });
      // The value range uses the example's 2.9x to 3.8x; coverage scales the example's 1.31x at $2.1M with the cash a buyer keeps.
      var adj = run;
      if (outEbitda) outEbitda.textContent = adj.toLocaleString("en-US") + ",000";
      if (outValue) { outValue.textContent = "$" + (adj * 2.9 / 1000).toFixed(1) + "–" + (adj * 3.8 / 1000).toFixed(1) + "M"; outValue.classList.toggle("is-changed", claim); }
      if (outDscr) { outDscr.textContent = (1.31 * adj / 548).toFixed(2) + "x"; outDscr.classList.toggle("is-changed", claim); }
      if (note) note.textContent = claim ? "The owner’s version adds $31K a year and lifts the range. A buyer’s lender will not count a cost that recurs every year." : "";
      if (sheet) { var row = sheet.querySelector("[data-key='marketing']"); if (row) row.classList.toggle("out", !claim); }
      var total = sheet && sheet.querySelector("[data-key='adjusted'] dd"); if (total) total.textContent = adj.toLocaleString("en-US") + ",000";
    }
    render();
    if (sw) {
      var flip = function () { claim = !claim; sw.setAttribute("aria-checked", String(claim)); render(); };
      sw.addEventListener("click", flip);
      var lbl = document.querySelector("[data-claim-label]"); if (lbl) lbl.addEventListener("click", function (e) { if (e.target !== sw) flip(); });
    }
    // Rows and bars light each other.
    if (sheet) [].forEach.call(sheet.querySelectorAll("[data-key]"), function (row) {
      var e = els.filter(function (x) { return x.s.key === row.getAttribute("data-key"); })[0];
      if (!e) return;
      var on = function () { row.classList.add("is-hot"); e.r.classList.add("is-hot"); };
      var off = function () { row.classList.remove("is-hot"); e.r.classList.remove("is-hot"); };
      row.addEventListener("pointerenter", on); row.addEventListener("pointerleave", off);
      e.r.addEventListener("pointerenter", on); e.r.addEventListener("pointerleave", off);
    });
    if (reduce || !("IntersectionObserver" in window)) { root.classList.add("is-drawn"); return; }
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { root.classList.add("is-drawn"); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(root);
  }

  // ---------- engagement steps light up one by one, and the rule fills across
  function steps() {
    var list = document.querySelector("[data-steps]");
    if (!list) return;
    var items = [].slice.call(list.querySelectorAll(".step")), fill = list.querySelector(".steps__fill");
    function run() {
      items.forEach(function (s, i) {
        setTimeout(function () {
          s.classList.add("is-on");
          if (fill) fill.style.setProperty("--progress", String((i + 1) / items.length));
          list.style.setProperty("--progress", String((i + 1) / items.length));
          if (i === items.length - 1) list.classList.add("is-done");
        }, reduce ? 0 : 160 + i * 260);
      });
    }
    if (reduce || !("IntersectionObserver" in window)) { items.forEach(function (s) { s.classList.add("is-on"); }); list.classList.add("is-done"); return; }
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { run(); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(list);
  }

  // ---------- How an engagement works: the five steps hold the screen and advance as you scroll
  function sequence() {
    var section = document.querySelector("[data-sequence]");
    if (!section) return;
    var track = section.querySelector(".seq-track");
    var steps = [].slice.call(section.querySelectorAll(".seq-step"));
    var art = [].slice.call(section.querySelectorAll(".vignette"));
    var digits = section.querySelector(".seq-digits"), fill = section.querySelector(".seq-fill");
    var wide = window.matchMedia("(min-width: 1000px)"), current = -1;
    function show(i) {
      if (i === current) return;
      current = i;
      steps.forEach(function (s, j) { s.classList.toggle("is-on", j === i); });
      art.forEach(function (a, j) { a.classList.toggle("is-on", j === i); });
      if (digits) digits.style.setProperty("--step", String(i));
    }
    function update() {
      if (!section.classList.contains("is-pinned")) return;
      var nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-nav-h")) || 80;
      var r = track.getBoundingClientRect();
      var run = r.height - (window.innerHeight - nav);
      var p = Math.max(0, Math.min(1, (nav - r.top) / Math.max(1, run)));
      if (fill) fill.style.setProperty("--p", p.toFixed(4));
      show(Math.min(steps.length - 1, Math.floor(p * steps.length * 0.9999)));
    }
    function apply() {
      var on = wide.matches && !reduce;
      section.classList.toggle("is-pinned", on);
      if (on) { current = -1; update(); }
    }
    wide.addEventListener("change", apply);
    apply();
    window.addEventListener("scroll", function () { requestAnimationFrame(update); }, { passive: true });
    window.addEventListener("resize", update);
  }

  // ---------- About: one team runs the whole cycle. A stage (in the list or the diagram) lights
  // the roles that lead it; while nobody is pointing, the cycle steps through on its own.
  function teamUnit() {
    var svg = document.querySelector("[data-unit]");
    if (!svg) return;
    var leads = { source: ["em", "sr"], analyze: ["an", "sr"], recheck: ["sr", "em"], present: ["em", "sr", "an"] };
    var order = ["source", "analyze", "recheck", "present"];
    var items = [].slice.call(document.querySelectorAll("[data-unit-list] [data-stage]"));
    var chips = [].slice.call(svg.querySelectorAll(".u-chip"));
    var roles = [].slice.call(svg.querySelectorAll(".u-role"));
    var held = false, i = 0, timer = 0;
    function light(stage) {
      if (stage) svg.setAttribute("data-active", stage); else svg.removeAttribute("data-active");
      chips.forEach(function (c) { c.classList.toggle("is-on", c.getAttribute("data-stage") === stage); });
      items.forEach(function (li) { li.classList.toggle("is-on", li.getAttribute("data-stage") === stage); });
      roles.forEach(function (r) { r.classList.toggle("is-lead", !!stage && leads[stage].indexOf(r.getAttribute("data-role")) > -1); });
    }
    function hold(stage) { held = true; light(stage); }
    function release() { held = false; }
    items.concat(chips).forEach(function (el) {
      var stage = el.getAttribute("data-stage");
      el.addEventListener("pointerenter", function () { hold(stage); });
      el.addEventListener("focus", function () { hold(stage); });
      el.addEventListener("pointerleave", release);
      el.addEventListener("blur", release);
    });
    light(order[0]);
    if (reduce || !("IntersectionObserver" in window)) return;
    new IntersectionObserver(function (en) {
      clearInterval(timer);
      if (en[0].isIntersecting) timer = setInterval(function () { if (held) return; i = (i + 1) % order.length; light(order[i]); }, 2400);
    }, { threshold: 0.3 }).observe(svg);
  }

  // ---------- headings, cards and photographs rise or open once on the way down
  function reveals() {
    var els = [].slice.call(document.querySelectorAll("[data-reveal], .reveal-photo"));
    if (!els.length) return;
    if (reduce || !("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("is-in"); }); return; }
    // A photograph waiting to open is clipped to nothing, so Chrome never sees it intersect:
    // watch its parent instead and open the photograph when the parent arrives.
    var watched = new Map();
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (x) {
        if (!x.isIntersecting) return;
        (watched.get(x.target) || []).forEach(function (el) { el.classList.add("is-in"); });
        io.unobserve(x.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
    els.forEach(function (e) {
      if (e.getBoundingClientRect().top < window.innerHeight * 0.9) { e.classList.add("is-in"); return; }
      var t = e.classList.contains("reveal-photo") ? e.parentElement : e;
      if (!watched.has(t)) { watched.set(t, []); io.observe(t); }
      watched.get(t).push(e);
    });
  }

  // ---------- the opening's photograph drifts slower than the page
  function drift() {
    var ph = document.querySelector(".hero__photo");
    if (!ph || reduce) return;
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () {
        var yv = Math.min(window.scrollY, window.innerHeight);
        ph.style.transform = "translate3d(0," + (yv * 0.18).toFixed(1) + "px,0)";
        ticking = false;
      });
    }, { passive: true });
  }
})();
