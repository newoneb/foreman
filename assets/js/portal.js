// Foreman portal: sign-in, the student application, client engagements, the member
// library and the administration views. Each view has its own address (#apply,
// #engagement-<id>, #applications), so any page can be bookmarked or shared with a
// colleague who has access. Every read and write goes through db.js.

import { db, inviteCode, MAX_FILE_MB, MAX_RESUME_MB } from "./db.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const main = document.getElementById("portal-main");
const nav = document.getElementById("portal-nav");
const shell = document.getElementById("portal-shell");
const userBox = document.getElementById("portal-user");
const demoBar = document.getElementById("portal-demo");
const toastBox = document.getElementById("portal-toast");

// ---------------------------------------------------------------- vocabulary

const PRACTICE = { succession: "Succession advisory", operations: "Operations improvement" };
const STAGES = [
  { key: "intro", label: "Introduction" },
  { key: "scope", label: "Agreement and scope" },
  { key: "records", label: "Records and interviews" },
  { key: "analysis", label: "Analysis and review" },
  { key: "presentation", label: "Final presentation" },
];
const APP_STATUS = { draft: "Draft", submitted: "Under review", interview_1: "First interview", interview_2: "Case interview", accepted: "Accepted", declined: "Declined" };
const APP_TONE = { draft: "muted", submitted: "new", interview_1: "active", interview_2: "active", accepted: "ok", declined: "muted" };
const APP_STEPS = ["Written application", "First interview", "Case interview", "Decision"];
const INQ_STATUS = { new: "New", contacted: "Contacted", engaged: "Engaged", closed: "Closed" };
const INQ_TONE = { new: "new", contacted: "active", engaged: "ok", closed: "muted" };
const RECOMMEND = { advance: "Advance", hold: "Hold", decline: "Decline" };
const RECOMMEND_TONE = { advance: "ok", hold: "active", decline: "muted" };
const ROLE = { user: "Account", member: "Member", admin: "Administrator" };
const TEAM_TITLES = ["Engagement manager", "Analyst", "Reviewer"];
const CATEGORIES = ["Training", "Templates", "Guides", "Cases"];
const YEARS = ["First-year", "Second-year", "Third-year", "Fourth-year", "Graduate student"];
const HEARD = ["A friend or member", "Activities fair", "Instagram", "LinkedIn", "A class or professor", "Other"];
const WORD_LIMIT = 250;
const QUESTIONS = [
  { name: "q1", label: "Why do you want to join Foreman?" },
  { name: "q2", label: "Choose a small business you know well. How does it make money, and what would concern you if you were buying it?" },
  { name: "q3", label: "Describe a time you worked through a difficult problem with other people. What did you contribute?" },
];
const CHECKLISTS = {
  succession: [
    { title: "Business tax returns, last three years", note: "Form 1120-S, 1065 or Schedule C, with all schedules." },
    { title: "Year-to-date profit and loss statement", note: "From your accounting system, through the latest month end." },
    { title: "Balance sheet", note: "As of the latest month end." },
    { title: "Payroll summary", note: "Annual totals by role. Names can be removed." },
    { title: "Debt schedule", note: "Loans, lines of credit and equipment financing, with balances and monthly payments." },
    { title: "Lease or property details", note: "The current lease, or the property tax bill if the owner holds the building." },
  ],
  operations: [
    { title: "Year-to-date profit and loss statement", note: "From your accounting system, through the latest month end." },
    { title: "Sales by customer, last twelve months", note: "Exported from your accounting or invoicing system." },
    { title: "Sales by product or service line", note: "Last twelve months, with cost of goods where available." },
    { title: "Accounts receivable aging", note: "As of the latest month end." },
    { title: "Payroll summary", note: "Annual totals by role. Names can be removed." },
    { title: "Price list or rate card", note: "Current prices, and any standard discounts." },
  ],
};

// ---------------------------------------------------------------- state

const S = {
  profile: null,
  links: [],
  clientEngagements: [],
  hasApplication: false,
  counts: { inquiries: 0, applications: 0 },
  recovery: false,
  linkNotice: "",
  prefill: null,
  appFilter: "submitted",
  inqFilter: "new",
  peopleFilter: "all",
  keepScroll: false,
};
let token = 0;
let authBusy = false;
let loadTimer = 0;

const ROUTES = {
  home: { view: viewHome },
  apply: { view: viewApply },
  join: { view: viewJoin },
  account: { view: viewAccount },
  engagement: { view: viewEngagement },
  engagements: { view: viewEngagements, roles: ["member", "admin"] },
  library: { view: viewLibrary, roles: ["member", "admin"] },
  overview: { view: viewOverview, roles: ["admin"] },
  applications: { view: viewApplications, roles: ["admin"] },
  application: { view: viewApplication, roles: ["admin"] },
  inquiries: { view: viewInquiries, roles: ["admin"] },
  people: { view: viewPeople, roles: ["admin"] },
  announcements: { view: viewAnnouncements, roles: ["admin"] },
};

init();

// ---------------------------------------------------------------- start-up and routing

async function init() {
  try {
    db.onAuth(onAuthEvent);
    await refresh();
  } catch (err) {
    main.replaceChildren(h("div", { class: "p-view" },
      h("h1", { class: "p-title" }, "The portal is unavailable."),
      h("p", { class: "p-sub" }, err.message || "Please try again in a few minutes."),
      h("div", { class: "actions mt-m" }, h("button", { class: "btn", type: "button", onclick: () => location.reload() }, "Try again"))));
    return;
  }
  window.addEventListener("hashchange", () => route());
  route();
}

async function onAuthEvent(event) {
  if (event === "PASSWORD_RECOVERY") {
    S.recovery = true;
    await refresh();
    route();
    return;
  }
  if (authBusy) return;
  if ((event === "SIGNED_OUT" && S.profile) || (event === "SIGNED_IN" && !S.profile)) {
    await refresh();
    route();
  }
}

async function refresh() {
  const session = await db.session();
  S.profile = session ? session.profile : null;
  S.links = [];
  S.clientEngagements = [];
  S.hasApplication = false;
  S.counts = { inquiries: 0, applications: 0 };
  if (S.profile) {
    S.links = await db.myLinks();
    if (S.profile.role === "user") {
      const [engagements, application] = await Promise.all([S.links.length ? db.listEngagements() : [], db.myApplication()]);
      S.clientEngagements = engagements.filter((e) => e.my_kind === "client");
      S.hasApplication = Boolean(application);
    }
    if (S.profile.role === "admin") await updateCounts();
  }
  renderChrome();
}

async function updateCounts(inquiries, applications) {
  const [inq, apps] = await Promise.all([inquiries || db.listInquiries(), applications || db.listApplications()]);
  S.counts = {
    inquiries: inq.filter((i) => i.status === "new").length,
    applications: apps.filter((a) => a.status === "submitted").length,
  };
  if (S.profile) renderNav();
}

function defaultView() {
  if (!S.profile) return "signin";
  if (S.profile.role === "admin") return "overview";
  if (S.profile.role === "user" && S.clientEngagements.length === 1 && !S.hasApplication) return `engagement-${S.clientEngagements[0].id}`;
  return "home";
}

function go(hash, replace = false) {
  if (location.hash.slice(1) === hash) return route();
  if (replace) location.replace(`#${hash}`);
  else location.hash = hash;
}

// Re-draw the current view in place after a change, keeping the reader's position.
function again() {
  S.keepScroll = true;
  return route();
}

// Links from Supabase emails arrive with tokens or an error in the hash.
function handleAuthLink() {
  const hash = location.hash.slice(1);
  if (!/(^|&)(access_token|error_description)=/.test(hash)) return "none";
  const params = new URLSearchParams(hash);
  if (params.get("error_description")) {
    S.linkNotice = "That link has expired or has already been used. Sign in, or ask for a new link.";
  } else {
    if (params.get("type") === "recovery") S.recovery = true;
    if (!S.profile) return "wait"; // Supabase is still finishing the sign-in; an auth event follows
  }
  history.replaceState(null, "", location.pathname + location.search);
  return "done";
}

async function route() {
  if (handleAuthLink() === "wait") return;
  let raw = "";
  try { raw = decodeURIComponent(location.hash.slice(1)); } catch (_) { raw = ""; }
  if (raw && document.getElementById(raw)) return; // in-page anchors, such as the skip link
  const t = ++token;
  const cut = raw.indexOf("-");
  const view = cut < 0 ? raw : raw.slice(0, cut);
  const id = cut < 0 ? "" : raw.slice(cut + 1);

  if (S.recovery && S.profile) return viewNewPassword(t);
  if (!S.profile) {
    const notice = S.linkNotice;
    S.linkNotice = "";
    return viewSignIn(t, {
      mode: notice ? "signin" : ["signup", "apply", "join"].includes(view) ? "signup" : view === "forgot" ? "forgot" : "signin",
      context: view,
      notice,
    });
  }
  const r = ROUTES[view];
  if (!r || (r.roles && !r.roles.includes(S.profile.role))) return go(defaultView(), true);
  markNav();
  clearTimeout(loadTimer);
  if (!S.keepScroll) {
    loadTimer = setTimeout(() => {
      if (t === token) main.replaceChildren(h("p", { class: "p-loading", role: "status" }, "Loading"));
    }, 280);
  }
  try {
    await r.view(t, id);
  } catch (err) {
    if (t === token) failure(t, err);
  } finally {
    if (t === token) clearTimeout(loadTimer);
  }
}

function failure(t, err) {
  S.keepScroll = false;
  screen(t, { title: "This page didn't load.", sub: err.message || "Something went wrong." },
    h("div", { class: "actions" },
      h("button", { class: "btn", type: "button", onclick: () => route() }, "Try again"),
      h("a", { class: "link", href: `#${defaultView()}` }, "Go to your home page", icon("arrow"))));
}

// ---------------------------------------------------------------- page chrome

function renderChrome() {
  const p = S.profile;
  shell.classList.toggle("is-auth", !p);
  nav.hidden = !p;
  userBox.hidden = !p;
  if (p) {
    userBox.replaceChildren(
      h("div", { class: "p-who" },
        h("span", { class: "p-who-name" }, p.full_name || p.email),
        h("span", { class: "p-who-role" }, roleLabel())),
      h("button", { class: "p-textbtn", type: "button", onclick: signOut }, "Sign out"));
    renderNav();
  } else {
    nav.replaceChildren();
  }
  renderDemoBar();
}

function roleLabel() {
  const p = S.profile;
  if (!p) return "";
  if (p.role !== "user") return ROLE[p.role];
  if (S.clientEngagements.length) return "Client";
  return S.hasApplication ? "Applicant" : "Account";
}

function renderNav() {
  const p = S.profile;
  if (!p) return;
  const items = [];
  const item = (hash, label, badge = 0) => items.push({ hash, label, badge });
  if (p.role === "admin") {
    item("overview", "Overview");
    item("applications", "Applications", S.counts.applications);
    item("inquiries", "Inquiries", S.counts.inquiries);
    item("engagements", "Engagements");
    item("people", "People");
    items.push("sep");
    item("library", "Library");
    item("announcements", "Announcements");
  } else if (p.role === "member") {
    item("home", "Home");
    item("engagements", "Engagements");
    item("library", "Library");
  } else {
    item("home", "Home");
    for (const e of S.clientEngagements) item(`engagement-${e.id}`, e.company);
    if (S.hasApplication || !S.clientEngagements.length) item("apply", "Application");
  }
  items.push("sep");
  item("account", "Account");
  nav.replaceChildren(h("ul", { class: "p-nav" }, items.map((it) => it === "sep"
    ? h("li", { class: "p-nav-sep", "aria-hidden": "true" })
    : h("li", {}, h("a", { href: `#${it.hash}`, "data-hash": it.hash },
      h("span", {}, it.label),
      it.badge ? h("span", { class: "p-badge", title: `${it.badge} waiting` }, String(it.badge)) : null)))));
  markNav();
}

