# Foreman website and portal

The site for foreman-capital.com, with a portal for clients, members and applicants. Plain HTML, CSS and JavaScript with no build step, hosted on Netlify. The portal stores its data in Supabase.

This is the interactive edition of the design. The wording, the forms and the portal are the same as the earlier edition; the public pages add an exploded drawing of the Foreman mark, working diagrams and a live earnings exhibit.

## What is here

| Path | What it is |
| --- | --- |
| `index.html` | Home |
| `services.html` | Succession advisory and operations improvement |
| `owners.html` | How engagements work, the client portal, questions, and the consultation request form |
| `students.html` | Recruiting: the live application status, the recruiting calendar, info sessions, coffee chats, the application process and the notify form |
| `team.html` | The team page, drawn from the cards in the portal |
| `about.html`, `contact.html`, `disclosures.html` | About, contact form, legal and privacy |
| `thanks.html`, `404.html` | Shown after a form without JavaScript, and for missing pages |
| `portal/` | The portal: sign-in, applications, client engagements, the member library, administration |
| `config.js` | Your Supabase project address and public key. Empty means demo mode. |
| `supabase/schema.sql` | The portal's database: tables, access rules and file storage. Run once in Supabase. |
| `assets/` | Styles, scripts, fonts (Geist, Geist Mono and EB Garamond, SIL Open Font License), logo and images |
| `netlify.toml` | Security headers, caching, and redirects from the old Framer addresses |

## 1. Put the site online

