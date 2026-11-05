// Recruiting helpers shared by the public pages and the portal: Chicago dates and times,
// where the recruiting calendar stands, and calendar links for info sessions.
// Every date on the site is shown in Chicago time, wherever the reader is.

export const TZ = "America/Chicago";
const DAY = 864e5;

const parts = (date, tz = TZ) => Object.fromEntries(new Intl.DateTimeFormat("en-US", {
  timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
}).formatToParts(date).map((p) => [p.type, p.value]));

// Minutes the zone is ahead of UTC at a moment (negative for Chicago).
function offset(date, tz = TZ) {
  const p = parts(date, tz);
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - date.getTime()) / 60000;
}

// "2027-01-13" and "18:00" in Chicago, as an ISO timestamp.
export function zonedISO(day, time = "00:00", tz = TZ) {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = String(time || "00:00").split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  let utc = wall;
  for (let i = 0; i < 2; i += 1) utc = wall - offset(new Date(utc), tz) * 60000;
  return new Date(utc).toISOString();
}

// An ISO timestamp as the Chicago day and time, for date and time inputs.
export function zonedParts(iso, tz = TZ) {
  const p = parts(new Date(iso), tz);
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${String(+p.hour % 24).padStart(2, "0")}:${p.minute}` };
}

// Today's date in Chicago, as YYYY-MM-DD.
export const todayISO = () => zonedParts(new Date().toISOString()).day;

const formatter = (options) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...options });
const longDay = formatter({ weekday: "long", month: "long", day: "numeric" });
const shortDay = formatter({ month: "short", day: "numeric" });
const weekday = formatter({ weekday: "short" });
const clock = formatter({ hour: "numeric", minute: "2-digit" });

const tidy = (s) => s.replace(":00", "").replace(/\s?AM$/, " am").replace(/\s?PM$/, " pm").replace(/\u202f/g, " ");

export const dayLong = (iso) => longDay.format(new Date(iso)); // Tuesday, January 13
export const dayShort = (iso) => shortDay.format(new Date(iso)); // Jan 13
export const dayName = (iso) => weekday.format(new Date(iso)); // Tue
export const timeOf = (iso) => tidy(clock.format(new Date(iso)).replace(/\u202f/g, " ")); // 6 pm, 6:30 pm
export const monthOf = (iso) => formatter({ month: "short" }).format(new Date(iso)); // Jan
export const dateOf = (iso) => formatter({ day: "numeric" }).format(new Date(iso)); // 13

// 6–7 pm, or 11:30 am – 1 pm when the halves of the day differ.
export function timeRange(start, end) {
  const a = timeOf(start);
  const b = timeOf(end);
  const half = (s) => s.slice(-2);
  return half(a) === half(b) ? `${a.slice(0, -3)}–${b}` : `${a} – ${b}`;
}

// A date column ("decisions by") is a calendar day, not a moment.
export function calendarDay(day) {
  if (!day) return "";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
}

// Closing at 11:59 pm reads better than "midnight" on the wrong day.
export function closesLabel(iso) {
  return `${dayLong(iso)} at ${timeOf(iso)} CT`;
}

// Where recruiting stands, from the public payload: { cycle, next, last, sessions, team }.
export function recruitingPhase(data, now = Date.now()) {
  const open = data && data.cycle && new Date(data.cycle.opens_at) <= now && new Date(data.cycle.closes_at) > now ? data.cycle : null;
  const next = data && data.next && new Date(data.next.opens_at) > now ? data.next : null;
  if (open) return { phase: "open", cycle: open, next, until: new Date(open.closes_at).getTime() };
  if (next) return { phase: "upcoming", cycle: next, next, until: new Date(next.opens_at).getTime() };
  return { phase: "closed", cycle: (data && data.last) || null, next: null, until: 0 };
}

// "9d 04h 17m", for the countdowns.
export function countdown(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  return d > 0 ? `${d}d ${String(h).padStart(2, "0")}h ${String(min).padStart(2, "0")}m` : `${h}h ${String(min).padStart(2, "0")}m`;
}

export const daysUntil = (ms, now = Date.now()) => Math.max(0, Math.ceil((ms - now) / DAY));

// Calendar links for a registered session: Google Calendar and an .ics file.
const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export function googleCalendarUrl(s, extra = "") {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `Foreman: ${s.title}`,
    dates: `${stamp(s.starts_at)}/${stamp(s.ends_at)}`,
    details: [s.details, s.meeting_url ? `Join online: ${s.meeting_url}` : "", extra].filter(Boolean).join("\n\n"),
    location: s.meeting_url && !s.location ? s.meeting_url : s.location || "",
    ctz: TZ,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function icsFile(s) {
  const esc = (v) => String(v || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Foreman//Recruiting//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${s.id}@foreman-capital.com`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(s.starts_at)}`,
    `DTEND:${stamp(s.ends_at)}`,
    `SUMMARY:${esc(`Foreman: ${s.title}`)}`,
    `LOCATION:${esc(s.location || s.meeting_url || "")}`,
    `DESCRIPTION:${esc([s.details, s.meeting_url ? `Join online: ${s.meeting_url}` : ""].filter(Boolean).join("\n\n"))}`,
    ...(s.meeting_url ? [`URL:${s.meeting_url}`] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

// Initials for a portrait placeholder.
export const initialsOf = (name) => String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "F";

// The team's usual order on the page. Anything else follows, alphabetically.
export const TEAM_ORDER = ["Leadership", "Engagement managers", "Analysts", "Marketing"];
export function teamGroups(team) {
  const names = new Set();
  team.forEach((m) => (m.teams && m.teams.length ? m.teams : ["Members"]).forEach((t) => names.add(t)));
  const ordered = [...TEAM_ORDER.filter((t) => names.has(t)), ...[...names].filter((t) => !TEAM_ORDER.includes(t)).sort()];
  // Each person appears once, under the first of their teams in that order.
  return ordered.map((name) => ({
    name,
    people: team.filter((m) => {
      const own = m.teams && m.teams.length ? m.teams : ["Members"];
      return ordered.find((t) => own.includes(t)) === name;
    }),
  })).filter((g) => g.people.length);
}
