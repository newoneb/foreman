// Foreman portal data: one set of calls, two back ends.
//
// Demo mode, used while config.js is empty: everything is kept in this browser's
// localStorage and seeded with sample records, so every part of the portal can be
// explored before any setup. Nothing leaves the browser.
//
// Live mode, used once config.js holds a Supabase project URL and anon key: accounts use
// Supabase Auth, records live in Postgres behind the row-level security policies in
// supabase/schema.sql, and files go to private Storage buckets. The browser only ever
// holds the signed-in person's own permissions.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../../config.js";
import { zonedISO } from "./recruit-shared.js";

export const MAX_FILE_MB = 50;
export const MAX_RESUME_MB = 10;

const LIVE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const MAX_PHOTO_MB = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- shared helpers

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// Ten characters without look-alikes (no 0, O, 1, I or L), shown as XXXXX-XXXXX.
export function inviteCode() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  while (out.length < 10) {
    for (const n of crypto.getRandomValues(new Uint8Array(16))) {
      if (n < 248 && out.length < 10) out += abc[n % abc.length];
    }
  }
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export const normalizeCode = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function safeName(name) {
  const clean = String(name || "file").normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|-+$/g, "");
  return (clean || "file").slice(-90);
}

// Some systems report no type for Office files, so fall back on the extension.
const TYPES = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", txt: "text/plain", zip: "application/zip",
};
function contentType(file) {
  const ext = String(file.name || "").split(".").pop().toLowerCase();
  return TYPES[ext] || file.type || "application/octet-stream";
}

function pick(source, keys) {
  const out = {};
  for (const k of keys) if (source && source[k] !== undefined) out[k] = source[k];
  return out;
}

const APPLICATION_FIELDS = ["full_name", "answers", "resume_path", "resume_name"];
const CYCLE_FIELDS = ["name", "opens_at", "closes_at", "decisions_by", "note"];
const SESSION_FIELDS = ["title", "starts_at", "ends_at", "location", "meeting_url", "capacity", "details", "cycle_id"];
const TEAM_FIELDS = ["name", "title", "teams", "bio", "class_year", "major", "photo_path", "linkedin_url", "email", "booking_url",
  "chat_topics", "hosts_chats", "runs_recruiting", "profile_id", "visible", "sort_order"];
// What people may change on their own team card. The database enforces the same list.
const OWN_CARD_FIELDS = ["bio", "class_year", "major", "photo_path", "linkedin_url", "email", "booking_url", "chat_topics", "hosts_chats"];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Empty optional links and numbers are stored as nothing, not as empty text.
function tidyRow(row) {
  const out = { ...row };
  for (const k of ["linkedin_url", "booking_url", "meeting_url", "photo_path", "decisions_by", "cycle_id", "profile_id"]) {
    if (k in out && (out[k] === "" || out[k] === undefined)) out[k] = null;
  }
  if ("capacity" in out) out.capacity = out.capacity === "" || out.capacity == null ? null : Number(out.capacity);
  if ("sort_order" in out) out.sort_order = Number(out.sort_order) || 100;
  return out;
}

