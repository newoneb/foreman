// Recruiting on the public site: the live application status, the recruiting calendar,
// info session registration, coffee chat hosts, the notify list, the team page and the
// small recruiting card that appears on other pages while a cycle is open.
// Everything here is read from one public call (db.recruitingPublic) and drawn without
// innerHTML, so text typed into the portal can never become markup on the site.

import { db } from "./db.js";
import {
  recruitingPhase, closesLabel, dayLong, dayName, monthOf, dateOf, timeOf, timeRange, calendarDay, countdown,
  googleCalendarUrl, icsFile, initialsOf, teamGroups,
} from "./recruit-shared.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const CACHE_KEY = "foreman-recruiting";
const CACHE_MS = 120000;
const YEARS = ["First-year", "Second-year", "Third-year", "Fourth-year", "Graduate student", "Other"];
const ARROW = '<path d="M1.5 8h12M9 3.5 13.5 8 9 12.5"/>';
const ICONS = {
  arrow: ARROW,
  external: '<path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5"/><path d="M12 9.5v4H2.5V4h4"/>',
  close: '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>',
  check: '<path d="M3 8.5l3.2 3L13 4.5"/>',
  calendar: '<path d="M2.5 3.5h11v10h-11z"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
  mail: '<path d="M2 3.5h12v9H2z"/><path d="M2 4l6 5 6-5"/>',
  linkedin: '<path d="M3.5 6v6.5M3.5 3.6v.1M6.5 12.5V6M6.5 8.6c0-1.6 1-2.6 2.4-2.6s2.1.9 2.1 2.6v3.9"/>',
};

