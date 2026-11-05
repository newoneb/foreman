# Foreman website

The site for foreman-capital.com. Plain HTML, CSS and JavaScript with no build step, set up for Netlify.

## Pages

- `index.html`: the home page
- `advisory.html`: sale readiness, valuation and financing, succession planning and operating performance, with the illustrative review and common questions
- `real-estate.html`: owner-occupied property and the three paths for the building
- `insights.html` and `insights/`: Foreman Research, with three articles
- `firm.html`: principles, organization, standards and the University affiliation
- `join.html`: the student program and application form
- `advisors.html`: the referral program for CPAs, lenders, brokers and counselors, with the referral form
- `contact.html`: the general contact form
- `disclosures.html`: legal and privacy information
- `thanks.html` and `404.html`: the after-submission page and the page-not-found screen

Supporting files: `styles.css` and `main.js` hold all styling and behavior. `assets/` holds the logo SVGs traced from the original PNGs, the icons, the social sharing image, and the fonts (Geist and EB Garamond, both under the SIL Open Font License). `netlify.toml` sets security headers, font caching, and redirects from the old Framer pages (`/for-business-owners`, `/team`, `/research`).

## Deploy

**Quickest:** sign in to Netlify, open https://app.netlify.com/drop and drag this folder onto the page.

**Better for updates:** put this folder in a GitHub repository, then in Netlify choose *Add new site → Import an existing project* and pick the repository. Leave the build command empty. The publish directory is already set in `netlify.toml`. Every push to GitHub then redeploys the site.

## Turn on the forms

Netlify only collects form submissions after you switch on form detection.

1. In the site's Netlify dashboard, open **Forms** and select **Enable form detection**.
2. Deploy again (drag the folder again, or push a commit).
3. Three forms should appear: `contact`, `advisor-referral` and `student-application`.
4. Under **Forms → Form notifications**, add an email notification so each submission reaches your inbox.
5. Send a test entry through each form on the live site.

Check your Netlify plan's monthly limit on form submissions.

## Move foreman-capital.com from Framer

1. In Netlify, open **Domain management**, choose **Add a domain** and enter `foreman-capital.com`.
2. Netlify shows the DNS records to use. Change them wherever the domain's DNS is managed (your registrar, or Framer if it manages the domain), replacing the records that point to Framer.
3. Netlify issues the HTTPS certificate automatically once the new records take effect.
4. Unpublish the Framer site after the Netlify version is live.

## Editing

- Page text lives in the HTML files. The header and footer are repeated on every page, so update them everywhere.
- Colors, fonts and type sizes are defined at the top of `styles.css`.
- The illustrative review on the Advisory page describes a hypothetical company. Keep the "Hypothetical" label and the note under it if you change the figures.
- The insights cite their sources at the end of each article. Check the figures again before republishing them later.
- The disclosures page says the site uses no tracking cookies. If you add analytics, update that page, and add the analytics domain to the `Content-Security-Policy` line in `netlify.toml`, or the browser will block it.