function markNav() {
  const current = location.hash.slice(1);
  const view = current.split("-")[0];
  const parent = { application: "applications", engagement: "engagements" }[view];
  const links = [...nav.querySelectorAll("a[data-hash]")];
  const exact = links.some((a) => a.dataset.hash === current);
  for (const a of links) {
    const on = a.dataset.hash === current || (!exact && a.dataset.hash === parent);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

function renderDemoBar() {
  if (!db.demo) { demoBar.hidden = true; return; }
  demoBar.hidden = false;
  const current = db.demoRole();
  demoBar.replaceChildren(h("div", { class: "p-demo-inner" },
    h("p", {}, h("strong", {}, "Demo mode."), h("span", { class: "p-demo-note" }, " Sample records, kept only in this browser.")),
    h("div", { class: "p-demo-switch", role: "group", "aria-label": "View the portal as" },
      h("span", {}, "View as"),
      db.demoAccounts.map((a) => h("button", { type: "button", "aria-pressed": String(a.key === current), onclick: () => switchDemo(a.key) }, a.label))),
    h("button", { type: "button", class: "p-textbtn", onclick: resetDemo }, "Reset sample data")));
}

async function switchDemo(key) {
  await db.demoSignIn(key);
  await refresh();
  go(defaultView(), true);
}

async function resetDemo() {
  await db.resetDemo();
  await refresh();
  toast("Sample data restored.");
  go(defaultView(), true);
}

async function signOut() {
  authBusy = true;
  try {
    await db.signOut();
  } finally {
    authBusy = false;
  }
  await refresh();
  go("signin", true);
}

// ---------------------------------------------------------------- building blocks

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "value") value = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (["checked", "selected", "disabled", "hidden", "required", "multiple"].includes(k)) el[k] = Boolean(v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  if (value != null) el.value = value;
  return el;
}

const ICONS = {
  arrow: '<path d="M1.5 8h12M9 3.5 13.5 8 9 12.5"/>',
  back: '<path d="M14.5 8h-12M7 3.5 2.5 8 7 12.5"/>',
  file: '<path d="M4 1.5h5.25L12.5 4.75V14.5H4z"/><path d="M9 1.5v3.5h3.5"/>',
  upload: '<path d="M8 10.5V2.5M4.75 5.5 8 2.5l3.25 3"/><path d="M2.5 10v3.5h11V10"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  external: '<path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5"/><path d="M12 9.5v4H2.5V4h4"/>',
};
function icon(name) {
  const span = document.createElement("span");
  span.className = "p-icon";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg viewBox="0 0 16 16" focusable="false" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
}

// Draw a view. Ignored if the reader has already moved on to another one.
function screen(t, { title, sub, back, actions, cls }, ...content) {
  if (t !== token) return null;
  clearTimeout(loadTimer);
  const heading = h("h1", { class: "p-title", tabindex: "-1" }, title);
  const view = h("div", { class: `p-view${cls ? ` ${cls}` : ""}` },
    h("header", { class: "p-head" },
      back ? h("a", { class: "p-crumb", href: back.href }, icon("back"), back.label) : null,
      h("div", { class: "p-head-row" },
        h("div", { class: "p-head-text" }, heading, sub ? h("p", { class: "p-sub" }, sub) : null),
        actions ? h("div", { class: "p-head-actions" }, actions) : null)),
    ...content);
  const y = window.scrollY;
  main.replaceChildren(view);
  if (S.keepScroll) {
    view.classList.add("is-quiet");
    window.scrollTo(0, y);
  } else {
    window.scrollTo(0, 0);
    heading.focus({ preventScroll: true });
  }
  S.keepScroll = false;
  countUp(view);
  return view;
}

function sec({ title, note, action, cls }, ...content) {
  return h("section", { class: `p-section${cls ? ` ${cls}` : ""}` },
    h("div", { class: "p-section-head" },
      h("h2", {}, title),
      note ? h("span", { class: "p-section-note" }, note) : null,
      action ? h("div", { class: "p-section-action" }, action) : null),
    ...content);
}

const empty = (text) => h("p", { class: "p-empty" }, text);
const pill = (label, tone = "muted") => h("span", { class: "p-pill", "data-tone": tone }, label);
const textBtn = (label, onclick, tone) => h("button", { type: "button", class: `p-textbtn${tone ? ` ${tone}` : ""}`, onclick }, label);
const arrowLink = (href, label) => h("a", { class: "link", href }, label, icon("arrow"));

let fieldCount = 0;
function field({ label, name, type = "text", value = "", required, optional, hint, rows, options, placeholder, autocomplete, wide, readonly, accept }) {
  const id = `field-${++fieldCount}`;
  let control;
  if (type === "textarea") {
    control = h("textarea", { id, name, rows: rows || 5, required, placeholder, value });
  } else if (type === "select") {
    control = h("select", { id, name, required },
      h("option", { value: "" }, required ? "Select" : "Not specified"),
      options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        return h("option", { value: v, selected: v === value }, typeof o === "string" ? o : o.label);
      }));
  } else {
    control = h("input", { id, name, type, required, placeholder, autocomplete, accept, readonly, value: type === "file" ? null : value });
  }
  return h("div", { class: `field${wide ? " wide" : ""}` },
    h("label", { for: id }, label, optional ? h("span", { class: "opt" }, " (optional)") : null),
    control,
    hint ? h("p", { class: "p-hint" }, hint) : null);
}

function choices(name, options, value, { required, label } = {}) {
  return h("fieldset", { class: "p-choices" },
    h("legend", {}, label),
    h("div", { class: "choices" }, options.map(([v, text]) => {
      const id = `field-${++fieldCount}`;
      return h("label", { class: "choice", for: id },
        h("input", { id, type: "radio", name, value: v, checked: v === value, required }),
        h("span", {}, text));
    })));
}

const formData = (form) => Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));

function say(el, text, tone = "") {
  el.textContent = text || "";
  el.dataset.tone = tone;
  el.hidden = !text;
}

async function busy(button, label, fn) {
  const before = button ? [...button.childNodes] : null;
  if (button) { button.disabled = true; button.textContent = label; }
  try {
    return await fn();
  } finally {
    if (button && button.isConnected) { button.disabled = false; button.replaceChildren(...before); }
  }
}

async function act(button, label, fn) {
  try {
    await busy(button, label, fn);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.", "bad");
  }
}

// A confirmation that appears in place, next to the control that asked for it.
function confirmInline(anchor, { text, yes, danger = false }, action) {
  const yesBtn = h("button", { type: "button", class: `btn btn-small${danger ? " btn-danger" : ""}` }, yes);
  const noBtn = h("button", { type: "button", class: "p-textbtn" }, "Cancel");
  const panel = h("div", { class: "p-confirm", role: "group" }, h("p", {}, text), h("div", { class: "p-confirm-actions" }, yesBtn, noBtn));
  anchor.hidden = true;
  anchor.after(panel);
  yesBtn.focus();
  noBtn.addEventListener("click", () => { panel.remove(); anchor.hidden = false; anchor.focus(); });
  yesBtn.addEventListener("click", () => act(yesBtn, "Working…", action));
}

function toast(message, tone = "") {
  const el = h("div", { class: "p-toast-item", "data-tone": tone }, message);
  toastBox.append(el);
  setTimeout(() => el.remove(), tone === "bad" ? 6500 : 4200);
}

function countUp(root) {
  if (reduceMotion) return;
  root.querySelectorAll("[data-count]").forEach((el) => {
    const n = Number(el.dataset.count);
    if (!n) return;
    const start = performance.now();
    const step = (time) => {
      const p = Math.min(1, (time - start) / 750);
      el.textContent = String(Math.round(n * (1 - (1 - p) ** 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = "0";
    requestAnimationFrame(step);
  });
}

async function copyText(text, holder) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied.");
  } catch (_) {
    const code = holder && holder.querySelector("code");
    if (code) {
      const range = document.createRange();
      range.selectNodeContents(code);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    toast("The link is selected. Press Ctrl+C or ⌘C to copy it.");
  }
}

function toDate(v) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
const date = (v) => toDate(v)?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) || "";
const time = (v) => toDate(v)?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) || "";
const dateTime = (v) => (v ? `${date(v)}, ${time(v)}` : "");
const today = () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
function ago(v) {
  const s = (Date.now() - toDate(v)) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return "Yesterday";
  return d < 7 ? `${d} days ago` : date(v);
}
const isoDay = (offset = 0) => {
  const d = new Date(Date.now() + offset * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
function size(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  return n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}
const words = (s) => (String(s || "").trim() ? String(s).trim().split(/\s+/).length : 0);
const initials = (s) => String(s || "").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "F";
const firstName = (p) => String(p.full_name || "").split(/\s+/)[0];
const stageIndex = (stage) => (stage === "complete" ? STAGES.length : Math.max(0, STAGES.findIndex((s) => s.key === stage)));
function stageText(stage) {
  if (stage === "complete") return "Complete";
  const i = stageIndex(stage);
  return `Stage ${i + 1} of ${STAGES.length}: ${STAGES[i].label}`;
}
function safeHref(url) {
  try {
    const u = new URL(url, location.href);
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? u.href : null;
  } catch (_) {
    return null;
  }
}
const inviteUrl = (code) => `${location.origin}${location.pathname}#join-${code}`;

function stageBar(stage) {
  const done = stageIndex(stage);
  return h("span", { class: "p-stagebar", "aria-hidden": "true" },
    STAGES.map((s, i) => h("i", { class: i < done || (i === done && stage !== "complete") ? "on" : "" })));
}

function dl(rows, cls = "p-dl") {
  return h("dl", { class: cls }, rows.filter(([, v]) => v).map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v))));
}

// ---------------------------------------------------------------- signed out