// The public key goes in the apikey header. Older projects' keys are tokens and may also be
// sent as the bearer; the newer publishable keys must not be.
const looksLikeToken = (key) => String(key).split(".").length === 3;
function publicHeaders() {
  const headers = { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" };
  if (looksLikeToken(SUPABASE_ANON_KEY)) headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  return headers;
}
const ENGAGEMENT_FIELDS = ["company", "title", "practice", "stage", "summary", "started_on", "target_on"];
const PERSON_FIELDS = ["kind", "name", "email", "title", "user_id", "invite_code"];

const INQUIRY_LIMITS = { name: 200, email: 320, company: 200, phone: 60, sector: 120, employees: 60, interest: 120, role: 120, message: 5000 };
function cleanInquiry(data) {
  const row = { kind: data.kind === "consultation" ? "consultation" : "general" };
  for (const [key, max] of Object.entries(INQUIRY_LIMITS)) row[key] = String(data[key] ?? "").trim().slice(0, max);
  return row;
}

function summarize(reviews) {
  const scores = reviews.map((r) => Number(r.score)).filter((n) => n > 0);
  return {
    review_count: reviews.length,
    review_avg: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
  };
}

const exists = () => Object.assign(new Error("An account with this email already exists. Sign in instead."), { kind: "exists" });

// Supabase returns terse technical messages; turn the common ones into plain English.
function friendly(error) {
  const text = String(error?.message || error || "");
  const code = String(error?.code || "");
  const rules = [
    [/invalid login credentials|invalid_credentials/i, "That email and password don't match an account."],
    [/email not confirmed|email_not_confirmed/i, "Please confirm your email address first, using the link we sent you."],
    [/already registered|already been registered|user_already_exists|email_exists/i, null],
    [/rate limit|too many requests|over_.*_rate_limit/i, "Too many attempts. Please wait a few minutes and try again."],
    [/failed to fetch|networkerror|load failed|network request failed/i, "We couldn't reach the server. Check your connection and try again."],
    [/row-level security|permission denied|42501/i, "You don't have permission to do that."],
    [/PGRST116|multiple \(or no\) rows/i, "That record isn't available to you any more. Refresh the page and try again."],
    [/relation .* does not exist|schema cache|42P01|PGRST205/i, "The portal database isn't set up yet. Run supabase/schema.sql in the Supabase project."],
    [/payload too large|maximum allowed size|entity too large|413/i, "That file is too large."],
    [/mime type|invalid_mime_type/i, "That type of file isn't accepted."],
    [/duplicate key|23505/i, "That already exists."],
    [/jwt expired|session.*(expired|missing)|refresh token/i, "Your session has ended. Please sign in again."],
  ];
  for (const [pattern, message] of rules) {
    if (pattern.test(text) || pattern.test(code)) return message === null ? exists() : Object.assign(new Error(message), { cause: error });
  }
  return Object.assign(new Error(text || "Something went wrong. Please try again."), { cause: error });
}

// ---------------------------------------------------------------- live: Supabase

function createLive() {
  let client = null;
  let loading = null;
  let user = null;
  const base = SUPABASE_URL.replace(/\/+$/, "");
  const portalUrl = () => new URL("../../portal/", import.meta.url).href;

  // The Supabase library is only fetched on pages that need it.
  async function sb() {
    if (client) return client;
    loading ||= new Promise((resolve, reject) => {
      if (window.supabase?.createClient) return resolve();
      const script = document.createElement("script");
      script.src = new URL("./vendor/supabase.js", import.meta.url).href;
      script.onload = () => resolve();
      script.onerror = () => { loading = null; reject(new Error("The portal couldn't load. Check your connection and refresh the page.")); };
      document.head.append(script);
    });
    await loading;
    client ||= window.supabase.createClient(base, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    return client;
  }

  async function run(build) {
    const c = await sb();
    const { data, error } = await build(c);
    if (error) throw friendly(error);
    return data;
  }

  async function me() {
    if (user) return user;
    const c = await sb();
    const { data } = await c.auth.getSession();
    user = data.session?.user || null;
    if (!user) throw new Error("Your session has ended. Please sign in again.");
    return user;
  }

  // The Storage client sends a File's own type, so re-wrap it with the type we want.
  async function upload(bucket, path, file) {
    const type = contentType(file);
    const body = typeof File === "function" ? new File([file], file.name, { type }) : file;
    await run((c) => c.storage.from(bucket).upload(path, body, { contentType: type, upsert: false }));
    return path;
  }
  async function removeFiles(bucket, paths) {
    const list = paths.filter(Boolean);
    if (list.length) await run((c) => c.storage.from(bucket).remove(list));
  }

  // The public recruiting calls are plain requests, so the website's pages never load the
  // Supabase library just to show dates or take a registration.
  async function rpcPublic(fn, args = {}) {
    let res;
    try {
      res = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: "POST", headers: publicHeaders(), body: JSON.stringify(args) });
    } catch (err) {
      throw friendly(err);
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
    if (!res.ok) throw friendly(data && data.message ? data : { message: `The request didn't go through (${res.status}).` });
    return data;
  }
  async function myId() {
    return (await me()).id;
  }

  return {
    live: true,
    demo: false,
    demoAccounts: [],
    demoRole: () => "",
    async demoSignIn() {},
    async resetDemo() {},

    async session() {
      const c = await sb();
      const { data, error } = await c.auth.getSession();
      if (error) throw friendly(error);
      user = data.session?.user || null;
      if (!user) return null;
      const profile = await run((c) => c.from("profiles").select("*").eq("id", user.id).maybeSingle());
      return {
        user: { id: user.id, email: user.email },
        profile: profile || { id: user.id, email: user.email, full_name: user.user_metadata?.full_name || "", role: "user", created_at: user.created_at },
      };
    },
    onAuth(callback) {
      let stop = () => {};
      sb().then((c) => {
        const { data } = c.auth.onAuthStateChange((event, session) => {
          user = session?.user || null;
          // Supabase asks that callbacks not call back into the client synchronously.
          setTimeout(() => callback(event), 0);
        });
        stop = () => data.subscription.unsubscribe();
      }).catch(() => {});
      return () => stop();
    },
    async signIn(email, password) {
      const data = await run((c) => c.auth.signInWithPassword({ email: email.trim(), password }));
      user = data.user;
    },
    async signUp(email, password, fullName) {
      const data = await run((c) => c.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() }, emailRedirectTo: portalUrl() },
      }));
      // With email confirmation on, Supabase hides existing accounts behind an empty identities list.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw exists();
      user = data.session?.user || null;
      return { needsConfirm: !data.session };
    },
    async signOut() {
      const c = await sb();
      await c.auth.signOut();
      user = null;
    },
    async requestReset(email) {
      await run((c) => c.auth.resetPasswordForEmail(email.trim(), { redirectTo: portalUrl() }));
    },
    async setPassword(password) {
      await run((c) => c.auth.updateUser({ password }));
    },
    async updateName(fullName) {
      const u = await me();
      await run((c) => c.from("profiles").update({ full_name: fullName.trim() }).eq("id", u.id));
    },
    async myLinks() {
      const u = await me();
      return run((c) => c.from("engagement_people").select("engagement_id, kind").eq("user_id", u.id));
    },

    async getSettings() {
      const rows = await run((c) => c.from("settings").select("key, value"));
      const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      return { applications_open: s.applications_open !== "false" };
    },
    async setSetting(key, value) {
      await run((c) => c.from("settings").upsert({ key, value: String(value) }));
    },

    async myApplication() {
      const u = await me();
      return run((c) => c.from("applications").select("*").eq("user_id", u.id).maybeSingle());
    },
    async saveApplication(changes, id) {
      const fields = pick(changes, APPLICATION_FIELDS);
      if (id) return run((c) => c.from("applications").update(fields).eq("id", id).select().single());
      const u = await me();
      return run((c) => c.from("applications").insert({ user_id: u.id, email: u.email, ...fields }).select().single());
    },
    async submitApplication(id) {
      return run((c) => c.from("applications").update({ status: "submitted" }).eq("id", id).eq("status", "draft").select().single());
    },
    async uploadResume(file, previousPath) {
      const u = await me();
      const path = `${u.id}/${Date.now()}-${safeName(file.name)}`;
      await upload("resumes", path, file);
      if (previousPath) removeFiles("resumes", [previousPath]).catch(() => {});
      return { resume_path: path, resume_name: file.name };
    },
    async listApplications() {
      const rows = await run((c) => c.from("applications").select("*, application_reviews(score)").order("updated_at", { ascending: false }));
      return rows.map(({ application_reviews: reviews = [], ...row }) => ({ ...row, ...summarize(reviews) }));
    },
    async getApplication(id) {
      if (!UUID.test(id)) return null;
      return run((c) => c.from("applications").select("*").eq("id", id).maybeSingle());
    },
    async updateApplication(id, changes) {
      return run((c) => c.from("applications").update(pick(changes, ["status", "message"])).eq("id", id).select().single());
    },
    async listReviews(id) {
      if (!UUID.test(id)) return [];
      return run((c) => c.from("application_reviews").select("*").eq("application_id", id).order("created_at", { ascending: false }));
    },
    async addReview(id, review) {
      return run((c) => c.from("application_reviews").insert({
        application_id: id, score: review.score, recommendation: review.recommendation, note: review.note || "",
      }).select().single());
    },

    // Called by the public forms. A plain request keeps the Supabase library off those pages.
    async createInquiry(data) {
      if (data["bot-field"]) return;
      const res = await fetch(`${base}/rest/v1/inquiries`, {
        method: "POST",
        headers: { ...publicHeaders(), Prefer: "return=minimal" },
        body: JSON.stringify(cleanInquiry(data)),
      });
      if (!res.ok) throw new Error(`The inquiry was not saved (${res.status}).`);
    },
    async listInquiries() {
      return run((c) => c.from("inquiries").select("*").order("created_at", { ascending: false }));
    },
    async updateInquiry(id, changes) {
      return run((c) => c.from("inquiries").update(pick(changes, ["status", "engagement_id"])).eq("id", id).select().single());
    },

    async listEngagements() {
      const u = await me();
      const [rows, links] = await Promise.all([
        run((c) => c.from("engagements").select("*, engagement_people(id, kind, user_id, name, title)").order("created_at", { ascending: false })),
        run((c) => c.from("engagement_people").select("engagement_id, kind").eq("user_id", u.id)),
      ]);
      return rows.map(({ engagement_people: people = [], ...row }) => ({
        ...row, people, my_kind: links.find((l) => l.engagement_id === row.id)?.kind || "",
      }));
    },
    async getEngagement(id) {
      if (!UUID.test(id)) return null;
      return run((c) => c.from("engagements").select("*").eq("id", id).maybeSingle());
    },
    async createEngagement(fields) {
      return run((c) => c.from("engagements").insert(pick(fields, ENGAGEMENT_FIELDS)).select().single());
    },
    async updateEngagement(id, changes) {
      return run((c) => c.from("engagements").update(pick(changes, ENGAGEMENT_FIELDS)).eq("id", id).select().single());
    },
    async deleteEngagement(id) {
      const docs = await run((c) => c.from("documents").select("path").eq("engagement_id", id).not("path", "is", null));
      await removeFiles("engagements", docs.map((d) => d.path));
      await run((c) => c.from("engagements").delete().eq("id", id));
    },
    async listPeople(id) {
      return run((c) => c.from("engagement_people").select("*").eq("engagement_id", id).order("created_at"));
    },
    async addPerson(id, person) {
      const row = { engagement_id: id, ...pick(person, PERSON_FIELDS), email: String(person.email || "").trim().toLowerCase() };
      return run((c) => c.from("engagement_people").insert(row).select().single());
    },
    async removePerson(personId) {
      await run((c) => c.from("engagement_people").delete().eq("id", personId));
    },
    async claimInvite(code) {
      return run((c) => c.rpc("claim_invite", { code: normalizeCode(code) }));
    },

    async listDocuments(id) {
      return run((c) => c.from("documents").select("*").eq("engagement_id", id).order("created_at"));
    },
    async addRequest(id, { title, note }) {
      return run((c) => c.from("documents").insert({ engagement_id: id, kind: "request", title, note: note || "", status: "open" }).select().single());
    },
    async updateDocument(docId, changes) {
      return run((c) => c.from("documents").update(pick(changes, ["status", "title", "note"])).eq("id", docId).select().single());
    },
    async uploadDocument(id, file, { kind = "upload", title = "", request_id = null } = {}) {
      const path = `${id}/${Date.now()}-${safeName(file.name)}`;
      await upload("engagements", path, file);
      try {
        return await run((c) => c.from("documents").insert({
          engagement_id: id, kind, title: title || file.name, request_id, path, file_name: file.name, size: file.size,
        }).select().single());
      } catch (err) {
        removeFiles("engagements", [path]).catch(() => {});
        throw err;
      }
    },
    async deleteDocument(doc) {
      await run((c) => c.from("documents").delete().eq("id", doc.id));
      if (doc.path) await removeFiles("engagements", [doc.path]).catch(() => {});
    },
    async purgeRecords(id) {
      const docs = await run((c) => c.from("documents").select("id, path").eq("engagement_id", id).eq("kind", "upload"));
      await removeFiles("engagements", docs.map((d) => d.path));
      if (docs.length) await run((c) => c.from("documents").delete().in("id", docs.map((d) => d.id)));
      return docs.length;
    },
    async fileUrls(bucket, paths) {
      const list = [...new Set(paths.filter(Boolean))];
      if (!list.length) return {};
      const data = await run((c) => c.storage.from(bucket).createSignedUrls(list, 3600));
      return Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
    },

    async listUpdates(id) {
      return run((c) => c.from("updates").select("*").eq("engagement_id", id).order("created_at", { ascending: false }));
    },
    async postUpdate(id, body) {
      return run((c) => c.from("updates").insert({ engagement_id: id, body }).select().single());
    },
    async deleteUpdate(updateId) {
      await run((c) => c.from("updates").delete().eq("id", updateId));
    },

    async listResources() {
      return run((c) => c.from("resources").select("*").order("created_at", { ascending: false }));
    },
    async addResource({ title, category, description, url, file }) {
      let path = null;
      if (file) path = await upload("library", `${Date.now()}-${safeName(file.name)}`, file);
      try {
        return await run((c) => c.from("resources").insert({
          title, category, description: description || "", url: url || null, path, file_name: file ? file.name : null,
        }).select().single());
      } catch (err) {
        if (path) removeFiles("library", [path]).catch(() => {});
        throw err;
      }
    },
    async deleteResource(row) {
      await run((c) => c.from("resources").delete().eq("id", row.id));
      if (row.path) await removeFiles("library", [row.path]).catch(() => {});
    },

    async listAnnouncements() {
      return run((c) => c.from("announcements").select("*").order("created_at", { ascending: false }));
    },
    async postAnnouncement({ title, body }) {
      return run((c) => c.from("announcements").insert({ title, body }).select().single());
    },
    async deleteAnnouncement(id) {
      await run((c) => c.from("announcements").delete().eq("id", id));
    },

    // ---- recruiting: the public side
    async recruitingPublic() {
      return rpcPublic("recruiting_public");
    },
    async registerForSession(id, { name, email, year }) {
      return rpcPublic("register_for_session", { p_session: id, p_name: name, p_email: email, p_year: year || "" });
    },
    async joinNotifyList({ email, name }) {
      await rpcPublic("join_notify_list", { p_email: email, p_name: name || "" });
    },
    photoUrl(path) {
      return path ? `${base}/storage/v1/object/public/team/${path.split("/").map(encodeURIComponent).join("/")}` : null;
    },

    // ---- recruiting: the portal side
    async recruiterInfo() {
      const id = await myId();
      const [recruiter, card] = await Promise.all([
        run((c) => c.rpc("is_recruiter")),
        run((c) => c.from("team_members").select("*").eq("profile_id", id).maybeSingle()),
      ]);
      return { recruiter: Boolean(recruiter), card: card || null };
    },
    async listCycles() {
      return run((c) => c.from("cycles").select("*").order("opens_at", { ascending: false }));
    },
    async saveCycle(fields, id) {
      const row = tidyRow(pick(fields, CYCLE_FIELDS));
      if (id) return run((c) => c.from("cycles").update(row).eq("id", id).select().single());
      return run((c) => c.from("cycles").insert(row).select().single());
    },
    async deleteCycle(id) {
      await run((c) => c.from("cycles").delete().eq("id", id));
    },
    async listSessions() {
      const [sessions, regs] = await Promise.all([
        run((c) => c.from("info_sessions").select("*").order("starts_at", { ascending: false })),
        run((c) => c.from("session_registrations").select("session_id")),
      ]);
      return sessions.map((s) => ({ ...s, registered: regs.filter((r) => r.session_id === s.id).length }));
    },
    async saveSession(fields, id) {
      const row = tidyRow(pick(fields, SESSION_FIELDS));
      if (id) return run((c) => c.from("info_sessions").update(row).eq("id", id).select().single());
      return run((c) => c.from("info_sessions").insert(row).select().single());
    },
    async deleteSession(id) {
      await run((c) => c.from("info_sessions").delete().eq("id", id));
    },
    async listRegistrations(sessionId) {
      return run((c) => c.from("session_registrations").select("*").eq("session_id", sessionId).order("created_at"));
    },
    async deleteRegistration(id) {
      await run((c) => c.from("session_registrations").delete().eq("id", id));
    },
    async listNotify() {
      return run((c) => c.from("notify_list").select("*").order("created_at", { ascending: false }));
    },
    async deleteNotify(ids) {
      if (ids.length) await run((c) => c.from("notify_list").delete().in("id", ids));
    },
    async listTeam() {
      return run((c) => c.from("team_members").select("*").order("sort_order").order("name"));
    },
    async saveTeamMember(fields, id) {
      const row = tidyRow(pick(fields, TEAM_FIELDS));
      if (id) return run((c) => c.from("team_members").update(row).eq("id", id).select().single());
      return run((c) => c.from("team_members").insert(row).select().single());
    },
    async deleteTeamMember(row) {
      await run((c) => c.from("team_members").delete().eq("id", row.id));
      if (row.photo_path) await removeFiles("team", [row.photo_path]).catch(() => {});
    },
    async uploadTeamPhoto(cardId, file, previousPath) {
      const path = `${cardId}/${Date.now()}-${safeName(file.name)}`;
      await upload("team", path, file);
      if (previousPath) removeFiles("team", [previousPath]).catch(() => {});
      return path;
    },
    async updateMyCard(id, changes) {
      return run((c) => c.from("team_members").update(tidyRow(pick(changes, OWN_CARD_FIELDS))).eq("id", id).select().single());
    },
    // Administrators only (the database enforces it). An account has at most one card, so free
    // its current card first, then link the chosen one. A null card just unlinks the account.
    async linkTeamCard(profileId, cardId) {
      await run((c) => {
        let q = c.from("team_members").update({ profile_id: null }).eq("profile_id", profileId);
        if (cardId) q = q.neq("id", cardId);
        return q;
      });
      if (!cardId) return null;
      return run((c) => c.from("team_members").update({ profile_id: profileId }).eq("id", cardId).select().single());
    },

    async listProfiles() {
      return run((c) => c.from("profiles").select("*").order("created_at", { ascending: false }));
    },
    async setRole(id, role) {
      await run((c) => c.rpc("set_role", { target: id, new_role: role }));
    },
  };
}

