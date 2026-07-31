# DampScan

The dampscan.co.uk marketing site, its lead capture API and the staff dashboard.

A static page plus serverless functions. No framework, no bundler, no build step:
`public/` is served as-is and `api/` becomes Node functions on Vercel.

```
public/          static sites, both served from this one deployment
  index.html     dampscan.co.uk, Kent and the South East
  london.html    atidampsurvey.co.uk, the London arm
  staff/         login page, dashboard, shared CSS
api/             serverless functions
  lead.js        POST, validates and writes the lead to Neon
  event.js       POST, records one analytics event
  notified.js    POST, records whether the browser sent the notification email
  health.js      GET, uptime check
  auth/          login and logout
  admin/         dashboard data, auth required
db/              schema.sql, migrate.js, account scripts
lib/             db, validation, throttle, session, attribution, metrics, site
test/            unit and integration tests
```

## Deployment checklist

1. **Push to GitHub.** `git init`, commit, push. `main` is production.
2. **Create the Neon project.** Copy the **pooled** connection string, the one whose
   host contains `-pooler`. The functions are stateless and short lived, so the
   pooler is what keeps connection counts sane.
3. **Create the schema.** `npm install`, then with `DATABASE_URL` set in `.env`,
   run `npm run migrate`. `schema.sql` is idempotent, so this is also how you roll
   a later schema change forward.
4. **Import into Vercel.** Connect the GitHub repo. No build command and no
   framework preset are needed: `vercel.json` sets `outputDirectory` to `public`.
   Set every environment variable below for **Production and Preview**, then deploy.
5. **Check the staff dashboard.** Sign in at `https://dampscan.co.uk/staff` with the
   value you set for `STAFF_ACCESS_CODE` and confirm the dashboard loads.
6. **Add the domains.** Add `dampscan.co.uk` and `www.dampscan.co.uk` in Vercel, then
   at the registrar set apex `A` to `76.76.21.21` and `www` `CNAME` to
   `cname.vercel-dns.com`. Wait for the certificate to issue.
7. **Activate FormSubmit.** Submit the live form once from a browser. FormSubmit
   sends a one-time activation email to `tom@atidampsurvey.co.uk` that has to be
   confirmed before any notification will arrive. Leads are stored in Neon from the
   very first submission either way, so nothing is lost while this is pending.
8. **Smoke test.** Work through the list below.

### Post-deploy smoke test

| Check | Expected |
| --- | --- |
| `GET /api/health` | `{ "ok": true, "db": true }` |
| Complete step 1, then close the tab | a `partial` row appears in `leads` |
| Finish the form in the same tab | one `complete` row, and no `partial` for that `session_id` |
| The notification email | arrives with `Previous survey` populated |
| Submit with the honeypot filled | `200`, and no row written |
| Fire 10 rapid posts to `/api/lead` | the 9th and 10th return `429` |
| Click the header, mobile bar and closing CTA phone links | three `call_click` rows in the call log with placements `header`, `mobile-bar`, `closing` |
| Load `/?utm_source=google&utm_medium=cpc&utm_campaign=damp-london` and book | the lead is attributed to channel `paid` and campaign `damp-london` |
| `/staff/dashboard` while signed out | redirects to the login page, and `/api/admin/summary` returns `401` |
| 6 wrong access codes in a row | the 6th returns `429` |
| Lighthouse, mobile | performance and accessibility both 95 or higher |

Everything in this table except email delivery, the domain and Lighthouse is
covered by `npm test`. See "Running the tests".

## Environment variables

| Name | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon **pooled** connection string. |
| `STAFF_ACCESS_CODE` | yes | The code typed at `/staff`. Under 4 characters and every login is refused, so it cannot be left blank by accident. |
| `SESSION_SECRET` | yes | Signs the staff session cookie. Long random string. Changing it invalidates every active session, which is the fastest way to sign everyone out. |
| `IP_SALT` | yes | Salt for hashing visitor IPs. Raw addresses are never stored. Changing it resets the throttle counters. |

Generate the two secrets with:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Copy `.env.example` to `.env` for local work. `.gitignore` covers `.env*` except
`.env.example`, so real values cannot be committed by accident.

## Database

### `leads`

One row per `(session_id, stage)`, enforced by a unique index. A `complete` is a
booking. A `partial` is an abandonment: the page holds the step 1 details back and
only sends them if the visitor leaves without finishing, so a visitor who books
produces one row, not two. Both stages share a `session_id`, so a partial and any
later contact still line up.