function viewSignIn(t, { mode, context, notice = "" }) {
  if (t !== token) return;
  clearTimeout(loadTimer);
  const [title, text] = {
    apply: ["Apply to join Foreman.", "Create an account to begin. You can save your application as a draft and return to it at any time."],
    join: ["Your client portal is ready.", "Create an account with the email address we have for you, or sign in if you already have one. Your engagement opens straight after."],
  }[context] || ["The Foreman portal.", "A private workspace for our clients, members and applicants."];

  let email = "";
  const panel = h("section", { class: "p-auth-panel", "aria-label": "Your account" });
  const draw = (m, notice = "") => {
    panel.replaceChildren(
      m === "forgot" ? null : tabs(m),
      m === "forgot" ? forgotForm() : authForm(m, notice),
      db.demo ? demoPicker() : null);
  };

  function tabs(m) {
    const tab = (key, label) => h("button", { type: "button", "aria-pressed": String(m === key), onclick: () => draw(key) }, label);
    return h("div", { class: "p-tabs", role: "group", "aria-label": "Sign in or create an account" }, tab("signin", "Sign in"), tab("signup", "Create an account"));
  }

  function authForm(m, notice) {
    const msg = h("p", { class: "p-form-msg", role: "status", hidden: true });
    const submit = h("button", { class: "btn", type: "submit" }, m === "signin" ? "Sign in" : "Create account", icon("arrow"));
    const form = h("form", { class: "form single p-auth-form" },
      m === "signup" ? field({ label: "Full name", name: "full_name", autocomplete: "name", required: true }) : null,
      field({ label: "Email", name: "email", type: "email", autocomplete: "email", required: true, value: email }),
      field({ label: "Password", name: "password", type: "password", autocomplete: m === "signin" ? "current-password" : "new-password", required: true, hint: m === "signup" ? "At least 8 characters." : null }),
      msg,
      h("div", { class: "p-form-actions" },
        submit,
        m === "signin" ? textBtn("Forgot your password?", () => draw("forgot")) : null),
      m === "signup" ? h("p", { class: "fine" }, "By creating an account you agree to our handling of your information, described in our ", h("a", { href: "../disclosures.html#privacy" }, "privacy notice"), ".") : null);
    if (notice) say(msg, notice, "info");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const d = formData(form);
      email = d.email;
      if (!form.checkValidity()) { form.reportValidity(); return; }
      if (m === "signup" && d.password.length < 8) { say(msg, "Choose a password of at least 8 characters.", "bad"); return; }
      say(msg, "");
      authBusy = true;
      try {
        await busy(submit, m === "signin" ? "Signing in…" : "Creating your account…", async () => {
          if (m === "signin") {
            await db.signIn(d.email, d.password);
          } else {
            const result = await db.signUp(d.email, d.password, d.full_name);
            if (result.needsConfirm) {
              panel.replaceChildren(h("div", { class: "p-auth-done" },
                h("h2", {}, "Check your email."),
                h("p", {}, `We sent a confirmation link to ${d.email}. Open it on this device to finish creating your account.`)));
              return;
            }
          }
          await refresh();
          route();
        });
      } catch (err) {
        if (err.kind === "exists") draw("signin", "An account with this email already exists. Sign in instead.");
        else say(msg, err.message, "bad");
      } finally {
        authBusy = false;
      }
    });
    return form;
  }

  function forgotForm() {
    const msg = h("p", { class: "p-form-msg", role: "status", hidden: true });
    const submit = h("button", { class: "btn", type: "submit" }, "Send a reset link");
    const form = h("form", { class: "form single p-auth-form" },
      h("div", { class: "p-auth-sub" }, h("h2", {}, "Reset your password"), h("p", {}, "Enter the email address for your account and we will send you a link to choose a new password.")),
      field({ label: "Email", name: "email", type: "email", autocomplete: "email", required: true, value: email }),
      msg,
      h("div", { class: "p-form-actions" }, submit, textBtn("Back to sign in", () => draw("signin"))));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      email = formData(form).email;
      try {
        await busy(submit, "Sending…", () => db.requestReset(email));
        say(msg, db.demo
          ? "Password emails aren't sent in demo mode. Use the sample accounts below."
          : "If an account exists for that address, a link is on its way. It can take a few minutes to arrive.", "info");
      } catch (err) {
        say(msg, err.message, "bad");
      }
    });
    return form;
  }

  function demoPicker() {
    return h("div", { class: "p-demo-pick" },
      h("h2", {}, "Explore the demo"),
      h("p", {}, "Sample accounts show each part of the portal. Nothing you enter leaves this browser."),
      h("div", { class: "p-demo-roles" }, db.demoAccounts.map((a) => h("button", {
        type: "button",
        onclick: async () => {
          await db.demoSignIn(a.key);
          await refresh();
          go(context === "apply" && a.key === "applicant" ? "apply" : defaultView(), true);
        },
      }, h("b", {}, a.label), h("span", {}, a.text)))));
  }

  draw(mode, notice);
  const intro = h("section", { class: "p-auth-intro" },
    h("h1", { class: "p-auth-title", tabindex: "-1" }, title),
    h("p", { class: "lede" }, text),
    context === "apply" || context === "join" ? null : h("ul", { class: "p-auth-roles" },
      h("li", {}, h("h2", {}, "Clients"), h("p", {}, "Share records securely, follow your engagement week by week and download your report.")),
      h("li", {}, h("h2", {}, "Members"), h("p", {}, "Your engagements, training materials and announcements in one place.")),
      h("li", {}, h("h2", {}, "Applicants"), h("p", {}, "Apply to join Foreman and follow your application at every step."))));
  main.replaceChildren(h("div", { class: "p-auth" }, intro, panel));
  window.scrollTo(0, 0);
}

function viewNewPassword(t) {
  if (t !== token) return;
  const msg = h("p", { class: "p-form-msg", role: "status", hidden: true });
  const submit = h("button", { class: "btn", type: "submit" }, "Save new password");
  const form = h("form", { class: "form single p-auth-form" },
    field({ label: "New password", name: "password", type: "password", autocomplete: "new-password", required: true, hint: "At least 8 characters." }),
    field({ label: "Repeat the new password", name: "repeat", type: "password", autocomplete: "new-password", required: true }),
    msg,
    h("div", { class: "p-form-actions" }, submit));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = formData(form);
    if (d.password.length < 8) return say(msg, "Choose a password of at least 8 characters.", "bad");
    if (d.password !== d.repeat) return say(msg, "The two passwords don't match.", "bad");
    try {
      await busy(submit, "Saving…", () => db.setPassword(d.password));
      S.recovery = false;
      toast("Your password has been changed.");
      await refresh();
      go(defaultView(), true);
    } catch (err) {
      say(msg, err.message, "bad");
    }
  });
  shell.classList.add("is-auth");
  main.replaceChildren(h("div", { class: "p-auth" },
    h("section", { class: "p-auth-intro" }, h("h1", { class: "p-auth-title" }, "Choose a new password."), h("p", { class: "lede" }, "You followed a password reset link. Set a new password to continue.")),
    h("section", { class: "p-auth-panel" }, form)));
}

// ---------------------------------------------------------------- home

async function viewHome(t) {
  const p = S.profile;
  if (p.role === "admin") return go("overview", true);
  if (p.role === "member") return memberHome(t);

  const [engagements, application, settings] = await Promise.all([
    S.links.length ? db.listEngagements() : [], db.myApplication(), db.getSettings(),
  ]);
  const mine = engagements.filter((e) => e.my_kind === "client");
  S.hasApplication = Boolean(application);
  screen(t, { title: p.full_name ? `Welcome, ${firstName(p)}.` : "Welcome.", sub: today() },
    mine.length ? sec({ title: mine.length === 1 ? "Your engagement" : "Your engagements" }, engagementCards(mine)) : null,
    h("div", { class: "p-cards" },
      mine.length && !application ? null : applicationCard(application, settings),
      inviteCard(mine.length > 0)));
}

async function memberHome(t) {
  const p = S.profile;
  const [engagements, announcements, resources] = await Promise.all([db.listEngagements(), db.listAnnouncements(), db.listResources()]);
  const mine = engagements.filter((e) => e.my_kind === "team");
  screen(t, { title: p.full_name ? `Welcome, ${firstName(p)}.` : "Welcome.", sub: today() },
    h("div", { class: "p-cols" },
      h("div", { class: "p-col-main" },
        sec({ title: "Your engagements" }, mine.length ? engagementCards(mine) : empty("You are not on an engagement yet. You will be added when a team is formed.")),
        sec({ title: "Announcements" }, announcements.length ? announcementList(announcements.slice(0, 6)) : empty("No announcements yet."))),
      h("aside", { class: "p-aside" },
        sec({ title: "From the library" },
          resources.length
            ? h("ul", { class: "p-mini" }, resources.slice(0, 4).map((r) => h("li", {}, h("a", { href: "#library" }, h("strong", {}, r.title), h("span", {}, r.category)))))
            : empty("The library is empty for now."),
          h("div", { class: "actions mt-m" }, arrowLink("#library", "Open the library"))))));
}

function engagementCards(list) {
  return h("ul", { class: "p-engs" }, list.map((e) => h("li", {},
    h("a", { class: "p-eng", href: `#engagement-${e.id}` },
      h("span", { class: "p-eng-co" }, e.company),
      h("span", { class: "p-eng-meta" }, `${e.title} · ${PRACTICE[e.practice] || ""}`),
      stageBar(e.stage),
      h("span", { class: "p-eng-stage" }, stageText(e.stage), icon("arrow"))))));
}

function announcementList(list) {
  return h("ol", { class: "p-notes" }, list.map((a) => h("li", {},
    h("header", {}, h("h3", {}, a.title), h("time", { datetime: a.created_at }, ago(a.created_at))),
    a.body ? h("p", {}, a.body) : null)));
}

function applicationCard(application, settings) {
  if (!application) {
    if (!settings.applications_open) {
      return h("section", { class: "p-card" }, h("h2", {}, "Applications are closed"), h("p", { class: "p-card-text" }, "We are not accepting new applications at the moment. Please check back soon."));
    }
    return h("section", { class: "p-card" },
      h("h2", {}, "Apply to join Foreman"),
      h("p", { class: "p-card-text" }, "Train in accounting, valuation and operations, then advise Chicago business owners. Your resume and three short answers are all we ask for."),
      h("div", { class: "actions" }, h("a", { class: "btn", href: "#apply" }, "Start your application", icon("arrow"))));
  }
  return h("section", { class: "p-card" },
    h("h2", {}, "Your application"),
    h("p", { class: "p-card-text" }, pill(APP_STATUS[application.status], APP_TONE[application.status])),
    h("p", { class: "p-card-text" }, applicationStatusText(application)),
    h("div", { class: "actions" }, arrowLink("#apply", application.status === "draft" ? "Continue your application" : "View your application")));
}

function inviteCard(already = false) {
  const msg = h("p", { class: "p-form-msg", role: "status", hidden: true });
  const submit = h("button", { class: "btn btn-quiet", type: "submit" }, "Open my portal");
  const form = h("form", { class: "form single" },
    field({ label: "Invitation code", name: "code", placeholder: "XXXXX-XXXXX", required: true, autocomplete: "off" }),
    msg,
    h("div", { class: "p-form-actions" }, submit));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { code } = formData(form);
    if (!code) return;
    try {
      const id = await busy(submit, "Checking…", () => db.claimInvite(code));
      await refresh();
      toast("Welcome. Your engagement is ready.");
      go(`engagement-${id}`);
    } catch (err) {
      say(msg, err.message, "bad");
    }
  });
  return h("section", { class: "p-card" },
    h("h2", {}, already ? "Another invitation?" : "Working with Foreman?"),
    h("p", { class: "p-card-text" }, already
      ? "If you have a code for another engagement, enter it here."
      : "Your engagement manager sends each client an invitation code. Enter it here to open your client portal."),
    form);
}

// ---------------------------------------------------------------- the student application

function applicationStatusText(a) {
  switch (a.status) {
    case "draft": return "Your draft is saved. Submit it when you are ready.";
    case "submitted": return `Submitted on ${date(a.submitted_at)}. We review applications on a rolling basis and will email you about next steps.`;
    case "interview_1": return "You are invited to a first interview. We will email you to arrange a time.";
    case "interview_2": return "You are invited to a case interview. We will email you to arrange a time.";
    case "accepted": return "Welcome to Foreman. Your member access is active.";
    case "declined": return "Thank you for applying. We are not able to offer you a place this time, and you are welcome to apply again in a future cycle.";
    default: return "";
  }
}

