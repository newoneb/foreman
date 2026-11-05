// Foreman public site, version 4: header and menu, the exploded mark in the hero, the
// dot field, headline reveals, the situation selector, the pinned engagement sequence,
// the fit check, the interactive exhibit, the live portal preview, the organization
// drawing and the inquiry forms.
// Everything degrades to a complete, readable page without scripts or with reduced motion.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

setUpHeader();
setUpMenu();
document.querySelectorAll(".hero-title, .page-hero h1").forEach(splitLines);
setUpAxo();
setUpField();
setUpReveal();
setUpSelector();
setUpSequence();
setUpTimeline();
setUpGlow();
setUpFit();
setUpExhibit();
setUpMock();
setUpOrg();
setUpMagnetic();
openDetailsFromHash();
window.addEventListener("hashchange", openDetailsFromHash);
// Recruiting dates, info sessions, coffee chats, the team page and the recruiting card are
// read from the portal's database, so they load after the page itself.
import("./recruiting.js").then((m) => m.startRecruiting()).catch(() => {});
document.querySelectorAll("form.js-form").forEach(setUpForm);

function setUpHeader() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const update = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    header.style.setProperty("--progress", max > 0 ? (window.scrollY / max).toFixed(4) : "0");
  };
  update();
  window.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
  window.addEventListener("resize", update);
}

function setUpMenu() {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.getElementById("site-nav");
  if (!toggle || !nav) return;
  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  };
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) { setOpen(false); toggle.focus(); }
  });
  window.matchMedia("(min-width: 1080px)").addEventListener("change", (mq) => { if (mq.matches) setOpen(false); });
}