// ---------------------------------------------------------------- demo: this browser only

const DEMO_VERSION = 5;
const DEMO_ACCOUNTS = [
  { key: "applicant", label: "Applicant", text: "A student with an application in draft" },
  { key: "member", label: "Member", text: "An analyst on a live engagement" },
  { key: "client", label: "Client", text: "An owner sharing records with the team" },
  { key: "admin", label: "Administrator", text: "Applications, inquiries and engagements" },
];

function createDemo() {
  const KEY = "foreman-portal-demo";
  const blobs = new Map(); // files added during this visit, by path
  let state = read() || seed();
  write();

  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      return saved && saved.version === DEMO_VERSION ? saved : null;
    } catch (_) {
      return null;
    }
  }
  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* private window: keep it in memory */ }
  }

  const pause = (ms = 140) => new Promise((resolve) => setTimeout(resolve, ms));
  const copy = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const now = () => new Date().toISOString();
  const bare = ({ password, demo, ...profile }) => profile;
  const me = () => state.profiles.find((p) => p.id === state.session) || null;
  function need() {
    const p = me();
    if (!p) throw new Error("Your session has ended. Please sign in again.");
    return p;
  }
  const isAdmin = () => need().role === "admin";
  const isMember = () => ["member", "admin"].includes(need().role);
  const myCard = () => state.team.find((m) => m.profile_id === state.session) || null;
  const isRecruiter = () => isAdmin() || (isMember() && Boolean(myCard() && myCard().runs_recruiting));
  const at = () => Date.now();
  const openCycle = () => state.cycles
    .filter((c) => new Date(c.opens_at) <= at() && new Date(c.closes_at) > at())
    .sort((a, b) => String(a.closes_at).localeCompare(String(b.closes_at)))[0] || null;
  const cycleAhead = () => state.cycles.some((c) => new Date(c.closes_at) > at());
  const publicCycle = (c) => (c ? (({ note, created_at, ...rest }) => rest)(c) : null);
  function overlapCheck(row, id) {
    const a = new Date(row.opens_at), b = new Date(row.closes_at);
    if (!(b > a)) throw new Error("A cycle has to close after it opens.");
    const clash = state.cycles.find((c) => c.id !== id && new Date(c.opens_at) < b && new Date(c.closes_at) > a);
    if (clash) throw new Error(`These dates overlap the ${clash.name} cycle. Cycles can't overlap.`);
  }
  const links = () => state.people.filter((x) => x.user_id === state.session);
  const onEngagement = (id) => isAdmin() || links().some((l) => l.engagement_id === id);
  const onTeam = (id) => isAdmin() || links().some((l) => l.engagement_id === id && l.kind === "team");
  const nameOf = (p) => p.full_name || p.email;
  function allow(ok) {
    if (!ok) throw new Error("You don't have permission to do that.");
  }
  function add(table, row) {
    const r = { id: newId(), created_at: now(), ...row };
    state[table].push(r);
    write();
    return copy(r);
  }
  function change(table, id, changes) {
    const r = state[table].find((x) => x.id === id);
    if (!r) throw new Error("That record isn't available any more. Refresh the page and try again.");
    Object.assign(r, changes);
    write();
    return copy(r);
  }
  function drop(table, test) {
    state[table] = state[table].filter((x) => !test(x));
    write();
  }
  async function hash(text) {
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`foreman-demo:${text}`));
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (_) {
      return "";
    }
  }
  function keep(folder, file) {
    const path = `${folder}/${Date.now()}-${safeName(file.name)}`;
    try { blobs.set(path, URL.createObjectURL(file)); } catch (_) { /* no preview for this file */ }
    return path;
  }
  const newest = (a, b) => String(b.created_at).localeCompare(String(a.created_at));
  const oldest = (a, b) => String(a.created_at).localeCompare(String(b.created_at));

  return {
    live: false,
    demo: true,
    demoAccounts: DEMO_ACCOUNTS,
    demoRole: () => me()?.demo || "",
    async demoSignIn(key) {
      const p = state.profiles.find((x) => x.demo === key);
      if (p) { state.session = p.id; write(); }
    },
    async resetDemo() {
      const role = me()?.demo;
      state = seed();
      if (role) state.session = state.profiles.find((p) => p.demo === role)?.id || null;
      blobs.clear();
      write();
    },

    async session() {
      const p = me();
      return p ? { user: { id: p.id, email: p.email }, profile: copy(bare(p)) } : null;
    },
    onAuth() { return () => {}; },
    async signIn(email, password) {
      await pause();
      const p = state.profiles.find((x) => x.email === email.trim().toLowerCase());
      if (p && p.demo) throw new Error("Sample accounts have no password. Use the buttons under Explore the demo.");
      if (!p || !p.password || p.password !== (await hash(password))) throw new Error("That email and password don't match an account.");
      state.session = p.id;
      write();
    },
    async signUp(email, password, fullName) {
      await pause();
      const address = email.trim().toLowerCase();
      if (state.profiles.some((x) => x.email === address)) throw exists();
      const p = add("profiles", { email: address, full_name: fullName.trim(), role: "user", password: await hash(password) });
      state.session = p.id;
      write();
      return { needsConfirm: false };
    },
    async signOut() { state.session = null; write(); },
    async requestReset() { await pause(); },
    async setPassword(password) { const p = need(); change("profiles", p.id, { password: await hash(password) }); },
    async updateName(fullName) { const p = need(); change("profiles", p.id, { full_name: fullName.trim() }); },
    async myLinks() { need(); return copy(links().map((l) => ({ engagement_id: l.engagement_id, kind: l.kind }))); },

    async getSettings() { return { applications_open: state.settings.applications_open !== "false" }; },
    async setSetting(key, value) { allow(isAdmin()); state.settings[key] = String(value); write(); },

    async myApplication() { const p = need(); return copy(state.applications.find((a) => a.user_id === p.id) || null); },
    async saveApplication(changes, id) {
      await pause(80);
      const p = need();
      const fields = pick(changes, APPLICATION_FIELDS);
      const current = state.applications.find((a) => a.user_id === p.id);
      if (!current) {
        if (!cycleAhead()) throw new Error("Applications are closed right now, and the next cycle hasn't been scheduled yet.");
        return add("applications", {
          user_id: p.id, status: "draft", full_name: "", email: p.email, answers: {}, resume_path: null, resume_name: null,
          message: "", submitted_at: null, decided_at: null, cycle_id: null, updated_at: now(), ...fields,
        });
      }
      allow(!id || current.id === id);
      if (current.status !== "draft") throw new Error("This application has already been submitted.");
      return change("applications", current.id, { ...fields, updated_at: now() });
    },
    async submitApplication(id) {
      await pause();
      const p = need();
      const a = state.applications.find((x) => x.id === id && x.user_id === p.id);
      allow(a && a.status === "draft");
      const cycle = a.cycle_id || (openCycle() && openCycle().id);
      if (!cycle) throw new Error("Applications are closed right now. You can submit once the next cycle opens.");
      return change("applications", id, { status: "submitted", cycle_id: cycle, submitted_at: now(), updated_at: now() });
    },
    async uploadResume(file) {
      await pause(400);
      const p = need();
      return { resume_path: keep(p.id, file), resume_name: file.name };
    },
    async listApplications() {
      allow(isAdmin());
      return copy(state.applications.map((a) => ({ ...a, ...summarize(state.reviews.filter((r) => r.application_id === a.id)) }))
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))));
    },
    async getApplication(id) {
      const p = need();
      const a = state.applications.find((x) => x.id === id);
      return a && (isAdmin() || a.user_id === p.id) ? copy(a) : null;
    },
    async updateApplication(id, changes) {
      allow(isAdmin());
      const a = state.applications.find((x) => x.id === id);
      const next = pick(changes, ["status", "message"]);
      const decided = next.status && next.status !== a?.status && ["accepted", "declined"].includes(next.status);
      const row = change("applications", id, { ...next, updated_at: now(), ...(decided ? { decided_at: now() } : {}) });
      if (next.status === "accepted") {
        const person = state.profiles.find((x) => x.id === row.user_id);
        if (person && person.role === "user") change("profiles", person.id, { role: "member" });
      }
      return row;
    },
    async listReviews(id) { allow(isAdmin()); return copy(state.reviews.filter((r) => r.application_id === id).sort(newest)); },
    async addReview(id, review) {
      allow(isAdmin());
      return add("reviews", {
        application_id: id, reviewer_id: need().id, reviewer_name: nameOf(need()),
        score: Number(review.score) || null, recommendation: review.recommendation, note: review.note || "",
      });
    },

    async createInquiry(data) {
      if (data["bot-field"]) return;
      add("inquiries", { ...cleanInquiry(data), status: "new", engagement_id: null });
    },
    async listInquiries() { allow(isAdmin()); return copy([...state.inquiries].sort(newest)); },
    async updateInquiry(id, changes) { allow(isAdmin()); return change("inquiries", id, pick(changes, ["status", "engagement_id"])); },

    async listEngagements() {
      need();
      const mine = links();
      return copy(state.engagements
        .filter((e) => isAdmin() || mine.some((l) => l.engagement_id === e.id))
        .map((e) => ({
          ...e,
          people: state.people.filter((p) => p.engagement_id === e.id),
          my_kind: mine.find((l) => l.engagement_id === e.id)?.kind || "",
        }))
        .sort(newest));
    },
    async getEngagement(id) {
      need();
      const e = state.engagements.find((x) => x.id === id);
      return e && onEngagement(id) ? copy(e) : null;
    },
    async createEngagement(fields) {
      allow(isAdmin());
      return add("engagements", { stage: "intro", summary: "", title: "Engagement", practice: "succession", started_on: null, target_on: null, ...pick(fields, ENGAGEMENT_FIELDS) });
    },
    async updateEngagement(id, changes) { allow(onTeam(id)); return change("engagements", id, pick(changes, ENGAGEMENT_FIELDS)); },
    async deleteEngagement(id) {
      allow(isAdmin());
      drop("engagements", (x) => x.id === id);
      ["people", "documents", "updates"].forEach((t) => drop(t, (x) => x.engagement_id === id));
      state.inquiries.forEach((i) => { if (i.engagement_id === id) i.engagement_id = null; });
      write();
    },
    async listPeople(id) { allow(onEngagement(id)); return copy(state.people.filter((p) => p.engagement_id === id).sort(oldest)); },
    async addPerson(id, person) {
      allow(isAdmin());
      if (person.user_id && state.people.some((p) => p.engagement_id === id && p.user_id === person.user_id)) throw new Error("That person is already on this engagement.");
      return add("people", { engagement_id: id, user_id: null, invite_code: null, title: "", name: "", ...pick(person, PERSON_FIELDS), email: String(person.email || "").trim().toLowerCase() });
    },
    async removePerson(personId) { allow(isAdmin()); drop("people", (p) => p.id === personId); },
    async claimInvite(code) {
      await pause();
      const p = need();
      const wanted = normalizeCode(code);
      const row = wanted && state.people.find((x) => x.invite_code && normalizeCode(x.invite_code) === wanted);
      if (!row || (row.user_id && row.user_id !== p.id)) throw new Error("This invitation code isn't valid, or it has already been used. Check the code, or ask your engagement manager for a new one.");
      if (!row.user_id && !state.people.some((x) => x.engagement_id === row.engagement_id && x.user_id === p.id)) {
        change("people", row.id, { user_id: p.id, name: row.name || nameOf(p) });
      }
      return row.engagement_id;
    },

    async listDocuments(id) { allow(onEngagement(id)); return copy(state.documents.filter((d) => d.engagement_id === id).sort(oldest)); },
    async addRequest(id, { title, note }) {
      allow(onTeam(id));
      return add("documents", { engagement_id: id, kind: "request", title, note: note || "", status: "open", request_id: null, path: null, file_name: null, size: null, created_by: need().id, created_by_name: nameOf(need()) });
    },
    async updateDocument(docId, changes) {
      const d = state.documents.find((x) => x.id === docId);
      allow(d && onTeam(d.engagement_id));
      return change("documents", docId, pick(changes, ["status", "title", "note"]));
    },
    async uploadDocument(id, file, { kind = "upload", title = "", request_id = null } = {}) {
      await pause(450);
      allow(onEngagement(id) && (kind === "upload" || onTeam(id)));
      const row = add("documents", {
        engagement_id: id, kind, title: title || file.name, note: "", status: "open", request_id, path: keep(id, file),
        file_name: file.name, size: file.size, created_by: need().id, created_by_name: nameOf(need()),
      });
      const request = request_id && state.documents.find((x) => x.id === request_id && x.engagement_id === id && x.kind === "request");
      if (request) change("documents", request.id, { status: "received" });
      return row;
    },
    async deleteDocument(doc) {
      const d = state.documents.find((x) => x.id === doc.id);
      allow(d && (onTeam(d.engagement_id) || (d.kind === "upload" && d.created_by === need().id)));
      drop("documents", (x) => x.id === doc.id);
      state.documents.forEach((x) => { if (x.request_id === doc.id) x.request_id = null; });
      write();
    },
    async purgeRecords(id) {
      allow(isAdmin());
      const count = state.documents.filter((d) => d.engagement_id === id && d.kind === "upload").length;
      drop("documents", (d) => d.engagement_id === id && d.kind === "upload");
      return count;
    },
    async fileUrls(bucket, paths) {
      return Object.fromEntries(paths.filter((p) => p && blobs.has(p)).map((p) => [p, blobs.get(p)]));
    },

    async listUpdates(id) { allow(onEngagement(id)); return copy(state.updates.filter((u) => u.engagement_id === id).sort(newest)); },
    async postUpdate(id, body) {
      allow(onTeam(id));
      return add("updates", { engagement_id: id, body, author_id: need().id, author_name: nameOf(need()) });
    },
    async deleteUpdate(updateId) {
      const u = state.updates.find((x) => x.id === updateId);
      allow(u && (isAdmin() || u.author_id === need().id));
      drop("updates", (x) => x.id === updateId);
    },

    async listResources() { allow(isMember()); return copy([...state.resources].sort(newest)); },
    async addResource({ title, category, description, url, file }) {
      allow(isAdmin());
      return add("resources", { title, category, description: description || "", url: url || null, path: file ? keep("library", file) : null, file_name: file ? file.name : null });
    },
    async deleteResource(row) { allow(isAdmin()); drop("resources", (x) => x.id === row.id); },

    async listAnnouncements() { allow(isMember()); return copy([...state.announcements].sort(newest)); },
    async postAnnouncement({ title, body }) { allow(isAdmin()); return add("announcements", { title, body, author_name: nameOf(need()) }); },
    async deleteAnnouncement(id) { allow(isAdmin()); drop("announcements", (x) => x.id === id); },

    // ---- recruiting: the public side, read from this browser's sample records
    async recruitingPublic() {
      await pause(60);
      const t = at();
      const past = state.cycles.filter((c) => new Date(c.closes_at) <= t).sort((a, b) => String(b.closes_at).localeCompare(String(a.closes_at)));
      const next = state.cycles.filter((c) => new Date(c.opens_at) > t).sort((a, b) => String(a.opens_at).localeCompare(String(b.opens_at)));
      const sessions = state.sessions.filter((s) => new Date(s.ends_at) > t).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
        .slice(0, 20)
        .map(({ meeting_url, cycle_id, created_at, ...s }) => ({ ...s, online: Boolean(meeting_url), registered: state.registrations.filter((r) => r.session_id === s.id).length }));
      const team = state.team.filter((m) => m.visible)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        .map((m) => ({
          id: m.id, name: m.name, title: m.title, teams: m.teams, bio: m.bio, class_year: m.class_year, major: m.major,
          photo_path: m.photo_path, linkedin_url: m.linkedin_url, hosts_chats: m.hosts_chats, sort_order: m.sort_order,
          booking_url: m.hosts_chats ? m.booking_url : null, email: m.hosts_chats ? m.email || null : null, chat_topics: m.hosts_chats ? m.chat_topics : "",
        }));
      return copy({ now: new Date(t).toISOString(), cycle: publicCycle(openCycle()), next: publicCycle(next[0]), last: publicCycle(past[0]), sessions, team });
    },
    async registerForSession(id, { name, email, year }) {
      await pause(300);
      const clean = String(email || "").trim().toLowerCase();
      if (!String(name || "").trim()) throw new Error("Please add your name.");
      if (!EMAIL.test(clean)) throw new Error("Please check your email address.");
      const s = state.sessions.find((x) => x.id === id);
      if (!s) throw new Error("This session is no longer on the calendar.");
      if (new Date(s.ends_at) <= at()) throw new Error("This session has already taken place.");
      const already = state.registrations.some((r) => r.session_id === id && r.email === clean);
      if (!already) {
        if (s.capacity && state.registrations.filter((r) => r.session_id === id).length >= s.capacity) throw new Error("This session is full. Please choose another one.");
        add("registrations", { session_id: id, name: String(name).trim().slice(0, 200), email: clean, year: String(year || "").slice(0, 40) });
      }
      const { cycle_id, created_at, capacity, ...out } = s;
      return copy({ ...out, already });
    },
    async joinNotifyList({ email, name }) {
      await pause(300);
      const clean = String(email || "").trim().toLowerCase();
      if (!EMAIL.test(clean)) throw new Error("Please check your email address.");
      const row = state.notify.find((n) => n.email === clean);
      if (row) { if (String(name || "").trim()) change("notify", row.id, { name: String(name).trim() }); return; }
      add("notify", { email: clean, name: String(name || "").trim().slice(0, 200) });
    },
    photoUrl(path) {
      return path ? blobs.get(path) || null : null;
    },

    // ---- recruiting: the portal side
    async recruiterInfo() {
      need();
      return { recruiter: isRecruiter(), card: copy(myCard()) };
    },
    async listCycles() { allow(isRecruiter()); return copy([...state.cycles].sort((a, b) => String(b.opens_at).localeCompare(String(a.opens_at)))); },
    async saveCycle(fields, id) {
      allow(isAdmin());
      const row = tidyRow(pick(fields, CYCLE_FIELDS));
      overlapCheck({ ...(id ? state.cycles.find((c) => c.id === id) : {}), ...row }, id);
      return id ? change("cycles", id, row) : add("cycles", { note: "", decisions_by: null, ...row });
    },
    async deleteCycle(id) {
      allow(isAdmin());
      drop("cycles", (c) => c.id === id);
      state.applications.forEach((a) => { if (a.cycle_id === id) a.cycle_id = null; });
      state.sessions.forEach((s) => { if (s.cycle_id === id) s.cycle_id = null; });
      write();
    },
    async listSessions() {
      allow(isRecruiter());
      return copy(state.sessions.map((s) => ({ ...s, registered: state.registrations.filter((r) => r.session_id === s.id).length }))
        .sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at))));
    },
    async saveSession(fields, id) {
      allow(isRecruiter());
      const row = tidyRow(pick(fields, SESSION_FIELDS));
      const merged = { ...(id ? state.sessions.find((s) => s.id === id) : {}), ...row };
      if (!(new Date(merged.ends_at) > new Date(merged.starts_at))) throw new Error("A session has to end after it starts.");
      return id ? change("sessions", id, row) : add("sessions", { location: "", meeting_url: null, capacity: null, details: "", cycle_id: null, ...row });
    },
    async deleteSession(id) {
      allow(isRecruiter());
      drop("sessions", (s) => s.id === id);
      drop("registrations", (r) => r.session_id === id);
    },
    async listRegistrations(sessionId) { allow(isRecruiter()); return copy(state.registrations.filter((r) => r.session_id === sessionId).sort(oldest)); },
    async deleteRegistration(id) { allow(isRecruiter()); drop("registrations", (r) => r.id === id); },
    async listNotify() { allow(isRecruiter()); return copy([...state.notify].sort(newest)); },
    async deleteNotify(ids) { allow(isRecruiter()); drop("notify", (n) => ids.includes(n.id)); },
    async listTeam() {
      allow(isRecruiter());
      return copy([...state.team].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
    },
    async saveTeamMember(fields, id) {
      allow(isAdmin());
      const row = tidyRow(pick(fields, TEAM_FIELDS));
      if (row.profile_id && state.team.some((m) => m.profile_id === row.profile_id && m.id !== id)) throw new Error("That account is already linked to another card.");
      const base = { title: "", teams: [], bio: "", class_year: "", major: "", photo_path: null, linkedin_url: null, email: "", booking_url: null,
        chat_topics: "", hosts_chats: false, runs_recruiting: false, profile_id: null, visible: true, sort_order: 100 };
      return id ? change("team", id, { ...row, updated_at: now() }) : add("team", { ...base, ...row, updated_at: now() });
    },
    async deleteTeamMember(row) { allow(isAdmin()); drop("team", (m) => m.id === row.id); },
    async uploadTeamPhoto(cardId, file) {
      await pause(400);
      const card = state.team.find((m) => m.id === cardId);
      allow(card && (isAdmin() || card.profile_id === state.session));
      return keep(cardId, file);
    },
    async updateMyCard(id, changes) {
      const card = state.team.find((m) => m.id === id);
      allow(card && (isAdmin() || card.profile_id === state.session));
      return change("team", id, { ...tidyRow(pick(changes, OWN_CARD_FIELDS)), updated_at: now() });
    },
    async linkTeamCard(profileId, cardId) {
      allow(isAdmin());
      state.team.forEach((m) => { if (m.profile_id === profileId && m.id !== cardId) m.profile_id = null; });
      if (!cardId) { write(); return null; }
      return change("team", cardId, { profile_id: profileId, updated_at: now() });
    },

    async listProfiles() { allow(isAdmin()); return copy(state.profiles.map(bare).sort(newest)); },
    async setRole(id, role) {
      allow(isAdmin());
      if (id === need().id && role !== "admin") throw new Error("You can't remove your own administrator access.");
      change("profiles", id, { role });
    },
  };
}

