// Info session check-in. People reach this page from the QR code shown in the room; the
// check-in token travels in the address after the #, so it is never sent to the server
// or to analytics. db.checkIn() records the visit and accepts the same person twice.

import { db } from "./db.js";

const root = document.querySelector(".checkin");
const ask = root.querySelector(".checkin-ask");
const done = root.querySelector(".checkin-done");
const missing = root.querySelector(".checkin-missing");
const form = root.querySelector(".checkin-form");
const status = form.querySelector(".form-status");
const button = form.querySelector("button[type=submit]");
const token = decodeURIComponent(location.hash.slice(1)).trim();
const REMEMBER = "foreman-checkin-me";

if (!/^[a-f0-9]{32,128}$/i.test(token)) {
  ask.hidden = true;
  missing.hidden = false;
} else {
  try {
    const me = JSON.parse(localStorage.getItem(REMEMBER) || "null");
    if (me) for (const k of ["name", "email", "year"]) if (me[k]) form.elements.namedItem(k).value = me[k];
  } catch (_) { /* nothing remembered */ }
}

const say = (text) => { status.textContent = text; status.hidden = !text; };

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = form.elements.namedItem("name").value.trim();
  const email = form.elements.namedItem("email").value.trim();
  const year = form.elements.namedItem("year").value;
  if (!name) { say("Please add your name."); form.elements.namedItem("name").focus(); return; }
  if (!email || !form.elements.namedItem("email").checkValidity()) { say("Please check your email address."); form.elements.namedItem("email").focus(); return; }
  say("");
  button.disabled = true;
  const label = button.textContent;
  button.textContent = "Checking in…";
  try {
    const result = await db.checkIn(token, { name, email, year });
    try { localStorage.setItem(REMEMBER, JSON.stringify({ name, email, year })); } catch (_) { /* private window */ }
    const title = result && result.title ? String(result.title).trim() : "";
    done.querySelector(".checkin-title").textContent = !title || /^information session$/i.test(title) ? "Foreman\u2019s information session" : `\u201C${title}\u201D`;
    if (result && result.already) done.querySelector("h1").textContent = "You're already checked in.";
    ask.hidden = true;
    done.hidden = false;
    done.focus();
  } catch (err) {
    say(err.message || "Something went wrong. Please try again.");
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});

// Friends sometimes share one phone: start a fresh check-in on the same page.
done.querySelector(".checkin-another").addEventListener("click", () => {
  form.reset();
  done.querySelector("h1").textContent = "You're checked in.";
  done.hidden = true;
  ask.hidden = false;
  form.elements.namedItem("name").focus();
});

// A different check-in link opened in the same tab: start over with it.
window.addEventListener("hashchange", () => location.reload());