`issues` is a `text[]` restricted to the six values the form offers. `role` is one
of the five. `previous_survey` is a nullable boolean: `null` means the visitor
never reached step 3, which is different from answering "no". `utm` is `jsonb`,
filtered to known campaign keys. `ip_hash` is `sha256(ip + IP_SALT)`, never the
address itself. `notified_at` and `notify_error` record what happened to the
notification email, so a lead that saved but failed to email is visible rather
than silent.

### `events`

First-party, cookieless interaction log. `session_id` comes from the visitor's
`sessionStorage` and dies with the tab. `type` is constrained by a check
constraint, so an unknown event name cannot be stored. `channel` and `device` are
derived on the server in `lib/attribution.js`, never accepted from the client.
`detail` is capped at 1 KB and stripped to a small allow-list. When a `complete`
lead is written, `lead_id` is back-filled onto every event in that session, which
is how a booking gets credited to the channel that produced it.

`staff_login` and `staff_login_failed` share this table but are deliberately
excluded from every visitor metric, otherwise each sign in would register as a
phantom session and dilute the conversion rates.

### `staff_users`

Not used by the current login route, which takes a single access code instead. The
table and the `create-user` / `set-user` scripts are kept so per-user accounts can
be restored without rebuilding them. `password_hash` is argon2id. There is no
seeded account and no default password anywhere in this repo.

### `rate_hits`

Supporting table for `lib/ratelimit.js`. Serverless instances do not share memory,
so an in-process counter would be bypassed by spreading requests across cold
starts. Counters live here where every instance can see them, and old rows are
pruned opportunistically.

## Staff access

Signing in at `/staff` takes a single shared access code and nothing else. The
code lives in the `STAFF_ACCESS_CODE` environment variable and is deliberately
not committed, because this repository is public and the dashboard holds customer
names, emails, phone numbers, postcodes and free-text notes.

To change the code, edit the variable in Vercel and redeploy. To sign everyone
out immediately, rotate `SESSION_SECRET` as well, which invalidates every session
cookie already issued.

A short numeric code has a small keyspace, so the route is defended by throttles
rather than by the code's strength:

- 5 failed attempts per address per 15 minutes.
- 50 failed attempts across **all** addresses per 15 minutes, because a per
  address limit alone still lets a pool of addresses walk a four digit keyspace.
- Every attempt is recorded as `staff_login` or `staff_login_failed`, so an
  attack is visible in the dashboard rather than silent.

Two honest limitations of this design:

1. A successful sign in clears the global counter. That is deliberate, otherwise
   50 failures from a stranger would lock the owner out of their own dashboard
   for 15 minutes. The cost is that an attacker gets a fresh allowance after each
   legitimate login rather than strictly one per window.
2. There is one code, so there is no per-person audit trail. Every entry in the
   log says "someone who knew the code", not who.

If the dashboard ever needs more than one person, or a record of who saw what,
move back to per-user accounts. The `staff_users` table and the
`create-user` / `set-user` scripts are still present and working for exactly that
reason, they are simply not consulted by the current login route.

### One staff area, two brands

`/staff` and `/staff/dashboard.html` are shared by both domains, so a surveyor
arriving from the ATi footer used to land on a page wearing the DampScan name.
Both lockups now sit in the markup and a small script in the `<head>` sets
`data-brand` on `<html>` from `location.hostname`, with `staff.css` hiding the
other one. It runs before paint, so neither site flashes the other's name, and
it also swaps the title and the favicon.

The hostname is the signal rather than a referrer or a query parameter, because
those get stripped and this must not be guessable from the link that was
clicked. With JavaScript off the DampScan lockup stands: the page still works,
it is just wearing one of the two names.

The ATi login screen takes the ATi site's own palette: off white, navy ink, and
the real mark beside its strapline. The mark is dark navy artwork on
transparency, so it needs a light background to exist on at all, and someone
arriving from the ATi site expects to see that anyway. It is done by overriding
the colour tokens on `body.login`, not by restyling each component.

The dashboard is deliberately left dark for both brands. It is a dense data
tool tuned for that, and it sits behind the login where the two businesses are
already one account looking at one set of numbers. Only the header lockup
changes there.

Nothing behind the login is branded per site. It is one account, one session and
one dashboard, with the Both / Kent / London selector doing the separating.

## Security notes

- The staff session cookie is the only cookie the site sets. `httpOnly`, `Secure`,
  `SameSite=Lax`, 8 hour expiry, HMAC signed and verified in constant time.
- Unknown email and wrong password do the same work and return the same message,
  so the login cannot be used to discover which addresses have accounts. A disabled
  account behaves identically.