// Headlines rise line by line. The original markup comes back once they have landed,
// so resizing later reflows the text normally.
function splitLines(el) {
  if (reduceMotion || !el) return;
  const original = el.innerHTML;
  const tokens = [];
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent.split(/(\s+)/).forEach((part) => { if (part.trim()) tokens.push(escapeHtml(part)); });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      tokens.push(node.outerHTML);
    }
  });
  el.innerHTML = tokens.map((t) => `<span class="w">${t}</span>`).join(" ");
  const lines = [];
  let top = null;
  el.querySelectorAll(".w").forEach((w) => {
    if (top === null || Math.abs(w.offsetTop - top) > 4) { lines.push([]); top = w.offsetTop; }
    lines[lines.length - 1].push(w.innerHTML);
  });
  el.innerHTML = lines.map((words) => `<span class="line"><span>${words.join(" ")}</span></span>`).join("");
  el.querySelectorAll(".line > span").forEach((span, i) => span.style.setProperty("--n", String(i)));
  el.classList.add("is-split");
  window.setTimeout(() => { el.classList.remove("is-split"); el.innerHTML = original; }, 2200);
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// The hero mark comes apart into its six pieces, each standing for a question our work
// answers. It assembles, lifts into an exploded view, follows the pointer, and closes up
// again as the reader scrolls on.
function setUpAxo() {
  const fig = document.querySelector("[data-axo]");
  if (!fig) return;
  const stage = fig.querySelector(".axo-stage");
  const lines = fig.querySelector(".axo-lines");
  const NS = "http://www.w3.org/2000/svg";
  const wide = window.matchMedia("(min-width: 1000px)");
  const layers = [...fig.querySelectorAll(".axo-layer")].map((layer) => {
    const i = Number(layer.dataset.i);
    const path = layer.querySelector("path");
    const anchor = layer.querySelector(".axo-anchor");
    const drop = fig.querySelectorAll(".axo-drop")[i];
    const label = fig.querySelector(`.axo-labels li[data-i="${i}"]`);
    const box = path.getBBox();
    const left = `${((box.x + box.width / 2) / 873) * 100}%`;
    const top = `${((box.y + box.height / 2) / 926) * 100}%`;
    anchor.style.left = left;
    anchor.style.top = top;
    if (drop) { drop.style.left = left; drop.style.top = top; }
    const leader = document.createElementNS(NS, "path");
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("r", "2.5");
    lines.append(leader, dot);
    return { i, layer, path, anchor, label, leader, dot };
  });

  const hot = (k) => {
    layers.forEach((l) => {
      const on = l.i === k;
      l.layer.classList.toggle("is-hot", on);
      l.layer.classList.toggle("is-dim", k >= 0 && !on);
      l.layer.style.setProperty("--lift", on ? "28" : "0");
      if (l.label) l.label.classList.toggle("is-hot", on);
      l.leader.classList.toggle("is-hot", on);
      l.dot.classList.toggle("is-hot", on);
    });
  };
  layers.forEach((l) => {
    if (l.label) {
      l.label.addEventListener("pointerenter", () => hot(l.i));
      l.label.addEventListener("pointerleave", () => hot(-1));
      l.label.addEventListener("focusin", () => hot(l.i));
      l.label.addEventListener("focusout", () => hot(-1));
    }
    l.path.addEventListener("pointerenter", () => hot(l.i));
    l.path.addEventListener("pointerleave", () => hot(-1));
    l.path.addEventListener("click", () => { const a = l.label && l.label.querySelector("a"); if (a) a.click(); });
  });

  let t = 0, px = 0, pz = 0, aimX = 0, aimZ = 0, visible = true, frameId = 0, start = Infinity;
  // While the pointer is over the labels they hold still, so they never slide out from under it.
  const list = fig.querySelector(".axo-labels");
  let hold = false, heldYs = [];
  list.addEventListener("pointerenter", () => { hold = true; });
  list.addEventListener("pointerleave", () => { hold = false; });
  // The pieces assemble the first time the figure comes into view.
  const begin = () => {
    if (start !== Infinity) return;
    fig.classList.remove("is-waiting");
    if (!reduceMotion) fig.classList.add("is-assembling");
    start = performance.now() + (reduceMotion ? -1e6 : 1100);
  };
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  if (!reduceMotion && finePointer) {
    window.addEventListener("pointermove", (e) => {
      aimX = (e.clientY / window.innerHeight - 0.5) * -10;
      aimZ = (e.clientX / window.innerWidth - 0.5) * 14;
    }, { passive: true });
  }
  if (!reduceMotion) fig.classList.add("is-waiting");

  const place = (now) => {
    const figRect = fig.getBoundingClientRect();
    const intro = reduceMotion ? 1 : start === Infinity ? 0 : ease(clamp((now - start) / 1900));
    // It closes up again as it rises past the header.
    const scroll = reduceMotion ? 0 : clamp((90 - figRect.top) / (figRect.height * 0.95));
    t = intro * (1 - scroll);
    px += (aimX - px) * 0.06;
    pz += (aimZ - pz) * 0.06;
    stage.style.setProperty("--t", t.toFixed(4));
    stage.style.setProperty("--px", (px * t).toFixed(3));
    stage.style.setProperty("--pz", ((pz + (reduceMotion ? 0 : Math.sin(now / 2600) * 3)) * t).toFixed(3));
    layers.forEach((l) => l.layer.style.setProperty("--bob", reduceMotion ? "0" : (Math.sin(now / 1400 + l.i * 0.9) * 5).toFixed(2)));
    if (!wide.matches) return;
    const listRect = list.getBoundingClientRect();
    const pts = layers.map((l) => {
      const r = l.anchor.getBoundingClientRect();
      return { x: r.left - figRect.left, y: r.top - figRect.top };
    });
    const heights = layers.map((l) => (l.label ? l.label.offsetHeight : 40));
    let ys = heldYs;
    if (!hold || !ys.length) {
      // Each label sits level with its layer, pushed down only as far as it must be to clear
      // the one above it; the top one never rises above the figure.
      ys = [];
      const order = pts.map((_, i) => i).sort((a, b) => pts[a].y - pts[b].y);
      let lastY = null, lastH = 0;
      order.forEach((i) => {
        const h = heights[i];
        const floor = lastY === null ? h / 2 : lastY + lastH / 2 + h / 2 + 8;
        ys[i] = Math.max(pts[i].y, floor);
        lastY = ys[i];
        lastH = h;
      });
      heldYs = ys;
    }
    const lx = listRect.left - figRect.left;
    layers.forEach((l, i) => {
      const o = clamp((t - 0.72 - i * 0.025) / 0.2);
      if (l.label) {
        l.label.style.setProperty("--y", `${(ys[i] - heights[i] / 2).toFixed(1)}px`);
        l.label.style.setProperty("--o", o.toFixed(3));
        l.label.inert = o < 0.2;
      }
      l.leader.setAttribute("d", `M${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}L${(lx - 24).toFixed(1)} ${ys[i].toFixed(1)}L${(lx - 4).toFixed(1)} ${ys[i].toFixed(1)}`);
      l.leader.style.opacity = o.toFixed(3);
      l.dot.setAttribute("cx", pts[i].x.toFixed(1));
      l.dot.setAttribute("cy", pts[i].y.toFixed(1));
      l.dot.style.opacity = o.toFixed(3);
    });
  };
  const loop = (now) => {
    place(now);
    frameId = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
  };
  const wake = () => { if (!frameId && visible && !document.hidden) frameId = requestAnimationFrame(loop); };
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) begin();
    wake();
  }, { threshold: 0.2 }).observe(fig);
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("resize", () => { place(performance.now()); wake(); });
  if (reduceMotion) {
    begin();
    fig.classList.add("is-static");
    place(performance.now());
    window.addEventListener("resize", () => place(performance.now()));
  } else {
    wake();
  }
}