async function viewApply(t) {
  const [application, settings] = await Promise.all([db.myApplication(), db.getSettings()]);
  if (t !== token) return;
  S.hasApplication = Boolean(application);
  if (!application && !settings.applications_open) {
    return screen(t, { title: "Applications are closed.", sub: "We are not accepting new applications at the moment. Please check back soon." },
      arrowLink("../students.html", "About membership"));
  }
  const editing = !application || application.status === "draft";
  screen(t, {
    title: "Your application",
    sub: editing ? "Answer in your own words. Your draft saves as you write, so you can return to it at any time." : applicationStatusText(application),
  },
  tracker(application ? application.status : "draft"),
  db.demo ? h("aside", { class: "p-note" }, h("h2", {}, "Demo mode"), h("p", {}, "This portal isn't connected yet, so applications stay in this browser and are not sent to Foreman.")) : null,
  application && application.message ? h("aside", { class: "p-note" }, h("h2", {}, "A note from Foreman"), h("p", {}, application.message)) : null,
  editing ? applicationForm(application) : applicationSummary(application));
}

function tracker(status) {
  const step = { draft: 0, submitted: 0, interview_1: 1, interview_2: 2, accepted: 3, declined: 3 }[status] ?? 0;
  const finished = status === "accepted" || status === "declined";
  const note = { draft: "In progress", submitted: "Under review", interview_1: "Invited", interview_2: "Invited", accepted: "Accepted", declined: "Decision shared" }[status];
  return h("ol", { class: "p-track", "aria-label": "Application progress" }, APP_STEPS.map((label, i) => {
    const state = i < step || (finished && i === step) ? "done" : i === step ? "current" : "";
    return h("li", { class: state, "aria-current": i === step ? "step" : null },
      h("b", {}, String(i + 1)),
      h("span", {}, label),
      i === step ? h("em", {}, note) : null);
  }));
}

function applicationForm(existing) {
  let current = existing;
  const a = (existing && existing.answers) || {};
  const msg = h("p", { class: "p-save", role: "status" }, current ? `Draft saved ${time(current.updated_at)}` : "");
  const resumeBox = h("div", { class: "p-resume" });
  const submitBtn = h("button", { class: "btn", type: "submit" }, "Submit application", icon("arrow"));
  const saveBtn = h("button", { class: "btn btn-quiet", type: "button" }, "Save draft");
  const actions = h("div", { class: "p-form-actions" }, submitBtn, saveBtn, msg);

  const answer = (q) => {
    const id = `field-${++fieldCount}`;
    const area = h("textarea", { id, name: q.name, rows: 7, value: a[q.name] || "" });
    const count = h("p", { class: "p-count" });
    const update = () => {
      const n = words(area.value);
      count.textContent = `${n} of ${WORD_LIMIT} words`;
      count.classList.toggle("over", n > WORD_LIMIT);
    };
    area.addEventListener("input", update);
    update();
    return h("div", { class: "field wide" }, h("label", { for: id }, q.label), area, count);
  };

  const form = h("form", { class: "form p-appform", novalidate: true },
    h("fieldset", { class: "p-fs" },
      h("legend", { class: "p-legend" }, "About you"),
      h("div", { class: "p-fs-grid" },
        field({ label: "Full name", name: "full_name", value: (current && current.full_name) || S.profile.full_name, autocomplete: "name" }),
        field({ label: "Email", name: "account_email", value: S.profile.email, readonly: true, hint: "Your account email. We write to you here." }),
        field({ label: "Year", name: "year", type: "select", options: YEARS, value: a.year, required: true }),
        field({ label: "Major or intended major", name: "major", value: a.major || "" }),
        field({ label: "Expected graduation", name: "graduation", value: a.graduation || "", placeholder: "June 2029" }),
        field({ label: "Phone", name: "phone", type: "tel", value: a.phone || "", optional: true, autocomplete: "tel" }),
        field({ label: "LinkedIn profile", name: "linkedin", type: "url", value: a.linkedin || "", optional: true, placeholder: "https://www.linkedin.com/in/…" }),
        field({ label: "How did you hear about Foreman?", name: "heard", type: "select", options: HEARD, value: a.heard }))),
    h("fieldset", { class: "p-fs" },
      h("legend", { class: "p-legend" }, "Resume"),
      resumeBox),
    h("fieldset", { class: "p-fs" },
      h("legend", { class: "p-legend" }, "Three short answers"),
      h("div", { class: "p-fs-grid" },
        h("p", { class: "p-fs-note wide" }, `Up to ${WORD_LIMIT} words each. Plain, specific writing reads best.`),
        QUESTIONS.map(answer))),
    actions);

  function collect() {
    const d = formData(form);
    return {
      full_name: d.full_name || "",
      answers: { year: d.year, major: d.major, graduation: d.graduation, phone: d.phone, linkedin: d.linkedin, heard: d.heard, q1: d.q1, q2: d.q2, q3: d.q3 },
    };
  }

  let timer = 0;
  let queue = Promise.resolve();
  const save = () => {
    queue = queue.then(async () => {
      try {
        current = await db.saveApplication(collect(), current && current.id);
        S.hasApplication = true;
        say(msg, `Draft saved ${time(current.updated_at)}`);
      } catch (err) {
        say(msg, err.message, "bad");
      }
    });
    return queue;
  };
  form.addEventListener("input", (e) => {
    if (e.target.type === "file") return;
    clearTimeout(timer);
    say(msg, "Saving soon…");
    timer = setTimeout(save, 1200);
  });

  function drawResume() {
    const input = h("input", { type: "file", accept: ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    input.addEventListener("change", () => onResume(input));
    resumeBox.replaceChildren(
      current && current.resume_name
        ? h("p", { class: "p-file" }, icon("file"), h("span", {}, current.resume_name), h("span", { class: "meta" }, "Uploaded"))
        : h("p", { class: "p-hint" }, `A PDF or Word document, up to ${MAX_RESUME_MB} MB.`),
      h("label", { class: "btn btn-quiet btn-small p-upload" }, icon("upload"), h("span", {}, current && current.resume_name ? "Replace resume" : "Upload resume"), input));
  }
  async function onResume(input) {
    const file = input.files[0];
    if (!file) return;
    if (!/\.(pdf|docx?)$/i.test(file.name)) { say(msg, "Please upload a PDF or Word document.", "bad"); return; }
    if (file.size > MAX_RESUME_MB * 1048576) { say(msg, `That file is larger than ${MAX_RESUME_MB} MB.`, "bad"); return; }
    clearTimeout(timer);
    say(msg, "Uploading your resume…");
    try {
      const uploaded = await db.uploadResume(file, current && current.resume_path);
      await queue;
      current = await db.saveApplication({ ...collect(), ...uploaded }, current && current.id);
      S.hasApplication = true;
      drawResume();
      say(msg, `Resume uploaded. Draft saved ${time(current.updated_at)}`);
    } catch (err) {
      say(msg, err.message, "bad");
    }
  }
  drawResume();

  saveBtn.addEventListener("click", async () => {
    clearTimeout(timer);
    await busy(saveBtn, "Saving…", save);
  });

  function problems() {
    const d = collect();
    const list = [];
    const need = (ok, name, text) => { if (!ok) list.push({ name, text }); };
    need(d.full_name, "full_name", "Add your full name.");
    need(d.answers.year, "year", "Choose your year.");
    need(d.answers.major, "major", "Add your major or intended major.");
    need(d.answers.graduation, "graduation", "Add your expected graduation.");
    need(current && current.resume_path, null, "Upload your resume.");
    QUESTIONS.forEach((q, i) => {
      need(d.answers[q.name], q.name, `Answer question ${i + 1}.`);
      need(words(d.answers[q.name]) <= WORD_LIMIT, q.name, `Shorten your answer to question ${i + 1} to ${WORD_LIMIT} words.`);
    });
    return list;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearTimeout(timer);
    await save();
    const issues = problems();
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    if (issues.length) {
      issues.forEach((i) => i.name && form.elements.namedItem(i.name) && form.elements.namedItem(i.name).setAttribute("aria-invalid", "true"));
      say(msg, issues.length === 1 ? issues[0].text : `${issues[0].text} ${issues.length - 1} more ${issues.length === 2 ? "item needs" : "items need"} attention.`, "bad");
      const first = issues.find((i) => i.name);
      if (first) form.elements.namedItem(first.name).focus();
      else resumeBox.querySelector("input").focus();
      return;
    }
    if (actions.hidden) return;
    confirmInline(actions, { text: "Submit your application? You won't be able to change it afterwards." , yes: "Submit application" }, async () => {
      current = await db.submitApplication(current.id);
      S.hasApplication = true;
      toast("Application submitted. Thank you.");
      renderChrome();
      route();
    });
  });
  return form;
}

function applicationSummary(a) {
  const ans = a.answers || {};
  return h("div", { class: "p-cols" },
    h("div", { class: "p-col-main" },
      sec({ title: "Your answers" }, QUESTIONS.map((q, i) => h("div", { class: "p-qa" }, h("h3", {}, `${i + 1}. ${q.label}`), h("p", {}, ans[q.name] || "No answer."))))),
    h("aside", { class: "p-aside" },
      sec({ title: "Details" }, dl([
        ["Name", a.full_name], ["Email", a.email], ["Year", ans.year], ["Major", ans.major], ["Graduation", ans.graduation],
        ["Resume", a.resume_name], ["Submitted", dateTime(a.submitted_at)],
      ]))));
}

async function viewJoin(t, code) {
  try {
    const id = await db.claimInvite(code);
    await refresh();
    if (t !== token) return;
    toast("Welcome. Your engagement is ready.");
    go(`engagement-${id}`, true);
  } catch (err) {
    screen(t, { title: "This invitation couldn't be used.", sub: err.message }, h("div", { class: "p-cards" }, inviteCard()));
  }
}

// ---------------------------------------------------------------- engagements

async function viewEngagement(t, id) {
  const engagement = await db.getEngagement(id);
  if (!engagement) {
    return screen(t, { title: "Engagement not found.", sub: "It may have been removed, or your account may not have access to it." }, arrowLink(`#${defaultView()}`, "Go to your home page"));
  }
  const [people, docs, updates] = await Promise.all([db.listPeople(id), db.listDocuments(id), db.listUpdates(id)]);
  const urls = await db.fileUrls("engagements", docs.map((d) => d.path));
  if (t !== token) return;

  const admin = S.profile.role === "admin";
  const link = S.links.find((l) => l.engagement_id === id);
  const ctx = { e: engagement, id, admin, team: admin || (link && link.kind === "team"), client: Boolean(link && link.kind === "client"), urls, people };
  const requests = docs.filter((d) => d.kind === "request");
  const uploads = docs.filter((d) => d.kind === "upload");
  const deliverables = docs.filter((d) => d.kind === "deliverable");
  const loose = uploads.filter((u) => !u.request_id || !requests.some((r) => r.id === u.request_id));

  screen(t, {
    title: engagement.company,
    sub: `${engagement.title} · ${PRACTICE[engagement.practice] || ""}`,
    back: S.profile.role === "user" ? null : { href: "#engagements", label: "Engagements" },
    cls: "p-view-engagement",
  },
  stageBlock(ctx),
  h("div", { class: "p-cols" },
    h("div", { class: "p-col-main" },
      requestsSection(ctx, requests, uploads),
      filesSection(ctx, loose),
      deliverablesSection(ctx, deliverables),
      updatesSection(ctx, updates)),
    h("aside", { class: "p-aside" },
      detailsCard(ctx),
      peopleCard(ctx),
      admin ? recordsCard(ctx, uploads) : null)));
}

function stageBlock({ e, team, id }) {
  const current = stageIndex(e.stage);
  const done = e.stage === "complete";
  const list = h("ol", { class: "p-stages" }, STAGES.map((s, i) => h("li", {
    class: done || i < current ? "done" : i === current ? "current" : "",
    "aria-current": !done && i === current ? "step" : null,
  }, h("span", {}, s.label))));
  let control = null;
  if (team) {
    const select = h("select", { class: "p-select", "aria-label": "Engagement stage" },
      [...STAGES, { key: "complete", label: "Complete" }].map((s) => h("option", { value: s.key, selected: s.key === e.stage }, s.label)));
    const save = h("button", { class: "btn btn-quiet btn-small", type: "button" }, "Update stage");
    save.addEventListener("click", () => act(save, "Saving…", async () => {
      await db.updateEngagement(id, { stage: select.value });
      await again();
      toast("Stage updated.");
    }));
    control = h("div", { class: "p-stage-control" }, select, save);
  }
  return h("section", { class: "p-stage-block", "aria-label": "Progress" },
    list,
    h("div", { class: "p-stage-foot" }, h("p", { class: "p-stage-caption" }, stageText(e.stage)), control));
}

function requestsSection(ctx, requests, uploads) {
  const { team, client } = ctx;
  const complete = requests.filter((r) => r.status !== "open").length;
  return sec({ title: "Requested records", note: requests.length ? `${complete} of ${requests.length} complete` : null },
    client && requests.some((r) => r.status === "open") ? h("p", { class: "p-lead" }, "Upload each record below. Files go only to your Foreman team and are deleted when the engagement ends.") : null,
    requests.length
      ? h("ul", { class: "p-reqs" }, requests.map((r) => requestItem(ctx, r, uploads.filter((u) => u.request_id === r.id))))
      : empty(team ? "No records requested yet. Add the standard checklist, or your own requests." : "Nothing has been requested yet. Your team will list the records they need here."),
    team ? requestTools(ctx, requests) : null);
}

function requestItem(ctx, r, files) {
  const { id, team, client } = ctx;
  const label = { open: "Requested", received: "Received", waived: "Not needed" }[r.status];
  const tone = { open: "new", received: "ok", waived: "muted" }[r.status];
  const side = h("div", { class: "p-req-side" }, pill(label, tone));
  if ((client || team) && r.status !== "waived") {
    side.append(uploadButton(files.length ? "Add a file" : "Upload", (file) => db.uploadDocument(id, file, { kind: "upload", request_id: r.id, title: r.title }), "Uploaded. Thank you."));
  }
  if (team) {
    const setStatus = (status, text) => textBtn(text, (e) => act(e.currentTarget, "Saving…", async () => { await db.updateDocument(r.id, { status }); await again(); }));
    const remove = textBtn("Remove", (e) => confirmInline(e.currentTarget, { text: `Remove “${r.title}”? Files already shared stay under Shared files.`, yes: "Remove request", danger: true }, async () => {
      await db.deleteDocument(r);
      await again();
      toast("Request removed.");
    }), "danger");
    side.append(h("div", { class: "p-req-actions" },
      r.status !== "received" ? setStatus("received", "Mark received") : null,
      r.status !== "waived" ? setStatus("waived", "Not needed") : null,
      r.status !== "open" ? setStatus("open", "Reopen") : null,
      remove));
  }
  return h("li", { class: "p-req", "data-status": r.status },
    h("div", { class: "p-req-main" },
      h("h3", {}, r.title),
      r.note ? h("p", {}, r.note) : null,
      files.length ? fileList(files, ctx) : null),
    side);
}

function requestTools({ id, e }, requests) {
  const wrap = h("div", { class: "p-tools" });
  if (!requests.length) {
    const list = CHECKLISTS[e.practice] || CHECKLISTS.succession;
    const add = h("button", { class: "btn btn-small", type: "button" }, icon("plus"), `Add the standard checklist (${list.length} items)`);
    add.addEventListener("click", () => act(add, "Adding…", async () => {
      for (const item of list) await db.addRequest(id, item);
      await again();
      toast("Checklist added. The client can now upload each record.");
    }));
    wrap.append(add);
  }
  const submit = h("button", { class: "btn btn-small", type: "submit" }, icon("plus"), "Add request");
  const form = h("form", { class: "form p-inline-form" },
    field({ label: "Record to request", name: "title", required: true, placeholder: "Accounts receivable aging" }),
    field({ label: "Note for the client", name: "note", optional: true, placeholder: "As of the latest month end" }),
    h("div", { class: "p-form-actions wide" }, submit));
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const d = formData(form);
    if (!d.title) { form.reportValidity(); return; }
    act(submit, "Adding…", async () => {
      await db.addRequest(id, { title: d.title, note: d.note });
      await again();
      toast("Request added.");
    });
  });
  wrap.append(h("details", { class: "p-disclose" }, h("summary", {}, "Request a record"), form));
  return wrap;
}