- Throttles: 8 leads and 60 events per 10 minutes per hashed IP, 5 failed logins per
  15 minutes. The lead and event throttles fail open, because a database blip should
  not stop the phone ringing. The login throttle fails closed.
- No raw IP is ever written to the database or the logs.
- Every `/api/admin/*` route calls `requireAuth` and aggregates in SQL. No admin
  endpoint pulls a table into JavaScript to count it.
- The dashboard builds every cell with `textContent`. Lead notes and referrers are
  visitor-supplied, so rendering them as markup would make the dashboard a stored
  XSS sink. CSV export also prefixes cells starting with `=`, `+`, `-` or `@` so a
  note cannot become a spreadsheet formula.
- `/staff/*` is `noindex, nofollow` in the markup, via an `X-Robots-Tag` header, and
  disallowed in `robots.txt`.

## Lead notifications

The email is sent by the visitor's browser, not by our functions. FormSubmit sits
behind Cloudflare, which answers a serverless request with a bot challenge page and
a 403 rather than sending anything, so a server-side call cannot work. FormSubmit is
built to be posted to from a browser, and that is what the page now does.

The order is deliberate. `/api/lead` stores the lead first and answers, then the
page posts to FormSubmit and reports the outcome to `/api/notified`, which stamps
`notified_at` or `notify_error` on the row. A blocked, closed or ad-blocked browser
therefore costs the email and never the enquiry, and the dashboard shows which of
the two happened instead of claiming everything was sent.

Two consequences worth knowing:

- The notification address lives in `NOTIFY_ENDPOINT` at the top of the script in
  `public/index.html`. A static page cannot read environment variables, so changing
  where leads are emailed is a commit rather than a dashboard edit.
- Delivery is best effort. Treat the dashboard as the record of what came in, and
  email as the prompt to go and look. Any lead whose `notify_error` is set is in the
  database and simply was not emailed.

## Two sites, one deployment

`dampscan.co.uk` and `atidampsurvey.co.uk` are served by the same Vercel project.
`middleware.js` rewrites the London hostname to `public/london.html`, so each domain
gets its own page, branding, phone number and inbox while `/api`, `/lib` and the
dashboard stay single-source. A fix lands on both at once instead of being applied
twice and drifting.

Routing lives in middleware rather than `vercel.json` because `vercel.json` rewrites
are evaluated **after** the filesystem, so a rewrite on `/` never fires: `/` already
matches `public/index.html`. Middleware runs first.

Because one project serves both domains, every file is otherwise reachable on both
hosts. Middleware also collapses those duplicates: `/index.html` redirects to the
root it duplicates, and `/london.html` redirects to `https://atidampsurvey.co.uk/`.
Preview deployments are exempt, since they have neither production host and would
otherwise be unable to show the London page. `middleware.js` also serves
`robots-london.txt`, `sitemap-london.xml` and `llms-london.txt` at the ordinary
paths on the London host, so each domain advertises only its own. `test/middleware.test.js`
covers all of it.

This is invisible to search engines. Google sees two independent domains; it has
no view of shared hosting, a shared repo or a shared database, and shared hosting
is explicitly fine by its own guidance. The content is genuinely different, about
4 percent overlap, which is what actually matters.

Every lead and event carries a `site` column, derived in `lib/site.js` from the
Host header and never trusted from the client, the same rule as `channel` and
`device`. The dashboard has a Both / Kent / London selector, and `?site=` on
`/api/admin/summary` and `/api/admin/leads` filters the same way. Values outside
the whitelist are ignored rather than interpolated.

Rows written before the London site existed default to `dampscan`, which is
accurate rather than merely convenient.

## Search and AI crawlers

About half the text on each page used to be built by JavaScript from `services`,
`reviews` and `faqs` arrays. Google renders JavaScript, but most AI crawlers do
not, so roughly 1,450 words per page were invisible to them. All three blocks are
now in the markup, and the JavaScript enhances what is there: the tab strip shows
one pre-rendered panel at a time instead of writing `innerHTML`, and the review
marquee duplicates its own track at runtime because the second copy is decoration
rather than content. Crawlable text went from 1,285 to 2,749 words on `index.html`
and 1,545 to 3,003 on `london.html`.

Both pages carry `FAQPage` structured data built from the same questions, next to
the existing `LocalBusiness` and `ProfessionalService` blocks.

`llms.txt` and `llms-london.txt` state the facts each business would want quoted:
areas, response times, what is included in a report, and the fact that ATi carries
out no remedial work. The convention is a proposal rather than a standard and the
major AI crawlers do not consume it yet, so this is cheap insurance, not a lever.