// A field of fine dots behind the hero, gathered into a lens around the pointer.
function setUpField() {
  document.querySelectorAll(".hero-field").forEach(field);
}

function field(canvas) {
  const ctx = canvas.getContext("2d");
  const host = canvas.parentElement;
  let w = 0, h = 0, mx = -999, my = -999, lens = 0, aim = 0;
  const size = () => {
    const r = canvas.getBoundingClientRect();
    w = r.width;
    h = r.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    const gap = 24, R = 170;
    for (let y = gap / 2; y < h; y += gap) {
      for (let x = gap / 2; x < w; x += gap) {
        const dx = x - mx, dy = y - my, dist = Math.hypot(dx, dy);
        const k = dist < R ? (1 - dist / R) ** 2 * lens : 0;
        const ox = dist ? (dx / dist) * k * 9 : 0;
        const oy = dist ? (dy / dist) * k * 9 : 0;
        ctx.fillStyle = k > 0.02 ? `rgba(36,70,216,${(0.16 + k * 0.5).toFixed(3)})` : "rgba(10,20,40,0.12)";
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, 0.9 + k * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  let scheduled = false;
  const frame = () => {
    scheduled = false;
    lens += (aim - lens) * 0.18;
    draw();
    if (Math.abs(aim - lens) > 0.004) schedule();
  };
  const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(frame); } };
  size();
  draw();
  window.addEventListener("resize", () => { size(); draw(); });
  if (reduceMotion || !finePointer) return;
  host.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    mx = e.clientX - r.left;
    my = e.clientY - r.top;
    aim = 1;
    schedule();
  });
  host.addEventListener("pointerleave", () => { aim = 0; schedule(); });
}

// Blocks below the first screen settle into place as they arrive. Anything already
// on screen at load is left alone, so the first view is always complete.
function setUpReveal() {
  const items = [...document.querySelectorAll(".reveal")];
  if (!items.length || reduceMotion || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.remove("is-pending"); io.unobserve(entry.target); }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  items.forEach((el) => {
    if (el.getBoundingClientRect().top > window.innerHeight * 0.92) {
      el.classList.add("is-pending");
      io.observe(el);
    }
  });
}

// Size each pill in a drawing to its text, which is set larger on phones.
function fitTags(scope) {
  scope.querySelectorAll(".diagram .tag, .org .tag").forEach((tag) => {
    const text = tag.querySelector("text");
    const rect = tag.querySelector("rect");
    const box = text.getBBox();
    if (!box.width) return;
    const padX = box.height * 0.62, padY = box.height * 0.3;
    rect.setAttribute("x", (box.x - padX).toFixed(1));
    rect.setAttribute("y", (box.y - padY).toFixed(1));
    rect.setAttribute("width", (box.width + padX * 2).toFixed(1));
    rect.setAttribute("height", (box.height + padY * 2).toFixed(1));
    rect.setAttribute("rx", ((box.height + padY * 2) / 2).toFixed(1));
  });
}