function fileList(files, ctx) {
  return h("ul", { class: "p-files" }, files.map((f) => {
    const url = ctx.urls[f.path];
    const name = f.file_name || f.title;
    const canDelete = ctx.team || (f.kind === "upload" && f.created_by === S.profile.id);
    const del = canDelete ? textBtn("Delete", (e) => confirmInline(e.currentTarget, { text: `Delete ${name}?`, yes: "Delete file", danger: true }, async () => {
      await db.deleteDocument(f);
      await again();
      toast("File deleted.");
    }), "danger") : null;
    return h("li", { class: "p-file" },
      icon("file"),
      h("span", { class: "p-file-text" },
        url
          ? h("a", { href: url, target: "_blank", rel: "noopener" }, name)
          : h("button", { type: "button", class: "p-file-name", onclick: () => toast(db.demo ? "Sample file: there is nothing to open in demo mode." : "This file isn't available right now. Refresh the page and try again.") }, name),
        h("span", { class: "meta" }, [f.created_by_name, date(f.created_at), size(f.size)].filter(Boolean).join(" · "))),
      del);
  }));
}

function uploadButton(label, upload, success = "Uploaded.") {
  const text = h("span", {}, label);
  const input = h("input", { type: "file" });
  const holder = h("label", { class: "btn btn-quiet btn-small p-upload" }, icon("upload"), text, input);
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1048576) {
      toast(`That file is larger than ${MAX_FILE_MB} MB.`, "bad");
      input.value = "";
      return;
    }
    holder.classList.add("is-busy");
    text.textContent = "Uploading…";
    try {
      await upload(file);
      await again();
      toast(success);
    } catch (err) {
      toast(err.message, "bad");
      holder.classList.remove("is-busy");
      text.textContent = label;
    } finally {
      input.value = "";
    }
  });
  return holder;
}

function filesSection(ctx, loose) {
  const { client, team, id } = ctx;
  return sec({
    title: "Shared files",
    action: client || team ? uploadButton("Share a file", (file) => db.uploadDocument(id, file, { kind: "upload" }), "File shared.") : null,
  }, loose.length ? fileList(loose, ctx) : empty(client ? "Anything else you would like your team to see can be shared here." : "No other files yet."));
}

function deliverablesSection(ctx, list) {
  const { team, client, id } = ctx;
  return sec({
    title: "Deliverables",
    action: team ? uploadButton("Upload a deliverable", (file) => db.uploadDocument(id, file, { kind: "deliverable" }), "Deliverable uploaded. The client can now open it.") : null,
  }, list.length ? fileList(list, ctx) : empty(client ? "Your report and working files will appear here." : "Nothing delivered yet."));
}

function updatesSection({ team, id }, updates) {
  let form = null;
  if (team) {
    const submit = h("button", { class: "btn btn-small", type: "submit" }, "Post update");
    form = h("form", { class: "form single p-post" },
      field({ label: "Write an update", name: "body", type: "textarea", rows: 4, required: true, placeholder: "What the team did this week, what comes next, and anything you need from the client." }),
      h("div", { class: "p-form-actions" }, submit, h("p", { class: "fine" }, "Everyone on this engagement can read updates, including the client.")));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const { body } = formData(form);
      if (!body) { form.reportValidity(); return; }
      act(submit, "Posting…", async () => {
        await db.postUpdate(id, body);
        await again();
        toast("Update posted.");
      });
    });
  }
  return sec({ title: "Updates" },
    form,
    updates.length ? h("ol", { class: "p-updates" }, updates.map((u) => h("li", { class: "p-update" },
      h("header", {}, h("strong", {}, u.author_name || "Foreman"), h("time", { datetime: u.created_at }, date(u.created_at))),
      h("p", {}, u.body),
      S.profile.role === "admin" || u.author_id === S.profile.id
        ? textBtn("Delete", (e) => confirmInline(e.currentTarget, { text: "Delete this update?", yes: "Delete update", danger: true }, async () => {
          await db.deleteUpdate(u.id);
          await again();
        }), "danger")
        : null)))
      : empty("Weekly updates from the team will appear here."));
}

function detailsCard({ e, admin, id }) {
  const card = h("section", { class: "p-card" },
    h("h2", {}, "Engagement"),
    e.summary ? h("p", { class: "p-card-text" }, e.summary) : null,
    dl([["Practice", PRACTICE[e.practice]], ["Started", date(e.started_on)], ["Target date", date(e.target_on)]]));
  if (admin) {
    const submit = h("button", { class: "btn btn-small", type: "submit" }, "Save details");
    const form = h("form", { class: "form single" },
      field({ label: "Company", name: "company", value: e.company, required: true }),
      field({ label: "Engagement name", name: "title", value: e.title, required: true }),
      field({ label: "Practice", name: "practice", type: "select", required: true, value: e.practice, options: [{ value: "succession", label: PRACTICE.succession }, { value: "operations", label: PRACTICE.operations }] }),
      field({ label: "Started", name: "started_on", type: "date", value: e.started_on || "" }),
      field({ label: "Target date", name: "target_on", type: "date", value: e.target_on || "" }),
      field({ label: "Summary", name: "summary", type: "textarea", rows: 4, value: e.summary || "" }),
      h("div", { class: "p-form-actions" }, submit));
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const d = formData(form);
      act(submit, "Saving…", async () => {
        await db.updateEngagement(id, { ...d, started_on: d.started_on || null, target_on: d.target_on || null });
        await again();
        toast("Details saved.");
      });
    });
    card.append(h("details", { class: "p-disclose" }, h("summary", {}, "Edit details"), form));
  }
  return card;
}

function peopleCard({ people, admin, team, id }) {
  const clients = people.filter((p) => p.kind === "client");
  const crew = people.filter((p) => p.kind === "team");
  const row = (p) => {
    const pending = p.kind === "client" && !p.user_id;
    const showEmail = p.email && (team || p.kind === "team");
    return h("li", { class: "p-person" },
      h("span", { class: "p-avatar", "aria-hidden": "true" }, initials(p.name || p.email)),
      h("div", { class: "p-person-text" },
        h("span", { class: "name" }, p.name || p.email),
        h("span", { class: "role" }, [p.title, pending ? "Invitation not yet accepted" : null].filter(Boolean).join(" · ")),
        showEmail ? h("span", { class: "role email", title: p.email }, p.email) : null),
      admin ? textBtn("Remove", (e) => confirmInline(e.currentTarget, { text: `Remove ${p.name || p.email} from this engagement?`, yes: "Remove", danger: true }, async () => {
        await db.removePerson(p.id);
        await refresh();
        await again();
      }), "danger") : null,
      admin && pending && p.invite_code ? inviteBox(p.invite_code) : null);
  };
  const card = h("section", { class: "p-card" },
    h("h2", {}, "People"),
    h("h3", { class: "p-card-label" }, clients.length === 1 ? "Client" : "Clients"),
    clients.length ? h("ul", { class: "p-people" }, clients.map(row)) : h("p", { class: "p-card-text" }, "No client added yet."),
    h("h3", { class: "p-card-label" }, "Foreman team"),
    crew.length ? h("ul", { class: "p-people" }, crew.map(row)) : h("p", { class: "p-card-text" }, "No team members yet."));
  if (admin) card.append(addClientForm(id), addTeamForm(id, people));
  return card;
}