`robots.txt` deliberately uses a single `User-agent: *` group. Adding a named group
for a crawler makes that crawler ignore the wildcard group entirely, which would
quietly drop the `/api` and `/staff` disallows for it.

## Reviews

The carousel on both sites is filled from the real Google listing. `/api/reviews`
reads Place Details for whichever site the Host header names and the page swaps
its cards for the result. Two things shape the design:

- Place Details returns **at most five** reviews and Google picks which five.
  There is no paging. The full set needs the Business Profile API, which is
  owner-authenticated and behind an access request.
- Places results may not be held indefinitely, so the response is cached at the
  edge for a day. Google is called roughly once a day per region rather than
  once per visitor, which also keeps it inside the free tier.

Set `GOOGLE_MAPS_API_KEY`, `GOOGLE_PLACE_ID_DAMPSCAN` and `GOOGLE_PLACE_ID_ATI`
to switch it on. Restrict the key by API rather than by HTTP referrer: the call
is made from the server, so a referrer restriction blocks it.

Unset, or rejected, or a listing with no reviews yet, all end the same way: an
empty list, and the page leaves whatever is in its markup alone. Nothing is ever
invented, and review text is escaped before it is inserted, because it is other
people's writing arriving over the network.

There is deliberately **no `aggregateRating`** in the structured data. Google's
review snippet guidelines exclude ratings aggregated from another site, so
marking up a Google score to win stars in Google's own results is not eligible
and risks a manual action. The rating is shown to visitors, not claimed to the
crawler.

## Analytics and privacy

No third-party analytics, no advertising cookies, no cross-site tracking. The
visitor session id lives in `sessionStorage` and is gone when the tab closes.
Attribution is captured once per visit from `document.referrer` and the `utm_*`
parameters, then held for the rest of that visit so a later event still knows where
the visitor came from. The cookie notice on the page describes exactly this.

## Running the tests

56 tests: 22 unit, 28 API integration and 6 covering the migration path. The integration tests exercise the real
handlers and the real SQL, with `lib/db.js` swapped for a `pg` client pointed at a
local Postgres.

```sh
# start a throwaway Postgres and apply the schema
initdb -D /tmp/pgdata -U dampscan --auth=trust
pg_ctl -D /tmp/pgdata -o "-p 55432" start
createdb -h 127.0.0.1 -p 55432 -U dampscan dampscan
psql -h 127.0.0.1 -p 55432 -U dampscan -d dampscan -f db/schema.sql

npm test
```

Override the target with `TEST_DATABASE_URL`. Never point it at production: each run
truncates every table. No test touches the network, FormSubmit is stubbed.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and every pull request:

1. Starts a real Postgres 16 service container.
2. Applies `db/schema.sql`, then applies it a second time to prove it is idempotent.
3. Asserts all four tables exist.
4. Runs `npm test`, all 56 tests.
5. Fails the build if an em dash has crept in.

On a push to `main`, and only then, a second job runs `npm run migrate` against
Neon so the production schema is applied automatically. It needs one repository
secret:

- **`DATABASE_URL`**, under Settings, Secrets and variables, Actions. Use the same
  pooled Neon string that Vercel has.

Without that secret the job logs a warning and skips, so CI stays green while you
are still setting things up rather than failing on a missing credential. The
migration only ever adds tables, indexes and columns, so re-running it on every
merge cannot destroy existing leads.

## Forking this to a new GitHub account and Vercel project

The code has nothing tied to a GitHub owner, repo name or Vercel project, so a
fork works. What does not travel with the fork is the domain, the environment
variables, the database and the staff accounts. Work through this:

1. **Repoint the domain.** The site is static with no build step, so the canonical
   link, `og:url`, `og:image`, JSON-LD, `sitemap.xml`, `robots.txt` and the
   `vercel.json` www redirect all carry the domain literally.

   ```sh
   npm run set-domain -- --check                    # show what points where now
   npm run set-domain -- --domain=newdomain.co.uk   # rewrite all of it
   ```

   Do not skip this. A fork left pointing at `dampscan.co.uk` still renders
   perfectly in a browser while telling Google the real version of the page lives
   on the old domain, so the new site competes with itself and loses. It is the one
   mistake here that is invisible until rankings move.

2. **Create a Neon project** for the fork, or point at the existing one. A forked
   repo does not fork the database.

3. **Set the environment variables in the new Vercel project.** All of them, for
   Production and Preview. `SESSION_SECRET` and `IP_SALT` should be freshly
   generated, not copied: reusing them means sessions minted by the old deployment
   are still valid against the new one.