function setUpSelector() {
  document.querySelectorAll("[data-selector]").forEach((root) => {
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
    const play = (panel) => {
      fitTags(panel);
      panel.classList.remove("is-entering");
      void panel.offsetWidth;
      panel.classList.add("is-entering");
    };
    const select = (i, focus) => {
      tabs.forEach((t, j) => {
        const on = i === j;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
        if (on) play(panels[j]);
      });
      if (focus) tabs[i].focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(i, false));
      t.addEventListener("keydown", (e) => {
        const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
        if (e.key in keys) { e.preventDefault(); select((i + keys[e.key] + tabs.length) % tabs.length, true); }
      });
    });
    const refit = () => panels.forEach((p) => { if (!p.hidden) fitTags(p); });
    window.matchMedia("(max-width: 599px)").addEventListener("change", refit);
    if (document.fonts) document.fonts.ready.then(refit);
    // The first drawing plays when the selector comes into view.
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) { play(panels[tabs.findIndex((t) => t.getAttribute("aria-selected") === "true")]); io.disconnect(); }
      }, { threshold: 0.35 });
      io.observe(root);
    }
  });
}

// The five steps of an engagement hold the screen and advance as the reader scrolls.
function setUpSequence() {
  const section = document.querySelector("[data-sequence]");
  if (!section) return;
  const track = section.querySelector(".seq-track");
  const steps = [...section.querySelectorAll(".seq-step")];
  const art = [...section.querySelectorAll(".vignette")];
  const digits = section.querySelector(".seq-digits");
  const fill = section.querySelector(".seq-fill");
  const wide = window.matchMedia("(min-width: 1000px)");
  let current = -1;
  const show = (i) => {
    if (i === current) return;
    current = i;
    steps.forEach((s, j) => s.classList.toggle("is-on", j === i));
    art.forEach((a, j) => a.classList.toggle("is-on", j === i));
    digits.style.setProperty("--step", String(i));
  };
  const update = () => {
    if (!section.classList.contains("is-pinned")) return;
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header")) || 76;
    const r = track.getBoundingClientRect();
    const run = r.height - (window.innerHeight - header);
    const p = clamp((header - r.top) / Math.max(1, run));
    fill.style.setProperty("--p", p.toFixed(4));
    show(Math.min(steps.length - 1, Math.floor(p * steps.length * 0.9999)));
  };
  const apply = () => {
    const on = wide.matches && !reduceMotion;
    section.classList.toggle("is-pinned", on);
    if (on) { current = -1; update(); }
  };
  wide.addEventListener("change", apply);
  apply();
  window.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
  window.addEventListener("resize", update);
}

// The line beside the application steps fills as the reader moves through them.
function setUpTimeline() {
  const line = document.querySelector(".timeline");
  if (!line) return;
  const bar = line.querySelector(".timeline-progress");
  const steps = [...line.querySelectorAll(".step")];
  const update = () => {
    const r = line.getBoundingClientRect();
    const mark = window.innerHeight * 0.6;
    const p = clamp((mark - r.top) / r.height);
    if (bar) bar.style.setProperty("--p", reduceMotion ? "1" : p.toFixed(3));
    steps.forEach((s) => s.classList.toggle("is-active", s.getBoundingClientRect().top < mark));
  };
  update();
  window.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
  window.addEventListener("resize", update);
}

// A soft light follows the pointer across each practice.
function setUpGlow() {
  if (reduceMotion || !finePointer) return;
  document.querySelectorAll(".practice").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--gx", `${e.clientX - r.left}px`);
      card.style.setProperty("--gy", `${e.clientY - r.top}px`);
    });
  });
}

function setUpFit() {
  const fit = document.querySelector("[data-fit]");
  if (!fit) return;
  const rows = [...fit.querySelectorAll(".fit-row")];
  const bars = [...fit.querySelectorAll(".fit-meter i")];
  const message = fit.querySelector(".fit-message");
  const initial = message.textContent;
  const words = [
    initial,
    "Possibly a fit. Tell us about the company and we will let you know.",
    "Possibly a fit. Tell us about the company and we will let you know.",
    "A likely fit. Request a consultation and we will confirm.",
  ];
  rows.forEach((row) => row.addEventListener("click", () => {
    row.setAttribute("aria-checked", String(row.getAttribute("aria-checked") !== "true"));
    const n = rows.filter((r) => r.getAttribute("aria-checked") === "true").length;
    bars.forEach((b, i) => b.classList.toggle("on", i < n));
    fit.dataset.score = String(n);
    message.textContent = words[n];
  }));
}