function inviteBox(code) {
  const url = inviteUrl(code);
  const box = h("div", { class: "p-invite" },
    h("p", {}, "Send this link to the client. It opens their portal once they create an account."),
    h("code", {}, url));
  box.append(h("div", { class: "p-invite-foot" }, textBtn("Copy link", () => copyText(url, box)), h("span", {}, `Code ${code}`)));
  return box;
}

function addClientForm(id) {
  const submit = h("button", { class: "btn btn-small", type: "submit" }, "Create invitation");
  const form = h("form", { class: "form single" },
    field({ label: "Name", name: "name", required: true, autocomplete: "off" }),
    field({ label: "Email", name: "email", type: "email", required: true, autocomplete: "off" }),
    field({ label: "Role at the company", name: "title", value: "Owner" }),
    h("div", { class: "p-form-actions" }, submit));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const d = formData(form);
    act(submit, "Creating…", async () => {
      await db.addPerson(id, { kind: "client", name: d.name, email: d.email, title: d.title, invite_code: inviteCode() });
      await again();
      toast("Invitation created. Copy the link and send it to the client.");
    });
  });
  return h("details", { class: "p-disclose" }, h("summary", {}, "Invite a client"), form);
}

function addTeamForm(id, people) {
  const slot = h("div", {}, h("p", { class: "p-card-text" }, "Loading members…"));
  const details = h("details", { class: "p-disclose" }, h("summary", {}, "Add a team member"), slot);
  let loaded = false;
  details.addEventListener("toggle", async () => {
    if (!details.open || loaded) return;
    loaded = true;
    try {
      const all = await db.listProfiles();
      const taken = new Set(people.filter((p) => p.user_id).map((p) => p.user_id));
      const members = all.filter((p) => p.role !== "user" && !taken.has(p.id));
      if (!members.length) { slot.replaceChildren(h("p", { class: "p-card-text" }, "Every member is already on this engagement.")); return; }
      const submit = h("button", { class: "btn btn-small", type: "submit" }, "Add to team");
      const form = h("form", { class: "form single" },
        field({ label: "Member", name: "user_id", type: "select", required: true, options: members.map((m) => ({ value: m.id, label: m.full_name || m.email })) }),
        field({ label: "Role", name: "title", type: "select", required: true, value: "Analyst", options: TEAM_TITLES }),
        h("div", { class: "p-form-actions" }, submit));
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const d = formData(form);
        const m = members.find((x) => x.id === d.user_id);
        act(submit, "Adding…", async () => {
          await db.addPerson(id, { kind: "team", user_id: m.id, name: m.full_name || m.email, email: m.email, title: d.title });
          await refresh();
          await again();
          toast("Added to the team.");
        });
      });
      slot.replaceChildren(form);
    } catch (err) {
      slot.replaceChildren(h("p", { class: "p-card-text" }, err.message));
    }
  });
  return details;
}

function recordsCard({ id, e }, uploads) {
  const purge = h("button", { class: "btn btn-quiet btn-small", type: "button", disabled: !uploads.length }, `Delete client records (${uploads.length})`);
  purge.addEventListener("click", () => confirmInline(purge, {
    text: `Permanently delete the ${uploads.length} ${uploads.length === 1 ? "file" : "files"} the client shared? Deliverables and updates stay.`,
    yes: "Delete records",
    danger: true,
  }, async () => {
    const n = await db.purgeRecords(id);
    await again();
    toast(`${n} ${n === 1 ? "file" : "files"} deleted.`);
  }));
  const remove = textBtn("Delete this engagement", (ev) => confirmInline(ev.currentTarget, {
    text: `Delete ${e.company} and everything in it, including files? This can't be undone.`,
    yes: "Delete engagement",
    danger: true,
  }, async () => {
    await db.deleteEngagement(id);
    toast("Engagement deleted.");
    await refresh();
    go("engagements");
  }), "danger");
  return h("section", { class: "p-card" },
    h("h2", {}, "Client records"),
    h("p", { class: "p-card-text" }, "We return or delete every record when an engagement ends. Delete the files the client shared once the final presentation is done."),
    h("div", { class: "p-stack" }, purge, remove));
}

async function viewEngagements(t) {
  const all = await db.listEngagements();
  const admin = S.profile.role === "admin";
  const list = admin ? all : all.filter((e) => e.my_kind);
  const active = list.filter((e) => e.stage !== "complete");
  const done = list.filter((e) => e.stage === "complete");
  const slot = h("div", { class: "p-slot" });
  let create = null;
  if (admin) {
    create = h("button", { class: "btn", type: "button" }, icon("plus"), "New engagement");
    const open = (prefill) => {
      slot.replaceChildren(newEngagementForm(prefill, () => { slot.replaceChildren(); create.hidden = false; }));
      create.hidden = true;
      slot.querySelector("input").focus();
    };
    create.addEventListener("click", () => open(null));
    if (S.prefill) {
      const prefill = S.prefill;
      S.prefill = null;
      setTimeout(() => open(prefill), 0);
    }
  }
  screen(t, { title: "Engagements", sub: admin ? "Every engagement, where it stands and who is on it." : "The engagements you are working on.", actions: create },
    slot,
    sec({ title: "In progress", note: String(active.length) }, active.length ? engagementTable(active) : empty(admin ? "No engagements in progress. Start one from an inquiry, or with New engagement." : "You are not on an engagement yet.")),
    done.length ? sec({ title: "Completed", note: String(done.length) }, engagementTable(done)) : null);
}

function engagementTable(list) {
  const table = h("table", { class: "p-table" },
    h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Company"), h("th", { scope: "col" }, "Practice"), h("th", { scope: "col" }, "Stage"), h("th", { scope: "col" }, "Team"), h("th", { scope: "col" }, "Target date"))),
    h("tbody", {}, list.map((e) => h("tr", { "data-href": `engagement-${e.id}` },
      h("td", {}, h("a", { class: "p-strong", href: `#engagement-${e.id}` }, e.company), h("span", { class: "p-sub2" }, e.title)),
      h("td", {}, PRACTICE[e.practice] || ""),
      h("td", { class: "p-td-stage" }, stageBar(e.stage), h("span", { class: "p-sub2" }, stageText(e.stage))),
      h("td", {}, String((e.people || []).filter((p) => p.kind === "team").length)),
      h("td", {}, date(e.target_on) || "—")))));
  return rowLinks(h("div", { class: "p-table-wrap" }, table));
}

// Whole rows open their record; the first cell keeps a real link for keyboards.
function rowLinks(wrap) {
  wrap.addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-href]");
    if (row && !e.target.closest("a, button, select, input, label")) location.hash = row.dataset.href;
  });
  return wrap;
}

function newEngagementForm(prefill, close) {
  const p = prefill || {};
  const titles = { succession: "Readiness review", operations: "Operations review" };
  const submit = h("button", { class: "btn", type: "submit" }, "Create engagement", icon("arrow"));
  const cancel = h("button", { class: "p-textbtn", type: "button", onclick: () => { S.prefill = null; close(); } }, "Cancel");
  const form = h("form", { class: "form p-panel-form" },
    h("div", { class: "p-panel-head wide" },
      h("h2", {}, "New engagement"),
      p.inquiryId ? h("p", {}, `From ${p.clientName}'s inquiry${p.message ? ":" : "."}`) : null,
      p.message ? h("blockquote", { class: "p-quote" }, p.message) : null),
    field({ label: "Company", name: "company", value: p.company || "", required: true }),
    field({ label: "Engagement name", name: "title", value: titles[p.practice || "succession"], required: true }),
    h("div", { class: "wide" }, choices("practice", [["succession", PRACTICE.succession], ["operations", PRACTICE.operations]], p.practice || "succession", { label: "Practice", required: true })),
    field({ label: "Client name", name: "client_name", value: p.clientName || "", optional: true, hint: "We create an invitation link for the client." }),
    field({ label: "Client email", name: "client_email", type: "email", value: p.clientEmail || "", optional: true }),
    field({ label: "Start date", name: "started_on", type: "date", value: isoDay(0) }),
    field({ label: "Target date", name: "target_on", type: "date", value: isoDay(56), hint: "About eight weeks after the start." }),
    field({ label: "Summary", name: "summary", type: "textarea", rows: 3, wide: true, optional: true, hint: "Everyone on the engagement sees this, including the client.", placeholder: "The company, the owner's question and what we agreed to deliver." }),
    h("div", { class: "p-form-actions wide" }, submit, cancel));
  const titleInput = form.elements.namedItem("title");
  let titleTouched = false;
  titleInput.addEventListener("input", () => { titleTouched = true; });
  form.addEventListener("change", (e) => {
    if (e.target.name === "practice" && !titleTouched) titleInput.value = titles[e.target.value];
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const d = formData(form);
    act(submit, "Creating…", async () => {
      const created = await db.createEngagement({
        company: d.company, title: d.title, practice: d.practice, stage: "intro", summary: d.summary,
        started_on: d.started_on || null, target_on: d.target_on || null,
      });
      if (d.client_name || d.client_email) {
        await db.addPerson(created.id, { kind: "client", name: d.client_name, email: d.client_email, title: "Owner", invite_code: inviteCode() });
      }
      if (p.inquiryId) await db.updateInquiry(p.inquiryId, { status: "engaged", engagement_id: created.id });
      S.prefill = null;
      toast("Engagement created.");
      await updateCounts();
      go(`engagement-${created.id}`);
    });
  });
  return form;
}

// ---------------------------------------------------------------- administration

async function viewOverview(t) {
  const [inquiries, applications, engagements, profiles] = await Promise.all([db.listInquiries(), db.listApplications(), db.listEngagements(), db.listProfiles()]);
  await updateCounts(inquiries, applications);
  const inReview = applications.filter((a) => ["submitted", "interview_1", "interview_2"].includes(a.status));
  const active = engagements.filter((e) => e.stage !== "complete");
  const stat = (n, label, href) => h("a", { class: "p-stat", href }, h("b", { "data-count": String(n) }, String(n)), h("span", {}, label));
  screen(t, { title: "Overview", sub: today() },
    h("div", { class: "p-stats" },
      stat(inquiries.filter((i) => i.status === "new").length, "New inquiries", "#inquiries"),
      stat(inReview.length, "Applications in progress", "#applications"),
      stat(active.length, "Active engagements", "#engagements"),
      stat(profiles.filter((p) => p.role !== "user").length, "Members", "#people")),
    h("div", { class: "p-cols p-cols-even" },
      sec({ title: "Latest inquiries", action: arrowLink("#inquiries", "All inquiries") },
        inquiries.length ? h("ul", { class: "p-lines" }, inquiries.slice(0, 4).map(inquiryLine)) : empty("No inquiries yet.")),
      sec({ title: "Applications in progress", action: arrowLink("#applications", "All applications") },
        inReview.length ? h("ul", { class: "p-lines" }, inReview.slice(0, 5).map(applicationLine)) : empty("Nothing waiting for review."))),
    sec({ title: "Engagements in progress", action: arrowLink("#engagements", "All engagements") },
      active.length ? engagementTable(active) : empty("No engagements in progress.")));
}