1. Put this folder in a GitHub repository (or open https://app.netlify.com/drop and drag the folder in).
2. In Netlify choose **Add new site → Import an existing project** and pick the repository. Leave the build command empty. Every change you commit then redeploys the site.
3. Open **Forms** in the site's Netlify dashboard, choose **Enable form detection**, and deploy once more. Two forms appear: `consultation` and `contact`.
4. Under **Forms → Form notifications**, add an email notification so each request reaches your inbox.

Until step 2 below is done, the portal runs in **demo mode**: sample records kept only in the visitor's browser, with buttons to view it as an applicant, member, client or administrator. Nothing is saved anywhere.

## 2. Connect the portal to Supabase

Supabase's free plan is enough to start.

1. Create a project at https://supabase.com (choose a US region near Chicago, such as East US). Save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, and choose **Run**. Notices that something "does not exist, skipping" are normal.
3. Open **Authentication → Sign In / Providers → Email**. Keep Email enabled and turn **Confirm email** off for now (see step 7 for why).
4. Open **Authentication → URL Configuration**. Set **Site URL** to `https://foreman-capital.com` and add `https://foreman-capital.com/portal/` under **Redirect URLs**. Add your `*.netlify.app` address the same way if you use it.
5. Open **Project Settings → API Keys** (or **Data API**). Copy the **Project URL** and the **anon public** key (or the **publishable** key) into `config.js`:
   ```js
   export const SUPABASE_URL = "https://your-project.supabase.co";
   export const SUPABASE_ANON_KEY = "your-public-key";
   ```
   These two values are meant to be public. Never put the `service_role` or **secret** key in this file.
6. Commit `config.js` and let Netlify redeploy. Open `/portal/`, choose **Create an account**, and sign up with your own email. Then, back in the SQL Editor, make yourself an administrator:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
   Refresh the portal and the administration pages appear. You can grant other people access from **People**.
7. **Before inviting clients, set up email.** Supabase's built-in email only reaches members of your Supabase team, at two messages an hour, so password-reset emails won't reach anyone else. In **Authentication**, open **SMTP Settings** (under **Emails**) and connect a sending service such as Resend (free for low volume): verify foreman-capital.com with them, then enter their SMTP host, port, user and password. Once that works you can turn **Confirm email** back on, so every new account proves its address.

With **Confirm email** off, anyone can create an account, but a new account can only start an application. Clients reach their engagement only through the invitation code you send them, and member access comes only from an accepted application or an administrator.

Supabase pauses free projects after a week without any activity. Opening the portal now and then keeps it awake, or you can restore a paused project from the Supabase dashboard.

## 3. How the portal works

**Applicants** create an account, write the application (three short answers and a resume), save drafts and submit. They can follow their status: under review, first interview, case interview, decision. Administrators review, score, leave notes for the applicant, and decide. Accepting an application gives the student member access automatically. Applications are accepted only while a recruiting cycle is open (see section 4).

**Clients** never sign up blindly. Start an engagement from an inquiry (or with **New engagement**) and the portal creates an invitation link for the client. Send it to them by email. When they create an account from that link, their engagement opens: they upload the records you request, read your weekly updates and download deliverables. Each request is marked received when a file arrives.

**Members** see the engagements they are on, the library and announcements. On their engagements they can request records, post updates, upload deliverables and move the stage forward.

**Administrators** see everything: inquiries from the website, applications and reviews, all engagements, people and access, the library and announcements. When an engagement ends, use **Delete client records** on its page to remove the files the client shared, as the site promises.

All of these rules are enforced by the database itself (row-level security in `supabase/schema.sql`), not just by the pages. Files sit in private storage and open only through links that expire after an hour.

## 4. Recruiting and the team page

Everything here is managed in the portal and appears on the website straight away.

**Recruiting cycles** (Portal → Recruiting → Cycles, administrators). Admissions are not rolling: schedule each cycle with a name, such as *Winter 2027*, and the dates and times applications open and close (Chicago time), plus an optional "decisions by" date.
- Students can start a draft once a cycle is scheduled, and can submit only while it is open. The database enforces this, so the deadline holds even if someone keeps the page open.
- Each submission is filed under its cycle. The Applications page shows one cycle at a time, and **Download CSV** exports the list you're looking at.
- An application you return to the student for edits can be sent back after the deadline.
- Cycles can't overlap. Until the first cycle is scheduled, applications are closed.
- The Students page shows where things stand: "Winter 2027 applications are open" with a countdown to the deadline, or a countdown to the opening date, and a recruiting calendar of the key dates. While a cycle is open, a small card on the other pages of the site points visitors to it. It appears once per visit and stays away once closed.

**Info sessions** (Portal → Recruiting → Info sessions). Add a title, date, times, place, an optional meeting link and an optional number of seats.
- Visitors register on the Students page and get **Add to Google Calendar** and an .ics file for Apple Calendar and Outlook.
- The meeting link is shown only to people who register. A full session says so.
- Open **Sign-ups** to see who is coming, copy their emails or download a CSV.

**Notify list** (Portal → Recruiting → Notify list). While applications are closed, the Students page asks visitors for their email. When a cycle opens, copy the addresses into the BCC line of one email, then clear the list.

**The team page** (Portal → Team page, administrators). Add each person with a title, teams (Leadership, Engagement managers, Analysts, Marketing, or your own), class year, major, a short bio, LinkedIn and a photo (JPEG, PNG or WebP, up to 5 MB, ideally 4:5). **Order on the page** sets who comes first. Photos sit in a public storage bucket, since the team page is public.
- **Link a card to the person's portal account**, and they get a **Your team profile** page where they can update their own photo, bio and coffee chat details. Name, title, teams and order stay with administrators.
- **Helps run recruiting** lets a member with a linked card manage info sessions, see sign-ups and use the notify list. Cycles and decisions stay with administrators.

**Coffee chats.** Anyone whose card says **Takes coffee chats** is listed on the Students page. Each person adds a booking link. Calendly, Cal.com and Google Calendar's appointment schedules all have free plans and handle confirmations, reminders and rescheduling. Anyone without a link gets an **Email to schedule** button instead. The Marketing team is the natural home for this, but anyone can host.

**For posters,** `foreman-capital.com/apply` goes to the Students page. A QR code pointing there always shows the current status.

## 5. Move foreman-capital.com from Framer

1. In Netlify, open **Domain management → Add a domain** and enter `foreman-capital.com`.
2. Netlify shows the DNS records to set. Change them wherever the domain's DNS is managed, replacing the records that point to Framer.
3. Netlify issues the HTTPS certificate automatically once the records take effect. Unpublish the Framer site afterwards.

The old Framer addresses `/for-business-owners`, `/team`, `/research` and `/join` redirect to the new pages.

## 6. Updating the site later

- **Updating from the November 4 version:** upload every file in this folder except `config.js`, then run the whole of `supabase/schema.sql` again in the Supabase SQL Editor. It adds recruiting cycles, info sessions, the notify list, the team page and the team photo bucket, and keeps all your data. Then schedule your first cycle under Portal → Recruiting, because applications stay closed until one is open.
- Update packages leave out `config.js`, so your Supabase settings are never overwritten. Upload the changed files on GitHub and keep your existing `config.js`.
- If a new version changes `supabase/schema.sql`, run the whole file again in the SQL Editor. It updates the rules and keeps your data.
- Page text lives in the HTML files. The header and footer are repeated on every page, so change them everywhere.
- Colors, fonts and spacing are defined at the top of `assets/css/site.css`. The portal's styles are in `assets/css/portal.css`.
- Recruiting and the team page are drawn by `assets/js/recruiting.js`, which reads one public call (`recruiting_public` in the schema). Visitors can read dates, sessions and the team, register for a session and join the notify list, and nothing else.
- The interactive pieces live in `assets/js/site.js`: the exploded mark and the dot field on the home page, the situation drawings, the engagement steps that hold the screen while you scroll, the fit check, the earnings exhibit on Services, the portal preview on the owners page and the organization drawing on About. Each one leaves a complete, readable page when JavaScript is off or a visitor has asked their device for reduced motion.
- The six labels beside the mark on the home page are the `axo-labels` list in `index.html`, listed from the top layer down. Each `data-i` ties a label to its layer of the mark, so edit the wording but keep those numbers.
- The earnings exhibit takes each adjustment from its row in `services.html` (`data-amount`). The financing assumptions (10% equity, a 10-year loan at 10.5%, capital expenditure and taxes) are set at the top of `setUpExhibit` in `assets/js/site.js`; the note under the exhibit states them, so change both together.
- The earnings exhibit on the Services page describes a hypothetical company. Keep the "Hypothetical example" label and the note under it if you change the figures.
- **Analytics:** the public pages load Google Analytics through `assets/js/analytics.js` (Measurement ID `G-S8YLE2RSHL`). It is not included in the portal, it sends only the page address and campaign tags (`utm_*`), it skips visitors whose browser sends Global Privacy Control, and Google's advertising features are off. The privacy section of `disclosures.html` says so; update it if you change any of this. Google's addresses are allowed in the `Content-Security-Policy` line of `netlify.toml`, which also needs updating if you add other services or give Supabase a custom domain.
- **Search:** each page has its own title, description and share card. The home page describes Foreman to search engines (structured data in `index.html`), and the Services page describes both services. When you add or rename a page, add it to `sitemap.xml`.