// The illustrative review on the Services page recalculates as adjustments are accepted
// or set aside, and as the price a buyer pays changes.
function setUpExhibit() {
  const ex = document.querySelector("[data-exhibit]");
  if (!ex) return;
  const REPORTED = 612000;
  const OTHER_COSTS = 60000 + 88000; // maintenance capital expenditure and estimated taxes
  const LOW = 2.9, HIGH = 3.8, MIN = 1.25;
  const rate = 0.105 / 12, months = 120;
  const payment = rate / (1 - Math.pow(1 + rate, -months)); // per dollar borrowed, monthly
  const yearlyService = (price) => price * 0.9 * payment * 12;
  const rows = [...ex.querySelectorAll(".ex-row")];
  const slider = ex.querySelector('input[type="range"]');
  const out = (name) => ex.querySelector(`[data-out="${name}"]`);
  const money = (n) => `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, "")}M`;
  const range = (n) => `$${(n / 1e6).toFixed(1)}M`;
  const thousands = (n) => Math.round(n).toLocaleString("en-US");
  const svg = ex.querySelector("[data-waterfall]");
  const NS = "http://www.w3.org/2000/svg";
  const labels = ["Reported", ...rows.map((r) => r.dataset.short), "Adjusted"];
  const bars = labels.map((text, i) => {
    const rect = document.createElementNS(NS, "rect");
    const value = document.createElementNS(NS, "text");
    const name = document.createElementNS(NS, "text");
    name.textContent = text;
    svg.append(rect, value, name);
    return { rect, value, name, i };
  });
  const axis = document.createElementNS(NS, "path");
  axis.setAttribute("class", "wf-axis");
  svg.append(axis);
  const top = 18, base = 132, lo = 440000, hi = 720000;
  const y = (v) => base - ((v - lo) / (hi - lo)) * (base - top);
  // The chart is drawn at the size it is shown, so its labels stay legible on a phone;
  // where the columns get narrow, alternate names drop to a second line.
  let W = 520, step = W / bars.length, stagger = false, last = REPORTED;
  const layout = () => {
    W = Math.round(svg.getBoundingClientRect().width) || 520;
    step = W / bars.length;
    stagger = step < 68;
    svg.setAttribute("viewBox", `0 0 ${W} ${stagger ? 168 : 156}`);
    axis.setAttribute("d", `M0 ${base}H${W}`);
  };

  const draw = (ebitda) => {
    last = ebitda;
    let running = REPORTED;
    const put = (b, from, to, cls, text) => {
      const x = b.i * step + step * 0.18;
      const width = step * 0.64;
      const y1 = y(Math.max(from, to));
      const y2 = y(Math.min(from, to));
      b.rect.setAttribute("x", x.toFixed(1));
      b.rect.setAttribute("width", width.toFixed(1));
      b.rect.style.setProperty("y", `${y1.toFixed(1)}px`);
      b.rect.style.setProperty("height", `${Math.max(1, y2 - y1).toFixed(1)}px`);
      b.rect.setAttribute("class", cls);
      b.value.textContent = text;
      b.value.setAttribute("x", (x + width / 2).toFixed(1));
      b.value.setAttribute("y", (y1 - 5).toFixed(1));
      b.value.setAttribute("text-anchor", "middle");
      // On narrow charts the end names align to their bars' outer edges so they stay inside.
      const edge = stagger && (b.i === 0 || b.i === bars.length - 1);
      b.name.setAttribute("x", (edge ? (b.i === 0 ? x : x + width) : x + width / 2).toFixed(1));
      b.name.setAttribute("y", String(base + 16 + (stagger && b.i % 2 ? 13 : 0)));
      b.name.setAttribute("text-anchor", edge ? (b.i === 0 ? "start" : "end") : "middle");
    };
    put(bars[0], lo, REPORTED, "wf-base", "612");
    // The axis starts above zero, so the two totals carry the usual break marks.
    [bars[0], bars[bars.length - 1]].forEach((b) => {
      if (!b.cut) {
        b.cut = document.createElementNS(NS, "path");
        b.cut.setAttribute("class", "wf-break");
        svg.append(b.cut);
      }
      const x = b.i * step + step * 0.18 - 3;
      b.cut.setAttribute("d", `M${x.toFixed(1)} ${base - 10}l${(step * 0.64 + 6).toFixed(1)} -6M${x.toFixed(1)} ${base - 5}l${(step * 0.64 + 6).toFixed(1)} -6`);
    });
    rows.forEach((row, k) => {
      const amount = Number(row.dataset.amount);
      const on = row.querySelector(".ex-toggle").getAttribute("aria-checked") === "true";
      const next = running + (on ? amount : 0);
      const cls = !on ? "wf-off" : amount > 0 ? "wf-up" : "wf-down";
      put(bars[k + 1], running, on ? next : running + amount, cls, `${amount > 0 ? "+" : "−"}${Math.abs(amount / 1000)}`);
      running = next;
    });
    put(bars[bars.length - 1], lo, ebitda, "wf-base", String(Math.round(ebitda / 1000)));
  };

  const update = () => {
    const ebitda = rows.reduce((sum, row) => {
      const on = row.querySelector(".ex-toggle").getAttribute("aria-checked") === "true";
      row.classList.toggle("is-off", !on);
      return sum + (on ? Number(row.dataset.amount) : 0);
    }, REPORTED);
    const price = Number(slider.value);
    const cash = ebitda - OTHER_COSTS;
    const dscr = cash / yearlyService(price);
    const ceiling = cash / (MIN * yearlyService(1));
    out("ebitda").textContent = thousands(ebitda);
    out("value").textContent = `${range(ebitda * LOW)}–${range(ebitda * HIGH)}`;
    out("price").textContent = money(price);
    out("price-label").textContent = money(price);
    out("dscr").textContent = `${dscr.toFixed(2)}x`;
    out("dscr").classList.toggle("is-bad", dscr < MIN);
    out("dscr-note").textContent = dscr >= MIN ? "Above the SBA minimum of 1.25x" : "Below the SBA minimum of 1.25x";
    out("ceiling").textContent = money(ceiling);
    const gauge = ex.querySelector(".ex-gauge");
    gauge.style.setProperty("--g", `${(clamp((dscr - 1) / 1) * 100).toFixed(1)}%`);
    gauge.style.setProperty("--min", `${((MIN - 1) / 1) * 100}%`);
    gauge.classList.toggle("is-bad", dscr < MIN);
    draw(ebitda);
  };
  rows.forEach((row) => {
    const toggle = row.querySelector(".ex-toggle");
    toggle.addEventListener("click", () => {
      toggle.setAttribute("aria-checked", String(toggle.getAttribute("aria-checked") !== "true"));
      update();
    });
  });
  slider.addEventListener("input", update);
  let resizing = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizing);
    resizing = requestAnimationFrame(() => { layout(); draw(last); });
  });
  layout();
  update();
}