function inquiryLine(i) {
  return h("li", {}, h("a", { class: "p-line", href: "#inquiries" },
    h("span", { class: "p-line-main" }, h("strong", {}, i.name), h("span", {}, i.company || i.role || (i.kind === "consultation" ? "Consultation request" : "Message"))),
    h("span", { class: "p-line-side" }, pill(INQ_STATUS[i.status], INQ_TONE[i.status]), h("time", { datetime: i.created_at }, ago(i.created_at)))));
}

function applicationLine(a) {
  const ans = a.answers || {};
  return h("li", {}, h("a", { class: "p-line", href: `#application-${a.id}` },
    h("span", { class: "p-line-main" }, h("strong", {}, a.full_name || a.email), h("span", {}, [ans.year, ans.major].filter(Boolean).join(" · "))),
    h("span", { class: "p-line-side" }, pill(APP_STATUS[a.status], APP_TONE[a.status]), h("time", { datetime: a.submitted_at || a.updated_at }, ago(a.submitted_at || a.updated_at)))));
}

function filterBar(groups, counts, current, onPick, label) {
  const bar = h("div", { class: "p-filters", role: "group", "aria-label": label });
  for (const [key, text] of groups) {
    bar.append(h("button", {
      type: "button",
      class: "p-filter",
      "aria-pressed": String(key === current),
      onclick: (e) => {
        bar.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
        onPick(key);
      },
    }, text, h("span", {}, String(counts[key] ?? 0))));
  }
  return bar;
}

async function viewApplications(t) {
  const [applications, settings] = await Promise.all([db.listApplications(), db.getSettings()]);
  await updateCounts(null, applications);
  const groups = [["submitted", "Under review"], ["interview_1", "First interview"], ["interview_2", "Case interview"], ["accepted", "Accepted"], ["declined", "Declined"], ["draft", "Drafts"], ["all", "All"]];
  const counts = Object.fromEntries(groups.map(([k]) => [k, k === "all" ? applications.length : applications.filter((a) => a.status === k).length]));
  const slot = h("div");
  const draw = () => {
    const rows = S.appFilter === "all" ? applications : applications.filter((a) => a.status === S.appFilter);
    slot.replaceChildren(rows.length ? applicationsTable(rows) : empty(S.appFilter === "draft" ? "No drafts in progress." : "No applications here."));
  };
  draw();
  screen(t, { title: "Applications", sub: "Admissions are rolling. Open an application to review it, record interviews and decide.", actions: admissionsSwitch(settings) },
    filterBar(groups, counts, S.appFilter, (k) => { S.appFilter = k; draw(); }, "Filter applications"),
    slot);
}

function admissionsSwitch(settings) {
  const sw = h("button", { type: "button", role: "switch", class: "p-switch", "aria-checked": String(settings.applications_open) },
    h("i", { "aria-hidden": "true" }), h("span", {}, "Accepting applications"));
  sw.addEventListener("click", async () => {
    const next = sw.getAttribute("aria-checked") !== "true";
    sw.setAttribute("aria-checked", String(next));
    try {
      await db.setSetting("applications_open", next);
      toast(next ? "Applications are open." : "Applications are closed. New applicants will see a notice.");
    } catch (err) {
      sw.setAttribute("aria-checked", String(!next));
      toast(err.message, "bad");
    }
  });
  return sw;
}

function applicationsTable(rows) {
  const table = h("table", { class: "p-table" },
    h("thead", {}, h("tr", {}, ["Applicant", "Year", "Major", "Submitted", "Reviews", "Status"].map((c) => h("th", { scope: "col" }, c)))),
    h("tbody", {}, rows.map((a) => {
      const ans = a.answers || {};
      return h("tr", { "data-href": `application-${a.id}` },
        h("td", {}, h("a", { class: "p-strong", href: `#application-${a.id}` }, a.full_name || "Unnamed applicant"), h("span", { class: "p-sub2" }, a.email)),
        h("td", {}, ans.year || "—"),
        h("td", {}, ans.major || "—"),
        h("td", {}, a.submitted_at ? date(a.submitted_at) : "—"),
        h("td", {}, a.review_count ? `${a.review_count} · ${a.review_avg ?? "–"} / 5` : "—"),
        h("td", {}, pill(APP_STATUS[a.status], APP_TONE[a.status])));
    })));
  return rowLinks(h("div", { class: "p-table-wrap" }, table));
}

async function viewApplication(t, id) {
  const [application, reviews] = await Promise.all([db.getApplication(id), db.listReviews(id)]);
  const back = { href: "#applications", label: "Applications" };
  if (!application) return screen(t, { title: "Application not found.", sub: "It may have been withdrawn or removed.", back });
  const urls = application.resume_path ? await db.fileUrls("resumes", [application.resume_path]) : {};
  const a = application.answers || {};
  const resumeUrl = urls[application.resume_path];
  const resume = application.resume_name
    ? (resumeUrl
      ? h("a", { href: resumeUrl, target: "_blank", rel: "noopener" }, application.resume_name)
      : h("button", { type: "button", class: "p-file-name", onclick: () => toast(db.demo ? "Sample file: there is nothing to open in demo mode." : "The resume isn't available right now.") }, application.resume_name))
    : "Not uploaded";
  const linkedin = a.linkedin && safeHref(a.linkedin);
  screen(t, {
    title: application.full_name || application.email,
    sub: [a.year, a.major, a.graduation ? `Graduating ${a.graduation}` : ""].filter(Boolean).join(" · "),
    back,
    actions: pill(APP_STATUS[application.status], APP_TONE[application.status]),
  },
  h("div", { class: "p-cols" },
    h("div", { class: "p-col-main" },
      sec({ title: "Short answers" }, QUESTIONS.map((q, i) => h("div", { class: "p-qa" },
        h("h3", {}, `${i + 1}. ${q.label}`),
        h("p", {}, a[q.name] || "No answer yet."),
        a[q.name] ? h("p", { class: "p-count" }, `${words(a[q.name])} words`) : null))),
      sec({ title: "Details" }, dl([
        ["Email", application.email], ["Phone", a.phone],
        ["LinkedIn", linkedin ? h("a", { href: linkedin, target: "_blank", rel: "noopener" }, a.linkedin) : null],
        ["Heard about us", a.heard], ["Resume", resume],
        ["Started", date(application.created_at)], ["Submitted", dateTime(application.submitted_at)],
      ], "p-dl p-dl-wide"))),
    h("aside", { class: "p-aside" },
      decisionCard(application),
      reviewsCard(application, reviews))));
}

function decisionCard(a) {
  if (a.status === "draft") {
    return h("section", { class: "p-card" }, h("h2", {}, "Decision"), h("p", { class: "p-card-text" }, "This application is still a draft. It can be reviewed once the student submits it."));
  }
  const submit = h("button", { class: "btn btn-small", type: "submit" }, "Save");
  const options = ["submitted", "interview_1", "interview_2", "accepted", "declined", "draft"]
    .map((v) => ({ value: v, label: v === "draft" ? "Returned to the applicant to edit" : APP_STATUS[v] }));
  const form = h("form", { class: "form single" },
    field({ label: "Status", name: "status", type: "select", required: true, value: a.status, options }),
    field({ label: "Note to the applicant", name: "message", type: "textarea", rows: 4, optional: true, value: a.message || "", hint: "Shown on their application page, for example an interview time." }),
    h("p", { class: "fine" }, "Accepting an applicant gives them member access to the portal. Returning an application lets the student edit and submit it again, for example in a new cycle."),
    h("div", { class: "p-form-actions" }, submit));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = formData(form);
    act(submit, "Saving…", async () => {
      await db.updateApplication(a.id, { status: d.status, message: d.message });
      await updateCounts();
      await again();
      toast(d.status === "accepted" ? "Accepted. Their member access is active." : "Saved.");
    });
  });
  return h("section", { class: "p-card" }, h("h2", {}, "Decision"), form);
}

function reviewsCard(a, reviews) {
  const scores = reviews.map((r) => r.score).filter(Boolean);
  const avg = scores.length ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10 : null;
  const submit = h("button", { class: "btn btn-small", type: "submit" }, "Add review");
  const form = h("form", { class: "form single" },
    choices("score", [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]], "", { label: "Score", required: true }),
    choices("recommendation", Object.entries(RECOMMEND), "", { label: "Recommendation", required: true }),
    field({ label: "Notes", name: "note", type: "textarea", rows: 3, optional: true }),
    h("div", { class: "p-form-actions" }, submit));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const d = formData(form);
    act(submit, "Saving…", async () => {
      await db.addReview(a.id, { score: Number(d.score), recommendation: d.recommendation, note: d.note });
      await again();
      toast("Review added.");
    });
  });
  return h("section", { class: "p-card" },
    h("h2", {}, "Reviews"),
    h("p", { class: "p-card-text" }, reviews.length ? `Average ${avg ?? "–"} out of 5, from ${reviews.length} ${reviews.length === 1 ? "review" : "reviews"}.` : "No reviews yet."),
    reviews.length ? h("ul", { class: "p-reviews" }, reviews.map((r) => h("li", {},
      h("header", {}, h("strong", {}, r.reviewer_name || "Reviewer"), h("span", { class: "p-score" }, r.score ? `${r.score} / 5` : "")),
      h("div", { class: "p-review-meta" }, pill(RECOMMEND[r.recommendation] || r.recommendation, RECOMMEND_TONE[r.recommendation]), h("time", { datetime: r.created_at }, date(r.created_at))),
      r.note ? h("p", {}, r.note) : null))) : null,
    h("details", { class: "p-disclose" }, h("summary", {}, "Write a review"), form));
}

async function viewInquiries(t) {
  const inquiries = await db.listInquiries();
  await updateCounts(inquiries);
  const groups = [["new", "New"], ["contacted", "Contacted"], ["engaged", "Engaged"], ["closed", "Closed"], ["all", "All"]];
  const counts = Object.fromEntries(groups.map(([k]) => [k, k === "all" ? inquiries.length : inquiries.filter((i) => i.status === k).length]));
  const slot = h("div");
  const draw = () => {
    const rows = S.inqFilter === "all" ? inquiries : inquiries.filter((i) => i.status === S.inqFilter);
    slot.replaceChildren(rows.length ? h("div", { class: "p-inquiries" }, rows.map(inquiryItem)) : empty("No inquiries here."));
  };
  draw();
  screen(t, { title: "Inquiries", sub: "Consultation requests and messages from the website, newest first." },
    filterBar(groups, counts, S.inqFilter, (k) => { S.inqFilter = k; draw(); }, "Filter inquiries"),
    slot);
}