// ---------------------------------------------------------------- small helpers

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (["hidden", "disabled", "required", "selected"].includes(k)) el[k] = Boolean(v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

function icon(name) {
  const span = document.createElement("span");
  span.className = "r-icon";
  span.setAttribute("aria-hidden", "true");
  // Fixed shapes from the table above; nothing from the database goes in here.
  span.innerHTML = `<svg viewBox="0 0 16 16" focusable="false" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
}

const store = {
  get(key, session = false) {
    try { return JSON.parse((session ? sessionStorage : localStorage).getItem(key) || "null"); } catch (_) { return null; }
  },
  set(key, value, session = false) {
    try { (session ? sessionStorage : localStorage).setItem(key, JSON.stringify(value)); } catch (_) { /* private window */ }
  },
};

function safeUrl(url, schemes = ["https:"]) {
  try {
    const u = new URL(url);
    return schemes.includes(u.protocol) ? u.href : null;
  } catch (_) {
    return null;
  }
}

const portalHref = () => new URL("../../portal/#apply", import.meta.url).href;
const studentsHref = (hash = "") => new URL(`../../students.html${hash}`, import.meta.url).href;
const teamHref = () => new URL("../../team.html", import.meta.url).href;

function portrait(person, cls = "portrait") {
  const src = db.photoUrl(person.photo_path);
  const box = h("span", { class: cls }, h("span", { class: "portrait-initials", "aria-hidden": "true" }, initialsOf(person.name)));
  if (src) {
    const img = h("img", { src, alt: "", loading: "lazy", decoding: "async" });
    img.addEventListener("load", () => box.classList.add("has-photo"));
    img.addEventListener("error", () => img.remove());
    box.append(img);
  }
  return box;
}

// Booking links from the sample data go nowhere real, so the demo says what would happen.
function isSample(url) {
  return db.demo && /example/.test(String(url));
}

// ---------------------------------------------------------------- data

async function load() {
  if (!db.demo) {
    const cached = store.get(CACHE_KEY, true);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  }
  const data = await db.recruitingPublic();
  if (!db.demo) store.set(CACHE_KEY, { at: Date.now(), data }, true);
  return data;
}

const forget = () => store.set(CACHE_KEY, null, true);

// ---------------------------------------------------------------- start

export async function startRecruiting() {
  const onStudents = Boolean(document.querySelector("[data-recruit-status]"));
  const onTeam = Boolean(document.querySelector("[data-team]"));
  const quiet = /(?:^|\/)(thanks|404)(?:\.html)?$/.test(location.pathname) || Boolean(document.querySelector("[data-no-popup]"));
  let data;
  try {
    data = await load();
  } catch (err) {
    document.querySelectorAll("[data-recruit-dates], [data-recruit-sessions], [data-recruit-chats], [data-team]").forEach((el) => {
      el.replaceChildren(h("p", { class: "r-empty" }, "This part of the page couldn't load. Please refresh, or try again in a few minutes."));
    });
    return;
  }
  if (onStudents) {
    const state = recruitingPhase(data);
    drawStatus(state, data);
    drawCalendar(state, data);
    drawSessions(data);
    drawChats(data);
    drawClosing(state);
  }
  if (onTeam) drawTeam(data);
  if (!onStudents && !onTeam && !quiet) popup(data);
}

// ---------------------------------------------------------------- students: status

function drawStatus(state, data) {
  const box = document.querySelector("[data-recruit-status]");
  const label = box.querySelector("[data-rs-label]");
  const detail = box.querySelector("[data-rs-detail]");
  const clock = box.querySelector("[data-rs-clock]");
  const primary = document.querySelector("[data-rs-primary]");
  const secondary = document.querySelector("[data-rs-secondary]");
  const next = (data.sessions || [])[0];
  box.dataset.phase = state.phase;
  const set = (a, text, href) => {
    if (!a) return;
    a.firstChild.textContent = `${text} `;
    a.setAttribute("href", href);
  };
  if (state.phase === "open") {
    label.textContent = `${state.cycle.name} applications are open`;
    detail.textContent = `Apply by ${closesLabel(state.cycle.closes_at)}.`;
    set(primary, "Start your application", portalHref());
    set(secondary, next ? "Info sessions" : "Application process", next ? "#sessions" : "#process");
  } else if (state.phase === "upcoming") {
    label.textContent = `${state.cycle.name} applications open ${dayLong(state.cycle.opens_at)}`;
    detail.textContent = "You can start a draft in the portal now and submit it once applications open.";
    set(primary, "Get notified", "#apply");
    set(secondary, next ? "Info sessions" : "Start a draft", next ? "#sessions" : portalHref());
  } else {
    label.textContent = "Applications are closed";
    detail.textContent = "We recruit at the start of each quarter. Leave your email and we'll tell you when the next cycle opens.";
    set(primary, "Get notified", "#apply");
    set(secondary, "Application process", "#process");
  }
  if (state.until) {
    clock.hidden = false;
    const tick = () => {
      const left = state.until - Date.now();
      if (left <= 0) { clock.textContent = state.phase === "open" ? "Applications have closed" : "Applications are open"; return false; }
      clock.textContent = `${state.phase === "open" ? "Closes in" : "Opens in"} ${countdown(left)}`;
      return true;
    };
    if (tick()) setInterval(tick, 30000);
  }
}

// ---------------------------------------------------------------- students: the recruiting calendar

function drawCalendar(state, data) {
  const box = document.querySelector("[data-recruit-dates]");
  const lede = document.querySelector("[data-cycle-lede]");
  if (!box) return;
  const c = state.cycle;
  if (!c || (state.phase === "closed")) {
    if (lede) lede.textContent = "We recruit at the start of each quarter, for a few weeks at a time.";
    box.replaceChildren(h("div", { class: "r-notice" },
      h("p", {}, c ? `The ${c.name} cycle closed on ${dayLong(c.closes_at)}. The next cycle hasn't been scheduled yet.` : "The next cycle hasn't been scheduled yet."),
      h("a", { class: "link", href: "#apply" }, "Tell me when it opens ", icon("arrow"))));
    return;
  }
  if (lede) lede.textContent = state.phase === "open"
    ? `${c.name} recruiting is under way. Every date is in Chicago time.`
    : `The dates for ${c.name}. Every date is in Chicago time.`;
  const opens = new Date(c.opens_at).getTime();
  const closes = new Date(c.closes_at).getTime();
  const sessions = (data.sessions || []).filter((s) => {
    const t = new Date(s.starts_at).getTime();
    return t >= opens - 21 * 864e5 && t <= closes;
  }).slice(0, 4);
  const marks = [
    { at: opens, title: "Applications open", note: timeOf(c.opens_at), href: null },
    ...sessions.map((s) => ({ at: new Date(s.starts_at).getTime(), title: s.title, note: `${timeOf(s.starts_at)}${s.online ? " · online" : ""}`, href: "#sessions" })),
    { at: closes, title: "Applications close", note: timeOf(c.closes_at), href: null },
  ].sort((a, b) => a.at - b.at);
  if (c.decisions_by) {
    const [y, m, d] = c.decisions_by.split("-").map(Number);
    marks.push({ at: Date.UTC(y, m - 1, d, 18), title: "Decisions by", note: "", href: null, day: c.decisions_by });
  }
  const now = Date.now();
  const iso = (t) => new Date(t).toISOString();
  // Where "today" falls: evenly spaced marks, with today placed in proportion between its neighbours.
  let progress = 0;
  if (now >= marks[marks.length - 1].at) progress = 1;
  else if (now > marks[0].at) {
    const i = marks.findIndex((m) => m.at > now) - 1;
    const span = marks[i + 1].at - marks[i].at || 1;
    progress = (i + (now - marks[i].at) / span) / (marks.length - 1);
  }
  const track = h("ol", { class: "cal", style: null },
    marks.map((m) => {
      const state = m.at < now ? "past" : "ahead";
      const day = m.day ? calendarDay(m.day) : dayLong(iso(m.at));
      const short = m.day ? new Date(m.at).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) : `${monthOf(iso(m.at))} ${dateOf(iso(m.at))}`;
      const inner = [
        h("span", { class: "cal-node", "aria-hidden": "true" }),
        h("span", { class: "cal-date mono" }, short),
        h("span", { class: "cal-title" }, m.title),
        h("span", { class: "cal-note" }, [m.day ? day.split(", ")[0] : dayName(iso(m.at)), m.note].filter(Boolean).join(" · ")),
      ];
      return h("li", { class: `cal-mark is-${state}` }, m.href ? h("a", { href: m.href }, inner) : inner,
        h("span", { class: "visually-hidden" }, state === "past" ? " (done)" : ""));
    }));
  const upcoming = track.querySelector(".is-ahead");
  if (upcoming) upcoming.classList.add("is-next");
  track.style.setProperty("--n", String(marks.length));
  track.style.setProperty("--p", progress.toFixed(4));
  const today = h("span", { class: "cal-today", "aria-hidden": "true" }, h("span", { class: "cal-today-label mono" }, "Today"));
  if (progress > 0 && progress < 1) track.append(today);
  box.replaceChildren(track);
  if (!reduceMotion) {
    track.classList.add("is-waiting");
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      track.classList.remove("is-waiting");
      track.classList.add("is-drawn");
      io.disconnect();
    }, { threshold: 0.3 });
    io.observe(track);
  }
}