// The portal preview on the owners page plays through a week of an engagement.
function setUpMock() {
  const mock = document.querySelector("[data-mock]");
  if (!mock || reduceMotion) return;
  const rows = [...mock.querySelectorAll(".mock-row")];
  const stages = [...mock.querySelectorAll(".mock-stages span")];
  const stageText = mock.querySelector("[data-mock-stage]");
  const update = mock.querySelector("[data-mock-update]");
  const first = { stage: stageText.textContent, update: update.innerHTML };
  const steps = [
    () => receive(2),
    () => receive(3),
    () => {
      stages[3].classList.add("on");
      stageText.textContent = "Stage 4 of 5: analysis and review";
      update.innerHTML = "<b>Week four update</b><span>All four records are in. Your team is building the analysis, and a second team will review it.</span>";
      update.classList.remove("is-new");
      void update.offsetWidth;
      update.classList.add("is-new");
    },
    () => {},
    () => {
      [2, 3].forEach((i) => { const em = rows[i].querySelector("em"); em.textContent = "Requested"; em.classList.add("wait"); });
      stages[3].classList.remove("on");
      stageText.textContent = first.stage;
      update.innerHTML = first.update;
    },
  ];
  function receive(i) {
    const em = rows[i].querySelector("em");
    em.textContent = "Received";
    em.classList.remove("wait");
    rows[i].classList.remove("is-new");
    void rows[i].offsetWidth;
    rows[i].classList.add("is-new");
  }
  let n = 0, timer = 0;
  const run = () => { steps[n % steps.length](); n += 1; timer = window.setTimeout(run, n % steps.length === 0 ? 1600 : 2300); };
  new IntersectionObserver(([entry]) => {
    window.clearTimeout(timer);
    if (entry.isIntersecting) timer = window.setTimeout(run, 1400);
  }, { threshold: 0.4 }).observe(mock);
}