// Sample records for demo mode. Every company and person here is invented.
function seed() {
  const now = Date.now();
  const at = (days, hours = 0) => new Date(now - days * 864e5 - hours * 36e5).toISOString();
  const day = (offset) => {
    const d = new Date(now + offset * 864e5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const person = (id, full_name, email, role, days, demo) => ({ id, full_name, email, role, created_at: at(days), ...(demo ? { demo } : {}) });

  const profiles = [
    person("demo-applicant", "Jordan Ellis", "jordan.ellis@example.edu", "user", 3, "applicant"),
    person("demo-member", "Priya Raman", "priya.raman@example.edu", "member", 160, "member"),
    person("demo-client", "Walt Brandt", "walt@kestrelmechanical.example", "user", 27, "client"),
    person("demo-admin", "Avery Chen", "avery.chen@example.edu", "admin", 420, "admin"),
    person("demo-marcus", "Marcus Webb", "marcus.webb@example.edu", "member", 240),
    person("demo-elena", "Elena Sorensen", "elena.sorensen@example.edu", "member", 95),
    person("demo-sam", "Sam Okafor", "sam.okafor@example.edu", "user", 6),
    person("demo-lily", "Lily Zhang", "lily.zhang@example.edu", "user", 14),
    person("demo-noah", "Noah Brennan", "noah.brennan@example.edu", "user", 22),
  ];

  const application = (id, user, status, answers, days, extra = {}) => {
    const p = profiles.find((x) => x.id === user);
    return {
      id, user_id: user, status, full_name: p.full_name, email: p.email, answers,
      resume_path: status === "draft" ? null : `${user}/resume.pdf`, resume_name: status === "draft" ? null : `${p.full_name.replace(" ", "-")}-Resume.pdf`,
      message: "", submitted_at: status === "draft" ? null : at(days), decided_at: null,
      cycle_id: status === "draft" ? null : "demo-cyc-winter",
      created_at: at(days + 2), updated_at: at(Math.max(0, days - 1)), ...extra,
    };
  };
  // Chicago days and times, relative to today, for the sample recruiting calendar.
  const chicago = (offset, clock) => zonedISO(day(offset), clock);
  // Sample cycles are named for the academic quarter they fall in: Autumn, Winter, Spring.
  const quarter = (shift) => {
    const d = new Date(now);
    let q = d.getMonth() <= 2 ? 0 : d.getMonth() <= 5 ? 1 : 2;
    let y = d.getFullYear();
    q += shift;
    while (q < 0) { q += 3; y -= 1; }
    while (q > 2) { q -= 3; y += 1; }
    return `${["Winter", "Spring", "Autumn"][q]} ${y}`;
  };
  const cycles = [
    { id: "demo-cyc-past", name: quarter(-1), opens_at: chicago(-205, "09:00"), closes_at: chicago(-184, "23:59"), decisions_by: day(-170), note: "", created_at: at(220) },
    { id: "demo-cyc-winter", name: quarter(0), opens_at: chicago(-18, "09:00"), closes_at: chicago(9, "23:59"), decisions_by: day(23), note: "Posters up in Harper, Reg and the Booth atrium.", created_at: at(30) },
    { id: "demo-cyc-next", name: quarter(1), opens_at: chicago(70, "09:00"), closes_at: chicago(84, "23:59"), decisions_by: day(98), note: "", created_at: at(5) },
  ];

  const applications = [
    application("demo-app-jordan", "demo-applicant", "draft", {
      year: "Second-year", major: "Economics", graduation: "June 2029",
      q1: "My family runs a small printing shop in Pilsen, and I have watched my parents make every decision about pricing and staffing on instinct. I want to learn how to look at a company like theirs properly, and to be useful to owners who rarely get outside help.",
      q2: "", q3: "",
    }, 0),
    application("demo-app-sam", "demo-sam", "submitted", {
      year: "Second-year", major: "Economics and Statistics", graduation: "June 2029", heard: "Activities fair",
      q1: "I want to work on real companies with real constraints. Foreman's engagements are the closest thing on campus to that, and the training would give me a foundation I can't get from coursework alone.",
      q2: "My uncle owns a landscaping company with eleven employees. It earns most of its money from recurring commercial maintenance contracts, with snow removal smoothing out the winter. As a buyer I would worry that three customers make up half of revenue, and that the crew leads know the routes but nothing is written down.",
      q3: "In a statistics project our model kept overfitting. I suggested we hold out a full season of data instead of random rows, rebuilt the validation, and wrote up why the original results were misleading.",
    }, 2),
    application("demo-app-lily", "demo-lily", "interview_1", {
      year: "First-year", major: "Computer Science (intended)", graduation: "June 2030", heard: "A friend or member",
      q1: "I like understanding how things actually work, and a business is a system with people in it. I want to learn accounting and valuation from people who use them, and to help owners who have spent decades building something.",
      q2: "A neighborhood bakery near my high school sells most of its bread wholesale to cafes, which keeps the ovens busy before the shop opens. I would worry about the owner doing all the baking and all the ordering, and about rent on a lease that ends soon.",
      q3: "I led a robotics team through a rebuild after our drive system failed two weeks before a competition. I split the work into pieces each person could own and kept a shared list of what was blocked.",
    }, 9, { message: "Thank you for applying. We would like to invite you to a first interview. We will email you to arrange a time." }),
    application("demo-app-noah", "demo-noah", "interview_2", {
      year: "Third-year", major: "Public Policy", graduation: "June 2028", heard: "LinkedIn", linkedin: "https://www.linkedin.com/in/example",
      q1: "I have studied small business lending in my policy courses, but only from the outside. I want to see how an owner, a buyer and a lender actually meet, and to help an owner prepare for that conversation.",
      q2: "A family-owned hardware store sells to contractors on account, which brings loyal customers and slow payments. As a buyer I would want to see receivables aging and how much of the margin depends on a few contractor accounts.",
      q3: "As a teaching assistant I noticed half the section was lost on one problem set. I organized an extra session, rewrote the worked example and asked students to explain it back to each other.",
    }, 16),
  ];

  const reviews = [
    { id: "demo-rev-1", application_id: "demo-app-lily", reviewer_id: "demo-admin", reviewer_name: "Avery Chen", score: 4, recommendation: "advance", note: "Clear, specific writing. The bakery answer shows good instincts about owner dependence.", created_at: at(7) },
    { id: "demo-rev-2", application_id: "demo-app-noah", reviewer_id: "demo-admin", reviewer_name: "Avery Chen", score: 5, recommendation: "advance", note: "Strong first interview. Asked thoughtful questions about lender requirements.", created_at: at(9) },
    { id: "demo-rev-3", application_id: "demo-app-noah", reviewer_id: "demo-marcus", reviewer_name: "Marcus Webb", score: 4, recommendation: "advance", note: "Good structure. Should practice working with numbers out loud in the case.", created_at: at(8) },
  ];

  const engagements = [
    {
      id: "demo-eng-kestrel", company: "Kestrel Mechanical", title: "Readiness review", practice: "succession", stage: "records",
      summary: "Sample engagement. A heating, cooling and plumbing contractor on the North Side, run by its founder for 31 years. The owner is weighing a sale against a handover to two senior managers within three years.",
      started_on: day(-24), target_on: day(32), created_at: at(26),
    },
    {
      id: "demo-eng-calder", company: "Calder Industrial Supply", title: "Margin and working capital review", practice: "operations", stage: "analysis",
      summary: "Sample engagement. An industrial supply distributor with two branches. Margins have narrowed as freight costs rose, and the owner wants to know which customers and product lines still earn their keep.",
      started_on: day(-41), target_on: day(15), created_at: at(43),
    },
  ];

  const people = [
    { id: "demo-pp-1", engagement_id: "demo-eng-kestrel", user_id: "demo-client", kind: "client", name: "Walt Brandt", email: "walt@kestrelmechanical.example", title: "Owner", invite_code: "KSTRL-7QXM4", created_at: at(25) },
    { id: "demo-pp-2", engagement_id: "demo-eng-kestrel", user_id: null, kind: "client", name: "Denise Brandt", email: "denise@kestrelmechanical.example", title: "Office manager", invite_code: "DNSBR-4RTPN", created_at: at(20) },
    { id: "demo-pp-3", engagement_id: "demo-eng-kestrel", user_id: "demo-admin", kind: "team", name: "Avery Chen", email: "avery.chen@example.edu", title: "Engagement manager", invite_code: null, created_at: at(25) },
    { id: "demo-pp-4", engagement_id: "demo-eng-kestrel", user_id: "demo-member", kind: "team", name: "Priya Raman", email: "priya.raman@example.edu", title: "Analyst", invite_code: null, created_at: at(25) },
    { id: "demo-pp-5", engagement_id: "demo-eng-kestrel", user_id: "demo-marcus", kind: "team", name: "Marcus Webb", email: "marcus.webb@example.edu", title: "Analyst", invite_code: null, created_at: at(25) },
    { id: "demo-pp-6", engagement_id: "demo-eng-calder", user_id: null, kind: "client", name: "Rosa Calder", email: "rosa@calderindustrial.example", title: "Owner", invite_code: "CLDRS-8HJW2", created_at: at(42) },
    { id: "demo-pp-7", engagement_id: "demo-eng-calder", user_id: "demo-marcus", kind: "team", name: "Marcus Webb", email: "marcus.webb@example.edu", title: "Engagement manager", invite_code: null, created_at: at(42) },
    { id: "demo-pp-8", engagement_id: "demo-eng-calder", user_id: "demo-elena", kind: "team", name: "Elena Sorensen", email: "elena.sorensen@example.edu", title: "Analyst", invite_code: null, created_at: at(42) },
  ];

  const doc = (id, engagement_id, kind, title, extra = {}) => ({
    id, engagement_id, kind, title, note: "", status: "open", request_id: null, path: null, file_name: null, size: null,
    created_by: "demo-admin", created_by_name: "Avery Chen", created_at: at(20), ...extra,
  });
  const documents = [
    doc("demo-doc-1", "demo-eng-kestrel", "deliverable", "Signed scope letter", { path: "demo-eng-kestrel/scope.pdf", file_name: "Foreman-Kestrel-Scope-Letter.pdf", size: 184320, created_at: at(19) }),
    doc("demo-doc-2", "demo-eng-kestrel", "request", "Business tax returns, last three years", { note: "Form 1120-S with all schedules.", status: "received", created_at: at(18, 3) }),
    doc("demo-doc-3", "demo-eng-kestrel", "request", "Year-to-date profit and loss statement", { note: "From your accounting system, through the latest month end.", status: "received", created_at: at(18, 2) }),
    doc("demo-doc-4", "demo-eng-kestrel", "request", "Payroll summary", { note: "Annual totals by role. Names can be removed.", created_at: at(18, 1) }),
    doc("demo-doc-5", "demo-eng-kestrel", "request", "Lease or property details", { note: "The current lease, or the property tax bill if you own the building.", created_at: at(18) }),
    doc("demo-doc-6", "demo-eng-kestrel", "upload", "Business tax returns, last three years", { request_id: "demo-doc-2", path: "demo-eng-kestrel/returns.pdf", file_name: "Kestrel-1120S-2023-2025.pdf", size: 2411724, created_by: "demo-client", created_by_name: "Walt Brandt", created_at: at(12) }),
    doc("demo-doc-7", "demo-eng-kestrel", "upload", "Year-to-date profit and loss statement", { request_id: "demo-doc-3", path: "demo-eng-kestrel/pl.xlsx", file_name: "Kestrel-PL-YTD.xlsx", size: 48230, created_by: "demo-client", created_by_name: "Walt Brandt", created_at: at(11) }),
    doc("demo-doc-8", "demo-eng-calder", "request", "Sales by customer, last twelve months", { status: "received", created_by: "demo-marcus", created_by_name: "Marcus Webb", created_at: at(36) }),
    doc("demo-doc-9", "demo-eng-calder", "request", "Accounts receivable aging", { status: "received", created_by: "demo-marcus", created_by_name: "Marcus Webb", created_at: at(36) }),
    doc("demo-doc-10", "demo-eng-calder", "deliverable", "Interim findings memo", { path: "demo-eng-calder/interim.pdf", file_name: "Foreman-Calder-Interim-Findings.pdf", size: 402113, created_by: "demo-marcus", created_by_name: "Marcus Webb", created_at: at(4) }),
  ];

  const updates = [
    { id: "demo-up-1", engagement_id: "demo-eng-kestrel", body: "Week three. Thank you for the tax returns and the year-to-date statement. We have restated earnings for 2023 to 2025 and have a few questions about vehicle expenses and the 2024 equipment purchase, which we will bring to Thursday's interview.\n\nStill outstanding: the payroll summary and the lease.", author_id: "demo-member", author_name: "Priya Raman", created_at: at(2, 4) },
    { id: "demo-up-2", engagement_id: "demo-eng-kestrel", body: "Week two. The signed scope letter is in your deliverables, and the records checklist is above. Our first interview with you is booked for next Thursday at 10 am at your office.", author_id: "demo-admin", author_name: "Avery Chen", created_at: at(9, 2) },
    { id: "demo-up-3", engagement_id: "demo-eng-calder", body: "Week five. The interim findings memo is in your deliverables. The short version: freight is not charged back on small orders, and two of the ten largest accounts lose money after delivery costs. We will walk through the detail on Tuesday.", author_id: "demo-marcus", author_name: "Marcus Webb", created_at: at(4) },
  ];

  const resource = (id, category, title, description, days) => ({ id, category, title, description, url: null, path: null, file_name: null, created_at: at(days) });
  const resources = [
    resource("demo-res-1", "Training", "Reading a business tax return", "Form 1120-S and Schedule C, line by line, using an invented contractor.", 60),
    resource("demo-res-2", "Training", "Normalizing earnings", "Owner pay, one-time items and personal expenses, with worked examples and the evidence each adjustment needs.", 45),
    resource("demo-res-3", "Templates", "Engagement scope letter", "The standard scope, timeline and confidentiality terms we agree with every owner.", 120),
    resource("demo-res-4", "Templates", "Final presentation outline", "The structure for the closing presentation and the written report.", 90),
    resource("demo-res-5", "Guides", "SBA 7(a) lending basics", "What a lender tests: debt service coverage, the buyer's equity and the independent business valuation.", 30),
    resource("demo-res-6", "Guides", "Interviewing an owner", "Questions for the first conversation, and how to listen for what matters to the owner.", 75),
    resource("demo-res-7", "Cases", "Practice case: a family bakery", "A complete practice engagement with records, questions and a model answer.", 15),
  ];

  const announcements = [
    { id: "demo-ann-1", title: "Training this Thursday: normalizing earnings", body: "6 pm, in the usual room. We will work through the sample tax return in the library, so please read it first.", author_name: "Avery Chen", created_at: at(1, 5) },
    { id: "demo-ann-2", title: "Two engagements under way", body: "Scopes are signed with a mechanical contractor and an industrial distributor. Team assignments are in your portal.", author_name: "Avery Chen", created_at: at(8) },
  ];

  const inquiries = [
    { id: "demo-inq-1", kind: "consultation", name: "Tom Reilly", email: "tom@reillyelectric.example", company: "Reilly Electric", phone: "", sector: "Specialty trades", employees: "10 to 24", interest: "Succession advisory", role: "Owner", message: "I'm 63 and my two foremen have asked about buying the business. I'd like to understand what it's worth and whether they could get a loan.", status: "new", engagement_id: null, created_at: at(1, 3) },
    { id: "demo-inq-2", kind: "general", name: "Michael Grant", email: "mgrant@granthale.example", company: "", phone: "", sector: "", employees: "", interest: "", role: "Advisor", message: "One of my clients, a commercial landscaping company, is starting to think about succession. Could I introduce you?", status: "new", engagement_id: null, created_at: at(3) },
    { id: "demo-inq-3", kind: "consultation", name: "Grace Liu", email: "grace@liufamilyfoods.example", company: "Liu Family Foods", phone: "", sector: "Distribution", employees: "25 to 49", interest: "Operations improvement", role: "Owner", message: "We distribute to about 300 restaurants. Sales are up but cash is always tight, and I can't tell which accounts are worth it.", status: "contacted", engagement_id: null, created_at: at(6) },
  ];

  const sessions = [
    { id: "demo-ses-past", title: "Information session", starts_at: chicago(-12, "18:00"), ends_at: chicago(-12, "19:00"), location: "Harper Memorial Library, Room 130", meeting_url: null, capacity: 60, details: "", cycle_id: "demo-cyc-winter", created_at: at(25) },
    { id: "demo-ses-1", title: "Information session", starts_at: chicago(2, "18:00"), ends_at: chicago(2, "19:00"), location: "Harper Memorial Library, Room 130", meeting_url: null, capacity: 60,
      details: "How engagements work, what training covers and how to apply. Pizza after.", cycle_id: "demo-cyc-winter", created_at: at(20) },
    { id: "demo-ses-2", title: "Online information session", starts_at: chicago(5, "12:30"), ends_at: chicago(5, "13:15"), location: "", meeting_url: "https://zoom.us/j/0000000000", capacity: null,
      details: "A shorter session over lunch, with time for questions. The link arrives when you register.", cycle_id: "demo-cyc-winter", created_at: at(20) },
    { id: "demo-ses-3", title: "Case practice for applicants", starts_at: chicago(11, "17:30"), ends_at: chicago(11, "19:00"), location: "Saieh Hall, Room 021", meeting_url: null, capacity: 30,
      details: "Work through a short case on a small distributor with current members. For students invited to interview.", cycle_id: "demo-cyc-winter", created_at: at(18) },
  ];
  const registration = (id, session_id, name, email, year, days) => ({ id, session_id, name, email, year, created_at: at(days) });
  const registrations = [
    registration("demo-reg-1", "demo-ses-past", "Ava Lindqvist", "ava.lindqvist@example.edu", "First-year", 14),
    registration("demo-reg-2", "demo-ses-past", "Mateo Rossi", "mateo.rossi@example.edu", "Second-year", 13),
    registration("demo-reg-3", "demo-ses-1", "Isaac Mensah", "isaac.mensah@example.edu", "First-year", 3),
    registration("demo-reg-4", "demo-ses-1", "Chloe Park", "chloe.park@example.edu", "Second-year", 2),
    registration("demo-reg-5", "demo-ses-1", "Ruth Adler", "ruth.adler@example.edu", "Third-year", 1),
    registration("demo-reg-6", "demo-ses-2", "Omar Haddad", "omar.haddad@example.edu", "First-year", 1),
  ];
  const notify = [
    { id: "demo-ntf-1", email: "nina.brooks@example.edu", name: "Nina Brooks", created_at: at(40) },
    { id: "demo-ntf-2", email: "theo.grant@example.edu", name: "Theo Grant", created_at: at(33) },
    { id: "demo-ntf-3", email: "maya.cohen@example.edu", name: "", created_at: at(27) },
  ];
  const member = (id, name, title, teams, sort_order, extra = {}) => ({
    id, name, title, teams, sort_order, bio: "", class_year: "", major: "", photo_path: null, linkedin_url: null, email: "", booking_url: null,
    chat_topics: "", hosts_chats: false, runs_recruiting: false, profile_id: null, visible: true, created_at: at(200), updated_at: at(10), ...extra,
  });
  const team = [
    member("demo-tm-avery", "Avery Chen", "President", ["Leadership"], 1, {
      class_year: "Class of 2027", major: "Economics", profile_id: "demo-admin", runs_recruiting: true, linkedin_url: "https://www.linkedin.com/in/example",
      bio: "Avery leads Foreman's training program and reviews every engagement before it reaches an owner. Before Foreman, Avery spent a summer in the finance office of a family-owned manufacturer.",
    }),
    member("demo-tm-marcus", "Marcus Webb", "Vice President, Engagements", ["Leadership", "Engagement managers"], 2, {
      class_year: "Class of 2027", major: "Statistics", profile_id: "demo-marcus",
      bio: "Marcus staffs each engagement and manages the Calder Industrial Supply review. He is most interested in how small distributors price their work.",
    }),
    member("demo-tm-priya", "Priya Raman", "Director of Recruiting", ["Marketing"], 3, {
      class_year: "Class of 2028", major: "Economics", profile_id: "demo-member", hosts_chats: true, runs_recruiting: true,
      email: "priya.raman@example.edu", booking_url: "https://calendly.com/example-foreman/coffee-chat", chat_topics: "Training, first engagements and the application",
      bio: "Priya runs info sessions and coffee chats, and is an analyst on the Kestrel Mechanical engagement.",
    }),
    member("demo-tm-elena", "Elena Sorensen", "Engagement manager", ["Engagement managers"], 4, {
      class_year: "Class of 2028", major: "Public Policy",
      bio: "Elena works on operations engagements, with a focus on working capital and the cash cycle.",
    }),
    member("demo-tm-daniel", "Daniel Okoro", "Marketing associate", ["Marketing"], 5, {
      class_year: "Class of 2029", major: "Economics", hosts_chats: true, email: "daniel.okoro@example.edu", chat_topics: "Joining as a first-year",
      bio: "Daniel joined Foreman in his first quarter and helps run recruiting events on campus.",
    }),
    member("demo-tm-hannah", "Hannah Brooks", "Analyst", ["Analysts", "Marketing"], 6, {
      class_year: "Class of 2028", major: "Mathematics", hosts_chats: true, booking_url: "https://cal.com/example-foreman/chat", chat_topics: "Case interviews and the analyst role",
      bio: "Hannah builds the earnings and financing models on succession engagements.",
    }),
    member("demo-tm-sofia", "Sofia Martinez", "Analyst", ["Analysts"], 7, { class_year: "Class of 2029", major: "Data Science" }),
    member("demo-tm-jonah", "Jonah Feld", "Analyst", ["Analysts"], 8, { class_year: "Class of 2028", major: "History" }),
    member("demo-tm-alumni", "Former member", "Alumni adviser", ["Advisers"], 50, { visible: false }),
  ];

  return {
    version: DEMO_VERSION,
    session: null,
    settings: { applications_open: "true" },
    profiles, applications, reviews, inquiries, engagements, people, documents, updates, resources, announcements,
    cycles, sessions, registrations, notify, team,
  };
}

// Created last, once every constant above is defined.
export const db = LIVE ? createLive() : createDemo();