// ---------------------------------------------------------------- students: info sessions

function drawSessions(data) {
  const box = document.querySelector("[data-recruit-sessions]");
  if (!box) return;
  const list = data.sessions || [];
  if (!list.length) {
    box.replaceChildren(h("p", { class: "r-empty" }, "No info sessions are scheduled right now. New sessions appear here when a cycle is announced."));
    return;
  }
  box.replaceChildren(h("div", { class: "sessions" }, list.map(sessionCard)));
}

function sessionCard(s) {
  const saved = store.get(`foreman-session-${s.id}`);
  const seatsLeft = s.capacity ? Math.max(0, s.capacity - s.registered) : null;
  const full = seatsLeft === 0 && !saved;
  const place = s.online ? (s.location ? `${s.location} and online` : "Online") : s.location;
  const card = h("article", { class: "session", "aria-labelledby": `session-${s.id}` });
  const act = h("div", { class: "session-act" });
  const form = h("form", { class: "session-form", hidden: true, novalidate: true });
  const done = h("div", { class: "session-done", hidden: true, role: "status" });

  const fieldId = (n) => `s-${s.id}-${n}`;
  const msg = h("p", { class: "session-msg", role: "alert", hidden: true });
  const submit = h("button", { class: "btn btn-small", type: "submit" }, "Save my seat");
  form.append(
    h("div", { class: "session-fields" },
      h("div", { class: "field" }, h("label", { for: fieldId("name") }, "Name"), h("input", { id: fieldId("name"), name: "name", autocomplete: "name", required: true })),
      h("div", { class: "field" }, h("label", { for: fieldId("email") }, "Email"), h("input", { id: fieldId("email"), name: "email", type: "email", autocomplete: "email", required: true, placeholder: "you@uchicago.edu" })),
      h("div", { class: "field" }, h("label", { for: fieldId("year") }, "Year"),
        h("select", { id: fieldId("year"), name: "year" }, h("option", { value: "" }, "Select"), YEARS.map((y) => h("option", { value: y }, y))))),
    msg,
    h("div", { class: "session-form-actions" }, submit,
      h("button", { class: "link-button", type: "button", onclick: () => { form.hidden = true; act.hidden = false; act.querySelector("button")?.focus(); } }, "Cancel")),
    h("p", { class: "fine" }, "We use your email only to send details about this session."));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    msg.hidden = true;
    if (!String(d.name || "").trim() || !form.elements.namedItem("email").checkValidity() || !String(d.email || "").trim()) {
      msg.textContent = !String(d.name || "").trim() ? "Please add your name." : "Please check your email address.";
      msg.hidden = false;
      return;
    }
    submit.disabled = true;
    submit.textContent = "Saving…";
    try {
      const result = await db.registerForSession(s.id, { name: d.name.trim(), email: d.email.trim(), year: d.year });
      const record = { ...s, ...result };
      store.set(`foreman-session-${s.id}`, { meeting_url: result.meeting_url || null, at: Date.now() });
      forget();
      form.hidden = true;
      showDone(record, result.already);
      done.focus();
      const seats = card.querySelector(".session-seats");
      if (seats && s.capacity && !result.already) seats.textContent = seatLine(s.capacity, s.registered + 1);
    } catch (err) {
      msg.textContent = err.message || "That didn't go through. Please try again.";
      msg.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = "Save my seat";
    }
  });

  function showDone(record, already) {
    act.hidden = true;
    done.hidden = false;
    done.setAttribute("tabindex", "-1");
    const meeting = safeUrl(record.meeting_url || "");
    const ics = new Blob([icsFile({ ...record, meeting_url: meeting })], { type: "text/calendar" });
    done.replaceChildren(
      h("p", { class: "session-done-head" }, icon("check"), h("strong", {}, already ? "You're already registered." : "You're registered."),
        h("span", {}, " We'll see you there.")),
      meeting ? h("p", { class: "session-join" }, "Join online: ", h("a", { href: meeting, target: "_blank", rel: "noopener" }, meeting.replace(/^https:\/\//, ""))) : null,
      h("div", { class: "session-cal" },
        h("a", { class: "link", href: googleCalendarUrl({ ...record, meeting_url: meeting }), target: "_blank", rel: "noopener" }, icon("calendar"), "Add to Google Calendar"),
        h("a", { class: "link", href: URL.createObjectURL(ics), download: `foreman-${record.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics` }, icon("calendar"), "Apple or Outlook (.ics)")));
  }

  act.append(saved
    ? h("span", { class: "session-pill" }, icon("check"), "Registered")
    : full
      ? h("span", { class: "session-pill is-full" }, "Full")
      : h("button", {
        class: "btn btn-small btn-quiet",
        type: "button",
        "aria-expanded": "false",
        onclick: (e) => {
          act.hidden = true;
          form.hidden = false;
          e.currentTarget.setAttribute("aria-expanded", "true");
          form.querySelector("input").focus();
        },
      }, "Register", h("span", { class: "visually-hidden" }, ` for ${s.title}, ${dayLong(s.starts_at)}`)));

  card.append(
    h("div", { class: "session-date", "aria-hidden": "true" },
      h("span", { class: "mono" }, monthOf(s.starts_at)), h("b", {}, dateOf(s.starts_at)), h("span", {}, dayName(s.starts_at))),
    h("div", { class: "session-main" },
      h("h3", { id: `session-${s.id}` }, s.title),
      h("p", { class: "session-meta" }, h("time", { datetime: s.starts_at }, `${dayLong(s.starts_at)} · ${timeRange(s.starts_at, s.ends_at)} CT`), place ? ` · ${place}` : ""),
      s.details ? h("p", { class: "session-details" }, s.details) : null,
      s.capacity ? h("p", { class: "session-seats mono" }, seatLine(s.capacity, s.registered)) : null),
    act, form, done);
  if (saved) {
    act.hidden = false;
    const again = h("button", { class: "link-button", type: "button", onclick: () => { again.remove(); showDone({ ...s, meeting_url: saved.meeting_url }, true); } }, "Show details");
    act.append(again);
  }
  return card;
}

const seatLine = (capacity, registered) => {
  const left = Math.max(0, capacity - registered);
  return left === 0 ? "Full" : `${left} of ${capacity} seats open`;
};

// ---------------------------------------------------------------- students: coffee chats

function drawChats(data) {
  const box = document.querySelector("[data-recruit-chats]");
  if (!box) return;
  const hosts = (data.team || []).filter((m) => m.hosts_chats && (safeUrl(m.booking_url || "") || m.email));
  if (!hosts.length) {
    box.replaceChildren(h("p", { class: "r-empty" }, "Coffee chats open with each recruiting cycle. Check back soon, or come to an info session."));
    return;
  }
  box.replaceChildren(h("ul", { class: "hosts" }, hosts.map((m) => h("li", { class: "host" },
    portrait(m, "portrait portrait-sm"),
    h("div", { class: "host-text" },
      h("h3", {}, m.name),
      m.title ? h("p", { class: "host-title" }, m.title) : null,
      m.chat_topics ? h("p", { class: "host-topics" }, m.chat_topics) : null),
    h("div", { class: "host-act" }, chatButton(m))))));
}

function chatButton(m) {
  const booking = safeUrl(m.booking_url || "");
  if (booking) {
    const a = h("a", { class: "btn btn-small", href: booking, target: "_blank", rel: "noopener" }, "Book a time", icon("external"),
      h("span", { class: "visually-hidden" }, ` with ${m.name} (opens their calendar)`));
    if (isSample(booking)) a.addEventListener("click", (e) => { e.preventDefault(); sampleNote(a, "In the live site this opens the host's own booking page, such as Calendly, Cal.com or a Google Calendar appointment schedule."); });
    return a;
  }
  const mail = safeUrl(`mailto:${m.email}?subject=${encodeURIComponent("Coffee chat about Foreman")}`, ["mailto:"]);
  return h("a", { class: "btn btn-small btn-quiet", href: mail }, "Email to schedule", h("span", { class: "visually-hidden" }, ` with ${m.name}`));
}

function sampleNote(anchor, text) {
  const host = anchor.closest(".host, .sheet-body") || anchor.parentElement;
  if (host.querySelector(".sample-note")) return;
  host.append(h("p", { class: "sample-note", role: "status" }, h("strong", {}, "Sample host. "), text));
}

// ---------------------------------------------------------------- students: closing and notify

function drawClosing(state) {
  const box = document.querySelector("[data-recruit-closing]");
  if (!box) return;
  const title = box.querySelector("h2");
  const sub = box.querySelector("[data-closing-sub]");
  const actions = box.querySelector("[data-closing-actions]");
  const form = box.querySelector("[data-notify]");
  if (state.phase === "open") {
    title.textContent = `${state.cycle.name} applications close ${dayLong(state.cycle.closes_at)}.`;
    sub.textContent = "Your resume and three short answers are all we ask for. Drafts save as you write.";
    actions.hidden = false;
    form.hidden = true;
    return;
  }
  title.textContent = state.phase === "upcoming" ? `${state.cycle.name} applications open ${dayLong(state.cycle.opens_at)}.` : "Be the first to know when applications open.";
  sub.textContent = state.phase === "upcoming"
    ? "Leave your email and we'll write when the cycle opens. You can start a draft in the portal now."
    : "Leave your email and we'll write when the next cycle opens.";
  actions.hidden = state.phase !== "upcoming";
  const primary = actions.querySelector("a");
  if (primary && state.phase === "upcoming") primary.firstChild.textContent = "Start a draft ";
  form.hidden = false;
  wireNotify(form);
}

function wireNotify(form) {
  const msg = form.querySelector(".notify-msg");
  const button = form.querySelector("button[type=submit]");
  const joined = store.get("foreman-notify");
  if (joined) {
    msg.hidden = false;
    msg.textContent = `You're on the list${joined.email ? ` as ${joined.email}` : ""}. We'll write when applications open.`;
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.elements.namedItem("email");
    const name = form.elements.namedItem("name");
    if (!email.value.trim() || !email.checkValidity()) {
      msg.hidden = false;
      msg.dataset.tone = "bad";
      msg.textContent = "Please enter a valid email address.";
      email.focus();
      return;
    }
    button.disabled = true;
    const label = button.textContent;
    button.textContent = "Saving…";
    try {
      await db.joinNotifyList({ email: email.value.trim(), name: name ? name.value.trim() : "" });
      store.set("foreman-notify", { email: email.value.trim().toLowerCase(), at: Date.now() });
      msg.hidden = false;
      msg.dataset.tone = "ok";
      msg.textContent = "Thank you. We'll email you when applications open.";
      form.reset();
    } catch (err) {
      msg.hidden = false;
      msg.dataset.tone = "bad";
      msg.textContent = err.message || "That didn't go through. Please try again.";
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
}

// ---------------------------------------------------------------- team page

function drawTeam(data) {
  const box = document.querySelector("[data-team]");
  const index = document.querySelector("[data-team-index]");
  const team = data.team || [];
  if (!team.length) {
    box.replaceChildren(h("p", { class: "r-empty" }, "Team profiles are on their way."));
    if (index) index.hidden = true;
    return;
  }
  const groups = teamGroups(team);
  const slug = (name) => `team-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const sheet = personSheet();
  box.replaceChildren(...groups.map((g) => h("section", { class: "team-group", id: slug(g.name), "aria-labelledby": `${slug(g.name)}-h` },
    h("header", { class: "team-group-head" },
      h("h2", { id: `${slug(g.name)}-h` }, g.name),
      h("span", { class: "mono" }, String(g.people.length).padStart(2, "0"))),
    h("ul", { class: "people" }, g.people.map((m, i) => {
      const others = (m.teams || []).filter((t) => t !== g.name);
      const card = h("button", { type: "button", class: "person", "aria-haspopup": "dialog" },
        portrait(m),
        h("span", { class: "person-name" }, m.name),
        h("span", { class: "person-title" }, m.title || ""),
        h("span", { class: "person-meta" }, [m.class_year, m.major].filter(Boolean).join(" · ")),
        others.length || m.hosts_chats ? h("span", { class: "person-tags" },
          others.map((t) => h("span", { class: "tag" }, t)),
          m.hosts_chats ? h("span", { class: "tag tag-signal" }, "Coffee chats") : null) : null);
      card.addEventListener("click", () => sheet.open(m, card));
      const li = h("li", {}, card);
      li.style.setProperty("--i", String(i));
      return li;
    })))));
  if (index) {
    index.replaceChildren(...groups.map((g) => h("a", { href: `#${slug(g.name)}` }, g.name, " ", h("span", { class: "mono" }, String(g.people.length).padStart(2, "0")))));
    index.hidden = false;
  }
  if (!reduceMotion) {
    box.querySelectorAll(".people").forEach((list) => {
      list.classList.add("is-waiting");
      const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        list.classList.remove("is-waiting");
        list.classList.add("is-in");
        io.disconnect();
      }, { threshold: 0.12 });
      io.observe(list);
    });
  }
}

// A side sheet with the full profile. A native dialog keeps focus inside and closes on Escape.
function personSheet() {
  const body = h("div", { class: "sheet-body" });
  const close = h("button", { type: "button", class: "sheet-close" }, icon("close"), h("span", { class: "visually-hidden" }, "Close"));
  const dialog = h("dialog", { class: "person-sheet", "aria-labelledby": "sheet-name" }, close, body);
  document.body.append(dialog);
  let opener = null;
  const shut = () => {
    if (!dialog.open) return;
    if (reduceMotion) { dialog.close(); return; }
    dialog.classList.add("is-closing");
    setTimeout(() => { dialog.classList.remove("is-closing"); dialog.close(); }, 220);
  };
  close.addEventListener("click", shut);
  dialog.addEventListener("click", (e) => { if (e.target === dialog) shut(); });
  dialog.addEventListener("close", () => { if (opener) opener.focus(); });
  return {
    open(m, from) {
      opener = from;
      const linkedin = safeUrl(m.linkedin_url || "");
      body.replaceChildren(
        portrait(m, "portrait portrait-lg"),
        h("p", { class: "sheet-teams mono" }, (m.teams || []).join(" · ")),
        h("h2", { id: "sheet-name" }, m.name),
        m.title ? h("p", { class: "sheet-title" }, m.title) : null,
        [m.class_year, m.major].some(Boolean) ? h("p", { class: "sheet-meta" }, [m.class_year, m.major].filter(Boolean).join(" · ")) : null,
        m.bio ? h("p", { class: "sheet-bio" }, m.bio) : null,
        h("div", { class: "sheet-links" },
          m.hosts_chats && (m.booking_url || m.email) ? chatButton(m) : null,
          linkedin ? h("a", { class: "link", href: linkedin, target: "_blank", rel: "noopener" }, icon("linkedin"), "LinkedIn") : null));
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      close.focus();
    },
  };
}

// ---------------------------------------------------------------- the recruiting card on other pages

function popup(data) {
  const state = recruitingPhase(data);
  if (state.phase !== "open") return;
  const key = `foreman-popup-${state.cycle.id}`;
  if (store.get(key) || store.get(key, true)) return;
  const next = (data.sessions || []).find((s) => !(s.capacity && s.registered >= s.capacity));
  let shown = false;
  const show = () => {
    if (shown) return;
    shown = true;
    store.set(key, "shown", true);
    window.removeEventListener("scroll", onScroll);
    const done = (remember) => {
      if (remember) store.set(key, "closed");
      card.classList.add("is-leaving");
      setTimeout(() => card.remove(), reduceMotion ? 0 : 260);
    };
    const card = h("aside", { class: "recruit-pop", "aria-labelledby": "recruit-pop-title" },
      h("button", { type: "button", class: "recruit-pop-x", onclick: () => done(true) }, icon("close"), h("span", { class: "visually-hidden" }, "Dismiss")),
      h("p", { class: "recruit-pop-kicker mono" }, h("span", { class: "rs-dot", "aria-hidden": "true" }), "Now recruiting"),
      h("h2", { id: "recruit-pop-title" }, `${state.cycle.name} applications are open`),
      h("p", { class: "recruit-pop-text" }, `Apply by ${dayLong(state.cycle.closes_at)}.`,
        next ? ` Next info session: ${dayLong(next.starts_at)}, ${timeOf(next.starts_at)}.` : ""),
      h("div", { class: "recruit-pop-actions" },
        h("a", { class: "btn btn-small", href: studentsHref(), onclick: () => store.set(key, "clicked") }, "How to apply", icon("arrow")),
        next ? h("a", { class: "link", href: studentsHref("#sessions"), onclick: () => store.set(key, "clicked") }, "Info sessions") : null));
    document.body.append(card);
    requestAnimationFrame(() => card.classList.add("is-in"));
  };
  const onScroll = () => { if (window.scrollY > window.innerHeight * 0.5) show(); };
  window.addEventListener("scroll", onScroll, { passive: true });
  setTimeout(show, 6000);
}

export { teamHref };