4. **Add the `DATABASE_URL` secret** to the new GitHub repo if you want the
   automatic migration job, otherwise run `npm run migrate` once by hand.

5. **Create staff accounts.** They live in the database, so a new database has
   none. `npm run create-user -- --email=... --role=admin`.

6. **Re-activate FormSubmit** if the notification address changes. Activation is
   per address, so an address that is already confirmed stays confirmed.

7. **Replace the branding** if this is a different business:
   `public/assets/dampscan-logo.svg`, `public/favicon.svg`, and the copy in
   `public/index.html`.

Vercel itself needs no special configuration on the new project. There is no build
command and no framework preset: `vercel.json` sets `outputDirectory` to `public`,
and `api/` is detected automatically.

## Front-end changes to `index.html`

The design, layout, class names and section order are untouched. The original ten
edits were:

1. `LEAD_ENDPOINT` now points at `/api/lead`.
2. A per-visit `sessionId` from `crypto.randomUUID()`, persisted in `sessionStorage`
   under `dampscan-session` and sent with both posts.
3. `sendLead(stage)` posts the JSON shape `/api/lead` expects. The partial is armed
   once when step 1 validates and sent only on abandonment, complete goes on submit,
   and a network failure still shows the success state.
4. A visually hidden honeypot input using the existing `.sr-only` class.
5. A `400` re-enables the submit button and renders the returned field errors
   through the existing `.form-row.has-err` and `.err` pattern. The server's
   messages are worded to match the static copy already on the page, so the visitor
   sees the wording the design always had.
6. `pushLeadToCRM()` is byte for byte unchanged.
7. The footer "Staff login" pill points at `/staff` with no `target="_blank"`. Every
   other SurveyMate link is untouched.
8. A `track(type, detail)` helper posting to `/api/event` with `keepalive`, fire and
   forget, wrapped in try/catch.
9. Delegated listeners for `page_view`, `call_click`, `email_click`, `cta_click`,
   `form_open`, `form_step`, `form_error` and `form_submit`. Nothing was added to the
   markup to support them.
10. The cookie notice paragraph now describes the first-party analytics, since that
    is what the site actually does.

Plus the SEO additions that were also specified: a canonical link, `og:url` and an
absolute `og:image`. The JSON-LD `image` was made absolute at the same time, because
a relative URL there is invalid, and `url` was added.

Requested since, on both `index.html` and `london.html`:

- The previous survey checkbox is optional. `validate()` used to require a tick in
  any `.form-row` holding checkboxes, which silently made it mandatory. Only a row
  marked `data-require-one` needs one now, and that is the issue picker.
- Area copy says London rather than Greater London.

Two things worth flagging:

- `public/assets/dampscan-logo.svg` did not exist in the supplied file, so it has
  been created to match the wordmark. It is referenced by `og:image`. Most social
  networks will not render an SVG preview, so replace it with a 1200x630 PNG at the
  same path when a raster asset is available.
- `index.html` is the one file over 300 lines. It arrived that way, and splitting it
  would mean restructuring the page, which was out of scope.

## Handing this to the SurveyMate CRM

Three integration points, in increasing order of usefulness:

1. **`pushLeadToCRM(payload, stage)`** in `public/index.html`. Still the untouched
   client-side hook, called for both the partial and the complete submission. Fine
   for a browser-side pixel or a tag manager push. Do not make it the only path: it
   runs in the visitor's browser, so an ad blocker or a closed tab can stop it.
2. **`session_id` on `leads` and `events`.** The join key. It ties a partial to its
   completion and a booking to the events that led to it, so the CRM can import a
   lead with its full attribution rather than just a form dump.
3. **`GET /api/admin/leads`** is the real integration surface. It returns each lead
   with every field, its resolved `channel` and `landingPage`, its `utm` object and
   its complete event `timeline`, and it accepts `range`, `stage`, `limit` and
   `offset`. A CRM sync should poll this endpoint rather than scrape the dashboard.

   It currently authenticates with the staff session cookie. For a server to server
   sync, add a bearer token check alongside `requireAuth` in `lib/session.js` rather
   than loosening the cookie rules, and give the CRM its own credential so it can be
   revoked on its own.

## A note on dependencies

Three runtime dependencies:

- `@neondatabase/serverless`, the Neon HTTP driver.
- `@node-rs/argon2` for argon2id password hashing. Chosen over the `argon2` package
  because it ships prebuilt binaries for the Lambda platform Vercel runs on, so a
  deploy cannot fail on a native compile step. Same algorithm, same PHC hash format.
- `dotenv`, used only by the local CLI scripts.

`pg` is a dev dependency, used only by the integration tests.