// Primary buttons lean slightly toward the pointer.
// About: the organization drawing and the list beside it point at each other.
function setUpOrg() {
  const chart = document.querySelector("[data-org-chart]");
  const list = document.querySelector("[data-org-list]");
  if (!chart || !list) return;
  const items = [...list.querySelectorAll("li[data-org]")];
  const parts = [...chart.querySelectorAll("[data-org]")];
  const hot = (key) => {
    if (key) chart.dataset.hot = key; else delete chart.dataset.hot;
    items.forEach((li) => li.classList.toggle("is-hot", li.dataset.org === key));
    parts.forEach((g) => g.classList.toggle("is-hot", g.dataset.org === key));
  };
  [...items, ...parts].forEach((el) => {
    el.addEventListener("pointerenter", () => hot(el.dataset.org));
    el.addEventListener("pointerleave", () => hot(null));
  });
  fitTags(chart);
  if (document.fonts) document.fonts.ready.then(() => fitTags(chart));
  window.matchMedia("(max-width: 599px)").addEventListener("change", () => fitTags(chart));
  // It draws itself, tier by tier, the first time it comes into view.
  if (reduceMotion || !("IntersectionObserver" in window)) return;
  chart.classList.add("is-waiting");
  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    chart.classList.remove("is-waiting");
    chart.classList.add("is-drawn");
    io.disconnect();
  }, { threshold: 0.4 });
  io.observe(chart);
}

function setUpMagnetic() {
  if (reduceMotion || !finePointer) return;
  document.querySelectorAll(".btn").forEach((btn) => {
    btn.addEventListener("pointermove", (e) => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty("--mx", `${((e.clientX - r.left) / r.width - 0.5) * 8}px`);
      btn.style.setProperty("--my", `${((e.clientY - r.top) / r.height - 0.5) * 6}px`);
    });
    btn.addEventListener("pointerleave", () => { btn.style.setProperty("--mx", "0px"); btn.style.setProperty("--my", "0px"); });
  });
}

function openDetailsFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const el = id && document.getElementById(id);
  if (el && el.tagName === "DETAILS") el.open = true;
}

// Inquiries go to Netlify Forms and, once the portal is connected, to the database too,
// so a request is never lost whichever is set up first.
function setUpForm(form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector(".form-status");
    const label = button ? button.innerHTML : "";
    if (button) { button.disabled = true; button.textContent = "Sending…"; }
    if (status) status.hidden = true;
    const data = Object.fromEntries(new FormData(form).entries());
    const preview = !!window.FOREMAN_PREVIEW;
    let delivered = false;
    try {
      if (!preview) {
        const res = await fetch("/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(new FormData(form)).toString(),
        });
        delivered = res.ok;
      }
    } catch (_) { /* fall through to the database */ }
    try {
      if (form.dataset.inquiry) {
        const { db } = await import("./db.js");
        await db.createInquiry({ ...data, kind: form.dataset.inquiry });
        if (db.live) delivered = true;
      }
    } catch (_) { /* reported below if nothing else worked */ }
    if (delivered || preview) { showDone(form, preview); return; }
    if (button) { button.disabled = false; button.innerHTML = label; }
    if (status) {
      status.textContent = "Your message didn't go through. Check your connection and try again. If it keeps failing, message us on LinkedIn.";
      status.hidden = false;
    }
  });
}

function showDone(form, preview) {
  const panel = document.createElement("div");
  panel.className = "form-done";
  panel.setAttribute("role", "status");
  panel.tabIndex = -1;
  const h = document.createElement("h3");
  h.textContent = form.dataset.doneTitle || "Thank you. We have your message.";
  const p = document.createElement("p");
  p.textContent = form.dataset.doneText || "We reply by email within a few business days.";
  panel.append(h, p);
  if (preview) {
    const n = document.createElement("p");
    n.className = "fine";
    n.textContent = "This is a design preview, so nothing was sent.";
    panel.append(n);
  }
  form.replaceWith(panel);
  panel.focus({ preventScroll: true });
  panel.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
}