function inquiryItem(i) {
  const submit = h("button", { class: "btn btn-quiet btn-small", type: "submit" }, "Update status");
  const status = h("form", { class: "p-inline-status" },
    h("label", { class: "visually-hidden", for: `inq-status-${i.id}` }, "Status"),
    h("select", { id: `inq-status-${i.id}`, name: "status", class: "p-select" }, Object.entries(INQ_STATUS).map(([v, label]) => h("option", { value: v, selected: v === i.status }, label))),
    submit);
  status.addEventListener("submit", (e) => {
    e.preventDefault();
    const { status: next } = formData(status);
    act(submit, "Saving…", async () => {
      await db.updateInquiry(i.id, { status: next });
      await again();
      toast("Status updated.");
    });
  });
  const start = i.status !== "engaged" ? h("button", {
    type: "button",
    class: "btn btn-small",
    onclick: () => {
      S.prefill = {
        inquiryId: i.id, company: i.company, clientName: i.name, clientEmail: i.email,
        practice: /operations/i.test(i.interest) ? "operations" : "succession", message: i.message,
      };
      go("engagements");
    },
  }, "Start an engagement", icon("arrow")) : (i.engagement_id ? arrowLink(`#engagement-${i.engagement_id}`, "Open the engagement") : null);
  const email = safeHref(`mailto:${i.email}`);
  return h("details", { class: "p-inquiry" },
    h("summary", {},
      h("span", { class: "p-inq-who" }, h("strong", {}, i.name), h("span", {}, [i.company || i.role, i.kind === "consultation" ? "Consultation request" : "Message"].filter(Boolean).join(" · "))),
      h("span", { class: "p-inq-side" }, pill(INQ_STATUS[i.status], INQ_TONE[i.status]), h("time", { datetime: i.created_at }, ago(i.created_at)))),
    h("div", { class: "p-inq-body" },
      h("p", { class: "p-inq-message" }, i.message || "No message."),
      dl([
        ["Email", email ? h("a", { href: email }, i.email) : i.email], ["Phone", i.phone], ["Company", i.company], ["Sector", i.sector],
        ["Employees", i.employees], ["Interested in", i.interest], ["They are", i.role], ["Received", dateTime(i.created_at)],
      ], "p-dl p-dl-wide"),
      h("div", { class: "p-inq-actions" }, status, start)));
}

async function viewPeople(t) {
  const [profiles, engagements, applications] = await Promise.all([db.listProfiles(), db.listEngagements(), db.listApplications()]);
  const applicants = new Set(applications.map((a) => a.user_id));
  const clients = new Set(engagements.flatMap((e) => (e.people || []).filter((p) => p.kind === "client" && p.user_id).map((p) => p.user_id)));
  const groups = [["all", "Everyone"], ["admin", "Administrators"], ["member", "Members"], ["user", "Accounts"]];
  const counts = Object.fromEntries(groups.map(([k]) => [k, k === "all" ? profiles.length : profiles.filter((p) => p.role === k).length]));
  let query = "";
  const slot = h("div");
  const draw = () => {
    const q = query.toLowerCase();
    const rows = profiles.filter((p) => (S.peopleFilter === "all" || p.role === S.peopleFilter)
      && (!q || `${p.full_name} ${p.email}`.toLowerCase().includes(q)));
    slot.replaceChildren(rows.length ? peopleTable(rows, applicants, clients) : empty("No one matches."));
  };
  const search = h("input", { type: "search", class: "p-search", placeholder: "Search by name or email", "aria-label": "Search people" });
  search.addEventListener("input", () => { query = search.value.trim(); draw(); });
  draw();
  screen(t, { title: "People", sub: "Everyone with a portal account. Members and administrators are set here; clients join through their invitation." },
    h("div", { class: "p-toolbar" }, filterBar(groups, counts, S.peopleFilter, (k) => { S.peopleFilter = k; draw(); }, "Filter people"), search),
    slot);
}

function peopleTable(rows, applicants, clients) {
  return h("div", { class: "p-table-wrap" }, h("table", { class: "p-table" },
    h("thead", {}, h("tr", {}, ["Name", "Email", "Access", "Joined"].map((c) => h("th", { scope: "col" }, c)))),
    h("tbody", {}, rows.map((p) => {
      const self = p.id === S.profile.id;
      const select = h("select", { class: "p-select", "aria-label": `Access for ${p.full_name || p.email}`, disabled: self, title: self ? "You can't change your own access." : null },
        Object.entries(ROLE).map(([v, label]) => h("option", { value: v, selected: v === p.role }, label)));
      select.addEventListener("change", async () => {
        const previous = p.role;
        try {
          await db.setRole(p.id, select.value);
          p.role = select.value;
          toast(`${p.full_name || p.email} is now ${select.value === "user" ? "an account without member access" : select.value === "admin" ? "an administrator" : "a member"}.`);
        } catch (err) {
          select.value = previous;
          toast(err.message, "bad");
        }
      });
      const tags = [applicants.has(p.id) ? "Applicant" : null, clients.has(p.id) ? "Client" : null].filter(Boolean);
      return h("tr", {},
        h("td", {}, h("span", { class: "p-strong" }, p.full_name || "No name yet"), tags.length ? h("span", { class: "p-sub2" }, tags.join(" · ")) : null),
        h("td", {}, p.email),
        h("td", {}, select),
        h("td", {}, date(p.created_at)));
    }))));
}

async function viewLibrary(t) {
  const resources = await db.listResources();
  const urls = await db.fileUrls("library", resources.map((r) => r.path));
  const admin = S.profile.role === "admin";
  const categories = [...CATEGORIES, ...new Set(resources.map((r) => r.category).filter((c) => !CATEGORIES.includes(c)))];
  const open = (r) => {
    const href = r.url ? safeHref(r.url) : urls[r.path];
    if (href) return h("a", { class: "link", href, target: "_blank", rel: "noopener" }, r.url ? "Open link" : "Open file", icon("external"));
    return h("button", { type: "button", class: "p-textbtn", onclick: () => toast(db.demo ? "Sample resource: there is no file in demo mode." : "This file isn't available right now.") }, "Open");
  };
  screen(t, { title: "Library", sub: "Training materials, templates and guides for members." },
    admin ? resourceForm() : null,
    resources.length ? categories.map((c) => {
      const items = resources.filter((r) => r.category === c);
      return items.length ? sec({ title: c, note: String(items.length) }, h("ul", { class: "p-resources" }, items.map((r) => h("li", { class: "p-resource" },
        h("div", {}, h("h3", {}, r.title), r.description ? h("p", {}, r.description) : null),
        h("div", { class: "p-resource-side" },
          open(r),
          admin ? textBtn("Remove", (e) => confirmInline(e.currentTarget, { text: `Remove “${r.title}” from the library?`, yes: "Remove", danger: true }, async () => {
            await db.deleteResource(r);
            await again();
            toast("Removed from the library.");
          }), "danger") : null))))) : null;
    }) : empty(admin ? "The library is empty. Add the first resource above." : "The library is empty for now."));
}

function resourceForm() {
  const submit = h("button", { class: "btn btn-small", type: "submit" }, "Add to the library");
  const form = h("form", { class: "form p-panel-form" },
    field({ label: "Title", name: "title", required: true }),
    field({ label: "Category", name: "category", type: "select", required: true, value: "Training", options: CATEGORIES }),
    field({ label: "Description", name: "description", type: "textarea", rows: 2, optional: true, wide: true }),
    field({ label: "Link", name: "url", type: "url", optional: true, placeholder: "https://…" }),
    field({ label: "Or a file", name: "file", type: "file", optional: true, hint: `Up to ${MAX_FILE_MB} MB.` }),
    h("div", { class: "p-form-actions wide" }, submit));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const d = formData(form);
    const file = form.elements.namedItem("file").files[0] || null;
    if (!d.url && !file) { toast("Add a link or choose a file.", "bad"); return; }
    if (file && file.size > MAX_FILE_MB * 1048576) { toast(`That file is larger than ${MAX_FILE_MB} MB.`, "bad"); return; }
    act(submit, "Adding…", async () => {
      await db.addResource({ title: d.title, category: d.category, description: d.description, url: d.url, file });
      await again();
      toast("Added to the library.");
    });
  });
  return h("details", { class: "p-disclose p-disclose-panel" }, h("summary", {}, "Add a resource"), form);
}

async function viewAnnouncements(t) {
  const list = await db.listAnnouncements();
  const submit = h("button", { class: "btn btn-small", type: "submit" }, "Post to members");
  const form = h("form", { class: "form single p-panel-form" },
    field({ label: "Title", name: "title", required: true }),
    field({ label: "Message", name: "body", type: "textarea", rows: 4, required: true }),
    h("div", { class: "p-form-actions" }, submit, h("p", { class: "fine" }, "Members see announcements on their home page.")));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const d = formData(form);
    act(submit, "Posting…", async () => {
      await db.postAnnouncement(d);
      await again();
      toast("Announcement posted.");
    });
  });
  screen(t, { title: "Announcements", sub: "News for members: training sessions, new engagements and deadlines." },
    h("div", { class: "p-cols" },
      h("div", { class: "p-col-main" },
        sec({ title: "Posted", note: String(list.length) }, list.length ? h("ol", { class: "p-notes" }, list.map((a) => h("li", {},
          h("header", {}, h("h3", {}, a.title), h("time", { datetime: a.created_at }, date(a.created_at))),
          a.body ? h("p", {}, a.body) : null,
          textBtn("Delete", (e) => confirmInline(e.currentTarget, { text: "Delete this announcement?", yes: "Delete", danger: true }, async () => {
            await db.deleteAnnouncement(a.id);
            await again();
          }), "danger")))) : empty("Nothing posted yet."))),
      h("aside", { class: "p-aside" }, h("section", { class: "p-card" }, h("h2", {}, "New announcement"), form))));
}

// ---------------------------------------------------------------- account

function viewAccount(t) {
  const p = S.profile;
  const nameMsg = h("p", { class: "p-form-msg", role: "status", hidden: true });
  const nameBtn = h("button", { class: "btn btn-small", type: "submit" }, "Save name");
  const nameForm = h("form", { class: "form single" },
    field({ label: "Full name", name: "full_name", value: p.full_name || "", required: true, autocomplete: "name" }),
    nameMsg,
    h("div", { class: "p-form-actions" }, nameBtn));
  nameForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { full_name: name } = formData(nameForm);
    if (!name) { nameForm.reportValidity(); return; }
    try {
      await busy(nameBtn, "Saving…", () => db.updateName(name));
      await refresh();
      say(nameMsg, "Saved.", "ok");
    } catch (err) {
      say(nameMsg, err.message, "bad");
    }
  });

  const pwMsg = h("p", { class: "p-form-msg", role: "status", hidden: true });
  const pwBtn = h("button", { class: "btn btn-small", type: "submit" }, "Change password");
  const pwForm = h("form", { class: "form single" },
    field({ label: "New password", name: "password", type: "password", autocomplete: "new-password", required: true, hint: "At least 8 characters." }),
    field({ label: "Repeat the new password", name: "repeat", type: "password", autocomplete: "new-password", required: true }),
    pwMsg,
    h("div", { class: "p-form-actions" }, pwBtn));
  pwForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = formData(pwForm);
    if (d.password.length < 8) return say(pwMsg, "Choose a password of at least 8 characters.", "bad");
    if (d.password !== d.repeat) return say(pwMsg, "The two passwords don't match.", "bad");
    try {
      await busy(pwBtn, "Saving…", () => db.setPassword(d.password));
      pwForm.reset();
      say(pwMsg, "Your password has been changed.", "ok");
    } catch (err) {
      say(pwMsg, err.message, "bad");
    }
  });

  const access = {
    admin: "As an administrator you can see and manage everything in the portal.",
    member: "As a member you can see your engagements, the library and announcements.",
  }[p.role] || (S.clientEngagements.length ? "As a client you can share records, read updates and download deliverables for your engagement." : "You can apply to join Foreman and follow your application here.");
  screen(t, { title: "Your account", sub: p.email },
    h("div", { class: "p-cols" },
      h("div", { class: "p-col-main" },
        sec({ title: "Name" }, nameForm),
        db.demo ? null : sec({ title: "Password" }, pwForm)),
      h("aside", { class: "p-aside" },
        h("section", { class: "p-card" },
          h("h2", {}, roleLabel()),
          h("p", { class: "p-card-text" }, access),
          h("div", { class: "p-stack" }, h("button", { class: "btn btn-quiet btn-small", type: "button", onclick: signOut }, "Sign out"))))));
}
